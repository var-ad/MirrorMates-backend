"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdjectives = listAdjectives;
exports.listUserSessions = listUserSessions;
exports.createJohariSession = createJohariSession;
exports.getJohariSessionById = getJohariSessionById;
exports.saveSelfSelections = saveSelfSelections;
exports.updateInviteSettings = updateInviteSettings;
exports.getInviteMeta = getInviteMeta;
exports.submitInviteFeedback = submitInviteFeedback;
exports.computeResults = computeResults;
exports.generateSessionReport = generateSessionReport;
exports.getLatestSessionReport = getLatestSessionReport;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const qrcode_1 = __importDefault(require("qrcode"));
const env_1 = require("../../../config/env");
const prisma_1 = require("../../../db/prisma");
const errors_1 = require("../../../utils/errors");
const invite_service_1 = require("../common/invite.service");
const gemini_service_1 = require("../../reports/gemini.service");
const report_service_1 = require("../../reports/report.service");
const DEFAULT_INVITE_EXPIRY_DAYS = 7;
const MAX_INVITE_EXPIRY_DAYS = 30;
const SHORT_INVITE_CODE_LENGTH = 5;
const SHORT_INVITE_CODE_REGEX = /^[A-Z0-9]{5}$/i;
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WINDOW_META = {
    open: {
        title: "Open Window",
        subtitle: "Known to self and others",
        description: "Traits you selected for yourself and peers also noticed.",
        position: { row: "top", column: "left" }
    },
    blind: {
        title: "Blind Window",
        subtitle: "Not known to self, known to others",
        description: "Traits peers selected that you did not choose for yourself.",
        position: { row: "top", column: "right" }
    },
    hidden: {
        title: "Hidden Window",
        subtitle: "Known to self, not known to others",
        description: "Traits you selected for yourself that peers did not surface.",
        position: { row: "bottom", column: "left" }
    },
    unknown: {
        title: "Unknown Window",
        subtitle: "Not known to self or others",
        description: "Traits that did not appear in either self or peer selections this round.",
        position: { row: "bottom", column: "right" }
    }
};
const sessionSelect = {
    id: true,
    ownerUserId: true,
    title: true,
    inviteToken: true,
    inviteExpiresAt: true,
    createdAt: true
};
function normalizeAdjectiveIds(adjectiveIds) {
    return [...new Set(adjectiveIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}
function normalizeInviteToken(token) {
    const trimmed = token.trim();
    if (SHORT_INVITE_CODE_REGEX.test(trimmed)) {
        return trimmed.toUpperCase();
    }
    return trimmed;
}
function assertOwner(ownerUserId, actualOwnerId) {
    if (ownerUserId !== actualOwnerId) {
        throw new errors_1.AppError("You do not have access to this session", 403);
    }
}
function ensureTrailingSlash(value) {
    return value.endsWith("/") ? value : `${value}/`;
}
function buildInviteUrl(inviteToken) {
    return new URL(`invite/${encodeURIComponent(inviteToken)}`, ensureTrailingSlash(env_1.env.FRONTEND_URL)).toString();
}
async function buildQrCodeDataUrl(inviteUrl) {
    return qrcode_1.default.toDataURL(inviteUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 280
    });
}
async function serializeSession(session, extra) {
    const inviteCode = session.inviteToken;
    const createdAt = new Date(session.createdAt);
    const inviteExpiresAt = new Date(session.inviteExpiresAt);
    const inviteUrl = buildInviteUrl(inviteCode);
    const qrCodeDataUrl = await buildQrCodeDataUrl(inviteUrl);
    return {
        id: session.id,
        title: session.title,
        createdAt,
        inviteToken: inviteCode,
        inviteCode,
        inviteExpiresAt,
        isInviteExpired: inviteExpiresAt.getTime() <= Date.now(),
        peerSubmissionCount: extra?.peerSubmissionCount,
        share: {
            inviteCode,
            inviteUrl,
            qrCodeUrl: qrCodeDataUrl,
            qrCodeDataUrl,
            inviteExpiresAt,
            isExpired: inviteExpiresAt.getTime() <= Date.now()
        }
    };
}
function resolveInviteExpiry(input) {
    if (input.inviteExpiresAt) {
        const expiresAt = new Date(input.inviteExpiresAt);
        if (Number.isNaN(expiresAt.getTime())) {
            throw new errors_1.AppError("Invite expiry must be a valid date", 400);
        }
        if (expiresAt.getTime() <= Date.now()) {
            throw new errors_1.AppError("Invite expiry must be in the future", 400);
        }
        const maxAllowedTime = Date.now() + MAX_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        if (expiresAt.getTime() > maxAllowedTime) {
            throw new errors_1.AppError(`Invite expiry cannot be more than ${MAX_INVITE_EXPIRY_DAYS} days away`, 400);
        }
        return expiresAt;
    }
    const expiresInDays = input.inviteExpiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS;
    return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
}
function createShortInviteCode() {
    let code = "";
    while (code.length < SHORT_INVITE_CODE_LENGTH) {
        const randomIndex = crypto_1.default.randomInt(0, INVITE_CODE_ALPHABET.length);
        code += INVITE_CODE_ALPHABET[randomIndex];
    }
    return code;
}
function isUniqueConstraintError(error) {
    return error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
async function generateUniqueInviteCode(executor) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
        const candidate = createShortInviteCode();
        const existing = await executor.johariSession.findUnique({
            where: {
                inviteToken: candidate
            },
            select: {
                id: true
            }
        });
        if (!existing) {
            return candidate;
        }
    }
    throw new errors_1.AppError("Could not generate a unique invite code right now", 500);
}
async function getSession(sessionId) {
    const session = await prisma_1.prisma.johariSession.findUnique({
        where: {
            id: sessionId
        },
        select: sessionSelect
    });
    if (!session) {
        throw new errors_1.AppError("Session not found", 404);
    }
    return session;
}
async function validateAdjectiveIds(adjectiveIds) {
    if (!adjectiveIds.length) {
        return;
    }
    const validCount = await prisma_1.prisma.adjectiveMaster.count({
        where: {
            id: {
                in: adjectiveIds
            }
        }
    });
    if (validCount !== adjectiveIds.length) {
        throw new errors_1.AppError("One or more adjective IDs are invalid", 400);
    }
}
async function replaceSelfSelections(executor, sessionId, requesterId, adjectiveIds) {
    await executor.selfSelection.deleteMany({
        where: {
            sessionId,
            userId: requesterId
        }
    });
    if (!adjectiveIds.length) {
        return;
    }
    await executor.selfSelection.createMany({
        data: adjectiveIds.map((adjectiveId) => ({
            sessionId,
            userId: requesterId,
            adjectiveId
        }))
    });
}
function toWords(adjectives) {
    return adjectives.map((item) => item.adjective);
}
function roundToSingleDecimal(value) {
    return Math.round(value * 10) / 10;
}
function buildWindowPayload(key, ids, adjectiveMap, selfSet, peerSet, peerCounts, peerSubmissionCount) {
    const adjectives = ids
        .map((id) => ({
        adjectiveId: id,
        adjective: adjectiveMap.get(id) ?? "unknown",
        peerCount: peerCounts[id] ?? 0,
        peerSupportPercent: peerSubmissionCount > 0 ? roundToSingleDecimal(((peerCounts[id] ?? 0) / peerSubmissionCount) * 100) : 0,
        selectedBySelf: selfSet.has(id),
        selectedByPeers: peerSet.has(id)
    }))
        .sort((a, b) => b.peerCount - a.peerCount || a.adjective.localeCompare(b.adjective));
    return {
        key,
        title: WINDOW_META[key].title,
        subtitle: WINDOW_META[key].subtitle,
        description: WINDOW_META[key].description,
        position: WINDOW_META[key].position,
        count: adjectives.length,
        adjectives
    };
}
function getOwnerLabel(owner) {
    return owner.fullName ?? owner.email.split("@")[0];
}
async function listAdjectives() {
    const adjectives = await prisma_1.prisma.adjectiveMaster.findMany({
        select: {
            id: true,
            word: true
        },
        orderBy: {
            word: "asc"
        }
    });
    return adjectives;
}
async function listUserSessions(userId) {
    const sessions = await prisma_1.prisma.johariSession.findMany({
        where: {
            ownerUserId: userId
        },
        orderBy: {
            createdAt: "desc"
        },
        include: {
            _count: {
                select: {
                    peerSubmissions: true
                }
            }
        }
    });
    return Promise.all(sessions.map((session) => serializeSession(session, {
        peerSubmissionCount: session._count.peerSubmissions
    })));
}
async function createJohariSession(userId, input) {
    const normalizedIds = normalizeAdjectiveIds(input.adjectiveIds ?? []);
    await validateAdjectiveIds(normalizedIds);
    const inviteExpiresAt = resolveInviteExpiry(input);
    for (let attempt = 0; attempt < 25; attempt += 1) {
        try {
            const session = await prisma_1.prisma.$transaction(async (tx) => {
                const inviteCode = await generateUniqueInviteCode(tx);
                const created = await tx.johariSession.create({
                    data: {
                        ownerUserId: userId,
                        title: input.title ?? "My Johari Window",
                        inviteToken: inviteCode,
                        inviteExpiresAt
                    },
                    select: sessionSelect
                });
                await replaceSelfSelections(tx, created.id, userId, normalizedIds);
                return created;
            });
            return {
                session: await serializeSession(session, { peerSubmissionCount: 0 }),
                selfSelectionAdjectiveIds: normalizedIds
            };
        }
        catch (error) {
            if (isUniqueConstraintError(error)) {
                continue;
            }
            throw error;
        }
    }
    throw new errors_1.AppError("Could not generate a unique invite code right now", 500);
}
async function getJohariSessionById(sessionId, requesterId) {
    const session = await getSession(sessionId);
    assertOwner(requesterId, session.ownerUserId);
    const [selfSelections, peerSubmissionCount] = await Promise.all([
        prisma_1.prisma.selfSelection.findMany({
            where: {
                sessionId,
                userId: requesterId
            },
            select: {
                adjectiveId: true
            }
        }),
        prisma_1.prisma.peerSubmission.count({
            where: {
                sessionId
            }
        })
    ]);
    return {
        session: await serializeSession(session, { peerSubmissionCount }),
        selfSelectionAdjectiveIds: selfSelections.map((row) => row.adjectiveId),
        peerSubmissionCount
    };
}
async function saveSelfSelections(sessionId, requesterId, adjectiveIds) {
    const session = await getSession(sessionId);
    assertOwner(requesterId, session.ownerUserId);
    const normalizedIds = normalizeAdjectiveIds(adjectiveIds);
    await validateAdjectiveIds(normalizedIds);
    await prisma_1.prisma.$transaction(async (tx) => {
        await replaceSelfSelections(tx, sessionId, requesterId, normalizedIds);
    });
    return {
        sessionId,
        selfSelectionAdjectiveIds: normalizedIds
    };
}
async function updateInviteSettings(sessionId, requesterId, input) {
    const session = await getSession(sessionId);
    assertOwner(requesterId, session.ownerUserId);
    const inviteExpiresAt = resolveInviteExpiry(input);
    const updated = await prisma_1.prisma.johariSession.update({
        where: {
            id: sessionId
        },
        data: {
            inviteExpiresAt
        },
        select: sessionSelect
    });
    return serializeSession(updated);
}
async function getInviteMeta(token) {
    const normalizedToken = normalizeInviteToken(token);
    const invite = await prisma_1.prisma.johariSession.findFirst({
        where: {
            inviteToken: normalizedToken,
            inviteExpiresAt: {
                gt: new Date()
            },
            status: client_1.JohariSessionStatus.ACTIVE
        },
        select: {
            id: true,
            title: true,
            inviteToken: true,
            inviteExpiresAt: true,
            owner: {
                select: {
                    fullName: true,
                    email: true
                }
            }
        }
    });
    if (!invite) {
        throw new errors_1.AppError("Invite link is invalid or expired", 404);
    }
    const inviteUrl = buildInviteUrl(invite.inviteToken);
    const inviteExpiresAt = new Date(invite.inviteExpiresAt);
    const qrCodeDataUrl = await buildQrCodeDataUrl(inviteUrl);
    return {
        sessionId: invite.id,
        title: invite.title,
        ownerLabel: getOwnerLabel(invite.owner),
        inviteCode: invite.inviteToken,
        inviteExpiresAt,
        inviteUrl,
        qrCodeUrl: qrCodeDataUrl,
        qrCodeDataUrl
    };
}
async function submitInviteFeedback(input) {
    const normalizedToken = normalizeInviteToken(input.inviteToken);
    const session = await (0, invite_service_1.getActiveSessionByInviteToken)(normalizedToken);
    if (!session) {
        throw new errors_1.AppError("Invite link is invalid or expired", 404);
    }
    const normalizedIds = normalizeAdjectiveIds(input.adjectiveIds);
    await validateAdjectiveIds(normalizedIds);
    try {
        await prisma_1.prisma.peerSubmission.create({
            data: {
                sessionId: session.id,
                inviteToken: normalizedToken,
                peerDisplayName: input.displayName.trim(),
                adjectiveIds: normalizedIds,
                fingerprint: input.fingerprint
            }
        });
    }
    catch (error) {
        if (isUniqueConstraintError(error)) {
            throw new errors_1.AppError("You have already submitted feedback for this invite", 409);
        }
        throw error;
    }
    return {
        sessionId: session.id,
        inviteCode: normalizedToken,
        submitted: true
    };
}
async function computeResults(sessionId, requesterId) {
    const session = await getSession(sessionId);
    assertOwner(requesterId, session.ownerUserId);
    const [adjectives, selfRows, peerRows] = await Promise.all([
        prisma_1.prisma.adjectiveMaster.findMany({
            select: {
                id: true,
                word: true
            },
            orderBy: {
                id: "asc"
            }
        }),
        prisma_1.prisma.selfSelection.findMany({
            where: {
                sessionId,
                userId: requesterId
            },
            select: {
                adjectiveId: true
            }
        }),
        prisma_1.prisma.peerSubmission.findMany({
            where: {
                sessionId
            },
            select: {
                adjectiveIds: true
            }
        })
    ]);
    const adjectiveMap = new Map(adjectives.map((row) => [row.id, row.word]));
    const allIds = adjectives.map((row) => row.id);
    const selfSet = new Set(selfRows.map((row) => row.adjectiveId));
    const peerCounts = {};
    const peerSet = new Set();
    for (const row of peerRows) {
        for (const adjectiveId of row.adjectiveIds ?? []) {
            peerSet.add(adjectiveId);
            peerCounts[adjectiveId] = (peerCounts[adjectiveId] ?? 0) + 1;
        }
    }
    const openIds = allIds.filter((id) => selfSet.has(id) && peerSet.has(id));
    const blindIds = allIds.filter((id) => !selfSet.has(id) && peerSet.has(id));
    const hiddenIds = allIds.filter((id) => selfSet.has(id) && !peerSet.has(id));
    const unknownIds = allIds.filter((id) => !selfSet.has(id) && !peerSet.has(id));
    const peerCountsJson = Object.fromEntries(Object.entries(peerCounts).map(([adjectiveId, count]) => [adjectiveId, count]));
    await prisma_1.prisma.computedResult.upsert({
        where: {
            sessionId
        },
        create: {
            sessionId,
            openIds,
            blindIds,
            hiddenIds,
            unknownIds,
            peerCounts: peerCountsJson,
            computedAt: new Date()
        },
        update: {
            openIds,
            blindIds,
            hiddenIds,
            unknownIds,
            peerCounts: peerCountsJson,
            computedAt: new Date()
        }
    });
    const peerSubmissionCount = peerRows.length;
    const openWindow = buildWindowPayload("open", openIds, adjectiveMap, selfSet, peerSet, peerCounts, peerSubmissionCount);
    const blindWindow = buildWindowPayload("blind", blindIds, adjectiveMap, selfSet, peerSet, peerCounts, peerSubmissionCount);
    const hiddenWindow = buildWindowPayload("hidden", hiddenIds, adjectiveMap, selfSet, peerSet, peerCounts, peerSubmissionCount);
    const unknownWindow = buildWindowPayload("unknown", unknownIds, adjectiveMap, selfSet, peerSet, peerCounts, peerSubmissionCount);
    const windows = [openWindow, blindWindow, hiddenWindow, unknownWindow];
    const counts = Object.entries(peerCounts)
        .map(([adjectiveId, count]) => {
        const id = Number(adjectiveId);
        return {
            adjectiveId: id,
            adjective: adjectiveMap.get(id) ?? "unknown",
            count,
            peerSupportPercent: peerSubmissionCount > 0 ? roundToSingleDecimal((count / peerSubmissionCount) * 100) : 0
        };
    })
        .sort((a, b) => b.count - a.count || a.adjective.localeCompare(b.adjective));
    const pools = {
        open: toWords(openWindow.adjectives),
        blind: toWords(blindWindow.adjectives),
        hidden: toWords(hiddenWindow.adjectives),
        unknown: toWords(unknownWindow.adjectives)
    };
    return {
        session: await serializeSession(session, { peerSubmissionCount }),
        sessionId,
        matrixAxes: {
            horizontal: {
                left: "Known to self",
                right: "Not known to self"
            },
            vertical: {
                top: "Known to others",
                bottom: "Not known to others"
            }
        },
        summary: {
            selfSelectedCount: selfSet.size,
            peerSubmissionCount,
            peerSelectedUniqueCount: peerSet.size,
            topPeerAdjectives: counts.slice(0, 8)
        },
        pools,
        windows,
        peerCounts: counts
    };
}
async function generateSessionReport(sessionId, requesterId) {
    const computed = await computeResults(sessionId, requesterId);
    const generated = await (0, gemini_service_1.generateGeminiJohariReport)({
        pools: computed.pools,
        peerSubmissionCount: computed.summary.peerSubmissionCount,
        topPeerAdjectives: computed.summary.topPeerAdjectives
    });
    const saved = await (0, report_service_1.saveGeminiReport)({
        userId: requesterId,
        sessionId,
        prompt: generated.prompt,
        pools: computed.pools,
        reportText: generated.reportText
    });
    return {
        reportId: String(saved._id),
        reportText: generated.reportText,
        feedbackText: generated.reportText,
        generatedAt: saved.createdAt
    };
}
async function getLatestSessionReport(sessionId, requesterId) {
    const session = await getSession(sessionId);
    assertOwner(requesterId, session.ownerUserId);
    const report = await (0, report_service_1.getLatestGeminiReport)(sessionId, requesterId);
    return report;
}
