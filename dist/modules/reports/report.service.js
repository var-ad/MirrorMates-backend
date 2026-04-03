"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveGeminiReport = saveGeminiReport;
exports.getLatestGeminiReport = getLatestGeminiReport;
const report_model_1 = require("./report.model");
async function saveGeminiReport(input) {
    return report_model_1.GeminiGeneratedReportModel.create({
        userId: input.userId,
        sessionId: input.sessionId,
        prompt: input.prompt,
        pools: input.pools,
        reportText: input.reportText,
        gameType: "johari"
    });
}
async function getLatestGeminiReport(sessionId, userId) {
    return report_model_1.GeminiGeneratedReportModel.findOne({ sessionId, userId }).sort({ createdAt: -1 }).lean();
}
