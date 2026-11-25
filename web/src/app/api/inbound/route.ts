import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Message } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET || 'nexus_mail_secret_change_in_production';
    const clientSecret = req.headers.get('x-webhook-secret');

    // Basic secret verification
    if (webhookSecret && clientSecret && clientSecret !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 401 });
    }

    const body = await req.json();
    const { from, fromName, to, subject, text, html, date, messageId, attachments } = body;

    if (!to || !from) {
      return NextResponse.json({ error: 'Missing to or from fields' }, { status: 400 });
    }

    // Determine domain and mailbox from "to" address
    const recipientEmail = to.toLowerCase().trim();
    const domainName = recipientEmail.split('@')[1];

    let mailbox = db.getMailboxByEmail(recipientEmail);
    let tenantId = 'tenant_1';
    let mailboxId = 'mbox_1';

    if (mailbox) {
      tenantId = mailbox.tenantId;
      mailboxId = mailbox.id;
    } else {
      // Check if domain exists
      const domain = db.getDomainByName(domainName);
      if (domain) {
        tenantId = domain.tenantId;
        const mailboxes = db.getMailboxes(tenantId);
        if (mailboxes.length > 0) {
          mailboxId = mailboxes[0].id;
        }
      }
    }

    const newMessage: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      tenantId,
      mailboxId,
      folder: 'inbox',
      from,
      fromName: fromName || from,
      to: recipientEmail,
      subject: subject || '(No Subject)',
      text: text || '',
      html: html || (text ? `<pre>${text}</pre>` : ''),
      isRead: false,
      isStarred: false,
      date: date || new Date().toISOString(),
      messageId: messageId || `<${Date.now()}@${domainName}>`,
      attachments: attachments || [],
    };

    db.createMessage(newMessage);

    console.log(`[INBOUND PROCESSED] Received email for ${recipientEmail} from ${from}`);
    return NextResponse.json({ success: true, messageId: newMessage.id }, { status: 200 });
  } catch (err: any) {
    console.error('Inbound webhook error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
