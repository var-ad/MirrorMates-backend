"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signup = signup;
exports.login = login;
exports.googleLogin = googleLogin;
exports.refresh = refresh;
exports.logout = logout;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const env_1 = require("../../config/env");
const prisma_1 = require("../../db/prisma");
const errors_1 = require("../../utils/errors");
const jwt_1 = require("../../utils/jwt");
const password_1 = require("../../utils/password");
const googleOAuthClient = env_1.env.GOOGLE_CLIENT_ID ? new google_auth_library_1.OAuth2Client(env_1.env.GOOGLE_CLIENT_ID) : null;
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function toPublicUser(user) {
    return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl
    };
}
async function persistRefreshToken(executor, userId, refreshToken, tokenId, context) {
    const decoded = jsonwebtoken_1.default.decode(refreshToken);
    if (!decoded?.exp) {
        throw new errors_1.AppError("Failed to create refresh token", 500);
    }
    await executor.refreshToken.create({
        data: {
            tokenId,
            userId,
            tokenHash: (0, jwt_1.hashToken)(refreshToken),
            expiresAt: new Date(decoded.exp * 1000),
            userAgent: context.userAgent ?? null,
            ipAddress: context.ipAddress ?? null
        }
    });
}
async function issueTokens(executor, userId, email, context) {
    const accessToken = (0, jwt_1.generateAccessToken)({ id: userId, email });
    const { token: refreshToken, tokenId } = (0, jwt_1.generateRefreshToken)(userId);
    await persistRefreshToken(executor, userId, refreshToken, tokenId, context);
    return {
        accessToken,
        refreshToken
    };
}
async function createUser(input) {
    return prisma_1.prisma.user.create({
        data: {
            email: normalizeEmail(input.email),
            passwordHash: input.passwordHash ?? null,
            fullName: input.fullName ?? null,
            avatarUrl: input.avatarUrl ?? null
        }
    });
}
async function getUserByEmail(email) {
    return prisma_1.prisma.user.findUnique({
        where: {
            email: normalizeEmail(email)
        }
    });
}
async function getUserByGoogleSub(googleSub) {
    const googleAccount = await prisma_1.prisma.userGoogleAccount.findUnique({
        where: {
            googleSub
        },
        include: {
            user: true
        }
    });
    return googleAccount?.user ?? null;
}
async function syncUserProfile(userId, input) {
    const data = {};
    if (input.fullName !== undefined) {
        data.fullName = input.fullName;
    }
    if (input.avatarUrl !== undefined) {
        data.avatarUrl = input.avatarUrl;
    }
    if (Object.keys(data).length === 0) {
        return;
    }
    await prisma_1.prisma.user.update({
        where: {
            id: userId
        },
        data
    });
}
async function upsertGoogleAccount(userId, payload) {
    await prisma_1.prisma.userGoogleAccount.upsert({
        where: {
            googleSub: payload.sub
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
            googleSub: payload.sub,
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
async function verifyGoogleIdentityToken(idToken) {
    if (!googleOAuthClient || !env_1.env.GOOGLE_CLIENT_ID) {
        throw new errors_1.AppError("Google sign-in is not configured", 503);
    }
    try {
        const ticket = await googleOAuthClient.verifyIdToken({
            idToken: idToken.trim(),
            audience: env_1.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        if (!payload?.sub || !payload.email) {
            throw new errors_1.AppError("Google account did not provide the required identity data", 401);
        }
        if (payload.email_verified !== true) {
            throw new errors_1.AppError("Google account email is not verified", 401);
        }
        if (env_1.env.GOOGLE_HOSTED_DOMAIN && payload.hd !== env_1.env.GOOGLE_HOSTED_DOMAIN) {
            throw new errors_1.AppError(`Google sign-in is restricted to ${env_1.env.GOOGLE_HOSTED_DOMAIN}`, 403);
        }
        return payload;
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : "Invalid Google ID token";
        if (message.includes("Wrong number of segments")) {
            throw new errors_1.AppError("Invalid Google ID token. Send the Google id_token from the frontend, not GOOGLE_CLIENT_ID.", 400);
        }
        throw new errors_1.AppError("Invalid or expired Google ID token", 401);
    }
}
async function signup(input, context) {
    const email = normalizeEmail(input.email);
    const existing = await getUserByEmail(email);
    if (existing) {
        throw new errors_1.AppError("Email is already registered", 409);
    }
    const hashedPassword = await (0, password_1.hashPassword)(input.password);
    const user = await createUser({
        email,
        passwordHash: hashedPassword,
        fullName: input.fullName ?? null
    });
    const tokens = await issueTokens(prisma_1.prisma, user.id, user.email, context);
    return {
        user: toPublicUser(user),
        tokens
    };
}
async function login(input, context) {
    const user = await getUserByEmail(input.email);
    if (!user) {
        throw new errors_1.AppError("Invalid email or password", 401);
    }
    if (!user.passwordHash) {
        throw new errors_1.AppError("This account uses Google sign-in", 401);
    }
    const validPassword = await (0, password_1.comparePassword)(input.password, user.passwordHash);
    if (!validPassword) {
        throw new errors_1.AppError("Invalid email or password", 401);
    }
    const tokens = await issueTokens(prisma_1.prisma, user.id, user.email, context);
    return {
        user: toPublicUser(user),
        tokens
    };
}
async function googleLogin(input, context) {
    const googleProfile = await verifyGoogleIdentityToken(input.idToken);
    const normalizedEmail = normalizeEmail(googleProfile.email);
    const fullName = googleProfile.name ?? null;
    const avatarUrl = googleProfile.picture ?? null;
    let user = await getUserByGoogleSub(googleProfile.sub);
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
    }
    else {
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
    const tokens = await issueTokens(prisma_1.prisma, user.id, user.email, context);
    return {
        user: toPublicUser(user),
        tokens
    };
}
async function refresh(refreshToken, context) {
    const payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
    const hashedToken = (0, jwt_1.hashToken)(refreshToken);
    const now = new Date();
    return prisma_1.prisma.$transaction(async (tx) => {
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
            throw new errors_1.AppError("Invalid refresh token", 401);
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
            throw new errors_1.AppError("User not found", 404);
        }
        return issueTokens(tx, user.id, user.email, context);
    });
}
async function logout(refreshToken) {
    const payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
    await prisma_1.prisma.refreshToken.updateMany({
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
