import { z } from "../../middleware/validate";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  fullName: z.string().min(2).max(100).optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

export const googleLoginSchema = z.object({
  idToken: z
    .string()
    .min(20)
    .refine((value) => value.trim().split(".").length === 3, {
      message: "idToken must be a Google ID token JWT, not a Google client ID"
    })
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

export const logoutSchema = refreshSchema;
