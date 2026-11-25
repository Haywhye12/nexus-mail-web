import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Message } from '@/lib/types';

const CLOUDFLARE_WORKER_URL =
  process.env.CLOUDFLARE_WORKER_URL ||
  'https://nexus-mail-inbound-worker.ayomidebobani.workers.dev';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mailboxId = searchParams.get('mailboxId') || undefined;
  const folder = searchParams.get('folder') || undefined;

  // 1. Sync live emails from Cloudflare Worker KV storage
  try {
    const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/api/messages`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (cfRes.ok) {
      const data = await cfRes.json();
      const cloudEmails: Message[] = data.messages || [];

      // Merge new emails into local store if not already present
      for (const email of cloudEmails) {
        const existing = db.getMessageById(email.id);
        if (!existing) {
          db.createMessage(email);
        }
      }
    }
  } catch (err: any) {
    console.warn('Note: Could not sync with Cloudflare KV, falling back to local store:', err.message);
  }

  // 2. Fetch from database
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

    // Also remove from Cloudflare Worker KV
    fetch(`${CLOUDFLARE_WORKER_URL}/api/messages/${id}`, {
      method: 'DELETE',
    }).catch(() => {});

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
