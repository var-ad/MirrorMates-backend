"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSubscriptionSchema = void 0;
const validate_1 = require("../../middleware/validate");
exports.createSubscriptionSchema = validate_1.z.object({
    planId: validate_1.z.string().uuid()
});
