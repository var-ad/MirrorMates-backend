import { Request, Response } from "express";
import { asyncHandler } from "../../utils/http";
import { googleLogin, login, logout, refresh, signup } from "./auth.service";

function requestContext(req: Request): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"]
  };
}

export const signupController = asyncHandler(async (req: Request, res: Response) => {
  const result = await signup(req.body, requestContext(req));
  res.status(201).json(result);
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
