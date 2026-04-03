import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.middleware";
import { inviteSubmissionRateLimiter } from "../../../middleware/rateLimiters";
import { validate } from "../../../middleware/validate";
import {
  createSessionController,
  generateReportController,
  getSessionController,
  inviteMetaController,
  inviteSubmitController,
  latestReportController,
  listAdjectivesController,
  listMySessionsController,
  selfSelectController,
  sessionResultsController,
  updateInviteSettingsController
} from "./johari.controller";
import {
  createSessionSchema,
  inviteSubmitSchema,
  selfSelectSchema,
  sessionIdParamSchema,
  tokenParamSchema,
  updateInviteSettingsSchema
} from "./johari.validators";

export const johariRouter = Router();

johariRouter.get("/johari/adjectives", requireAuth, listAdjectivesController);
johariRouter.get("/johari/sessions/me", requireAuth, listMySessionsController);
johariRouter.post("/johari/session/create", requireAuth, validate({ body: createSessionSchema }), createSessionController);
johariRouter.get("/johari/session/:id", requireAuth, validate({ params: sessionIdParamSchema }), getSessionController);
johariRouter.post(
  "/johari/session/:id/self-select",
  requireAuth,
  validate({ params: sessionIdParamSchema, body: selfSelectSchema }),
  selfSelectController
);
johariRouter.patch(
  "/johari/session/:id/invite",
  requireAuth,
  validate({ params: sessionIdParamSchema, body: updateInviteSettingsSchema }),
  updateInviteSettingsController
);

johariRouter.get("/invite/:token/meta", validate({ params: tokenParamSchema }), inviteMetaController);
johariRouter.post(
  "/invite/:token/submit",
  inviteSubmissionRateLimiter,
  validate({ params: tokenParamSchema, body: inviteSubmitSchema }),
  inviteSubmitController
);

johariRouter.get(
  "/johari/session/:id/results",
  requireAuth,
  validate({ params: sessionIdParamSchema }),
  sessionResultsController
);
johariRouter.get("/johari/session/:id/report", requireAuth, validate({ params: sessionIdParamSchema }), latestReportController);
johariRouter.post(
  "/johari/session/:id/generate-report",
  requireAuth,
  validate({ params: sessionIdParamSchema }),
  generateReportController
);
