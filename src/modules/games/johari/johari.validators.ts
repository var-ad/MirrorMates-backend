import { z } from "../../../middleware/validate";

const adjectiveIdsSchema = z.array(z.number().int().positive()).min(1).max(50);

export const createSessionSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  adjectiveIds: adjectiveIdsSchema.optional(),
  inviteExpiresInDays: z.number().int().min(1).max(30).optional(),
  inviteExpiresAt: z.coerce.date().optional()
});

export const sessionIdParamSchema = z.object({
  id: z.string().uuid()
});

export const tokenParamSchema = z.object({
  token: z.string().trim().min(5).max(200)
});

export const selfSelectSchema = z.object({
  adjectiveIds: adjectiveIdsSchema
});

export const inviteSubmitSchema = z.object({
  displayName: z.string().min(2).max(50),
  adjectiveIds: adjectiveIdsSchema
});

export const updateInviteSettingsSchema = z
  .object({
    inviteExpiresInDays: z.number().int().min(1).max(30).optional(),
    inviteExpiresAt: z.coerce.date().optional()
  })
  .refine((input) => input.inviteExpiresInDays !== undefined || input.inviteExpiresAt !== undefined, {
    message: "Either inviteExpiresInDays or inviteExpiresAt is required"
  });
