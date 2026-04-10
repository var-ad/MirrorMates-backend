import crypto from "crypto";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { env } from "../config/env";
import { AppError } from "./errors";

interface UserPayload {
  id: string;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  tid: string;
}

const JWT_ALGORITHM: jwt.Algorithm = "HS256";

export function generateAccessToken(user: UserPayload): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    env.JWT_ACCESS_SECRET as jwt.Secret,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    },
  );
}

export function generateRefreshToken(userId: string): { token: string; tokenId: string } {
  const tokenId = uuid();
  const token = jwt.sign(
    {
      sub: userId,
      tid: tokenId,
    },
    env.JWT_REFRESH_SECRET as jwt.Secret,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    },
  );

  return { token, tokenId };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: [JWT_ALGORITHM],
  }) as RefreshTokenPayload;

  if (!payload?.sub || !payload.tid) {
    throw new AppError("Invalid refresh token", 401);
  }

  return payload;
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
