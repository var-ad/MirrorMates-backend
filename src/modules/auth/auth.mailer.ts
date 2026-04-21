import nodemailer, { Transporter } from "nodemailer";
import { env } from "../../config/env";
import { AppError } from "../../utils/errors";

const EMAIL_UNAVAILABLE_MESSAGE = "Email delivery is not configured";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let transporter: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM);
}

export function assertSmtpConfigured(): void {
  if (!isSmtpConfigured()) {
    throw new AppError(EMAIL_UNAVAILABLE_MESSAGE, 503);
  }

  if ((env.SMTP_USER && !env.SMTP_PASS) || (!env.SMTP_USER && env.SMTP_PASS)) {
    throw new AppError("Email delivery is not configured correctly", 503);
  }
}

function getTransporter(): Transporter {
  assertSmtpConfigured();

  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT!,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  });

  return transporter;
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM!,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html
    });
  } catch (error) {
    console.error("sendMail failed", error);
    const publicMessage =
      env.NODE_ENV === "production"
        ? "Failed to send email. Please try again later."
        : `Failed to send email: ${error instanceof Error ? error.message : "Unknown mailer error"}`;
    throw new AppError(publicMessage, 502);
  }
}

export async function sendSignupOtpEmail(input: {
  to: string;
  otp: string;
  fullName?: string | null;
  expiresInMinutes: number;
}): Promise<void> {
  const trimmedName = input.fullName?.trim();
  const greetingText = trimmedName ? `Hi ${trimmedName},` : "Hi,";
  const greetingHtml = trimmedName ? `Hi ${escapeHtml(trimmedName)},` : "Hi,";

  await sendEmail({
    to: input.to,
    subject: "Verify your MirrorMates email",
    text: `${greetingText}

Your MirrorMates verification code is ${input.otp}.

It expires in ${input.expiresInMinutes} minutes. If you did not request this, you can ignore this email.`,
    html: `<p>${greetingHtml}</p>
<p>Your MirrorMates verification code is:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${input.otp}</p>
<p>It expires in ${input.expiresInMinutes} minutes.</p>
<p>If you did not request this, you can ignore this email.</p>`
  });
}

export async function sendPasswordResetOtpEmail(input: {
  to: string;
  otp: string;
  fullName?: string | null;
  expiresInMinutes: number;
}): Promise<void> {
  const trimmedName = input.fullName?.trim();
  const greetingText = trimmedName ? `Hi ${trimmedName},` : "Hi,";
  const greetingHtml = trimmedName ? `Hi ${escapeHtml(trimmedName)},` : "Hi,";

  await sendEmail({
    to: input.to,
    subject: "Reset your MirrorMates password",
    text: `${greetingText}

Your MirrorMates password reset code is ${input.otp}.

It expires in ${input.expiresInMinutes} minutes. If you did not request this, you can ignore this email.`,
    html: `<p>${greetingHtml}</p>
<p>Your MirrorMates password reset code is:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${input.otp}</p>
<p>It expires in ${input.expiresInMinutes} minutes.</p>
<p>If you did not request this, you can ignore this email.</p>`
  });
}

export async function sendInviteExpiredReportEmail(input: {
  to: string;
  fullName?: string | null;
  sessionTitle: string;
  reportUrl: string;
  inviteExpiredAt: Date;
  peerSubmissionCount: number;
}): Promise<void> {
  const trimmedName = input.fullName?.trim();
  const greetingText = trimmedName ? `Hi ${trimmedName},` : "Hi,";
  const greetingHtml = trimmedName ? `Hi ${escapeHtml(trimmedName)},` : "Hi,";
  const sessionTitleText = input.sessionTitle.trim() || "your Johari session";
  const sessionTitleHtml = escapeHtml(sessionTitleText);
  const expiredAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(input.inviteExpiredAt);
  const responseLabel =
    input.peerSubmissionCount === 1
      ? "1 response"
      : `${input.peerSubmissionCount} responses`;

  await sendEmail({
    to: input.to,
    subject: `Your MirrorMates invite has closed: ${sessionTitleText}`,
    text: `${greetingText}

Your MirrorMates invite for "${sessionTitleText}" expired on ${expiredAt}.

You received ${responseLabel}. Open this secure link to generate the Johari report:
${input.reportUrl}

The link works once and expires automatically after a short period.`,
    html: `<p>${greetingHtml}</p>
<p>Your MirrorMates invite for <strong>${sessionTitleHtml}</strong> expired on ${escapeHtml(expiredAt)}.</p>
<p>You received <strong>${escapeHtml(responseLabel)}</strong>.</p>
<p><a href="${escapeHtml(input.reportUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#ff6a00;color:#ffffff;text-decoration:none;font-weight:700;">Generate Johari report</a></p>
<p>This link works once and expires automatically after a short period.</p>`,
  });
}
