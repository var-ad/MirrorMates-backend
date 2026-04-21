import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.middleware";
import {
  inviteMetaRateLimiter,
  inviteSubmissionRateLimiter,
  reportGenerationRateLimiter,
  sessionCreationRateLimiter,
  sessionUpdateRateLimiter
} from "../../../middleware/rateLimiters";
import { validate } from "../../../middleware/validate";
import {
  createSessionController,
  generateReportFromTokenController,
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
  reportTokenSchema,
  tokenParamSchema,
  updateInviteSettingsSchema
} from "./johari.validators";

export const johariRouter = Router();

johariRouter.get("/johari/adjectives", requireAuth, listAdjectivesController);
johariRouter.get("/johari/sessions/me", requireAuth, listMySessionsController);
johariRouter.post(
  "/johari/session/create",
  requireAuth,
  sessionCreationRateLimiter,
  validate({ body: createSessionSchema }),
  createSessionController
);
johariRouter.get("/johari/session/:id", requireAuth, validate({ params: sessionIdParamSchema }), getSessionController);
johariRouter.post(
  "/johari/session/:id/self-select",
  requireAuth,
  sessionUpdateRateLimiter,
  validate({ params: sessionIdParamSchema, body: selfSelectSchema }),
  selfSelectController
);
johariRouter.patch(
  "/johari/session/:id/invite",
  requireAuth,
  sessionUpdateRateLimiter,
  validate({ params: sessionIdParamSchema, body: updateInviteSettingsSchema }),
  updateInviteSettingsController
);

johariRouter.get("/invite/:token/meta", inviteMetaRateLimiter, validate({ params: tokenParamSchema }), inviteMetaController);
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
  reportGenerationRateLimiter,
  validate({ params: sessionIdParamSchema }),
  generateReportController
);

johariRouter.post(
  "/report/generate",
  validate({ body: reportTokenSchema }),
  generateReportFromTokenController,
);
