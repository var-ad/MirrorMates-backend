import { JohariSessionStatus } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../utils/errors";
import { getActiveSessionByInviteToken } from "../common/invite.service";
import {
  buildQrCodeDataUrl,
  buildInviteUrl,
  getOwnerLabel,
  isUniqueConstraintError,
  normalizeAdjectiveIds,
  normalizeInviteToken,
  requiresDisplayName,
  toApiResponseIdentityMode,
  validateAdjectiveIds,
} from "./johari.shared";

export async function getInviteMeta(token: string) {
  const normalizedToken = normalizeInviteToken(token);
  const invite = await prisma.johariSession.findFirst({
    where: {
      inviteToken: normalizedToken,
      inviteExpiresAt: {
        gt: new Date(),
      },
      status: JohariSessionStatus.ACTIVE,
    },
    select: {
      id: true,
      title: true,
      inviteToken: true,
      inviteExpiresAt: true,
      responseIdentityMode: true,
      owner: {
        select: {
          fullName: true,
          email: true,
        },
      },
    },
  });

  if (!invite) {
    throw new AppError("Invite link is invalid or expired", 404);
  }

  const inviteUrl = buildInviteUrl(invite.inviteToken);
  const inviteExpiresAt = new Date(invite.inviteExpiresAt);
  const qrCodeDataUrl = await buildQrCodeDataUrl(inviteUrl);
  const responseIdentityMode = toApiResponseIdentityMode(
    invite.responseIdentityMode,
  );

  return {
    sessionId: invite.id,
    title: invite.title,
    ownerLabel: getOwnerLabel(invite.owner),
    inviteCode: invite.inviteToken,
    inviteExpiresAt,
    responseIdentityMode,
    requiresDisplayName: requiresDisplayName(invite.responseIdentityMode),
    inviteUrl,
    qrCodeUrl: qrCodeDataUrl,
    qrCodeDataUrl,
  };
}

export async function submitInviteFeedback(input: {
  inviteToken: string;
  displayName?: string;
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
  const trimmedDisplayName = input.displayName?.trim() ?? "";
  const displayNameRequired = requiresDisplayName(session.responseIdentityMode);

  if (
    displayNameRequired &&
    (trimmedDisplayName.length < 2 || trimmedDisplayName.length > 50)
  ) {
    throw new AppError(
      "Display name is required for named feedback sessions",
      400,
    );
  }

  try {
    await prisma.peerSubmission.create({
      data: {
        sessionId: session.id,
        inviteToken: normalizedToken,
        peerDisplayName: displayNameRequired ? trimmedDisplayName : null,
        adjectiveIds: normalizedIds,
        fingerprint: input.fingerprint,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(
        "You have already submitted feedback for this invite",
        409,
      );
    }

    throw error;
  }

  return {
    sessionId: session.id,
    inviteCode: normalizedToken,
    submitted: true,
  };
}
