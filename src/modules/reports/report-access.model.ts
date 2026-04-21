import { Schema, model } from "mongoose";

const reportAccessTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "report_access_tokens",
  },
);

// TTL index: auto-delete expired documents after expiration time
reportAccessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ReportAccessTokenModel = model(
  "ReportAccessToken",
  reportAccessTokenSchema,
);
