import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Prisma, PrismaClient, User } from "@prisma/client";
import { OAuth2Client, TokenPayload } from "google-auth-library";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { AppError } from "../../utils/errors";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyRefreshToken,
  type RefreshTokenPayload,
} from "../../utils/jwt";
import { comparePassword, hashPassword } from "../../utils/password";
import {
  assertSmtpConfigured,
  sendPasswordResetOtpEmail,
  sendSignupOtpEmail,
} from "./auth.mailer";

interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
}

interface PublicUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  hasPasswordLogin: boolean;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface GoogleIdentity {
  googleSub: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  payload: TokenPayload;
}

type PrismaAuthExecutor = PrismaClient | Prisma.TransactionClient;

const INVALID_LOGIN_MESSAGE = "Invalid email or password";
const INVALID_REFRESH_MESSAGE = "Invalid refresh token";
const ACCOUNT_UNAVAILABLE_MESSAGE = "Account is unavailable";
const GENERIC_SIGNUP_FAILURE_MESSAGE =
  "Unable to create account with provided credentials";
const LOCAL_ACCOUNT_GOOGLE_CONFLICT_MESSAGE =
  "An account with this email already exists using a password. Please log in with your password to continue.";
const GOOGLE_ACCOUNT_PASSWORD_LOGIN_MESSAGE =
  "This account is linked to Google. Please use 'Sign in with Google'.";
const SIGNUP_OTP_SENT_MESSAGE = "Verification code sent to your email";
const INVALID_SIGNUP_OTP_MESSAGE = "Invalid or expired verification code";
const FORGOT_PASSWORD_SENT_MESSAGE =
  "If an account with that email exists, a password reset code has been sent.";
const INVALID_RESET_OTP_MESSAGE = "Invalid or expired password reset code";
const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Password reset successful. Please log in with your new password.";
const OTP_ATTEMPT_LIMIT = 5;
const SIGNUP_OTP_TTL_MINUTES = 10;
const RESET_OTP_TTL_MINUTES = 10;

const googleOAuthClient = env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(env.GOOGLE_CLIENT_ID)
  : null;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(
  user: Pick<User, "id" | "email" | "fullName" | "avatarUrl" | "passwordHash">,
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    hasPasswordLogin: Boolean(user.passwordHash),
  };
}

function normalizeContext(context: AuthContext): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  return {
    ipAddress: context.ipAddress?.trim() || null,
    userAgent: context.userAgent?.trim() || null,
  };
}

function addMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function generateOtp(): string {
  // Use a cryptographically secure RNG for OTPs.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function isOtpExpired(otpExpiresAt: Date): boolean {
  return otpExpiresAt.getTime() <= Date.now();
}

function isGoogleOnlyUser(input: {
  passwordHash: string | null;
  googleAccounts: Array<unknown>;
}): boolean {
  return !input.passwordHash && input.googleAccounts.length > 0;
}

async function persistRefreshToken(
  executor: PrismaAuthExecutor,
  userId: string,
  refreshToken: string,
  tokenId: string,
  context: AuthContext,
): Promise<void> {
  const decoded = jwt.decode(refreshToken) as jwt.JwtPayload | null;
  if (!decoded?.exp) {
    throw new AppError("Failed to create refresh token", 500);
  }

  const normalizedContext = normalizeContext(context);

  await executor.refreshToken.create({
    data: {
      tokenId,
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
      userAgent: normalizedContext.userAgent,
      ipAddress: normalizedContext.ipAddress,
    },
  });
}

async function issueTokens(
  executor: PrismaAuthExecutor,
  userId: string,
  email: string,
  context: AuthContext,
): Promise<TokenPair> {
  const accessToken = generateAccessToken({ id: userId, email });
  const { token: refreshToken, tokenId } = generateRefreshToken(userId);

  await persistRefreshToken(executor, userId, refreshToken, tokenId, context);

  return {
    accessToken,
    refreshToken,
  };
}

async function revokeAllActiveRefreshTokens(
  executor: PrismaAuthExecutor,
  userId: string,
): Promise<void> {
  await executor.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

async function hasSuspiciousLoginContext(
  executor: PrismaAuthExecutor,
  userId: string,
  context: AuthContext,
): Promise<boolean> {
  const normalizedContext = normalizeContext(context);

  if (!normalizedContext.ipAddress && !normalizedContext.userAgent) {
    return false;
  }

  const activeSessions = await executor.refreshToken.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
    select: {
      ipAddress: true,
      userAgent: true,
    },
  });

  if (activeSessions.length === 0) {
    return false;
  }

  const hasMatchingIp =
    normalizedContext.ipAddress !== null &&
    activeSessions.some(
      (session) => session.ipAddress === normalizedContext.ipAddress,
    );
  const hasMatchingUserAgent =
    normalizedContext.userAgent !== null &&
    activeSessions.some(
      (session) => session.userAgent === normalizedContext.userAgent,
    );

  return !hasMatchingIp && !hasMatchingUserAgent;
}

async function mitigateSuspiciousLogin(
  executor: PrismaAuthExecutor,
  userId: string,
  context: AuthContext,
): Promise<void> {
  const suspicious = await hasSuspiciousLoginContext(executor, userId, context);

  if (!suspicious) {
    return;
  }

  await revokeAllActiveRefreshTokens(executor, userId);
}

async function createUser(
  executor: PrismaAuthExecutor,
  input: {
    email: string;
    passwordHash?: string | null;
    fullName?: string | null;
    avatarUrl?: string | null;
    emailVerified?: boolean;
  },
): Promise<User> {
  return executor.user.create({
    data: {
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash ?? null,
      fullName: input.fullName ?? null,
      avatarUrl: input.avatarUrl ?? null,
      emailVerified: input.emailVerified ?? true,
    },
  });
}

async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: {
      email: normalizeEmail(email),
    },
  });
}

async function getUserByEmailWithProviders(email: string) {
  return prisma.user.findUnique({
    where: {
      email: normalizeEmail(email),
    },
    include: {
      googleAccounts: {
        select: {
          id: true,
          googleSub: true,
        },
      },
      passwordResetOtp: true,
    },
  });
}

async function getUserByGoogleSub(googleSub: string): Promise<User | null> {
  const googleAccount = await prisma.userGoogleAccount.findUnique({
    where: {
      googleSub,
    },
    include: {
      user: true,
    },
  });

  return googleAccount?.user ?? null;
}

async function getUserForSession(
  userId: string,
): Promise<Pick<
  User,
  "id" | "email" | "fullName" | "avatarUrl" | "passwordHash" | "isActive"
> | null> {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      passwordHash: true,
      isActive: true,
    },
  });
}

async function syncUserProfile(
  userId: string,
  input: { fullName?: string | null; avatarUrl?: string | null },
): Promise<void> {
  const data: Prisma.UserUpdateInput = {};

  if (input.fullName !== undefined) {
    data.fullName = input.fullName;
  }

  if (input.avatarUrl !== undefined) {
    data.avatarUrl = input.avatarUrl;
  }

  if (Object.keys(data).length === 0) {
    return;
  }

  await prisma.user.update({
    where: {
      id: userId,
    },
    data,
  });
}

async function upsertGoogleAccount(
  userId: string,
  payload: TokenPayload,
): Promise<void> {
  await prisma.userGoogleAccount.upsert({
    where: {
      googleSub: payload.sub!,
    },
    update: {
      userId,
      email: normalizeEmail(payload.email ?? ""),
      emailVerified: payload.email_verified === true,
      hostedDomain: payload.hd ?? null,
      fullName: payload.name ?? null,
      givenName: payload.given_name ?? null,
      familyName: payload.family_name ?? null,
      pictureUrl: payload.picture ?? null,
      lastLoginAt: new Date(),
    },
    create: {
      userId,
      googleSub: payload.sub!,
      email: normalizeEmail(payload.email ?? ""),
      emailVerified: payload.email_verified === true,
      hostedDomain: payload.hd ?? null,
      fullName: payload.name ?? null,
      givenName: payload.given_name ?? null,
      familyName: payload.family_name ?? null,
      pictureUrl: payload.picture ?? null,
      lastLoginAt: new Date(),
    },
  });
}

async function verifyGoogleIdentityToken(
  idToken: string,
): Promise<TokenPayload> {
  if (!googleOAuthClient || !env.GOOGLE_CLIENT_ID) {
    throw new AppError("Google sign-in is not configured", 503);
  }

  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: idToken.trim(),
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      throw new AppError(
        "Google account did not provide the required identity data",
        401,
      );
    }

    if (payload.email_verified !== true) {
      throw new AppError("Google account email is not verified", 401);
    }

    if (env.GOOGLE_HOSTED_DOMAIN && payload.hd !== env.GOOGLE_HOSTED_DOMAIN) {
      throw new AppError(
        `Google sign-in is restricted to ${env.GOOGLE_HOSTED_DOMAIN}`,
        403,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Invalid Google ID token";

    if (message.includes("Wrong number of segments")) {
      throw new AppError(
        "Invalid Google ID token. Send the Google id_token from the frontend, not GOOGLE_CLIENT_ID.",
        400,
      );
    }

    throw new AppError("Invalid or expired Google ID token", 401);
  }
}

function toGoogleIdentity(payload: TokenPayload): GoogleIdentity {
  return {
    googleSub: payload.sub!,
    email: normalizeEmail(payload.email!),
    fullName: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
    payload,
  };
}

async function resolveGoogleLoginUser(identity: GoogleIdentity): Promise<User> {
  let user = await getUserByGoogleSub(identity.googleSub);

  if (!user) {
    const existingByEmail = await getUserByEmailWithProviders(identity.email);

    if (existingByEmail) {
      if (!existingByEmail.isActive) {
        throw new AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
      }

      if (existingByEmail.passwordHash) {
        throw new AppError(LOCAL_ACCOUNT_GOOGLE_CONFLICT_MESSAGE, 409);
      }

      user = existingByEmail;
    }
  }

  if (user && !user.isActive) {
    throw new AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
  }

  if (!user) {
    return createUser(prisma, {
      email: identity.email,
      passwordHash: null,
      fullName: identity.fullName,
      avatarUrl: identity.avatarUrl,
      emailVerified: true,
    });
  }

  await syncUserProfile(user.id, {
    fullName: identity.fullName ?? undefined,
    avatarUrl: identity.avatarUrl ?? undefined,
  });

  return {
    ...user,
    fullName: identity.fullName ?? user.fullName,
    avatarUrl: identity.avatarUrl ?? user.avatarUrl,
  };
}

export async function signup(
  input: { email: string; password: string; fullName?: string },
  _context: AuthContext,
): Promise<{ message: string; email: string; expiresInMinutes: number }> {
  assertSmtpConfigured();

  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);

  if (existing) {
    throw new AppError(GENERIC_SIGNUP_FAILURE_MESSAGE, 400);
  }

  const [passwordHash, otp] = await Promise.all([
    hashPassword(input.password),
    Promise.resolve(generateOtp()),
  ]);
  const otpHash = await hashPassword(otp);

  await prisma.pendingLocalSignup.upsert({
    where: {
      email,
    },
    update: {
      passwordHash,
      fullName: input.fullName?.trim() || null,
      otpHash,
      otpExpiresAt: addMinutes(SIGNUP_OTP_TTL_MINUTES),
      attempts: 0,
    },
    create: {
      email,
      passwordHash,
      fullName: input.fullName?.trim() || null,
      otpHash,
      otpExpiresAt: addMinutes(SIGNUP_OTP_TTL_MINUTES),
      attempts: 0,
    },
  });

  await sendSignupOtpEmail({
    to: email,
    otp,
    fullName: input.fullName ?? null,
    expiresInMinutes: SIGNUP_OTP_TTL_MINUTES,
  });

  return {
    message: SIGNUP_OTP_SENT_MESSAGE,
    email,
    expiresInMinutes: SIGNUP_OTP_TTL_MINUTES,
  };
}

export async function verifySignupOtp(
  input: { email: string; otp: string },
  context: AuthContext,
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const email = normalizeEmail(input.email);

  return prisma.$transaction(async (tx) => {
    const pendingSignup = await tx.pendingLocalSignup.findUnique({
      where: {
        email,
      },
    });

    if (!pendingSignup) {
      throw new AppError(INVALID_SIGNUP_OTP_MESSAGE, 400);
    }

    if (
      pendingSignup.attempts >= OTP_ATTEMPT_LIMIT ||
      isOtpExpired(pendingSignup.otpExpiresAt)
    ) {
      await tx.pendingLocalSignup.delete({
        where: {
          email,
        },
      });
      throw new AppError(INVALID_SIGNUP_OTP_MESSAGE, 400);
    }

    const otpValid = await comparePassword(input.otp, pendingSignup.otpHash);

    if (!otpValid) {
      await tx.pendingLocalSignup.update({
        where: {
          email,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });
      throw new AppError(INVALID_SIGNUP_OTP_MESSAGE, 400);
    }

    const existingUser = await tx.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      await tx.pendingLocalSignup.delete({
        where: {
          email,
        },
      });
      throw new AppError(GENERIC_SIGNUP_FAILURE_MESSAGE, 400);
    }

    const user = await createUser(tx, {
      email,
      passwordHash: pendingSignup.passwordHash,
      fullName: pendingSignup.fullName,
      emailVerified: true,
    });

    await tx.pendingLocalSignup.delete({
      where: {
        email,
      },
    });

    const tokens = await issueTokens(tx, user.id, user.email, context);

    return {
      user: toPublicUser(user),
      tokens,
    };
  });
}

export async function login(
  input: { email: string; password: string },
  context: AuthContext,
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const user = await getUserByEmailWithProviders(input.email);

  if (!user) {
    throw new AppError(INVALID_LOGIN_MESSAGE, 401);
  }

  if (!user.isActive) {
    throw new AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
  }

  if (!user.passwordHash && isGoogleOnlyUser(user)) {
    throw new AppError(GOOGLE_ACCOUNT_PASSWORD_LOGIN_MESSAGE, 400);
  }

  if (!user.passwordHash) {
    throw new AppError(INVALID_LOGIN_MESSAGE, 401);
  }

  const validPassword = await comparePassword(
    input.password,
    user.passwordHash,
  );

  if (!validPassword) {
    throw new AppError(INVALID_LOGIN_MESSAGE, 401);
  }

  const tokens = await prisma.$transaction(async (tx) => {
    await mitigateSuspiciousLogin(tx, user.id, context);
    return issueTokens(tx, user.id, user.email, context);
  });

  return {
    user: toPublicUser(user),
    tokens,
  };
}

export async function googleLogin(
  input: { idToken: string },
  context: AuthContext,
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const googlePayload = await verifyGoogleIdentityToken(input.idToken);
  const googleIdentity = toGoogleIdentity(googlePayload);
  const user = await resolveGoogleLoginUser(googleIdentity);

  await upsertGoogleAccount(user.id, googleIdentity.payload);

  const tokens = await prisma.$transaction(async (tx) => {
    await mitigateSuspiciousLogin(tx, user.id, context);
    return issueTokens(tx, user.id, user.email, context);
  });

  return {
    user: toPublicUser(user),
    tokens,
  };
}

export async function forgotPassword(
  email: string,
): Promise<{ message: string }> {
  assertSmtpConfigured();

  const normalizedEmail = normalizeEmail(email);
  const user = await getUserByEmailWithProviders(normalizedEmail);

  if (!user || !user.isActive || !user.passwordHash) {
    return { message: FORGOT_PASSWORD_SENT_MESSAGE };
  }

  const otp = generateOtp();
  const otpHash = await hashPassword(otp);

  await prisma.passwordResetOtp.upsert({
    where: {
      userId: user.id,
    },
    update: {
      otpHash,
      otpExpiresAt: addMinutes(RESET_OTP_TTL_MINUTES),
      attempts: 0,
    },
    create: {
      userId: user.id,
      otpHash,
      otpExpiresAt: addMinutes(RESET_OTP_TTL_MINUTES),
      attempts: 0,
    },
  });

  await sendPasswordResetOtpEmail({
    to: user.email,
    otp,
    fullName: user.fullName,
    expiresInMinutes: RESET_OTP_TTL_MINUTES,
  });

  return { message: FORGOT_PASSWORD_SENT_MESSAGE };
}

export async function resetPassword(input: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const normalizedEmail = normalizeEmail(input.email);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      include: {
        googleAccounts: {
          select: {
            id: true,
          },
        },
        passwordResetOtp: true,
      },
    });

    if (
      !user ||
      !user.isActive ||
      !user.passwordHash ||
      !user.passwordResetOtp
    ) {
      throw new AppError(INVALID_RESET_OTP_MESSAGE, 400);
    }

    if (
      user.passwordResetOtp.attempts >= OTP_ATTEMPT_LIMIT ||
      isOtpExpired(user.passwordResetOtp.otpExpiresAt)
    ) {
      await tx.passwordResetOtp.delete({
        where: {
          userId: user.id,
        },
      });
      throw new AppError(INVALID_RESET_OTP_MESSAGE, 400);
    }

    const otpValid = await comparePassword(
      input.otp,
      user.passwordResetOtp.otpHash,
    );

    if (!otpValid) {
      await tx.passwordResetOtp.update({
        where: {
          userId: user.id,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });
      throw new AppError(INVALID_RESET_OTP_MESSAGE, 400);
    }

    const nextPasswordHash = await hashPassword(input.newPassword);

    await tx.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash: nextPasswordHash,
        emailVerified: true,
      },
    });

    await tx.passwordResetOtp.delete({
      where: {
        userId: user.id,
      },
    });

    await revokeAllActiveRefreshTokens(tx, user.id);
  });

  return { message: PASSWORD_RESET_SUCCESS_MESSAGE };
}

export async function getCurrentUser(
  userId: string,
): Promise<{ user: PublicUser }> {
  const user = await getUserForSession(userId);

  if (!user || !user.isActive) {
    throw new AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
  }

  return {
    user: toPublicUser(user),
  };
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  context: AuthContext,
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    throw new AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
  }

  if (!user.passwordHash) {
    throw new AppError(
      "Password sign-in is not available for this account",
      400,
    );
  }

  const validPassword = await comparePassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!validPassword) {
    throw new AppError("Current password is incorrect", 400);
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  const tokens = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    await revokeAllActiveRefreshTokens(tx, user.id);

    return issueTokens(tx, user.id, user.email, context);
  });

  return {
    user: toPublicUser(user),
    tokens,
  };
}

export async function refresh(
  refreshToken: string,
  context: AuthContext,
): Promise<TokenPair> {
  const payload = verifyRefreshToken(refreshToken);
  const hashedToken = hashToken(refreshToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshToken.updateMany({
      where: {
        tokenId: payload.tid,
        userId: payload.sub,
        tokenHash: hashedToken,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
      },
    });

    if (revoked.count !== 1) {
      throw new AppError(INVALID_REFRESH_MESSAGE, 401);
    }

    const user = await tx.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new AppError(INVALID_REFRESH_MESSAGE, 401);
    }

    return issueTokens(tx, user.id, user.email, context);
  });
}

export async function logout(refreshToken: string): Promise<void> {
  let payload: RefreshTokenPayload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    // Idempotent logout: invalid or already-expired refresh tokens have nothing to revoke.
    return;
  }

  await prisma.refreshToken.updateMany({
    where: {
      tokenId: payload.tid,
      userId: payload.sub,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
