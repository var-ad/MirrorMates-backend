import { Request, Response } from "express";
import { createFingerprint } from "../../../middleware/fingerprint";
import { asyncHandler } from "../../../utils/http";
import {
  computeResults,
  createJohariSession,
  generateSessionReport,
  getInviteMeta,
  getJohariSessionById,
  getLatestSessionReport,
  listAdjectives,
  listUserSessions,
  saveSelfSelections,
  submitInviteFeedback,
  updateInviteSettings
} from "./johari.service";

export const listAdjectivesController = asyncHandler(async (_req: Request, res: Response) => {
  const adjectives = await listAdjectives();
  res.json({ adjectives });
});

export const listMySessionsController = asyncHandler(async (req: Request, res: Response) => {
  const sessions = await listUserSessions(req.user!.id);
  res.json({ sessions });
});

export const createSessionController = asyncHandler(async (req: Request, res: Response) => {
  const created = await createJohariSession(req.user!.id, req.body);
  res.status(201).json(created);
});

export const getSessionController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getJohariSessionById(req.params.id, req.user!.id);
  res.json(data);
});

export const selfSelectController = asyncHandler(async (req: Request, res: Response) => {
  const result = await saveSelfSelections(req.params.id, req.user!.id, req.body.adjectiveIds);
  res.json({ message: "Self selections saved", ...result });
});

export const updateInviteSettingsController = asyncHandler(async (req: Request, res: Response) => {
  const session = await updateInviteSettings(req.params.id, req.user!.id, req.body);
  res.json({ session });
});

export const inviteMetaController = asyncHandler(async (req: Request, res: Response) => {
  const meta = await getInviteMeta(req.params.token);
  const adjectives = await listAdjectives();
  res.json({ invite: meta, adjectives });
});

export const inviteSubmitController = asyncHandler(async (req: Request, res: Response) => {
  const result = await submitInviteFeedback({
    inviteToken: req.params.token,
    displayName: req.body.displayName,
    adjectiveIds: req.body.adjectiveIds,
    fingerprint: createFingerprint(req, req.params.token)
  });
  res.status(201).json(result);
});

export const sessionResultsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await computeResults(req.params.id, req.user!.id);
  res.json(result);
});

export const generateReportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await generateSessionReport(req.params.id, req.user!.id);
  res.status(201).json({
    ...result,
    feedback: {
      text: result.feedbackText,
      generatedAt: result.generatedAt
    }
  });
});

export const latestReportController = asyncHandler(async (req: Request, res: Response) => {
  const report = await getLatestSessionReport(req.params.id, req.user!.id);
  res.json({
    report,
    feedback: report
      ? {
          text: report.reportText,
          generatedAt: report.createdAt
        }
      : null
  });
});
