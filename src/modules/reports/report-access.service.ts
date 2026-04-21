import crypto from "crypto";
import { AppError } from "../../utils/errors";
import { hashToken } from "../../utils/jwt";
import { ReportAccessTokenModel } from "./report-access.model";

const REPORT_LINK_TTL_HOURS = 48;

function resolveExpiryDate(now = new Date()): Date {
  return new Date(now.getTime() + REPORT_LINK_TTL_HOURS * 60 * 60 * 1000);
}

export async function issueReportAccessToken(input: {
  userId: string;
  sessionId: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomUUID();
  const expiresAt = resolveExpiryDate();

  await ReportAccessTokenModel.create({
    tokenHash: hashToken(token),
    userId: input.userId,
    sessionId: input.sessionId,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function consumeReportAccessToken(token: string): Promise<{
  userId: string;
  sessionId: string;
}> {
  const consumedAt = new Date();
  const tokenHash = hashToken(token);
  const record = await ReportAccessTokenModel.findOneAndUpdate(
    {
      tokenHash,
      consumedAt: null,
      expiresAt: {
        $gt: consumedAt,
      },
    },
    {
      $set: {
        consumedAt,
      },
    },
    {
      new: true,
    },
  );

  if (!record) {
    throw new AppError("This report link is invalid or has expired", 410);
  }

  return {
    userId: record.userId,
    sessionId: record.sessionId,
  };
}
