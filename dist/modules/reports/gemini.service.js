"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGeminiJohariReport = generateGeminiJohariReport;
const generative_ai_1 = require("@google/generative-ai");
const env_1 = require("../../config/env");
function buildPrompt(input) {
    const { pools, peerSubmissionCount, topPeerAdjectives } = input;
    const topPeerSummary = topPeerAdjectives.length > 0
        ? topPeerAdjectives
            .map((item) => `${item.adjective} (${item.count}/${peerSubmissionCount}, ${item.peerSupportPercent}%)`)
            .join(", ")
        : "None";
    return [
        "You are writing neutral feedback for a Johari Window reflection exercise.",
        "Rules:",
        "1) Keep a neutral, calm, professional tone.",
        "2) Avoid diagnoses, moral judgments, or extreme assumptions.",
        "3) Use only evidence from the adjective pools and peer counts.",
        "4) Acknowledge limited data when peer submissions are low.",
        "5) Keep recommendations practical, specific, and non-alarmist.",
        "Required sections:",
        "Summary",
        "Strengths (based on Open + Blind)",
        "Growth Opportunities (Blind)",
        "Private Traits (Hidden)",
        "Potential Untapped Traits (Unknown)",
        "Actionable Advice",
        "Data:",
        `Peer submissions: ${peerSubmissionCount}`,
        `Top peer-selected adjectives: ${topPeerSummary}`,
        `Open: ${pools.open.join(", ") || "None"}`,
        `Blind: ${pools.blind.join(", ") || "None"}`,
        `Hidden: ${pools.hidden.join(", ") || "None"}`,
        `Unknown: ${pools.unknown.join(", ") || "None"}`
    ].join("\n");
}
async function generateGeminiJohariReport(input) {
    const prompt = buildPrompt(input);
    if (!env_1.env.GEMINI_API_KEY) {
        return {
            prompt,
            reportText: "Gemini API key is not configured. This is a placeholder report. Add GEMINI_API_KEY in backend .env to enable AI-generated insights."
        };
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(env_1.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: env_1.env.GEMINI_MODEL });
    const response = await model.generateContent(prompt);
    const reportText = response.response.text();
    return {
        prompt,
        reportText
    };
}
