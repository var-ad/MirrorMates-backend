"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiGeneratedReportModel = void 0;
const mongoose_1 = require("mongoose");
const geminiGeneratedReportSchema = new mongoose_1.Schema({
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    gameType: { type: String, required: true, default: "johari" },
    pools: {
        open: [{ type: String, required: true }],
        blind: [{ type: String, required: true }],
        hidden: [{ type: String, required: true }],
        unknown: [{ type: String, required: true }]
    },
    prompt: { type: String, required: true },
    reportText: { type: String, required: true }
}, { timestamps: true, collection: "gemini_generated_reports" });
exports.GeminiGeneratedReportModel = (0, mongoose_1.model)("GeminiGeneratedReport", geminiGeneratedReportSchema);
