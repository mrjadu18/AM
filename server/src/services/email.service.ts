import { env } from '../config/env.js';

export type EmailSendResult = {
  attempted: boolean;
  delivered: boolean;
  error?: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export function emailConfigError(): string {
  return 'Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in the server environment.';
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailSendResult> {
  if (!isEmailConfigured()) {
    return { attempted: true, delivered: false, error: emailConfigError() };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || `<pre>${options.text}</pre>`,
    });

    return { attempted: true, delivered: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email';
    return { attempted: true, delivered: false, error: message };
  }
}
