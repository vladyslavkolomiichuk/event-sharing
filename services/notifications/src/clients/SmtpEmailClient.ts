import nodemailer, { type Transporter } from 'nodemailer';
import type { MailRequest } from '@event-sharing/contracts';

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  user?: string | undefined;
  password?: string | undefined;
};

export class SmtpEmailClient {
  private readonly transport: Transporter;

  constructor(private readonly settings: SmtpSettings) {
    this.transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      auth: settings.user
        ? { user: settings.user, pass: settings.password }
        : undefined,
    });
  }

  async send(id: string, request: MailRequest): Promise<void> {
    const subject = {
      EMAIL_CHANGE: 'Confirm your new email address',
      EMAIL_CONFIRMATION: 'Approve your email change',
      PASSWORD_RESET: 'Reset your password',
    }[request.kind];
    const instructions = {
      EMAIL_CHANGE: 'Open this link to confirm your new email address:',
      EMAIL_CONFIRMATION: 'Open this link to approve the email change:',
      PASSWORD_RESET: 'Open this link to reset your password:',
    }[request.kind];
    await this.transport.sendMail({
      from: this.settings.from,
      to: request.recipient,
      subject,
      text: `${instructions}\n\n${request.url}\n\nThis link expires in one hour. If you did not request this, ignore this email.`,
      messageId: `<${id}@event-sharing.local>`,
    });
  }
}
