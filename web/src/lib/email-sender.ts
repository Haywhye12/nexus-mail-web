import nodemailer from 'nodemailer';
import { Attachment } from './types';

export interface SendMailOptions {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
}

export async function sendMail(options: SendMailOptions) {
  const { from, fromName, to, subject, text, html, attachments } = options;

  // Check if SMTP environment credentials exist (e.g. Brevo, Resend, Amazon SES, or custom SMTP)
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  const formattedAttachments = attachments?.map((att) => ({
    filename: att.filename,
    content: att.contentBase64 ? Buffer.from(att.contentBase64, 'base64') : Buffer.from(''),
    contentType: att.mimeType,
  }));

  if (smtpHost && smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const info = await transporter.sendMail({
      from: fromName ? `"${fromName}" <${from}>` : from,
      to,
      subject,
      text: text || '',
      html: html || (text ? `<p>${text}</p>` : ''),
      attachments: formattedAttachments,
    });

    return {
      success: true,
      mode: 'smtp_live',
      messageId: info.messageId,
    };
  }

  // Development / Simulation mode (when running locally or before SMTP secrets are added)
  console.log(
    `[OUTBOUND SIMULATION] Sent email from: ${from} to: ${to} - Subject: ${subject} - Attachments: ${attachments?.length || 0}`
  );
  return {
    success: true,
    mode: 'simulation',
    messageId: `<sim_${Date.now()}@${from.split('@')[1] || 'devgeeksnexus.com'}>`,
    note: 'Email simulated in development mode. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local to send live.',
  };
}
