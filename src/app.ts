import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { johariRouter } from "./modules/games/johari/johari.routes";
import { AppError } from "./utils/errors";

export const app = express();

app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);

const defaultLocalOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function isLocalOrigin(origin: string): boolean {
  return (
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
  );
}

const configuredOrigins = [env.FRONTEND_URL, ...env.CORS_ALLOWED_ORIGINS].map(
  normalizeOrigin,
);

if (env.NODE_ENV === "production") {
  for (const origin of configuredOrigins) {
    if (origin === "*" || origin.includes("*")) {
      throw new Error("CORS wildcard origins are not allowed in production");
    }

    if (isLocalOrigin(origin)) {
      throw new Error(
        "Localhost origins are not allowed in production CORS configuration",
      );
    }
  }
}

const allowedOrigins = new Set([
  ...configuredOrigins,
  ...(env.NODE_ENV === "production"
    ? []
    : defaultLocalOrigins.map(normalizeOrigin)),
]);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (allowedOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      if (env.NODE_ENV === "production") {
        callback(new AppError("Origin not allowed by CORS", 403));
        return;
      }

      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "32kb", strict: true }));
if (env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/", johariRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use(errorHandler);
