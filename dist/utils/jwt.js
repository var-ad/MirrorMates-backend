"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.hashToken = hashToken;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const env_1 = require("../config/env");
function generateAccessToken(user) {
    return jsonwebtoken_1.default.sign({
        sub: user.id,
        email: user.email
    }, env_1.env.JWT_ACCESS_SECRET, { expiresIn: env_1.env.ACCESS_TOKEN_TTL });
}
function generateRefreshToken(userId) {
    const tokenId = (0, uuid_1.v4)();
    const token = jsonwebtoken_1.default.sign({
        sub: userId,
        tid: tokenId
    }, env_1.env.JWT_REFRESH_SECRET, { expiresIn: env_1.env.REFRESH_TOKEN_TTL });
    return { token, tokenId };
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, env_1.env.JWT_REFRESH_SECRET);
}
function hashToken(rawToken) {
    return crypto_1.default.createHash("sha256").update(rawToken).digest("hex");
}
