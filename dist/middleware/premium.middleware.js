"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePremium = requirePremium;
const postgres_1 = require("../db/postgres");
async function requirePremium(req, res, next) {
    if (!req.user?.id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const result = await (0, postgres_1.pgQuery)(`SELECT id FROM user_subscriptions
     WHERE user_id = $1
       AND status = 'active'
       AND (current_period_end IS NULL OR current_period_end > NOW())
     ORDER BY created_at DESC
     LIMIT 1`, [req.user.id]);
    if (result.rowCount === 0) {
        res.status(403).json({ message: "Premium subscription required" });
        return;
    }
    next();
}
