import { GeneratedReportModel } from "./report.model";
import { JohariPools } from "./openrouter.service";

export async function saveGeneratedReport(input: {
  userId: string;
  sessionId: string;
  prompt: string;
  pools: JohariPools;
  reportText: string;
}) {
  return GeneratedReportModel.create({
    userId: input.userId,
    sessionId: input.sessionId,
    prompt: input.prompt,
    pools: input.pools,
    reportText: input.reportText,
    gameType: "johari",
  });
}

export async function getLatestGeneratedReport(
  sessionId: string,
  userId: string,
) {
  return GeneratedReportModel.findOne({ sessionId, userId })
    .sort({ createdAt: -1 })
    .select("-prompt")
    .lean();
}
