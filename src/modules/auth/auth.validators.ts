import { z } from "../../middleware/validate";

const normalizedEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

export const signupSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(2).max(100).optional(),
});

export const signupVerifySchema = z.object({
  email: normalizedEmailSchema,
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});

export const loginSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(8).max(72),
});

export const googleLoginSchema = z.object({
  idToken: z
    .string()
    .trim()
    .min(20)
    .refine((value) => value.split(".").length === 3, {
      message: "idToken must be a Google ID token JWT, not a Google client ID",
    }),
});

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(20),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(72),
    newPassword: z.string().min(8).max(72),
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: normalizedEmailSchema,
});

export const resetPasswordSchema = z.object({
  email: normalizedEmailSchema,
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "OTP must be a 6-digit code"),
  newPassword: z.string().min(8).max(72),
});
