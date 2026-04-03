"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.latestReportController = exports.generateReportController = exports.sessionResultsController = exports.inviteSubmitController = exports.inviteMetaController = exports.updateInviteSettingsController = exports.selfSelectController = exports.getSessionController = exports.createSessionController = exports.listMySessionsController = exports.listAdjectivesController = void 0;
const fingerprint_1 = require("../../../middleware/fingerprint");
const http_1 = require("../../../utils/http");
const johari_service_1 = require("./johari.service");
exports.listAdjectivesController = (0, http_1.asyncHandler)(async (_req, res) => {
    const adjectives = await (0, johari_service_1.listAdjectives)();
    res.json({ adjectives });
});
exports.listMySessionsController = (0, http_1.asyncHandler)(async (req, res) => {
    const sessions = await (0, johari_service_1.listUserSessions)(req.user.id);
    res.json({ sessions });
});
exports.createSessionController = (0, http_1.asyncHandler)(async (req, res) => {
    const created = await (0, johari_service_1.createJohariSession)(req.user.id, req.body);
    res.status(201).json(created);
});
exports.getSessionController = (0, http_1.asyncHandler)(async (req, res) => {
    const data = await (0, johari_service_1.getJohariSessionById)(req.params.id, req.user.id);
    res.json(data);
});
exports.selfSelectController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, johari_service_1.saveSelfSelections)(req.params.id, req.user.id, req.body.adjectiveIds);
    res.json({ message: "Self selections saved", ...result });
});
exports.updateInviteSettingsController = (0, http_1.asyncHandler)(async (req, res) => {
    const session = await (0, johari_service_1.updateInviteSettings)(req.params.id, req.user.id, req.body);
    res.json({ session });
});
exports.inviteMetaController = (0, http_1.asyncHandler)(async (req, res) => {
    const meta = await (0, johari_service_1.getInviteMeta)(req.params.token);
    const adjectives = await (0, johari_service_1.listAdjectives)();
    res.json({ invite: meta, adjectives });
});
exports.inviteSubmitController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, johari_service_1.submitInviteFeedback)({
        inviteToken: req.params.token,
        displayName: req.body.displayName,
        adjectiveIds: req.body.adjectiveIds,
        fingerprint: (0, fingerprint_1.createFingerprint)(req, req.params.token)
    });
    res.status(201).json(result);
});
exports.sessionResultsController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, johari_service_1.computeResults)(req.params.id, req.user.id);
    res.json(result);
});
exports.generateReportController = (0, http_1.asyncHandler)(async (req, res) => {
    const result = await (0, johari_service_1.generateSessionReport)(req.params.id, req.user.id);
    res.status(201).json({
        ...result,
        feedback: {
            text: result.feedbackText,
            generatedAt: result.generatedAt
        }
    });
});
exports.latestReportController = (0, http_1.asyncHandler)(async (req, res) => {
    const report = await (0, johari_service_1.getLatestSessionReport)(req.params.id, req.user.id);
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
