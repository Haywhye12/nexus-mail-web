import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mailboxId = searchParams.get('mailboxId') || undefined;
  const folder = searchParams.get('folder') || undefined;

  const messages = db.getMessages(mailboxId, folder);
  const mailboxes = db.getMailboxes();
  const domains = db.getDomains();

  return NextResponse.json({
    messages,
    mailboxes,
    domains,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, isRead, isStarred, folder, action } = body;

  if (action === 'delete') {
    db.deleteMessage(id);
    return NextResponse.json({ success: true, deleted: true });
  }

  if (typeof isRead === 'boolean') {
    db.markRead(id, isRead);
  }

  if (action === 'toggleStar') {
    db.toggleStar(id);
  }

  return NextResponse.json({ success: true, message: db.getMessageById(id) });
}
