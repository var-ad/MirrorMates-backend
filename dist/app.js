"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const error_middleware_1 = require("./middleware/error.middleware");
const auth_routes_1 = require("./modules/auth/auth.routes");
const dev_routes_1 = require("./modules/dev/dev.routes");
const johari_routes_1 = require("./modules/games/johari/johari.routes");
exports.app = (0, express_1.default)();
const defaultLocalOrigins = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = new Set([
    env_1.env.FRONTEND_URL,
    ...env_1.env.CORS_ALLOWED_ORIGINS,
    ...(env_1.env.NODE_ENV === "production" ? [] : defaultLocalOrigins)
]);
exports.app.use((0, helmet_1.default)());
exports.app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }
        callback(null, false);
    },
    credentials: true
}));
exports.app.use(express_1.default.json({ limit: "1mb" }));
exports.app.use((0, morgan_1.default)("dev"));
exports.app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
if (env_1.env.NODE_ENV !== "production") {
    exports.app.use("/", dev_routes_1.devRouter);
}
exports.app.use("/auth", auth_routes_1.authRouter);
exports.app.use("/", johari_routes_1.johariRouter);
exports.app.use(error_middleware_1.errorHandler);
