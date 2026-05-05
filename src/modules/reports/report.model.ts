import { Schema, model } from "mongoose";

const generatedReportSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    gameType: { type: String, required: true, default: "johari" },
    pools: {
      open: [{ type: String, required: true }],
      blind: [{ type: String, required: true }],
      hidden: [{ type: String, required: true }],
      unknown: [{ type: String, required: true }],
    },
    prompt: { type: String, required: true },
    reportText: { type: String, required: true },
  },
  { timestamps: true, collection: "generated_reports" },
);

export const GeneratedReportModel = model(
  "GeneratedReport",
  generatedReportSchema,
);
