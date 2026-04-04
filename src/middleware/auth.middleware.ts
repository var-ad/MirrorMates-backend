import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../db/prisma";

interface AccessTokenPayload {
  sub: string;
  email: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing access token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;

    void prisma.user
      .findUnique({
        where: {
          id: payload.sub
        },
        select: {
          id: true,
          email: true,
          isActive: true
        }
      })
      .then((user) => {
        if (!user || !user.isActive) {
          res.status(401).json({ message: "Invalid or expired access token" });
          return;
        }

        req.user = {
          id: user.id,
          email: user.email
        };
        next();
      })
      .catch(() => {
        res.status(401).json({ message: "Invalid or expired access token" });
      });
  } catch {
    res.status(401).json({ message: "Invalid or expired access token" });
  }
}
