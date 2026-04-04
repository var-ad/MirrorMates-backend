"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveSessionByInviteToken = getActiveSessionByInviteToken;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../db/prisma");
async function getActiveSessionByInviteToken(token) {
    const trimmedToken = token.trim();
    const normalizedToken = /^[A-Z0-9]{5}$/i.test(trimmedToken) ? trimmedToken.toUpperCase() : trimmedToken;
    return prisma_1.prisma.johariSession.findFirst({
        where: {
            inviteToken: normalizedToken,
            inviteExpiresAt: {
                gt: new Date()
            },
            status: client_1.JohariSessionStatus.ACTIVE
        },
        select: {
            id: true,
            ownerUserId: true,
            inviteToken: true,
            inviteExpiresAt: true,
            responseIdentityMode: true
        }
    });
}
