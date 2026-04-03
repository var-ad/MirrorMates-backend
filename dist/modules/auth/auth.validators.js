"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutSchema = exports.refreshSchema = exports.googleLoginSchema = exports.loginSchema = exports.signupSchema = void 0;
const validate_1 = require("../../middleware/validate");
exports.signupSchema = validate_1.z.object({
    email: validate_1.z.string().email(),
    password: validate_1.z.string().min(8).max(72),
    fullName: validate_1.z.string().min(2).max(100).optional()
});
exports.loginSchema = validate_1.z.object({
    email: validate_1.z.string().email(),
    password: validate_1.z.string().min(8).max(72)
});
exports.googleLoginSchema = validate_1.z.object({
    idToken: validate_1.z
        .string()
        .min(20)
        .refine((value) => value.trim().split(".").length === 3, {
        message: "idToken must be a Google ID token JWT, not a Google client ID"
    })
});
exports.refreshSchema = validate_1.z.object({
    refreshToken: validate_1.z.string().min(20)
});
exports.logoutSchema = exports.refreshSchema;
