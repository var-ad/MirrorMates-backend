import { z } from "../../../middleware/validate";

const adjectiveIdsSchema = z.array(z.number().int().positive()).min(1).max(50);
const responseIdentityModeSchema = z.enum(["anonymous", "named"]);

function hasAtLeastOneInviteSetting(input: {
  inviteExpiresInDays?: number;
  inviteExpiresAt?: Date;
  responseIdentityMode?: "anonymous" | "named";
}): boolean {
  return (
    input.inviteExpiresInDays !== undefined ||
    input.inviteExpiresAt !== undefined ||
    input.responseIdentityMode !== undefined
  );
}

export const createSessionSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  adjectiveIds: adjectiveIdsSchema.optional(),
  inviteExpiresInDays: z.number().int().min(1).max(30).optional(),
  inviteExpiresAt: z.coerce.date().optional(),
  responseIdentityMode: responseIdentityModeSchema.optional(),
});

export const sessionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const tokenParamSchema = z.object({
  token: z.string().trim().min(5).max(200),
});

export const reportTokenSchema = z.object({
  token: z.string().trim().uuid(),
});

export const selfSelectSchema = z.object({
  adjectiveIds: adjectiveIdsSchema,
});

export const inviteSubmitSchema = z.object({
  displayName: z.string().trim().max(50).optional(),
  adjectiveIds: adjectiveIdsSchema,
  peerId: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .optional(),
});

export const updateInviteSettingsSchema = z
  .object({
    inviteExpiresInDays: z.number().int().min(1).max(30).optional(),
    inviteExpiresAt: z.coerce.date().optional(),
    responseIdentityMode: responseIdentityModeSchema.optional(),
  })
  .refine(hasAtLeastOneInviteSetting, {
    message: "At least one invite setting must be provided",
  });
