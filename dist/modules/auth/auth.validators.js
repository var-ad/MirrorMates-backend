"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.changePasswordSchema = exports.logoutSchema = exports.refreshSchema = exports.googleLoginSchema = exports.loginSchema = exports.signupVerifySchema = exports.signupSchema = void 0;
const validate_1 = require("../../middleware/validate");
const normalizedEmailSchema = validate_1.z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase());
exports.signupSchema = validate_1.z.object({
    email: normalizedEmailSchema,
    password: validate_1.z.string().min(8).max(72),
    fullName: validate_1.z.string().trim().min(2).max(100).optional()
});
exports.signupVerifySchema = validate_1.z.object({
    email: normalizedEmailSchema,
    otp: validate_1.z.string().trim().regex(/^\d{6}$/, "OTP must be a 6-digit code")
});
exports.loginSchema = validate_1.z.object({
    email: normalizedEmailSchema,
    password: validate_1.z.string().min(8).max(72)
});
exports.googleLoginSchema = validate_1.z.object({
    idToken: validate_1.z
        .string()
        .trim()
        .min(20)
        .refine((value) => value.split(".").length === 3, {
        message: "idToken must be a Google ID token JWT, not a Google client ID"
    })
});
exports.refreshSchema = validate_1.z.object({
    refreshToken: validate_1.z.string().trim().min(20)
});
exports.logoutSchema = exports.refreshSchema;
exports.changePasswordSchema = validate_1.z
    .object({
    currentPassword: validate_1.z.string().min(8).max(72),
    newPassword: validate_1.z.string().min(8).max(72)
})
    .refine((input) => input.currentPassword !== input.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"]
});
exports.forgotPasswordSchema = validate_1.z.object({
    email: normalizedEmailSchema
});
exports.resetPasswordSchema = validate_1.z.object({
    email: normalizedEmailSchema,
    otp: validate_1.z.string().trim().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
    newPassword: validate_1.z.string().min(8).max(72)
});
