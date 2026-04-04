"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const prisma_1 = require("../db/prisma");
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ message: "Missing access token" });
        return;
    }
    const token = authHeader.slice("Bearer ".length);
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
        void prisma_1.prisma.user
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
    }
    catch {
        res.status(401).json({ message: "Invalid or expired access token" });
    }
}
