import { Request, Response } from "express";
import { asyncHandler } from "../../utils/http";
import {
  changePassword,
  forgotPassword,
  getCurrentUser,
  googleLogin,
  login,
  logout,
  refresh,
  resetPassword,
  signup,
  verifySignupOtp
} from "./auth.service";

function requestContext(req: Request): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"]
  };
}

export const signupController = asyncHandler(async (req: Request, res: Response) => {
  const result = await signup(req.body, requestContext(req));
  res.status(202).json(result);
});

export const verifySignupOtpController = asyncHandler(async (req: Request, res: Response) => {
  const result = await verifySignupOtp(req.body, requestContext(req));
  res.json(result);
});

export const meController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getCurrentUser(req.user!.id);
  res.json(result);
});

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const result = await login(req.body, requestContext(req));
  res.json(result);
});

export const googleLoginController = asyncHandler(async (req: Request, res: Response) => {
  const result = await googleLogin(req.body, requestContext(req));
  res.json(result);
});

export const refreshController = asyncHandler(async (req: Request, res: Response) => {
  const result = await refresh(req.body.refreshToken, requestContext(req));
  res.json(result);
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  await logout(req.body.refreshToken);
  res.json({ message: "Logged out" });
});

export const changePasswordController = asyncHandler(async (req: Request, res: Response) => {
  const result = await changePassword(req.user!.id, req.body, requestContext(req));
  res.json(result);
});

export const forgotPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const result = await forgotPassword(req.body.email);
  res.json(result);
});

export const resetPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const result = await resetPassword(req.body);
  res.json(result);
});
