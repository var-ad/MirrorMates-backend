import { JohariSessionStatus } from "@prisma/client";
import {
  isSmtpConfigured,
  sendInviteExpiredReportEmail,
} from "../../auth/auth.mailer";
import { prisma } from "../../../db/prisma";
import { issueReportAccessToken } from "../../reports/report-access.service";
import { buildReportGenerateUrl } from "./johari.shared";

const EXPIRY_EMAIL_CHECK_INTERVAL_MS = 60_000;
const EXPIRY_EMAIL_BATCH_SIZE = 25;

let scheduler: NodeJS.Timeout | null = null;
let runInProgress = false;

export async function sendExpiredInviteReportEmails(
  now = new Date(),
): Promise<number> {
  if (!isSmtpConfigured()) {
    return 0;
  }

  if (runInProgress) {
    return 0;
  }

  runInProgress = true;

  try {
    const expiredSessions = await prisma.johariSession.findMany({
      where: {
        inviteExpiresAt: {
          lte: now,
        },
        expiryReportEmailSentAt: null,
        status: JohariSessionStatus.ACTIVE,
        owner: {
          isActive: true,
        },
      },
      orderBy: {
        inviteExpiresAt: "asc",
      },
      take: EXPIRY_EMAIL_BATCH_SIZE,
      include: {
        owner: {
          select: {
            email: true,
            fullName: true,
          },
        },
        _count: {
          select: {
            peerSubmissions: true,
          },
        },
      },
    });

    let sentCount = 0;

    for (const session of expiredSessions) {
      try {
        const reportAccessToken = await issueReportAccessToken({
          userId: session.ownerUserId,
          sessionId: session.id,
        });

        await sendInviteExpiredReportEmail({
          to: session.owner.email,
          fullName: session.owner.fullName,
          sessionTitle: session.title,
          reportUrl: buildReportGenerateUrl(reportAccessToken.token),
          inviteExpiredAt: session.inviteExpiresAt,
          peerSubmissionCount: session._count.peerSubmissions,
        });

        const updated = await prisma.johariSession.updateMany({
          where: {
            id: session.id,
            expiryReportEmailSentAt: null,
          },
          data: {
            expiryReportEmailSentAt: new Date(),
          },
        });

        sentCount += updated.count;
      } catch (error) {
        console.error(
          `Failed to send invite expiry email for session ${session.id}`,
          error,
        );
      }
    }

    return sentCount;
  } finally {
    runInProgress = false;
  }
}

export function startInviteExpiryEmailScheduler(): () => void {
  if (scheduler) {
    return stopInviteExpiryEmailScheduler;
  }

  if (!isSmtpConfigured()) {
    console.warn(
      "Invite expiry email scheduler disabled because SMTP is not configured.",
    );
    return () => undefined;
  }

  void sendExpiredInviteReportEmails();

  scheduler = setInterval(() => {
    void sendExpiredInviteReportEmails();
  }, EXPIRY_EMAIL_CHECK_INTERVAL_MS);
  scheduler.unref();

  return stopInviteExpiryEmailScheduler;
}

export function stopInviteExpiryEmailScheduler(): void {
  if (!scheduler) {
    return;
  }

  clearInterval(scheduler);
  scheduler = null;
}
