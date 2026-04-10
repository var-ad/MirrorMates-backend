import { config } from "dotenv";
import { z } from "zod";

config();

function parseStringList(value?: string): string[] {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function parseOriginList(value?: string): string[] {
  return parseStringList(value);
}

function parseDnsServerList(value?: string): string[] {
  return parseStringList(value);
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  CORS_ALLOWED_ORIGINS: z.string().optional().transform(parseOriginList),
  POSTGRES_URL: z.string().min(1),
  POSTGRES_SSL: z.coerce.boolean().default(false),
  MONGODB_URI: z.string().min(1),
  MONGODB_APP_NAME: z.string().default("MirrorMates Backend"),
  MONGODB_DNS_SERVERS: z.string().optional().transform(parseDnsServerList),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_HOSTED_DOMAIN: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
