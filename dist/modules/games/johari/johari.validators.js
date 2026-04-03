"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateInviteSettingsSchema = exports.inviteSubmitSchema = exports.selfSelectSchema = exports.tokenParamSchema = exports.sessionIdParamSchema = exports.createSessionSchema = void 0;
const validate_1 = require("../../../middleware/validate");
const adjectiveIdsSchema = validate_1.z.array(validate_1.z.number().int().positive()).min(1).max(50);
exports.createSessionSchema = validate_1.z.object({
    title: validate_1.z.string().min(2).max(120).optional(),
    adjectiveIds: adjectiveIdsSchema.optional(),
    inviteExpiresInDays: validate_1.z.number().int().min(1).max(30).optional(),
    inviteExpiresAt: validate_1.z.coerce.date().optional()
});
exports.sessionIdParamSchema = validate_1.z.object({
    id: validate_1.z.string().uuid()
});
exports.tokenParamSchema = validate_1.z.object({
    token: validate_1.z.string().trim().min(5).max(200)
});
exports.selfSelectSchema = validate_1.z.object({
    adjectiveIds: adjectiveIdsSchema
});
exports.inviteSubmitSchema = validate_1.z.object({
    displayName: validate_1.z.string().min(2).max(50),
    adjectiveIds: adjectiveIdsSchema
});
exports.updateInviteSettingsSchema = validate_1.z
    .object({
    inviteExpiresInDays: validate_1.z.number().int().min(1).max(30).optional(),
    inviteExpiresAt: validate_1.z.coerce.date().optional()
})
    .refine((input) => input.inviteExpiresInDays !== undefined || input.inviteExpiresAt !== undefined, {
    message: "Either inviteExpiresInDays or inviteExpiresAt is required"
});
