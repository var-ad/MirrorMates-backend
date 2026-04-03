"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlans = getPlans;
exports.createSubscription = createSubscription;
exports.handleWebhook = handleWebhook;
const postgres_1 = require("../../db/postgres");
const errors_1 = require("../../utils/errors");
async function getPlans() {
    const result = await (0, postgres_1.pgQuery)(`SELECT id, code, name, amount_inr, billing_cycle, features, is_active
     FROM subscription_plans
     WHERE is_active = true
     ORDER BY amount_inr ASC`);
    return result.rows;
}
async function createSubscription(userId, planId) {
    const plan = await (0, postgres_1.pgQuery)("SELECT id, code FROM subscription_plans WHERE id = $1 AND is_active = true", [planId]);
    if (!plan.rowCount) {
        throw new errors_1.AppError("Plan not found", 404);
    }
    const created = await (0, postgres_1.pgQuery)(`INSERT INTO user_subscriptions (user_id, plan_id, status, provider, provider_subscription_id)
     VALUES ($1, $2, 'pending', 'razorpay', NULL)
     RETURNING id, user_id, plan_id, status, provider, created_at`, [userId, planId]);
    return {
        subscription: created.rows[0],
        note: "Razorpay integration scaffolded. Add provider API call in this service."
    };
}
async function handleWebhook(payload) {
    const event = String(payload.event ?? "unknown");
    return {
        acknowledged: true,
        event,
        note: "Webhook scaffold active. Map Razorpay events to user_subscriptions status updates."
    };
}
