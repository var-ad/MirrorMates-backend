import { JohariSessionStatus } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { normalizeInviteToken } from "../johari/johari.shared";

export async function getActiveSessionByInviteToken(token: string) {
  const normalizedToken = normalizeInviteToken(token);

  return prisma.johariSession.findFirst({
    where: {
      inviteToken: {
        equals: normalizedToken,
        mode: "insensitive"
      },
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
