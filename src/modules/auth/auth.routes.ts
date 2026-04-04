import { Router } from "express";
import {
  authForgotPasswordRateLimiter,
  authGoogleRateLimiter,
  authLoginRateLimiter,
  authLogoutRateLimiter,
  authOtpVerificationRateLimiter,
  authPasswordChangeRateLimiter,
  authResetPasswordRateLimiter,
  authRefreshRateLimiter,
  authSignupRateLimiter
} from "../../middleware/rateLimiters";
import { requireAuth } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate";
import {
  changePasswordController,
  forgotPasswordController,
  googleLoginController,
  loginController,
  logoutController,
  meController,
  refreshController,
  resetPasswordController,
  signupController,
  verifySignupOtpController
} from "./auth.controller";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  resetPasswordSchema,
  signupSchema,
  signupVerifySchema
} from "./auth.validators";

export const authRouter = Router();

authRouter.post("/signup", authSignupRateLimiter, validate({ body: signupSchema }), signupController);
authRouter.post("/signup/verify", authOtpVerificationRateLimiter, validate({ body: signupVerifySchema }), verifySignupOtpController);
authRouter.get("/me", requireAuth, meController);
authRouter.post("/login", authLoginRateLimiter, validate({ body: loginSchema }), loginController);
authRouter.post("/google", authGoogleRateLimiter, validate({ body: googleLoginSchema }), googleLoginController);
authRouter.post("/forgot-password", authForgotPasswordRateLimiter, validate({ body: forgotPasswordSchema }), forgotPasswordController);
authRouter.post("/reset-password", authResetPasswordRateLimiter, validate({ body: resetPasswordSchema }), resetPasswordController);
authRouter.post("/refresh", authRefreshRateLimiter, validate({ body: refreshSchema }), refreshController);
authRouter.post("/logout", authLogoutRateLimiter, validate({ body: logoutSchema }), logoutController);
authRouter.patch(
  "/password",
  requireAuth,
  authPasswordChangeRateLimiter,
  validate({ body: changePasswordSchema }),
  changePasswordController
);
