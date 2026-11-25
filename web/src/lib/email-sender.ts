import nodemailer from 'nodemailer';

export interface SendMailOptions {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendMail(options: SendMailOptions) {
  const { from, fromName, to, subject, text, html } = options;

  // Check if SMTP environment credentials exist (e.g. Brevo, Resend, Amazon SES, or custom SMTP)
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

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
    });

    return {
      success: true,
      mode: 'smtp_live',
      messageId: info.messageId,
    };
  }

  // Development / Simulation mode (when running locally or before SMTP secrets are added)
  console.log(`[OUTBOUND SIMULATION] Sent email from: ${from} to: ${to} - Subject: ${subject}`);
  return {
    success: true,
    mode: 'simulation',
    messageId: `<sim_${Date.now()}@${from.split('@')[1] || 'devgeeksnexus.com'}>`,
    note: 'Email simulated in development mode. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local to send live.',
  };
}
