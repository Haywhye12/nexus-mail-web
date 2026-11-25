import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendMail } from '@/lib/email-sender';
import { Message, Attachment } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { from, fromName, to, subject, text, html, mailboxId, tenantId, attachments } = body;

    if (!from || !to || !subject) {
      return NextResponse.json({ error: 'Missing from, to, or subject' }, { status: 400 });
    }

    const cleanAttachments: Attachment[] = Array.isArray(attachments) ? attachments : [];

    // 1. Dispatch through email delivery transport
    const sendResult = await sendMail({
      from,
      fromName: fromName || 'DevGeeksNexus Team',
      to,
      subject,
      text,
      html,
      attachments: cleanAttachments,
    });

    // 2. Save into Sent folder
    const sentMessage: Message = {
      id: `msg_sent_${Date.now()}`,
      tenantId: tenantId || 'tenant_1',
      mailboxId: mailboxId || 'mbox_1',
      folder: 'sent',
      from,
      fromName: fromName || 'DevGeeksNexus Team',
      to,
      subject,
      text: text || '',
      html: html || (text ? `<p>${text}</p>` : ''),
      isRead: true,
      isStarred: false,
      date: new Date().toISOString(),
      messageId: sendResult.messageId,
      attachments: cleanAttachments,
    };

    db.createMessage(sentMessage);

    return NextResponse.json({
      success: true,
      message: sentMessage,
      delivery: sendResult,
    });
  } catch (err: any) {
    console.error('Send mail API error:', err);
    return NextResponse.json({ error: err.message || 'Failed to send mail' }, { status: 500 });
  }
}
