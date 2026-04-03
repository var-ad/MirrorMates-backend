import crypto from "crypto";
import { JohariSession, JohariSessionStatus, Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { env } from "../../../config/env";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../utils/errors";
import { getActiveSessionByInviteToken } from "../common/invite.service";
import { generateGeminiJohariReport, JohariPools } from "../../reports/gemini.service";
import { getLatestGeminiReport, saveGeminiReport } from "../../reports/report.service";

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
} as const;

const sessionSelect = {
  id: true,
  ownerUserId: true,
  title: true,
  inviteToken: true,
  inviteExpiresAt: true,
  createdAt: true
} as const;

type PrismaJohariExecutor = typeof prisma | Prisma.TransactionClient;
type SessionRecord = Pick<
  JohariSession,
  "id" | "ownerUserId" | "title" | "inviteToken" | "inviteExpiresAt" | "createdAt"
>;

interface AdjectiveRow {
  id: number;
  word: string;
}

interface ResultAdjective {
  adjectiveId: number;
  adjective: string;
  peerCount: number;
  peerSupportPercent: number;
  selectedBySelf: boolean;
  selectedByPeers: boolean;
}

type WindowKey = keyof JohariPools;

interface WindowPayload {
  key: WindowKey;
  title: string;
  subtitle: string;
  description: string;
  position: {
    row: "top" | "bottom";
    column: "left" | "right";
  };
  count: number;
  adjectives: ResultAdjective[];
}

function normalizeAdjectiveIds(adjectiveIds: number[]): number[] {
  return [...new Set(adjectiveIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function normalizeInviteToken(token: string): string {
  const trimmed = token.trim();

  if (SHORT_INVITE_CODE_REGEX.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed;
}

function assertOwner(ownerUserId: string, actualOwnerId: string): void {
  if (ownerUserId !== actualOwnerId) {
    throw new AppError("You do not have access to this session", 403);
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildInviteUrl(inviteToken: string): string {
  return new URL(`invite/${encodeURIComponent(inviteToken)}`, ensureTrailingSlash(env.FRONTEND_URL)).toString();
}

async function buildQrCodeDataUrl(inviteUrl: string): Promise<string> {
  return QRCode.toDataURL(inviteUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 280
  });
}

async function serializeSession(session: SessionRecord, extra?: { peerSubmissionCount?: number }) {
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

function resolveInviteExpiry(input: { inviteExpiresInDays?: number; inviteExpiresAt?: Date }): Date {
  if (input.inviteExpiresAt) {
    const expiresAt = new Date(input.inviteExpiresAt);

    if (Number.isNaN(expiresAt.getTime())) {
      throw new AppError("Invite expiry must be a valid date", 400);
    }

    if (expiresAt.getTime() <= Date.now()) {
      throw new AppError("Invite expiry must be in the future", 400);
    }

    const maxAllowedTime = Date.now() + MAX_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (expiresAt.getTime() > maxAllowedTime) {
      throw new AppError(`Invite expiry cannot be more than ${MAX_INVITE_EXPIRY_DAYS} days away`, 400);
    }

    return expiresAt;
  }

  const expiresInDays = input.inviteExpiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS;
  return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
}

function createShortInviteCode(): string {
  let code = "";

  while (code.length < SHORT_INVITE_CODE_LENGTH) {
    const randomIndex = crypto.randomInt(0, INVITE_CODE_ALPHABET.length);
    code += INVITE_CODE_ALPHABET[randomIndex];
  }

  return code;
}

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function generateUniqueInviteCode(executor: PrismaJohariExecutor): Promise<string> {
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

  throw new AppError("Could not generate a unique invite code right now", 500);
}

async function getSession(sessionId: string): Promise<SessionRecord> {
  const session = await prisma.johariSession.findUnique({
    where: {
      id: sessionId
    },
    select: sessionSelect
  });

  if (!session) {
    throw new AppError("Session not found", 404);
  }

  return session;
}

async function validateAdjectiveIds(adjectiveIds: number[]): Promise<void> {
  if (!adjectiveIds.length) {
    return;
  }

  const validCount = await prisma.adjectiveMaster.count({
    where: {
      id: {
        in: adjectiveIds
      }
    }
  });

  if (validCount !== adjectiveIds.length) {
    throw new AppError("One or more adjective IDs are invalid", 400);
  }
}

async function replaceSelfSelections(
  executor: PrismaJohariExecutor,
  sessionId: string,
  requesterId: string,
  adjectiveIds: number[]
): Promise<void> {
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

function toWords(adjectives: ResultAdjective[]): string[] {
  return adjectives.map((item) => item.adjective);
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildWindowPayload(
  key: WindowKey,
  ids: number[],
  adjectiveMap: Map<number, string>,
  selfSet: Set<number>,
  peerSet: Set<number>,
  peerCounts: Record<number, number>,
  peerSubmissionCount: number
): WindowPayload {
  const adjectives = ids
    .map((id) => ({
      adjectiveId: id,
      adjective: adjectiveMap.get(id) ?? "unknown",
      peerCount: peerCounts[id] ?? 0,
      peerSupportPercent:
        peerSubmissionCount > 0 ? roundToSingleDecimal(((peerCounts[id] ?? 0) / peerSubmissionCount) * 100) : 0,
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

function getOwnerLabel(owner: { fullName: string | null; email: string }): string {
  return owner.fullName ?? owner.email.split("@")[0];
}

export async function listAdjectives() {
  const adjectives = await prisma.adjectiveMaster.findMany({
    select: {
      id: true,
      word: true
    },
    orderBy: {
      word: "asc"
    }
  });

  return adjectives satisfies AdjectiveRow[];
}

export async function listUserSessions(userId: string) {
  const sessions = await prisma.johariSession.findMany({
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

  return Promise.all(
    sessions.map((session) =>
      serializeSession(session, {
        peerSubmissionCount: session._count.peerSubmissions
      })
    )
  );
}

export async function createJohariSession(
  userId: string,
  input: { title?: string; inviteExpiresInDays?: number; inviteExpiresAt?: Date; adjectiveIds?: number[] }
) {
  const normalizedIds = normalizeAdjectiveIds(input.adjectiveIds ?? []);
  await validateAdjectiveIds(normalizedIds);

  const inviteExpiresAt = resolveInviteExpiry(input);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const session = await prisma.$transaction(async (tx) => {
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
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new AppError("Could not generate a unique invite code right now", 500);
}

export async function getJohariSessionById(sessionId: string, requesterId: string) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const [selfSelections, peerSubmissionCount] = await Promise.all([
    prisma.selfSelection.findMany({
      where: {
        sessionId,
        userId: requesterId
      },
      select: {
        adjectiveId: true
      }
    }),
    prisma.peerSubmission.count({
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

export async function saveSelfSelections(sessionId: string, requesterId: string, adjectiveIds: number[]) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const normalizedIds = normalizeAdjectiveIds(adjectiveIds);
  await validateAdjectiveIds(normalizedIds);

  await prisma.$transaction(async (tx) => {
    await replaceSelfSelections(tx, sessionId, requesterId, normalizedIds);
  });

  return {
    sessionId,
    selfSelectionAdjectiveIds: normalizedIds
  };
}

export async function updateInviteSettings(
  sessionId: string,
  requesterId: string,
  input: { inviteExpiresInDays?: number; inviteExpiresAt?: Date }
) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const inviteExpiresAt = resolveInviteExpiry(input);

  const updated = await prisma.johariSession.update({
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

export async function getInviteMeta(token: string) {
  const normalizedToken = normalizeInviteToken(token);
  const invite = await prisma.johariSession.findFirst({
    where: {
      inviteToken: normalizedToken,
      inviteExpiresAt: {
        gt: new Date()
      },
      status: JohariSessionStatus.ACTIVE
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
    throw new AppError("Invite link is invalid or expired", 404);
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

export async function submitInviteFeedback(input: {
  inviteToken: string;
  displayName: string;
  adjectiveIds: number[];
  fingerprint: string;
}) {
  const normalizedToken = normalizeInviteToken(input.inviteToken);
  const session = await getActiveSessionByInviteToken(normalizedToken);
  if (!session) {
    throw new AppError("Invite link is invalid or expired", 404);
  }

  const normalizedIds = normalizeAdjectiveIds(input.adjectiveIds);
  await validateAdjectiveIds(normalizedIds);

  try {
    await prisma.peerSubmission.create({
      data: {
        sessionId: session.id,
        inviteToken: normalizedToken,
        peerDisplayName: input.displayName.trim(),
        adjectiveIds: normalizedIds,
        fingerprint: input.fingerprint
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError("You have already submitted feedback for this invite", 409);
    }

    throw error;
  }

  return {
    sessionId: session.id,
    inviteCode: normalizedToken,
    submitted: true
  };
}

export async function computeResults(sessionId: string, requesterId: string) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const [adjectives, selfRows, peerRows] = await Promise.all([
    prisma.adjectiveMaster.findMany({
      select: {
        id: true,
        word: true
      },
      orderBy: {
        id: "asc"
      }
    }),
    prisma.selfSelection.findMany({
      where: {
        sessionId,
        userId: requesterId
      },
      select: {
        adjectiveId: true
      }
    }),
    prisma.peerSubmission.findMany({
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
  const peerCounts: Record<number, number> = {};
  const peerSet = new Set<number>();

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
  const peerCountsJson: Prisma.InputJsonObject = Object.fromEntries(
    Object.entries(peerCounts).map(([adjectiveId, count]) => [adjectiveId, count])
  );

  await prisma.computedResult.upsert({
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
  const hiddenWindow = buildWindowPayload(
    "hidden",
    hiddenIds,
    adjectiveMap,
    selfSet,
    peerSet,
    peerCounts,
    peerSubmissionCount
  );
  const unknownWindow = buildWindowPayload(
    "unknown",
    unknownIds,
    adjectiveMap,
    selfSet,
    peerSet,
    peerCounts,
    peerSubmissionCount
  );

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

  const pools: JohariPools = {
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

export async function generateSessionReport(sessionId: string, requesterId: string) {
  const computed = await computeResults(sessionId, requesterId);

  const generated = await generateGeminiJohariReport({
    pools: computed.pools,
    peerSubmissionCount: computed.summary.peerSubmissionCount,
    topPeerAdjectives: computed.summary.topPeerAdjectives
  });
  const saved = await saveGeminiReport({
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

export async function getLatestSessionReport(sessionId: string, requesterId: string) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const report = await getLatestGeminiReport(sessionId, requesterId);
  return report;
}
