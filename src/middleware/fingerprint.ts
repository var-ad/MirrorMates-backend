import crypto from "crypto";
import { Request } from "express";

export function createFingerprint(req: Request, token: string): string {
  const userAgent = req.headers["user-agent"] ?? "unknown-agent";
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown-ip";
  return crypto.createHash("sha256").update(`${token}:${ip}:${userAgent}`).digest("hex");
}
