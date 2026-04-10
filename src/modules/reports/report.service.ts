import { GeminiGeneratedReportModel } from "./report.model";
import { JohariPools } from "./gemini.service";

export async function saveGeminiReport(input: {
  userId: string;
  sessionId: string;
  prompt: string;
  pools: JohariPools;
  reportText: string;
}) {
  return GeminiGeneratedReportModel.create({
    userId: input.userId,
    sessionId: input.sessionId,
    prompt: input.prompt,
    pools: input.pools,
    reportText: input.reportText,
    gameType: "johari"
  });
}

export async function getLatestGeminiReport(sessionId: string, userId: string) {
  return GeminiGeneratedReportModel.findOne({ sessionId, userId })
    .sort({ createdAt: -1 })
    .select("-prompt")
    .lean();
}
