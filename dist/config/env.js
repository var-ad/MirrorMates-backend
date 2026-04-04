"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = require("dotenv");
const zod_1 = require("zod");
(0, dotenv_1.config)();
function parseOriginList(value) {
    if (!value) {
        return [];
    }
    return value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
}
function parseDnsServerList(value) {
    if (!value) {
        return [];
    }
    return value
        .split(",")
        .map((server) => server.trim())
        .filter(Boolean);
}
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    PORT: zod_1.z.coerce.number().default(4000),
    FRONTEND_URL: zod_1.z.string().url().default("http://localhost:3000"),
    CORS_ALLOWED_ORIGINS: zod_1.z.string().optional().transform(parseOriginList),
    POSTGRES_URL: zod_1.z.string().min(1),
    POSTGRES_SSL: zod_1.z.coerce.boolean().default(false),
    MONGODB_URI: zod_1.z.string().min(1),
    MONGODB_APP_NAME: zod_1.z.string().default("MirrorMates Backend"),
    MONGODB_DNS_SERVERS: zod_1.z.string().optional().transform(parseDnsServerList),
    GOOGLE_CLIENT_ID: zod_1.z.string().optional(),
    GOOGLE_HOSTED_DOMAIN: zod_1.z.string().optional(),
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.coerce.number().optional(),
    SMTP_SECURE: zod_1.z.coerce.boolean().default(false),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASS: zod_1.z.string().optional(),
    SMTP_FROM: zod_1.z.string().optional(),
    JWT_ACCESS_SECRET: zod_1.z.string().min(16),
    JWT_REFRESH_SECRET: zod_1.z.string().min(16),
    ACCESS_TOKEN_TTL: zod_1.z.string().default("15m"),
    REFRESH_TOKEN_TTL: zod_1.z.string().default("7d"),
    GEMINI_API_KEY: zod_1.z.string().optional(),
    GEMINI_MODEL: zod_1.z.string().default("gemini-1.5-flash")
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
