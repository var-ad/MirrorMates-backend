"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportGenerationRateLimiter = exports.inviteSubmissionRateLimiter = exports.inviteMetaRateLimiter = exports.sessionUpdateRateLimiter = exports.sessionCreationRateLimiter = exports.authPasswordChangeRateLimiter = exports.authLogoutRateLimiter = exports.authRefreshRateLimiter = exports.authResetPasswordRateLimiter = exports.authForgotPasswordRateLimiter = exports.authOtpVerificationRateLimiter = exports.authGoogleRateLimiter = exports.authLoginRateLimiter = exports.authSignupRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
function keyByUserOrIp(req) {
    return req.user?.id ?? req.ip ?? "unknown";
}
function createJsonRateLimiter(options) {
    return (0, express_rate_limit_1.default)({
        windowMs: options.windowMs,
        max: options.max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: options.keyGenerator,
        message: { message: options.message }
    });
}
exports.authSignupRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: "Too many signup attempts. Try again later."
});
exports.authLoginRateLimiter = createJsonRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: "Too many login attempts. Try again later."
});
exports.authGoogleRateLimiter = createJsonRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: "Too many Google sign-in attempts. Try again later."
});
exports.authOtpVerificationRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many verification attempts. Try again later."
});
exports.authForgotPasswordRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many password reset requests. Try again later."
});
exports.authResetPasswordRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many password reset attempts. Try again later."
});
exports.authRefreshRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many token refresh attempts. Try again later."
});
exports.authLogoutRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: "Too many logout attempts. Try again later."
});
exports.authPasswordChangeRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: keyByUserOrIp,
    message: "Too many password change attempts. Try again later."
});
exports.sessionCreationRateLimiter = createJsonRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: keyByUserOrIp,
    message: "Too many session creation attempts. Try again later."
});
exports.sessionUpdateRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyGenerator: keyByUserOrIp,
    message: "Too many session update attempts. Try again later."
});
exports.inviteMetaRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: "Too many invite lookups. Try again later."
});
exports.inviteSubmissionRateLimiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many invite submissions. Try again later."
});
exports.reportGenerationRateLimiter = createJsonRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: keyByUserOrIp,
    message: "Too many report generation attempts. Try again later."
});
