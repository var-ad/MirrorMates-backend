"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFingerprint = createFingerprint;
const crypto_1 = __importDefault(require("crypto"));
function createFingerprint(req, token) {
    const userAgent = req.headers["user-agent"] ?? "unknown-agent";
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown-ip";
    return crypto_1.default.createHash("sha256").update(`${token}:${ip}:${userAgent}`).digest("hex");
}
