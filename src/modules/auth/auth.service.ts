import jwt from "jsonwebtoken";
import { Prisma, PrismaClient, User } from "@prisma/client";
import { OAuth2Client, TokenPayload } from "google-auth-library";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { AppError } from "../../utils/errors";
import { generateAccessToken, generateRefreshToken, hashToken, verifyRefreshToken } from "../../utils/jwt";
import { comparePassword, hashPassword } from "../../utils/password";

interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
}

interface PublicUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

type PrismaAuthExecutor = PrismaClient | Prisma.TransactionClient;

const googleOAuthClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(user: Pick<User, "id" | "email" | "fullName" | "avatarUrl">): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl
  };
}

async function persistRefreshToken(
  executor: PrismaAuthExecutor,
  userId: string,
  refreshToken: string,
  tokenId: string,
  context: AuthContext
): Promise<void> {
  const decoded = jwt.decode(refreshToken) as jwt.JwtPayload | null;
  if (!decoded?.exp) {
    throw new AppError("Failed to create refresh token", 500);
  }

  await executor.refreshToken.create({
    data: {
      tokenId,
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
      userAgent: context.userAgent ?? null,
      ipAddress: context.ipAddress ?? null
    }
  });
}

async function issueTokens(
  executor: PrismaAuthExecutor,
  userId: string,
  email: string,
  context: AuthContext
): Promise<TokenPair> {
  const accessToken = generateAccessToken({ id: userId, email });
  const { token: refreshToken, tokenId } = generateRefreshToken(userId);

  await persistRefreshToken(executor, userId, refreshToken, tokenId, context);

  return {
    accessToken,
    refreshToken
  };
}

async function createUser(input: {
  email: string;
  passwordHash?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
}): Promise<User> {
  return prisma.user.create({
    data: {
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash ?? null,
      fullName: input.fullName ?? null,
      avatarUrl: input.avatarUrl ?? null
    }
  });
}

async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: {
      email: normalizeEmail(email)
    }
  });
}

async function getUserByGoogleSub(googleSub: string): Promise<User | null> {
  const googleAccount = await prisma.userGoogleAccount.findUnique({
    where: {
      googleSub
    },
    include: {
      user: true
    }
  });

  return googleAccount?.user ?? null;
}

async function syncUserProfile(userId: string, input: { fullName?: string | null; avatarUrl?: string | null }): Promise<void> {
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
      id: userId
    },
    data
  });
}

async function upsertGoogleAccount(userId: string, payload: TokenPayload): Promise<void> {
  await prisma.userGoogleAccount.upsert({
    where: {
      googleSub: payload.sub!
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
      lastLoginAt: new Date()
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
      lastLoginAt: new Date()
    }
  });
}

async function verifyGoogleIdentityToken(idToken: string): Promise<TokenPayload> {
  if (!googleOAuthClient || !env.GOOGLE_CLIENT_ID) {
    throw new AppError("Google sign-in is not configured", 503);
  }

  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: idToken.trim(),
      audience: env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      throw new AppError("Google account did not provide the required identity data", 401);
    }

    if (payload.email_verified !== true) {
      throw new AppError("Google account email is not verified", 401);
    }

    if (env.GOOGLE_HOSTED_DOMAIN && payload.hd !== env.GOOGLE_HOSTED_DOMAIN) {
      throw new AppError(`Google sign-in is restricted to ${env.GOOGLE_HOSTED_DOMAIN}`, 403);
    }

    return payload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Invalid Google ID token";

    if (message.includes("Wrong number of segments")) {
      throw new AppError("Invalid Google ID token. Send the Google id_token from the frontend, not GOOGLE_CLIENT_ID.", 400);
    }

    throw new AppError("Invalid or expired Google ID token", 401);
  }
}

export async function signup(
  input: { email: string; password: string; fullName?: string },
  context: AuthContext
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);

  if (existing) {
    throw new AppError("Email is already registered", 409);
  }

  const hashedPassword = await hashPassword(input.password);
  const user = await createUser({
    email,
    passwordHash: hashedPassword,
    fullName: input.fullName ?? null
  });

  const tokens = await issueTokens(prisma, user.id, user.email, context);

  return {
    user: toPublicUser(user),
    tokens
  };
}

export async function login(
  input: { email: string; password: string },
  context: AuthContext
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const user = await getUserByEmail(input.email);

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  if (!user.passwordHash) {
    throw new AppError("This account uses Google sign-in", 401);
  }

  const validPassword = await comparePassword(input.password, user.passwordHash);

  if (!validPassword) {
    throw new AppError("Invalid email or password", 401);
  }

  const tokens = await issueTokens(prisma, user.id, user.email, context);

  return {
    user: toPublicUser(user),
    tokens
  };
}

export async function googleLogin(
  input: { idToken: string },
  context: AuthContext
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const googleProfile = await verifyGoogleIdentityToken(input.idToken);
  const normalizedEmail = normalizeEmail(googleProfile.email!);
  const fullName = googleProfile.name ?? null;
  const avatarUrl = googleProfile.picture ?? null;

  let user = await getUserByGoogleSub(googleProfile.sub!);

  if (!user) {
    user = await getUserByEmail(normalizedEmail);
  }

  if (!user) {
    user = await createUser({
      email: normalizedEmail,
      passwordHash: null,
      fullName,
      avatarUrl
    });
  } else {
    await syncUserProfile(user.id, {
      fullName: fullName ?? undefined,
      avatarUrl: avatarUrl ?? undefined
    });
    user = {
      ...user,
      fullName: fullName ?? user.fullName,
      avatarUrl: avatarUrl ?? user.avatarUrl
    };
  }

  await upsertGoogleAccount(user.id, googleProfile);

  const tokens = await issueTokens(prisma, user.id, user.email, context);

  return {
    user: toPublicUser(user),
    tokens
  };
}

export async function refresh(refreshToken: string, context: AuthContext): Promise<TokenPair> {
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
          gt: now
        }
      },
      data: {
        revokedAt: now
      }
    });

    if (revoked.count !== 1) {
      throw new AppError("Invalid refresh token", 401);
    }

    const user = await tx.user.findUnique({
      where: {
        id: payload.sub
      },
      select: {
        id: true,
        email: true
      }
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return issueTokens(tx, user.id, user.email, context);
  });
}

export async function logout(refreshToken: string): Promise<void> {
  const payload = verifyRefreshToken(refreshToken);

  await prisma.refreshToken.updateMany({
    where: {
      tokenId: payload.tid,
      userId: payload.sub,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}
