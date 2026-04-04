import crypto from "crypto";
import {
  JohariResponseIdentityMode,
  JohariSession,
  Prisma,
} from "@prisma/client";
import QRCode from "qrcode";
import { env } from "../../../config/env";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../utils/errors";

const DEFAULT_INVITE_EXPIRY_DAYS = 7;
const MAX_INVITE_EXPIRY_DAYS = 30;
const SHORT_INVITE_CODE_LENGTH = 5;
const SHORT_INVITE_CODE_REGEX = /^[A-Z0-9]{5}$/i;
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const sessionSelect = {
  id: true,
  ownerUserId: true,
  title: true,
  inviteToken: true,
  inviteExpiresAt: true,
  responseIdentityMode: true,
  createdAt: true,
} as const;

export type PrismaJohariExecutor = typeof prisma | Prisma.TransactionClient;

export type SessionRecord = Pick<
  JohariSession,
  | "id"
  | "ownerUserId"
  | "title"
  | "inviteToken"
  | "inviteExpiresAt"
  | "responseIdentityMode"
  | "createdAt"
>;

export interface AdjectiveRow {
  id: number;
  word: string;
}

export interface ResultAdjective {
  adjectiveId: number;
  adjective: string;
  peerCount: number;
  peerSupportPercent: number;
  selectedBySelf: boolean;
  selectedByPeers: boolean;
}

export interface WindowPayload {
  key: keyof import("../../reports/gemini.service").JohariPools;
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

export type ResponseIdentityMode = "anonymous" | "named";

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function createShortInviteCode(): string {
  let code = "";

  while (code.length < SHORT_INVITE_CODE_LENGTH) {
    const randomIndex = crypto.randomInt(0, INVITE_CODE_ALPHABET.length);
    code += INVITE_CODE_ALPHABET[randomIndex];
  }

  return code;
}

export async function buildQrCodeDataUrl(inviteUrl: string): Promise<string> {
  return QRCode.toDataURL(inviteUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 280,
  });
}

export function normalizeAdjectiveIds(adjectiveIds: number[]): number[] {
  return [
    ...new Set(
      adjectiveIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

export function normalizeInviteToken(token: string): string {
  const trimmed = token.trim();

  if (SHORT_INVITE_CODE_REGEX.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed;
}

export function assertOwner(ownerUserId: string, actualOwnerId: string): void {
  if (ownerUserId !== actualOwnerId) {
    throw new AppError("You do not have access to this session", 403);
  }
}

export function toApiResponseIdentityMode(
  mode: JohariResponseIdentityMode,
): ResponseIdentityMode {
  return mode === JohariResponseIdentityMode.ANONYMOUS ? "anonymous" : "named";
}

export function toPrismaResponseIdentityMode(
  mode?: ResponseIdentityMode,
): JohariResponseIdentityMode {
  return mode === "anonymous"
    ? JohariResponseIdentityMode.ANONYMOUS
    : JohariResponseIdentityMode.NAMED;
}

export function requiresDisplayName(mode: JohariResponseIdentityMode): boolean {
  return mode === JohariResponseIdentityMode.NAMED;
}

export function buildInviteUrl(inviteToken: string): string {
  return new URL(
    `invite/${encodeURIComponent(inviteToken)}`,
    ensureTrailingSlash(env.FRONTEND_URL),
  ).toString();
}

export async function serializeSession(
  session: SessionRecord,
  extra?: { peerSubmissionCount?: number },
) {
  const inviteCode = session.inviteToken;
  const createdAt = new Date(session.createdAt);
  const inviteExpiresAt = new Date(session.inviteExpiresAt);
  const inviteUrl = buildInviteUrl(inviteCode);
  const qrCodeDataUrl = await buildQrCodeDataUrl(inviteUrl);
  const responseIdentityMode = toApiResponseIdentityMode(
    session.responseIdentityMode,
  );
  const displayNameRequired = requiresDisplayName(session.responseIdentityMode);

  return {
    id: session.id,
    title: session.title,
    createdAt,
    inviteToken: inviteCode,
    inviteCode,
    inviteExpiresAt,
    responseIdentityMode,
    requiresDisplayName: displayNameRequired,
    isInviteExpired: inviteExpiresAt.getTime() <= Date.now(),
    peerSubmissionCount: extra?.peerSubmissionCount,
    share: {
      inviteCode,
      inviteUrl,
      qrCodeUrl: qrCodeDataUrl,
      qrCodeDataUrl,
      inviteExpiresAt,
      responseIdentityMode,
      requiresDisplayName: displayNameRequired,
      isExpired: inviteExpiresAt.getTime() <= Date.now(),
    },
  };
}

export function resolveInviteExpiry(input: {
  inviteExpiresInDays?: number;
  inviteExpiresAt?: Date;
}): Date {
  if (input.inviteExpiresAt) {
    const expiresAt = new Date(input.inviteExpiresAt);

    if (Number.isNaN(expiresAt.getTime())) {
      throw new AppError("Invite expiry must be a valid date", 400);
    }

    if (expiresAt.getTime() <= Date.now()) {
      throw new AppError("Invite expiry must be in the future", 400);
    }

    const maxAllowedTime =
      Date.now() + MAX_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (expiresAt.getTime() > maxAllowedTime) {
      throw new AppError(
        `Invite expiry cannot be more than ${MAX_INVITE_EXPIRY_DAYS} days away`,
        400,
      );
    }

    return expiresAt;
  }

  const expiresInDays = input.inviteExpiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS;
  return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
}

export function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function generateUniqueInviteCode(
  executor: PrismaJohariExecutor,
): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = createShortInviteCode();
    const existing = await executor.johariSession.findUnique({
      where: {
        inviteToken: candidate,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new AppError("Could not generate a unique invite code right now", 500);
}

export async function getSession(sessionId: string): Promise<SessionRecord> {
  const session = await prisma.johariSession.findUnique({
    where: {
      id: sessionId,
    },
    select: sessionSelect,
  });

  if (!session) {
    throw new AppError("Session not found", 404);
  }

  return session;
}

export async function validateAdjectiveIds(
  adjectiveIds: number[],
): Promise<void> {
  if (!adjectiveIds.length) {
    return;
  }

  const validCount = await prisma.adjectiveMaster.count({
    where: {
      id: {
        in: adjectiveIds,
      },
    },
  });

  if (validCount !== adjectiveIds.length) {
    throw new AppError("One or more adjective IDs are invalid", 400);
  }
}

export async function replaceSelfSelections(
  executor: PrismaJohariExecutor,
  sessionId: string,
  requesterId: string,
  adjectiveIds: number[],
): Promise<void> {
  await executor.selfSelection.deleteMany({
    where: {
      sessionId,
      userId: requesterId,
    },
  });

  if (!adjectiveIds.length) {
    return;
  }

  await executor.selfSelection.createMany({
    data: adjectiveIds.map((adjectiveId) => ({
      sessionId,
      userId: requesterId,
      adjectiveId,
    })),
  });
}

export function toWords(adjectives: ResultAdjective[]): string[] {
  return adjectives.map((item) => item.adjective);
}

export function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getOwnerLabel(owner: {
  fullName: string | null;
  email: string;
}): string {
  return owner.fullName ?? owner.email.split("@")[0];
}
