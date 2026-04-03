import { Schema, model } from "mongoose";

const geminiGeneratedReportSchema = new Schema(
  {
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
  },
  { timestamps: true, collection: "gemini_generated_reports" }
);

export const GeminiGeneratedReportModel = model("GeminiGeneratedReport", geminiGeneratedReportSchema);
