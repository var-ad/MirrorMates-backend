import { JohariSessionStatus } from "@prisma/client";
import { prisma } from "../../../db/prisma";

export async function getActiveSessionByInviteToken(token: string) {
  const trimmedToken = token.trim();
  const normalizedToken = /^[A-Z0-9]{5}$/i.test(trimmedToken) ? trimmedToken.toUpperCase() : trimmedToken;

  return prisma.johariSession.findFirst({
    where: {
      inviteToken: normalizedToken,
      inviteExpiresAt: {
        gt: new Date()
      },
      status: JohariSessionStatus.ACTIVE
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
