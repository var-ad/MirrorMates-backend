import { Prisma } from "@prisma/client";
import { AppError } from "../../../utils/errors";
import { prisma } from "../../../db/prisma";
import {
  AdjectiveRow,
  ResponseIdentityMode,
  assertOwner,
  generateUniqueInviteCode,
  getSession,
  isUniqueConstraintError,
  normalizeAdjectiveIds,
  replaceSelfSelections,
  resolveInviteExpiry,
  serializeSession,
  sessionSelect,
  toPrismaResponseIdentityMode,
  validateAdjectiveIds,
} from "./johari.shared";

export async function listAdjectives() {
  const adjectives = await prisma.adjectiveMaster.findMany({
    select: {
      id: true,
      word: true,
    },
    orderBy: {
      word: "asc",
    },
  });

  return adjectives satisfies AdjectiveRow[];
}

export async function listUserSessions(userId: string) {
  const sessions = await prisma.johariSession.findMany({
    where: {
      ownerUserId: userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      _count: {
        select: {
          peerSubmissions: true,
        },
      },
    },
  });

  return Promise.all(
    sessions.map((session) =>
      serializeSession(session, {
        peerSubmissionCount: session._count.peerSubmissions,
      }),
    ),
  );
}

export async function createJohariSession(
  userId: string,
  input: {
    title?: string;
    inviteExpiresInDays?: number;
    inviteExpiresAt?: Date;
    adjectiveIds?: number[];
    responseIdentityMode?: ResponseIdentityMode;
  },
) {
  const normalizedIds = normalizeAdjectiveIds(input.adjectiveIds ?? []);
  await validateAdjectiveIds(normalizedIds);

  const inviteExpiresAt = resolveInviteExpiry(input);
  const responseIdentityMode = toPrismaResponseIdentityMode(
    input.responseIdentityMode,
  );

  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const session = await prisma.$transaction(async (tx) => {
        const inviteCode = await generateUniqueInviteCode(tx);
        const created = await tx.johariSession.create({
          data: {
            ownerUserId: userId,
            title: input.title ?? "My Johari Window",
            inviteToken: inviteCode,
            inviteExpiresAt,
            responseIdentityMode,
          },
          select: sessionSelect,
        });

        await replaceSelfSelections(tx, created.id, userId, normalizedIds);

        return created;
      });

      return {
        session: await serializeSession(session, { peerSubmissionCount: 0 }),
        selfSelectionAdjectiveIds: normalizedIds,
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

export async function getJohariSessionById(
  sessionId: string,
  requesterId: string,
) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const [selfSelections, peerSubmissionCount] = await Promise.all([
    prisma.selfSelection.findMany({
      where: {
        sessionId,
        userId: requesterId,
      },
      select: {
        adjectiveId: true,
      },
    }),
    prisma.peerSubmission.count({
      where: {
        sessionId,
      },
    }),
  ]);

  return {
    session: await serializeSession(session, { peerSubmissionCount }),
    selfSelectionAdjectiveIds: selfSelections.map((row) => row.adjectiveId),
    peerSubmissionCount,
  };
}

export async function saveSelfSelections(
  sessionId: string,
  requesterId: string,
  adjectiveIds: number[],
) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const normalizedIds = normalizeAdjectiveIds(adjectiveIds);
  await validateAdjectiveIds(normalizedIds);

  await prisma.$transaction(async (tx) => {
    await replaceSelfSelections(tx, sessionId, requesterId, normalizedIds);
  });

  return {
    sessionId,
    selfSelectionAdjectiveIds: normalizedIds,
  };
}

export async function updateInviteSettings(
  sessionId: string,
  requesterId: string,
  input: {
    inviteExpiresInDays?: number;
    inviteExpiresAt?: Date;
    responseIdentityMode?: ResponseIdentityMode;
  },
) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const data: Prisma.JohariSessionUpdateInput = {};

  if (
    input.inviteExpiresInDays !== undefined ||
    input.inviteExpiresAt !== undefined
  ) {
    data.inviteExpiresAt = resolveInviteExpiry(input);
    data.expiryReportEmailSentAt = null;
  }

  if (input.responseIdentityMode !== undefined) {
    data.responseIdentityMode = toPrismaResponseIdentityMode(
      input.responseIdentityMode,
    );
  }

  const updated = await prisma.johariSession.update({
    where: {
      id: sessionId,
    },
    data,
    select: sessionSelect,
  });

  return serializeSession(updated);
}
