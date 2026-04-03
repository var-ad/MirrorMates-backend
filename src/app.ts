import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { devRouter } from "./modules/dev/dev.routes";
import { johariRouter } from "./modules/games/johari/johari.routes";

export const app = express();

const defaultLocalOrigins = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = new Set([
  env.FRONTEND_URL,
  ...env.CORS_ALLOWED_ORIGINS,
  ...(env.NODE_ENV === "production" ? [] : defaultLocalOrigins)
]);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

if (env.NODE_ENV !== "production") {
  app.use("/", devRouter);
}

app.use("/auth", authRouter);
app.use("/", johariRouter);

app.use(errorHandler);
