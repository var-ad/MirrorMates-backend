import nodemailer, { Transporter } from "nodemailer";
import { env } from "../../config/env";
import { AppError } from "../../utils/errors";

const EMAIL_UNAVAILABLE_MESSAGE = "Email delivery is not configured";

let transporter: Transporter | null = null;

function isSmtpConfigured(): boolean {
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
    const message = error instanceof Error ? error.message : "Unknown mailer error";
    throw new AppError(`Failed to send email: ${message}`, 502);
  }
}

export async function sendSignupOtpEmail(input: {
  to: string;
  otp: string;
  fullName?: string | null;
  expiresInMinutes: number;
}): Promise<void> {
  const greeting = input.fullName?.trim() ? `Hi ${input.fullName.trim()},` : "Hi,";

  await sendEmail({
    to: input.to,
    subject: "Verify your MirrorMates email",
    text: `${greeting}

Your MirrorMates verification code is ${input.otp}.

It expires in ${input.expiresInMinutes} minutes. If you did not request this, you can ignore this email.`,
    html: `<p>${greeting}</p>
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
  const greeting = input.fullName?.trim() ? `Hi ${input.fullName.trim()},` : "Hi,";

  await sendEmail({
    to: input.to,
    subject: "Reset your MirrorMates password",
    text: `${greeting}

Your MirrorMates password reset code is ${input.otp}.

It expires in ${input.expiresInMinutes} minutes. If you did not request this, you can ignore this email.`,
    html: `<p>${greeting}</p>
<p>Your MirrorMates password reset code is:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${input.otp}</p>
<p>It expires in ${input.expiresInMinutes} minutes.</p>
<p>If you did not request this, you can ignore this email.</p>`
  });
}
