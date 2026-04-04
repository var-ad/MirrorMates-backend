import { Request } from "express";
import rateLimit from "express-rate-limit";

function keyByUserOrIp(req: Request): string {
  return req.user?.id ?? req.ip ?? "unknown";
}

function createJsonRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator,
    message: { message: options.message }
  });
}

export const authSignupRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: "Too many signup attempts. Try again later."
});

export const authLoginRateLimiter = createJsonRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Too many login attempts. Try again later."
});

export const authGoogleRateLimiter = createJsonRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: "Too many Google sign-in attempts. Try again later."
});

export const authOtpVerificationRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many verification attempts. Try again later."
});

export const authForgotPasswordRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many password reset requests. Try again later."
});

export const authResetPasswordRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many password reset attempts. Try again later."
});

export const authRefreshRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many token refresh attempts. Try again later."
});

export const authLogoutRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many logout attempts. Try again later."
});

export const authPasswordChangeRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: keyByUserOrIp,
  message: "Too many password change attempts. Try again later."
});

export const sessionCreationRateLimiter = createJsonRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: keyByUserOrIp,
  message: "Too many session creation attempts. Try again later."
});

export const sessionUpdateRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: keyByUserOrIp,
  message: "Too many session update attempts. Try again later."
});

export const inviteMetaRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many invite lookups. Try again later."
});

export const inviteSubmissionRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many invite submissions. Try again later."
});

export const reportGenerationRateLimiter = createJsonRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: keyByUserOrIp,
  message: "Too many report generation attempts. Try again later."
});
