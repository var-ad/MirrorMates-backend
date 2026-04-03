"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutController = exports.refreshController = exports.googleLoginController = exports.loginController = exports.signupController = void 0;
const http_1 = require("../../utils/http");
const auth_service_1 = require("./auth.service");
function requestContext(req) {
    return {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]
    };
}
exports.signupController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, auth_service_1.signup)(req.body, requestContext(req));
    res.status(201).json(result);
});
exports.loginController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, auth_service_1.login)(req.body, requestContext(req));
    res.json(result);
});
exports.googleLoginController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, auth_service_1.googleLogin)(req.body, requestContext(req));
    res.json(result);
});
exports.refreshController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, auth_service_1.refresh)(req.body.refreshToken, requestContext(req));
    res.json(result);
});
exports.logoutController = (0, http_1.asyncHandler)(async (req, res) => {
    await (0, auth_service_1.logout)(req.body.refreshToken);
    res.json({ message: "Logged out" });
});
