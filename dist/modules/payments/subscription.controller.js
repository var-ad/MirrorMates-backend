"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionWebhookController = exports.createSubscriptionController = exports.getPlansController = void 0;
const http_1 = require("../../utils/http");
const subscription_service_1 = require("./subscription.service");
exports.getPlansController = (0, http_1.asyncHandler)(async (_req, res) => {
    const plans = await (0, subscription_service_1.getPlans)();
    res.json({ plans });
});
exports.createSubscriptionController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, subscription_service_1.createSubscription)(req.user.id, req.body.planId);
    res.status(201).json(result);
});
exports.subscriptionWebhookController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, subscription_service_1.handleWebhook)(req.body);
    res.json(result);
});
