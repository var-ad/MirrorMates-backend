import { generateGeminiJohariReport } from "../../reports/gemini.service";
import {
  getLatestGeminiReport,
  saveGeminiReport,
} from "../../reports/report.service";
import { assertOwner, getSession } from "./johari.shared";
import { computeResults } from "./johari.results.service";

export async function generateSessionReport(
  sessionId: string,
  requesterId: string,
) {
  const computed = await computeResults(sessionId, requesterId);

  const generated = await generateGeminiJohariReport({
    pools: computed.pools,
    peerSubmissionCount: computed.summary.peerSubmissionCount,
    topPeerAdjectives: computed.summary.topPeerAdjectives,
  });
  const saved = await saveGeminiReport({
    userId: requesterId,
    sessionId,
    prompt: generated.prompt,
    pools: computed.pools,
    reportText: generated.reportText,
  });

  return {
    reportId: String(saved._id),
    reportText: generated.reportText,
    feedbackText: generated.reportText,
    generatedAt: saved.createdAt,
  };
}

export async function getLatestSessionReport(
  sessionId: string,
  requesterId: string,
) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const report = await getLatestGeminiReport(sessionId, requesterId);
  return report;
}
