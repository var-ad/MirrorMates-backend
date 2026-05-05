import { generateOpenRouterJohariReport } from "../../reports/openrouter.service";
import { consumeReportAccessToken } from "../../reports/report-access.service";
import {
  getLatestGeneratedReport,
  saveGeneratedReport,
} from "../../reports/report.service";
import { assertOwner, getSession } from "./johari.shared";
import { computeResults } from "./johari.results.service";

export async function generateSessionReport(
  sessionId: string,
  requesterId: string,
) {
  const computed = await computeResults(sessionId, requesterId);

  const generated = await generateOpenRouterJohariReport({
    pools: computed.pools,
    peerSubmissionCount: computed.summary.peerSubmissionCount,
    topPeerAdjectives: computed.summary.topPeerAdjectives,
  });
  const saved = await saveGeneratedReport({
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

  const report = await getLatestGeneratedReport(sessionId, requesterId);
  return report;
}

export async function generateSessionReportFromToken(token: string) {
  const access = await consumeReportAccessToken(token);
  const report = await generateSessionReport(access.sessionId, access.userId);
  const session = await getSession(access.sessionId);
  const results = await computeResults(access.sessionId, access.userId);

  return {
    sessionId: access.sessionId,
    sessionTitle: session.title,
    results,
    ...report,
  };
}
