"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signup = signup;
exports.verifySignupOtp = verifySignupOtp;
exports.login = login;
exports.googleLogin = googleLogin;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
exports.getCurrentUser = getCurrentUser;
exports.changePassword = changePassword;
exports.refresh = refresh;
exports.logout = logout;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const env_1 = require("../../config/env");
const prisma_1 = require("../../db/prisma");
const errors_1 = require("../../utils/errors");
const jwt_1 = require("../../utils/jwt");
const password_1 = require("../../utils/password");
const auth_mailer_1 = require("./auth.mailer");
const INVALID_LOGIN_MESSAGE = "Invalid email or password";
const INVALID_REFRESH_MESSAGE = "Invalid refresh token";
const ACCOUNT_UNAVAILABLE_MESSAGE = "Account is unavailable";
const GENERIC_SIGNUP_FAILURE_MESSAGE = "Unable to create account with provided credentials";
const LOCAL_ACCOUNT_GOOGLE_CONFLICT_MESSAGE = "An account with this email already exists using a password. Please log in with your password to continue.";
const GOOGLE_ACCOUNT_PASSWORD_LOGIN_MESSAGE = "This account is linked to Google. Please use 'Sign in with Google'.";
const SIGNUP_OTP_SENT_MESSAGE = "Verification code sent to your email";
const INVALID_SIGNUP_OTP_MESSAGE = "Invalid or expired verification code";
const FORGOT_PASSWORD_SENT_MESSAGE = "If an account with that email exists, a password reset code has been sent.";
const INVALID_RESET_OTP_MESSAGE = "Invalid or expired password reset code";
const PASSWORD_RESET_SUCCESS_MESSAGE = "Password reset successful. Please log in with your new password.";
const OTP_ATTEMPT_LIMIT = 5;
const SIGNUP_OTP_TTL_MINUTES = 10;
const RESET_OTP_TTL_MINUTES = 10;
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
function normalizeContext(context) {
    return {
        ipAddress: context.ipAddress?.trim() || null,
        userAgent: context.userAgent?.trim() || null
    };
}
function addMinutes(minutes) {
    return new Date(Date.now() + minutes * 60 * 1000);
}
function generateOtp() {
    return Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, "0");
}
function isOtpExpired(otpExpiresAt) {
    return otpExpiresAt.getTime() <= Date.now();
}
function isGoogleOnlyUser(input) {
    return !input.passwordHash && input.googleAccounts.length > 0;
}
async function persistRefreshToken(executor, userId, refreshToken, tokenId, context) {
    const decoded = jsonwebtoken_1.default.decode(refreshToken);
    if (!decoded?.exp) {
        throw new errors_1.AppError("Failed to create refresh token", 500);
    }
    const normalizedContext = normalizeContext(context);
    await executor.refreshToken.create({
        data: {
            tokenId,
            userId,
            tokenHash: (0, jwt_1.hashToken)(refreshToken),
            expiresAt: new Date(decoded.exp * 1000),
            userAgent: normalizedContext.userAgent,
            ipAddress: normalizedContext.ipAddress
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
async function revokeAllActiveRefreshTokens(executor, userId) {
    await executor.refreshToken.updateMany({
        where: {
            userId,
            revokedAt: null
        },
        data: {
            revokedAt: new Date()
        }
    });
}
async function hasSuspiciousLoginContext(executor, userId, context) {
    const normalizedContext = normalizeContext(context);
    if (!normalizedContext.ipAddress && !normalizedContext.userAgent) {
        return false;
    }
    const activeSessions = await executor.refreshToken.findMany({
        where: {
            userId,
            revokedAt: null,
            expiresAt: {
                gt: new Date()
            }
        },
        orderBy: {
            createdAt: "desc"
        },
        take: 10,
        select: {
            ipAddress: true,
            userAgent: true
        }
    });
    if (activeSessions.length === 0) {
        return false;
    }
    const hasMatchingIp = normalizedContext.ipAddress !== null &&
        activeSessions.some((session) => session.ipAddress === normalizedContext.ipAddress);
    const hasMatchingUserAgent = normalizedContext.userAgent !== null &&
        activeSessions.some((session) => session.userAgent === normalizedContext.userAgent);
    return !hasMatchingIp && !hasMatchingUserAgent;
}
async function mitigateSuspiciousLogin(executor, userId, context) {
    const suspicious = await hasSuspiciousLoginContext(executor, userId, context);
    if (!suspicious) {
        return;
    }
    await revokeAllActiveRefreshTokens(executor, userId);
}
async function createUser(executor, input) {
    return executor.user.create({
        data: {
            email: normalizeEmail(input.email),
            passwordHash: input.passwordHash ?? null,
            fullName: input.fullName ?? null,
            avatarUrl: input.avatarUrl ?? null,
            emailVerified: input.emailVerified ?? true
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
async function getUserByEmailWithProviders(email) {
    return prisma_1.prisma.user.findUnique({
        where: {
            email: normalizeEmail(email)
        },
        include: {
            googleAccounts: {
                select: {
                    id: true,
                    googleSub: true
                }
            },
            passwordResetOtp: true
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
async function getUserForSession(userId) {
    return prisma_1.prisma.user.findUnique({
        where: {
            id: userId
        },
        select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            isActive: true
        }
    });
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
async function signup(input, _context) {
    (0, auth_mailer_1.assertSmtpConfigured)();
    const email = normalizeEmail(input.email);
    const existing = await getUserByEmail(email);
    if (existing) {
        throw new errors_1.AppError(GENERIC_SIGNUP_FAILURE_MESSAGE, 400);
    }
    const [passwordHash, otp] = await Promise.all([(0, password_1.hashPassword)(input.password), Promise.resolve(generateOtp())]);
    const otpHash = await (0, password_1.hashPassword)(otp);
    await prisma_1.prisma.pendingLocalSignup.upsert({
        where: {
            email
        },
        update: {
            passwordHash,
            fullName: input.fullName?.trim() || null,
            otpHash,
            otpExpiresAt: addMinutes(SIGNUP_OTP_TTL_MINUTES),
            attempts: 0
        },
        create: {
            email,
            passwordHash,
            fullName: input.fullName?.trim() || null,
            otpHash,
            otpExpiresAt: addMinutes(SIGNUP_OTP_TTL_MINUTES),
            attempts: 0
        }
    });
    await (0, auth_mailer_1.sendSignupOtpEmail)({
        to: email,
        otp,
        fullName: input.fullName ?? null,
        expiresInMinutes: SIGNUP_OTP_TTL_MINUTES
    });
    return {
        message: SIGNUP_OTP_SENT_MESSAGE,
        email,
        expiresInMinutes: SIGNUP_OTP_TTL_MINUTES
    };
}
async function verifySignupOtp(input, context) {
    const email = normalizeEmail(input.email);
    return prisma_1.prisma.$transaction(async (tx) => {
        const pendingSignup = await tx.pendingLocalSignup.findUnique({
            where: {
                email
            }
        });
        if (!pendingSignup) {
            throw new errors_1.AppError(INVALID_SIGNUP_OTP_MESSAGE, 400);
        }
        if (pendingSignup.attempts >= OTP_ATTEMPT_LIMIT || isOtpExpired(pendingSignup.otpExpiresAt)) {
            await tx.pendingLocalSignup.delete({
                where: {
                    email
                }
            });
            throw new errors_1.AppError(INVALID_SIGNUP_OTP_MESSAGE, 400);
        }
        const otpValid = await (0, password_1.comparePassword)(input.otp, pendingSignup.otpHash);
        if (!otpValid) {
            await tx.pendingLocalSignup.update({
                where: {
                    email
                },
                data: {
                    attempts: {
                        increment: 1
                    }
                }
            });
            throw new errors_1.AppError(INVALID_SIGNUP_OTP_MESSAGE, 400);
        }
        const existingUser = await tx.user.findUnique({
            where: {
                email
            }
        });
        if (existingUser) {
            await tx.pendingLocalSignup.delete({
                where: {
                    email
                }
            });
            throw new errors_1.AppError(GENERIC_SIGNUP_FAILURE_MESSAGE, 400);
        }
        const user = await createUser(tx, {
            email,
            passwordHash: pendingSignup.passwordHash,
            fullName: pendingSignup.fullName,
            emailVerified: true
        });
        await tx.pendingLocalSignup.delete({
            where: {
                email
            }
        });
        const tokens = await issueTokens(tx, user.id, user.email, context);
        return {
            user: toPublicUser(user),
            tokens
        };
    });
}
async function login(input, context) {
    const user = await getUserByEmailWithProviders(input.email);
    if (!user) {
        throw new errors_1.AppError(INVALID_LOGIN_MESSAGE, 401);
    }
    if (!user.isActive) {
        throw new errors_1.AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
    }
    if (!user.passwordHash && isGoogleOnlyUser(user)) {
        throw new errors_1.AppError(GOOGLE_ACCOUNT_PASSWORD_LOGIN_MESSAGE, 400);
    }
    if (!user.passwordHash) {
        throw new errors_1.AppError(INVALID_LOGIN_MESSAGE, 401);
    }
    const validPassword = await (0, password_1.comparePassword)(input.password, user.passwordHash);
    if (!validPassword) {
        throw new errors_1.AppError(INVALID_LOGIN_MESSAGE, 401);
    }
    const tokens = await prisma_1.prisma.$transaction(async (tx) => {
        await mitigateSuspiciousLogin(tx, user.id, context);
        return issueTokens(tx, user.id, user.email, context);
    });
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
        const existingByEmail = await getUserByEmailWithProviders(normalizedEmail);
        if (existingByEmail) {
            if (!existingByEmail.isActive) {
                throw new errors_1.AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
            }
            if (existingByEmail.passwordHash) {
                throw new errors_1.AppError(LOCAL_ACCOUNT_GOOGLE_CONFLICT_MESSAGE, 409);
            }
            user = existingByEmail;
        }
    }
    if (user && !user.isActive) {
        throw new errors_1.AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
    }
    if (!user) {
        user = await createUser(prisma_1.prisma, {
            email: normalizedEmail,
            passwordHash: null,
            fullName,
            avatarUrl,
            emailVerified: true
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
    const tokens = await prisma_1.prisma.$transaction(async (tx) => {
        await mitigateSuspiciousLogin(tx, user.id, context);
        return issueTokens(tx, user.id, user.email, context);
    });
    return {
        user: toPublicUser(user),
        tokens
    };
}
async function forgotPassword(email) {
    (0, auth_mailer_1.assertSmtpConfigured)();
    const normalizedEmail = normalizeEmail(email);
    const user = await getUserByEmailWithProviders(normalizedEmail);
    if (!user || !user.isActive || !user.passwordHash) {
        return { message: FORGOT_PASSWORD_SENT_MESSAGE };
    }
    const otp = generateOtp();
    const otpHash = await (0, password_1.hashPassword)(otp);
    await prisma_1.prisma.passwordResetOtp.upsert({
        where: {
            userId: user.id
        },
        update: {
            otpHash,
            otpExpiresAt: addMinutes(RESET_OTP_TTL_MINUTES),
            attempts: 0
        },
        create: {
            userId: user.id,
            otpHash,
            otpExpiresAt: addMinutes(RESET_OTP_TTL_MINUTES),
            attempts: 0
        }
    });
    await (0, auth_mailer_1.sendPasswordResetOtpEmail)({
        to: user.email,
        otp,
        fullName: user.fullName,
        expiresInMinutes: RESET_OTP_TTL_MINUTES
    });
    return { message: FORGOT_PASSWORD_SENT_MESSAGE };
}
async function resetPassword(input) {
    const normalizedEmail = normalizeEmail(input.email);
    await prisma_1.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
            where: {
                email: normalizedEmail
            },
            include: {
                googleAccounts: {
                    select: {
                        id: true
                    }
                },
                passwordResetOtp: true
            }
        });
        if (!user || !user.isActive || !user.passwordHash || !user.passwordResetOtp) {
            throw new errors_1.AppError(INVALID_RESET_OTP_MESSAGE, 400);
        }
        if (user.passwordResetOtp.attempts >= OTP_ATTEMPT_LIMIT || isOtpExpired(user.passwordResetOtp.otpExpiresAt)) {
            await tx.passwordResetOtp.delete({
                where: {
                    userId: user.id
                }
            });
            throw new errors_1.AppError(INVALID_RESET_OTP_MESSAGE, 400);
        }
        const otpValid = await (0, password_1.comparePassword)(input.otp, user.passwordResetOtp.otpHash);
        if (!otpValid) {
            await tx.passwordResetOtp.update({
                where: {
                    userId: user.id
                },
                data: {
                    attempts: {
                        increment: 1
                    }
                }
            });
            throw new errors_1.AppError(INVALID_RESET_OTP_MESSAGE, 400);
        }
        const nextPasswordHash = await (0, password_1.hashPassword)(input.newPassword);
        await tx.user.update({
            where: {
                id: user.id
            },
            data: {
                passwordHash: nextPasswordHash,
                emailVerified: true
            }
        });
        await tx.passwordResetOtp.delete({
            where: {
                userId: user.id
            }
        });
        await revokeAllActiveRefreshTokens(tx, user.id);
    });
    return { message: PASSWORD_RESET_SUCCESS_MESSAGE };
}
async function getCurrentUser(userId) {
    const user = await getUserForSession(userId);
    if (!user || !user.isActive) {
        throw new errors_1.AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
    }
    return {
        user: toPublicUser(user)
    };
}
async function changePassword(userId, input, context) {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            id: userId
        },
        select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            passwordHash: true,
            isActive: true
        }
    });
    if (!user || !user.isActive) {
        throw new errors_1.AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 403);
    }
    if (!user.passwordHash) {
        throw new errors_1.AppError("Password sign-in is not available for this account", 400);
    }
    const validPassword = await (0, password_1.comparePassword)(input.currentPassword, user.passwordHash);
    if (!validPassword) {
        throw new errors_1.AppError("Current password is incorrect", 400);
    }
    const newPasswordHash = await (0, password_1.hashPassword)(input.newPassword);
    const tokens = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: {
                id: user.id
            },
            data: {
                passwordHash: newPasswordHash
            }
        });
        await revokeAllActiveRefreshTokens(tx, user.id);
        return issueTokens(tx, user.id, user.email, context);
    });
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
            throw new errors_1.AppError(INVALID_REFRESH_MESSAGE, 401);
        }
        const user = await tx.user.findUnique({
            where: {
                id: payload.sub
            },
            select: {
                id: true,
                email: true,
                isActive: true
            }
        });
        if (!user || !user.isActive) {
            throw new errors_1.AppError(INVALID_REFRESH_MESSAGE, 401);
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
