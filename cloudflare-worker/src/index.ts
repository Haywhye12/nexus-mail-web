import PostalMime from 'postal-mime';

export interface Env {
  RESEND_API_KEY?: string;
  SMTP_PASS?: string;
  GEMINI_API_KEY?: string;
  EMAILS?: any; // KVNamespace
  DB?: D1Database;
}

// User Accounts & Role Permissions
// Role 'superadmin' / 'admin': Full access to all accounts (admin@, info@, ayomidebobani@), Spam settings, and Security.
// Role 'member': Restricted strictly to assigned mailboxes (e.g. info@ or personal only, NO access to admin@).
// Role 'student': Sandboxed strictly to individual student mailbox (e.g. firstname.lastname@devgeeksnexus.com).
export interface TeamMember {
  email: string;
  name: string;
  role: 'superadmin' | 'admin' | 'member' | 'student';
  allowedAccounts: string[]; // ['*'] for all, or specific email addresses
}

export interface StudentAccount {
  id: string;
  firstName: string;
  lastName: string;
  studentEmail: string; // firstname.lastname@devgeeksnexus.com
  activeEmail: string;  // personal real email (OTP destination)
  createdAt: string;
  expiresAt: string | null;
  status: 'active' | 'suspended';
}

export async function getStudentAccounts(kv: any): Promise<StudentAccount[]> {
  if (!kv) return [];
  try {
    const list = await kv.get('students:list', 'json');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('getStudentAccounts error:', e);
    return [];
  }
}

export async function saveStudentAccounts(kv: any, list: StudentAccount[]): Promise<void> {
  if (!kv) return;
  await kv.put('students:list', JSON.stringify(list));
}

// ==========================================
// Community & General Group Hub
// Accessible by Students, Staff, and Admins
// ==========================================
export interface CommunityReply {
  id: string;
  authorEmail: string;
  authorName: string;
  authorRole: 'superadmin' | 'admin' | 'student' | 'member';
  content: string;
  createdAt: string;
}

export interface CommunityPost {
  id: string;
  title: string;
  content: string;
  category: 'question' | 'report' | 'announcement' | 'general';
  authorEmail: string;
  authorName: string;
  authorRole: 'superadmin' | 'admin' | 'student' | 'member';
  isPinned?: boolean;
  status?: 'open' | 'pending' | 'reviewed' | 'resolved'; // for reports & questions
  replies: CommunityReply[];
  createdAt: string;
  updatedAt: string;
}

export async function getCommunityPosts(kv: any): Promise<CommunityPost[]> {
  if (!kv) return [];
  try {
    const posts = await kv.get('community:posts', 'json');
    return Array.isArray(posts) ? posts : [];
  } catch (e) {
    console.error('getCommunityPosts error:', e);
    return [];
  }
}

export async function saveCommunityPosts(kv: any, posts: CommunityPost[]): Promise<void> {
  if (!kv) return;
  await kv.put('community:posts', JSON.stringify(posts));
}

export function sanitizeEmailHandle(str: string): string {
  return (str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^\.+|\.+$/g, '');
}

export function generateStudentEmail(firstName: string, lastName: string, existingList: StudentAccount[] = []): string {
  const f = sanitizeEmailHandle(firstName) || 'student';
  const l = sanitizeEmailHandle(lastName) || 'user';
  const baseHandle = `${f}.${l}`;
  let candidate = `${baseHandle}@devgeeksnexus.com`;
  let counter = 2;
  const existingEmails = new Set(existingList.map((s) => (s.studentEmail || '').toLowerCase()));
  while (existingEmails.has(candidate.toLowerCase())) {
    candidate = `${baseHandle}${counter}@devgeeksnexus.com`;
    counter++;
  }
  return candidate;
}

export function maskEmail(email: string): string {
  const parts = (email || '').trim().split('@');
  if (parts.length !== 2) return email || '';
  const user = parts[0];
  const domain = parts[1];
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  return `${user.slice(0, 2)}***${user.slice(-1)}@${domain}`;
}

export const TEAM_MEMBERS: TeamMember[] = [
  {
    email: 'ayomidebobani@gmail.com',
    name: 'Ayomide Bobani',
    role: 'superadmin',
    allowedAccounts: ['*'],
  },
  {
    email: 'ayomidebobani@devgeeksnexus.com',
    name: 'Ayomide Bobani (Direct)',
    role: 'admin',
    allowedAccounts: ['*'],
  },
  {
    email: 'admin@devgeeksnexus.com',
    name: 'Admin Desk',
    role: 'admin',
    allowedAccounts: ['*'],
  },
  {
    email: 'info@devgeeksnexus.com',
    name: 'Support Team',
    role: 'member',
    allowedAccounts: ['info@devgeeksnexus.com'],
  },
];

export function resolveUserPermissions(userEmail: string, studentsList: StudentAccount[] = []): TeamMember {
  const normalized = (userEmail || '').trim().toLowerCase();

  // 1. Check Student Accounts
  const matchedStudent = studentsList.find(
    (s) => s.studentEmail.toLowerCase() === normalized || s.activeEmail.toLowerCase() === normalized
  );
  if (matchedStudent) {
    return {
      email: matchedStudent.studentEmail.toLowerCase(),
      name: `${matchedStudent.firstName} ${matchedStudent.lastName}`.trim(),
      role: 'student',
      allowedAccounts: [matchedStudent.studentEmail.toLowerCase()],
    };
  }

  // 2. Check Static Team Members
  const matched = TEAM_MEMBERS.find((m) => m.email.toLowerCase() === normalized);
  if (matched) return matched;

  // 3. Default fallback for any newly verified @devgeeksnexus.com staff: member with access to info only
  return {
    email: normalized,
    name: normalized.split('@')[0],
    role: 'member',
    allowedAccounts: ['info@devgeeksnexus.com'],
  };
}

export const KNOWN_ACCOUNTS = [
  {
    email: 'info@devgeeksnexus.com',
    name: 'DevGeeksNexus Team',
    label: 'Info Desk',
    role: 'Customer & General Inquiries',
    color: 'indigo',
    avatar: 'I',
  },
  {
    email: 'ayomidebobani@devgeeksnexus.com',
    name: 'Ayomide Bobani',
    label: 'Ayomide Bobani',
    role: 'Personal & Direct',
    color: 'emerald',
    avatar: 'A',
  },
  {
    email: 'admin@devgeeksnexus.com',
    name: 'Admin | DevGeeksNexus',
    label: 'Administrator',
    role: 'System & Admin Alerts',
    color: 'amber',
    avatar: '🛡️',
  },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function parseEmailList(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((s) => String(s).trim()).filter(Boolean);
  return String(input)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveAccount(toStr: string, defaultAcc: string = 'info@devgeeksnexus.com'): string {
  const lower = (toStr || '').toLowerCase();
  for (const acc of KNOWN_ACCOUNTS) {
    if (lower.includes(acc.email.toLowerCase())) {
      return acc.email;
    }
  }
  if (lower.includes('@devgeeksnexus.com')) {
    const match = lower.match(/([a-zA-Z0-9._%+-]+@devgeeksnexus\.com)/);
    if (match) return match[1];
  }
  return defaultAcc;
}

function rowToMessage(row: any): any {
  if (!row) return null;
  let attachments = [];
  try {
    if (row.attachments_json) attachments = JSON.parse(row.attachments_json);
  } catch (e) {}
  return {
    id: row.id,
    account: row.account,
    from: row.from_address,
    fromName: row.from_name || row.from_address,
    to: row.to_address,
    cc: row.cc || '',
    bcc: row.bcc || '',
    subject: row.subject || '(No Subject)',
    text: row.text || '',
    html: row.html || (row.text ? `<pre>${row.text}</pre>` : ''),
    date: row.date,
    messageId: row.message_id || `<${row.id}@devgeeksnexus.com>`,
    folder: row.folder || 'inbox',
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    isSpam: Boolean(row.is_spam),
    spamReason: row.spam_reason || null,
    attachments,
    trackingId: row.tracking_id || null,
    isScheduled: Boolean(row.is_scheduled),
    scheduledTime: row.scheduled_time || null,
  };
}

async function saveMessageToDB(db: D1Database, msg: any) {
  const attachmentsJson = JSON.stringify(msg.attachments || []);
  await db.prepare(`
    INSERT OR REPLACE INTO messages (
      id, account, from_address, from_name, to_address, cc, bcc,
      subject, text, html, date, message_id, folder,
      is_read, is_starred, is_spam, spam_reason, attachments_json,
      tracking_id, is_scheduled, scheduled_time, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    msg.id,
    msg.account,
    msg.from || '',
    msg.fromName || '',
    msg.to || '',
    msg.cc || '',
    msg.bcc || '',
    msg.subject || '',
    msg.text || '',
    msg.html || '',
    msg.date || new Date().toISOString(),
    msg.messageId || null,
    msg.folder || 'inbox',
    msg.isRead ? 1 : 0,
    msg.isStarred ? 1 : 0,
    msg.isSpam ? 1 : 0,
    msg.spamReason || null,
    attachmentsJson,
    msg.trackingId || null,
    msg.isScheduled ? 1 : 0,
    msg.scheduledTime || null,
    Date.now()
  ).run();
}

async function saveMessageToKV(kv: any, msg: any) {
  // Direct O(1) write with deterministic key
  const key = `msg:${msg.id}`;
  await kv.put(key, JSON.stringify(msg));
  try {
    const index: string[] = (await kv.get('index:messages', 'json')) || [];
    if (!index.includes(key) && !index.includes(msg.id)) {
      index.unshift(key);
      if (index.length > 500) index.length = 500;
      await kv.put('index:messages', JSON.stringify(index));
    }
  } catch (e) {}
}

async function deleteMessageFromKV(kv: any, msgId: string) {
  // Direct O(1) delete
  await kv.delete(`msg:${msgId}`);
  try {
    const index: string[] = (await kv.get('index:messages', 'json')) || [];
    const filtered = index.filter((id: string) => id !== msgId && !id.endsWith(msgId));
    await kv.put('index:messages', JSON.stringify(filtered));
  } catch (e) {}
}

async function scheduleMessageInKV(kv: any, schedId: string, schedPayload: any) {
  await kv.put(`scheduled:${schedId}`, JSON.stringify(schedPayload));
  try {
    const index: string[] = (await kv.get('index:scheduled', 'json')) || [];
    if (!index.includes(schedId)) {
      index.push(schedId);
      await kv.put('index:scheduled', JSON.stringify(index));
    }
  } catch (e) {}
}

async function deleteScheduledFromKV(kv: any, schedId: string) {
  await kv.delete(`scheduled:${schedId}`);
  try {
    const index: string[] = (await kv.get('index:scheduled', 'json')) || [];
    const filtered = index.filter((id: string) => id !== schedId);
    await kv.put('index:scheduled', JSON.stringify(filtered));
  } catch (e) {}
}

export default {
  // 1. INBOUND EMAIL EVENT HANDLER (Cloudflare Email Routing)
  async email(message: any, env: Env, ctx: any): Promise<void> {
    try {
      const rawEmail = new Response(message.raw);
      const arrayBuffer = await rawEmail.arrayBuffer();

      const parser = new PostalMime();
      const parsed = await parser.parse(arrayBuffer);

      const toAddress = message.to || (parsed.to && parsed.to[0]?.address) || 'info@devgeeksnexus.com';
      const fromAddress = message.from || (parsed.from?.address) || 'unknown';
      const ccAddress = (parsed.cc || []).map((c: any) => c.address || c.name).join(', ');

      const targetAccount = resolveAccount(toAddress);

      // SPAM & PHISHING FILTERING ENGINE
      let isSpam = false;
      let spamReason = '';
      if (env.EMAILS) {
        const securitySettings = (await env.EMAILS.get('settings:security', 'json')) as any || {
          blocklist: [],
          allowlist: [],
          spamKeywords: ['claim prize', 'wire money', 'urgent transfer', 'crypto investment', 'bitcoin bonus', 'verify bank login', 'account suspended click here'],
        };

        const fromNormalized = fromAddress.toLowerCase();
        const bodyContent = `${parsed.subject || ''} ${parsed.text || ''}`.toLowerCase();

        // 1. Check Allowlist
        const isAllowlisted = (securitySettings.allowlist || []).some((item: string) => fromNormalized.includes(item.toLowerCase()));

        if (!isAllowlisted) {
          // 2. Check Blocklist
          const isBlocklisted = (securitySettings.blocklist || []).some((item: string) => fromNormalized.includes(item.toLowerCase()));
          if (isBlocklisted) {
            isSpam = true;
            spamReason = 'Sender is on your automated blocklist';
          }

          // 3. Check Keyword and Phishing patterns
          if (!isSpam && securitySettings.spamKeywords) {
            for (const kw of securitySettings.spamKeywords) {
              if (bodyContent.includes(kw.toLowerCase())) {
                isSpam = true;
                spamReason = `Detected phishing/spam pattern: "${kw}"`;
                break;
              }
            }
          }
        }
      }

      const attachments = (parsed.attachments || []).map((att: any) => ({
        filename: att.filename || 'attachment',
        mimeType: att.mimeType || 'application/octet-stream',
        size: att.content ? att.content.byteLength : 0,
        contentBase64: att.content ? Buffer.from(att.content).toString('base64') : null,
      }));

      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const payload = {
        id: msgId,
        account: targetAccount,
        from: fromAddress,
        fromName: parsed.from?.name || fromAddress,
        to: toAddress,
        cc: ccAddress,
        subject: parsed.subject || '(No Subject)',
        text: parsed.text || '',
        html: parsed.html || (parsed.text ? `<pre>${parsed.text}</pre>` : ''),
        date: parsed.date || new Date().toISOString(),
        messageId: parsed.messageId || `<${msgId}@devgeeksnexus.com>`,
        attachments,
        folder: isSpam ? 'spam' : 'inbox',
        isSpam,
        spamReason: spamReason || null,
        isRead: false,
        isStarred: false,
      };

      if (env.DB) {
        try {
          await saveMessageToDB(env.DB, payload);
          console.log(`Stored inbound email ${msgId} for mailbox ${targetAccount} in Cloudflare D1 (folder: ${payload.folder}).`);
        } catch (dbErr) {
          console.error('Error saving inbound email to D1:', dbErr);
        }
      }
      if (env.EMAILS) {
        try {
          await env.EMAILS.put(`msg:${payload.date}:${msgId}`, JSON.stringify(payload));
          console.log(`Stored inbound email ${msgId} for mailbox ${targetAccount} in Cloudflare KV (folder: ${payload.folder}).`);
        } catch (kvErr) {}
      }
    } catch (err: any) {
      console.error('Inbound email error:', err.message || err);
    }
  },

  // 1.5 SCHEDULED CRON HANDLER (Scheduled Sending)
  async scheduled(event: any, env: Env, ctx: any) {
    if (!env.EMAILS) return;
    try {
      const now = Date.now();
      const list = await env.EMAILS.list({ prefix: 'scheduled:' });
      for (const key of list.keys) {
        const item = (await env.EMAILS.get(key.name, 'json')) as any;
        if (item && item.scheduledTime && item.scheduledTime <= now) {
          const apiKey = env.RESEND_API_KEY || env.SMTP_PASS;
          if (apiKey) {
            const resendPayload: any = {
              from: item.fromFormatted || item.from,
              to: item.toList,
              subject: item.subject,
              html: item.htmlWithTracking || item.html || `<p>${item.text}</p>`,
            };
            if (item.ccList && item.ccList.length > 0) resendPayload.cc = item.ccList;
            if (item.bccList && item.bccList.length > 0) resendPayload.bcc = item.bccList;
            if (item.attachments && item.attachments.length > 0) {
              resendPayload.attachments = item.attachments.map((att: any) => ({
                filename: att.filename,
                content: att.contentBase64,
              }));
            }

            const sendRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(resendPayload),
            });

            if (sendRes.ok) {
              const resData = (await sendRes.json()) as any;
              const sentId = `sent_${Date.now()}`;
              const sentMsg = {
                id: sentId,
                account: item.from,
                from: item.from,
                fromName: item.fromName,
                to: item.toList.join(', '),
                cc: (item.ccList || []).join(', '),
                bcc: (item.bccList || []).join(', '),
                subject: item.subject,
                text: item.text || '',
                html: item.html || '',
                date: new Date().toISOString(),
                folder: 'sent',
                isRead: true,
                isStarred: false,
                attachments: item.attachments || [],
                messageId: resData.id,
                trackingId: item.trackingId || null,
              };
              await env.EMAILS.put(`msg:${sentMsg.date}:${sentId}`, JSON.stringify(sentMsg));
              await env.EMAILS.delete(key.name);
            }
          }
        }
      }
    } catch (e) {
      console.error('Scheduled cron error:', e);
    }
  },

  // 2. HTTP FETCH HANDLER (Nexus Mail Web App & API)
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // API: GET /api/track/open (Tracking pixel)
    if (url.pathname === '/api/track/open') {
      const trackingId = url.searchParams.get('tid');
      if (trackingId) {
        ctx.waitUntil(
          (async () => {
            const now = new Date().toISOString();
            if (env.DB) {
              await env.DB.prepare(`
                INSERT INTO tracking (id, opens, clicks, first_opened_at, last_opened_at, updated_at)
                VALUES (?, 1, 0, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  opens = opens + 1,
                  first_opened_at = COALESCE(first_opened_at, excluded.first_opened_at),
                  last_opened_at = excluded.last_opened_at,
                  updated_at = excluded.updated_at
              `).bind(trackingId, now, now, now).run();
            } else if (env.EMAILS) {
              const existing = await env.EMAILS.get(`track:${trackingId}`, 'json') as any || { opens: 0, clicks: 0, firstOpenedAt: null, lastOpenedAt: null };
              existing.opens = (existing.opens || 0) + 1;
              if (!existing.firstOpenedAt) existing.firstOpenedAt = now;
              existing.lastOpenedAt = now;
              await env.EMAILS.put(`track:${trackingId}`, JSON.stringify(existing));
            }
          })()
        );
      }
      // Return 1x1 transparent GIF
      const transparentGif = new Uint8Array([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
        0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
        0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
        0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
        0x01, 0x00, 0x3b
      ]);
      return new Response(transparentGif, {
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    // API: GET /api/track/click (Link redirect tracking)
    if (url.pathname === '/api/track/click') {
      const trackingId = url.searchParams.get('tid');
      const targetUrl = url.searchParams.get('url');
      if (trackingId) {
        ctx.waitUntil(
          (async () => {
            const now = new Date().toISOString();
            if (env.DB) {
              await env.DB.prepare(`
                INSERT INTO tracking (id, opens, clicks, first_clicked_at, last_clicked_at, updated_at)
                VALUES (?, 0, 1, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  clicks = clicks + 1,
                  first_clicked_at = COALESCE(first_clicked_at, excluded.first_clicked_at),
                  last_clicked_at = excluded.last_clicked_at,
                  updated_at = excluded.updated_at
              `).bind(trackingId, now, now, now).run();
            } else if (env.EMAILS) {
              const existing = await env.EMAILS.get(`track:${trackingId}`, 'json') as any || { opens: 0, clicks: 0, firstClickedAt: null, lastClickedAt: null };
              existing.clicks = (existing.clicks || 0) + 1;
              if (!existing.firstClickedAt) existing.firstClickedAt = now;
              existing.lastClickedAt = now;
              await env.EMAILS.put(`track:${trackingId}`, JSON.stringify(existing));
            }
          })()
        );
      }
      return Response.redirect(targetUrl || 'https://devgeeksnexus.com', 302);
    }

    // API: GET /api/track/stats
    if (url.pathname === '/api/track/stats') {
      const tid = url.searchParams.get('tid');
      if (!tid) {
        return new Response(JSON.stringify({ opens: 0, clicks: 0 }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      if (env.DB) {
        const row = (await env.DB.prepare('SELECT opens, clicks, first_opened_at, last_opened_at, first_clicked_at, last_clicked_at FROM tracking WHERE id = ?').bind(tid).first()) as any;
        if (row) {
          return new Response(JSON.stringify({
            opens: row.opens || 0,
            clicks: row.clicks || 0,
            firstOpenedAt: row.first_opened_at,
            lastOpenedAt: row.last_opened_at,
            firstClickedAt: row.first_clicked_at,
            lastClickedAt: row.last_clicked_at
          }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }
      if (env.EMAILS) {
        const data = await env.EMAILS.get(`track:${tid}`, 'json') || { opens: 0, clicks: 0 };
        return new Response(JSON.stringify(data), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ opens: 0, clicks: 0 }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Standalone Isolated Video Meeting / Training Room Route
    // Accessible via /meet, /meet?room=..., /meet/:room, or legacy /?meet=...
    // Fully isolated from email: participants have ZERO access to emails or mailbox APIs
    if (url.pathname.startsWith('/meet') || url.searchParams.has('meet')) {
      const roomParam =
        url.searchParams.get('room') ||
        url.searchParams.get('meet') ||
        url.pathname.replace(/^\/meet\/?/, '').trim();
      return new Response(renderStandaloneMeetHtml(roomParam || 'devgeeksnexus-training'), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
        },
      });
    }

    // Helper: Parse cookie header
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );
    const sessionToken = cookies['nexus_session'];
    let isAuthenticated = false;
    let authEmail = '';

    if (sessionToken && env.EMAILS) {
      const sessionData = await env.EMAILS.get(`session:${sessionToken}`, 'json') as any;
      if (sessionData && sessionData.email) {
        isAuthenticated = true;
        authEmail = sessionData.email;
      }
    }

    // AUTH API: POST /api/auth/send-otp
    if (request.method === 'POST' && url.pathname === '/api/auth/send-otp') {
      try {
        const body = (await request.json()) as any;
        const email = (body.email || '').trim().toLowerCase();

        // Check if matching a registered student account
        const studentsList = await getStudentAccounts(env.EMAILS);
        const matchedStudent = studentsList.find(
          (s) => s.studentEmail.toLowerCase() === email || s.activeEmail.toLowerCase() === email
        );

        let targetSendEmail = email;
        let resolvedSessionEmail = email;
        let isStudent = false;

        if (matchedStudent) {
          if (matchedStudent.status === 'suspended') {
            return new Response(
              JSON.stringify({ error: 'Your student mailbox has been suspended. Please contact the administrator.' }),
              { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
          }
          if (matchedStudent.expiresAt && new Date(matchedStudent.expiresAt).getTime() < Date.now()) {
            return new Response(
              JSON.stringify({ error: 'Your student temporary mailbox has expired. Please contact the administrator.' }),
              { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
          }
          isStudent = true;
          targetSendEmail = matchedStudent.activeEmail; // send to real active personal email!
          resolvedSessionEmail = matchedStudent.studentEmail; // session is for student's @devgeeksnexus.com mailbox
        } else {
          // Check standard staff / admin
          const isAuthorized =
            email === 'ayomidebobani@gmail.com' ||
            email.endsWith('@devgeeksnexus.com');

          if (!email || !isAuthorized) {
            return new Response(
              JSON.stringify({ error: 'Unauthorized email address. Only admin and authorized personnel are permitted.' }),
              { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Generate a 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        if (env.EMAILS) {
          const otpPayload = {
            code: otpCode,
            timestamp: Date.now(),
            resolvedEmail: resolvedSessionEmail,
            isStudent,
          };
          // Store OTP in Cloudflare KV under both login email and student addresses with 10-minute expiration
          await env.EMAILS.put(`otp:${email}`, JSON.stringify(otpPayload), { expirationTtl: 600 });
          if (isStudent && matchedStudent) {
            await env.EMAILS.put(`otp:${matchedStudent.studentEmail.toLowerCase()}`, JSON.stringify(otpPayload), { expirationTtl: 600 });
            await env.EMAILS.put(`otp:${matchedStudent.activeEmail.toLowerCase()}`, JSON.stringify(otpPayload), { expirationTtl: 600 });
          }
        }

        // Send OTP directly via Resend to the user's destination email
        const resendKey = (env.RESEND_API_KEY || (env as any).SMTP_PASS || '').trim();
        if (resendKey) {
          const emailSubject = isStudent
            ? `${otpCode} is your DevGeeksNexus Student Mail Verification Code`
            : `${otpCode} is your DevGeeksNexus Webmail Login Code`;
          const emailBodyTitle = isStudent ? 'Student Mailbox Verification' : 'DevGeeksNexus Webmail';
          const emailBodySub = isStudent
            ? `Single-use code to access <strong>${resolvedSessionEmail}</strong>`
            : 'Identity Verification & Secure Sign-In';

          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'DevGeeksNexus Security <info@devgeeksnexus.com>',
              to: [targetSendEmail],
              subject: emailSubject,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0f172a; border-radius: 16px; color: #f8fafc; border: 1px solid #1e293b;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 12px; background: linear-gradient(135deg, #4f46e5, #0ea5e9); color: #ffffff; font-weight: bold; font-size: 22px;">N</div>
                    <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 12px; margin-bottom: 4px;">${emailBodyTitle}</h2>
                    <p style="font-size: 13px; color: #94a3b8; margin: 0;">${emailBodySub}</p>
                  </div>
                  <div style="background: #1e293b; border-radius: 12px; padding: 24px; text-align: center; border: 1px solid #334155;">
                    <p style="font-size: 14px; color: #cbd5e1; margin-top: 0; margin-bottom: 16px;">Here is your single-use verification code to log in to your mailbox:</p>
                    <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; font-family: monospace; padding: 12px 0;">${otpCode}</div>
                    <p style="font-size: 12px; color: #94a3b8; margin-top: 16px; margin-bottom: 0;">This code expires in <strong>10 minutes</strong>. Never share this code with anyone.</p>
                  </div>
                  <div style="margin-top: 24px; text-align: center; font-size: 11px; color: #64748b;">
                    <p style="margin: 0;">If you did not request this login code, you can safely ignore this email.</p>
                  </div>
                </div>
              `,
              text: `Your DevGeeksNexus verification code is: ${otpCode}. It expires in 10 minutes.`,
            }),
          });

          if (!resendResponse.ok) {
            const errBody = await resendResponse.text();
            console.error('Failed to send OTP via Resend:', errBody);
            return new Response(JSON.stringify({ error: 'Failed to send OTP email. Please try again.' }), {
              status: 500,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
        } else {
          console.warn('RESEND_API_KEY missing, unable to send OTP email.');
        }

        const maskedTarget = maskEmail(targetSendEmail);
        return new Response(
          JSON.stringify({
            success: true,
            isStudent,
            sentTo: maskedTarget,
            message: `OTP verification code sent to ${maskedTarget}`,
          }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Error sending OTP' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // AUTH API: POST /api/auth/verify-otp
    if (request.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
      try {
        const body = (await request.json()) as any;
        const email = (body.email || '').trim().toLowerCase();
        const code = (body.code || '').trim();

        if (!email || !code) {
          return new Response(JSON.stringify({ error: 'Email and verification code are required.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        if (!env.EMAILS) {
          return new Response(JSON.stringify({ error: 'Storage KV unavailable.' }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const storedOtp = await env.EMAILS.get(`otp:${email}`, 'json') as any;

        if (!storedOtp || storedOtp.code !== code) {
          return new Response(JSON.stringify({ error: 'Invalid or expired verification code. Please request a new code.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // OTP is valid! Delete used OTP
        await env.EMAILS.delete(`otp:${email}`);

        // Resolve authenticated session email (for students, their student @devgeeksnexus.com address)
        const sessionEmail = storedOtp.resolvedEmail || email;

        // Generate 24-hour session token
        const newSessionToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const sessionPayload = {
          email: sessionEmail,
          isStudent: !!storedOtp.isStudent,
          createdAt: Date.now(),
        };

        // 24 hours = 86400 seconds
        await env.EMAILS.put(`session:${newSessionToken}`, JSON.stringify(sessionPayload), {
          expirationTtl: 86400,
        });

        const setCookieHeader = `nexus_session=${newSessionToken}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure`;

        return new Response(JSON.stringify({ success: true, email: sessionEmail }), {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Set-Cookie': setCookieHeader,
          },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Verification failed.' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // AUTH API: POST /api/auth/logout
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      if (sessionToken && env.EMAILS) {
        await env.EMAILS.delete(`session:${sessionToken}`);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Set-Cookie': 'nexus_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
        },
      });
    }

    // Check Authentication for Mail APIs and Main App
    if (!isAuthenticated) {
      // If client requests API while unauthenticated
      if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Authentication required. Please log in.' }), {
          status: 401,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // Serve Login / OTP Page
      return new Response(renderLoginHtml('ayomidebobani@gmail.com'), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
        },
      });
    }

    // Resolve User Role & Permitted Mailbox Accounts
    const studentsList = await getStudentAccounts(env.EMAILS);
    const userPerms = resolveUserPermissions(authEmail, studentsList);
    const hasFullAccess = userPerms.allowedAccounts.includes('*');

    // Filter accounts visible to this user
    let userAccessibleAccounts = KNOWN_ACCOUNTS.filter(
      acc => hasFullAccess || userPerms.allowedAccounts.includes(acc.email.toLowerCase())
    );
    if (userPerms.role === 'student') {
      userAccessibleAccounts = [{
        email: userPerms.email,
        name: userPerms.name,
        label: 'Student Mailbox',
        role: 'Temporary Student Account',
        color: 'sky',
        avatar: (userPerms.name[0] || 'S').toUpperCase(),
      }];
    }

    // SECURITY & ADMIN API: GET & POST /api/admin/security-settings
    if (url.pathname === '/api/admin/security-settings') {
      if (userPerms.role !== 'superadmin' && userPerms.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Permission denied. Admin role required.' }), {
          status: 403,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'POST') {
        const body = (await request.json()) as any;
        if (env.EMAILS) {
          await env.EMAILS.put('settings:security', JSON.stringify({
            blocklist: body.blocklist || [],
            allowlist: body.allowlist || [],
            spamKeywords: body.spamKeywords || [],
          }));
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // GET settings
      let secSettings = {
        blocklist: [],
        allowlist: [],
        spamKeywords: ['claim prize', 'wire money', 'urgent transfer', 'crypto investment', 'bitcoin bonus', 'verify bank login', 'account suspended click here'],
      };
      if (env.EMAILS) {
        secSettings = (await env.EMAILS.get('settings:security', 'json')) || secSettings;
      }
      return new Response(JSON.stringify({ settings: secSettings, team: TEAM_MEMBERS, user: userPerms }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // API: POST /api/admin/migrate-to-d1 (One-click migration of all KV messages into D1)
    if (url.pathname === '/api/admin/migrate-to-d1' && request.method === 'POST') {
      if (userPerms.role !== 'superadmin' && userPerms.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Permission denied. Administrator access required.' }), {
          status: 403,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      if (!env.DB) {
        return new Response(JSON.stringify({ error: 'D1 database binding (DB) is not configured.' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const results = { migrated: 0, errors: [] };

      try {
        let keysToMigrate = [];
        if (env.EMAILS) {
          try {
            const list = await env.EMAILS.list({ prefix: 'msg:' });
            keysToMigrate = list.keys.map((k) => k.name);
          } catch (e) {
            console.warn('KV list failed, reading index:messages:', e);
          }
          if (keysToMigrate.length === 0) {
            try {
              const index = (await env.EMAILS.get('index:messages', 'json')) || [];
              keysToMigrate = index.map((k) => k.startsWith('msg:') ? k : `msg:${k}`);
            } catch (e) {}
          }
        }

        for (const key of keysToMigrate) {
          try {
            const msg = await env.EMAILS.get(key, 'json');
            if (msg) {
              if (!msg.account) {
                msg.account = resolveAccount(msg.from, msg.to);
              }
              await saveMessageToDB(env.DB, msg);
              results.migrated++;
            }
          } catch (mErr) {
            console.error(`Failed migrating key ${key}:`, mErr);
            results.errors.push({ key, error: mErr.message });
          }
        }

        return new Response(JSON.stringify({ success: true, ...results }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'Migration failed.' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // STUDENT MANAGEMENT API: GET, POST, PUT, DELETE /api/admin/students
    if (url.pathname === '/api/admin/students') {
      if (userPerms.role !== 'superadmin' && userPerms.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Permission denied. Super Admin or Admin role required.' }), {
          status: 403,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // GET: List all students
      if (request.method === 'GET') {
        return new Response(JSON.stringify({ students: studentsList }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // POST: Create student
      if (request.method === 'POST') {
        try {
          const body = (await request.json()) as any;
          const firstName = (body.firstName || '').trim();
          const lastName = (body.lastName || '').trim();
          const activeEmail = (body.activeEmail || '').trim().toLowerCase();
          const validityDays = body.validityDays !== undefined ? Number(body.validityDays) : 30;
          const status = body.status === 'suspended' ? 'suspended' : 'active';

          if (!firstName || !lastName || !activeEmail) {
            return new Response(JSON.stringify({ error: 'First name, last name, and active personal email are required.' }), {
              status: 400,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }

          if (!activeEmail.includes('@') || !activeEmail.includes('.')) {
            return new Response(JSON.stringify({ error: 'Please provide a valid active email address.' }), {
              status: 400,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }

          const studentEmail = generateStudentEmail(firstName, lastName, studentsList);
          let expiresAt: string | null = null;
          if (validityDays > 0) {
            expiresAt = new Date(Date.now() + validityDays * 86400000).toISOString();
          }

          const newStudent: StudentAccount = {
            id: `stud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            firstName,
            lastName,
            studentEmail,
            activeEmail,
            createdAt: new Date().toISOString(),
            expiresAt,
            status,
          };

          studentsList.unshift(newStudent);
          await saveStudentAccounts(env.EMAILS, studentsList);

          return new Response(JSON.stringify({ success: true, student: newStudent }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || 'Failed to create student account.' }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // PUT: Edit student
      if (request.method === 'PUT') {
        try {
          const body = (await request.json()) as any;
          const id = body.id;
          const student = studentsList.find((s) => s.id === id);
          if (!student) {
            return new Response(JSON.stringify({ error: 'Student account not found.' }), {
              status: 404,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }

          if (body.firstName) student.firstName = body.firstName.trim();
          if (body.lastName) student.lastName = body.lastName.trim();
          if (body.activeEmail) student.activeEmail = body.activeEmail.trim().toLowerCase();
          if (body.status) student.status = body.status === 'suspended' ? 'suspended' : 'active';

          if (body.validityDays !== undefined) {
            const days = Number(body.validityDays);
            if (days > 0) {
              student.expiresAt = new Date(Date.now() + days * 86400000).toISOString();
            } else if (days === -1) {
              student.expiresAt = null;
            }
          } else if (body.expiresAt !== undefined) {
            student.expiresAt = body.expiresAt;
          }

          await saveStudentAccounts(env.EMAILS, studentsList);

          return new Response(JSON.stringify({ success: true, student }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || 'Failed to update student account.' }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // DELETE: Delete student
      if (request.method === 'DELETE') {
        try {
          let id = url.searchParams.get('id');
          if (!id) {
            const body = (await request.json().catch(() => ({}))) as any;
            id = body.id;
          }
          if (!id) {
            return new Response(JSON.stringify({ error: 'Student ID is required.' }), {
              status: 400,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }

          const filtered = studentsList.filter((s) => s.id !== id);
          await saveStudentAccounts(env.EMAILS, filtered);

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || 'Failed to delete student account.' }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // ==========================================
    // COMMUNITY & GENERAL GROUP API ENDPOINTS
    // Available to ALL authenticated users (Students, Staff, Admins)
    // ==========================================

    // API: GET /api/community/posts - List all community posts
    if (url.pathname === '/api/community/posts' && request.method === 'GET') {
      try {
        const posts = await getCommunityPosts(env.EMAILS);
        // Sort: pinned first, then newest updated/created
        posts.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          const timeA = new Date(a.updatedAt || a.createdAt).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt).getTime();
          return timeB - timeA;
        });

        return new Response(JSON.stringify({ posts, currentUser: { email: userPerms.email, name: userPerms.name, role: userPerms.role } }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Failed to fetch community posts.' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // API: POST /api/community/posts - Create a new post or report
    if (url.pathname === '/api/community/posts' && request.method === 'POST') {
      try {
        const body = (await request.json()) as any;
        const title = (body.title || '').trim();
        const postContent = (body.content || '').trim();
        const category = ['question', 'report', 'announcement', 'general'].includes(body.category)
          ? body.category
          : 'general';

        if (!title || !postContent) {
          return new Response(JSON.stringify({ error: 'Title and content are required.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Only superadmin/admin can post official announcements or pin posts
        let isPinned = false;
        if ((category === 'announcement' || body.isPinned) && !['superadmin', 'admin'].includes(userPerms.role)) {
          return new Response(JSON.stringify({ error: 'Only administrators can post official announcements or pin topics.' }), {
            status: 403,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        if (body.isPinned && ['superadmin', 'admin'].includes(userPerms.role)) {
          isPinned = true;
        }

        const now = new Date().toISOString();
        const newPost: CommunityPost = {
          id: 'post_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
          title,
          content: postContent,
          category,
          authorEmail: userPerms.email,
          authorName: userPerms.name || userPerms.email.split('@')[0],
          authorRole: userPerms.role,
          isPinned,
          status: category === 'report' ? 'pending' : (category === 'question' ? 'open' : undefined),
          replies: [],
          createdAt: now,
          updatedAt: now,
        };

        const existingPosts = await getCommunityPosts(env.EMAILS);
        existingPosts.unshift(newPost);
        await saveCommunityPosts(env.EMAILS, existingPosts);

        return new Response(JSON.stringify({ success: true, post: newPost }), {
          status: 201,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Failed to create community post.' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // API: POST /api/community/reply - Add a reply to a post
    if (url.pathname === '/api/community/reply' && request.method === 'POST') {
      try {
        const body = (await request.json()) as any;
        const postId = (body.postId || '').trim();
        const replyContent = (body.content || '').trim();

        if (!postId || !replyContent) {
          return new Response(JSON.stringify({ error: 'Post ID and reply content are required.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const posts = await getCommunityPosts(env.EMAILS);
        const post = posts.find((p) => p.id === postId);
        if (!post) {
          return new Response(JSON.stringify({ error: 'Post not found.' }), {
            status: 404,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const now = new Date().toISOString();
        const newReply: CommunityReply = {
          id: 'rep_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
          authorEmail: userPerms.email,
          authorName: userPerms.name || userPerms.email.split('@')[0],
          authorRole: userPerms.role,
          content: replyContent,
          createdAt: now,
        };

        if (!Array.isArray(post.replies)) post.replies = [];
        post.replies.push(newReply);
        post.updatedAt = now;

        await saveCommunityPosts(env.EMAILS, posts);

        return new Response(JSON.stringify({ success: true, reply: newReply }), {
          status: 201,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Failed to submit reply.' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // API: POST /api/community/status - Update post status (e.g. report pending -> reviewed -> resolved)
    if (url.pathname === '/api/community/status' && request.method === 'POST') {
      try {
        const body = (await request.json()) as any;
        const postId = (body.postId || '').trim();
        const newStatus = (body.status || '').trim().toLowerCase();

        if (!postId || !['open', 'pending', 'reviewed', 'resolved'].includes(newStatus)) {
          return new Response(JSON.stringify({ error: 'Valid post ID and status are required.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const posts = await getCommunityPosts(env.EMAILS);
        const post = posts.find((p) => p.id === postId);
        if (!post) {
          return new Response(JSON.stringify({ error: 'Post not found.' }), {
            status: 404,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Only admins can change status, except authors can mark their own question/report as resolved
        const isAdmin = ['superadmin', 'admin'].includes(userPerms.role);
        const isAuthor = post.authorEmail.toLowerCase() === userPerms.email.toLowerCase();
        if (!isAdmin && (!isAuthor || newStatus !== 'resolved')) {
          return new Response(JSON.stringify({ error: 'Permission denied to update post status.' }), {
            status: 403,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        post.status = newStatus as any;
        post.updatedAt = new Date().toISOString();
        await saveCommunityPosts(env.EMAILS, posts);

        return new Response(JSON.stringify({ success: true, post }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Failed to update status.' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // API: DELETE /api/community/posts - Delete a post
    if (url.pathname === '/api/community/posts' && request.method === 'DELETE') {
      try {
        const postId = url.searchParams.get('id');
        if (!postId) {
          return new Response(JSON.stringify({ error: 'Post ID is required.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const posts = await getCommunityPosts(env.EMAILS);
        const post = posts.find((p) => p.id === postId);
        if (!post) {
          return new Response(JSON.stringify({ error: 'Post not found.' }), {
            status: 404,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const isAdmin = ['superadmin', 'admin'].includes(userPerms.role);
        const isAuthor = post.authorEmail.toLowerCase() === userPerms.email.toLowerCase();
        if (!isAdmin && !isAuthor) {
          return new Response(JSON.stringify({ error: 'Permission denied to delete this post.' }), {
            status: 403,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const updated = posts.filter((p) => p.id !== postId);
        await saveCommunityPosts(env.EMAILS, updated);

        return new Response(JSON.stringify({ success: true, deletedId: postId }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Failed to delete post.' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // API: GET /api/messages
    if (url.pathname === '/api/messages') {
      const folder = url.searchParams.get('folder') || 'inbox';
      let selectedAccount = (url.searchParams.get('account') || 'all').toLowerCase();

      // Enforce Role Restriction: If member tries to access unpermitted account, default to their first allowed account
      if (!hasFullAccess) {
        if (selectedAccount === 'all' || !userPerms.allowedAccounts.includes(selectedAccount)) {
          selectedAccount = userPerms.allowedAccounts[0] || 'info@devgeeksnexus.com';
        }
      }

      const allFetched: any[] = [];

      // Primary source: Cloudflare D1 Database
      if (env.DB) {
        try {
          const query = await env.DB.prepare('SELECT * FROM messages ORDER BY date DESC').all();
          if (query && Array.isArray(query.results)) {
            for (const row of query.results) {
              const msg = rowToMessage(row);
              if (msg) allFetched.push(msg);
            }
          }
        } catch (dbErr) {
          console.error('D1 fetch error, attempting KV fallback:', dbErr);
        }
      }

      // KV Fallback if D1 is empty or unavailable
      if (allFetched.length === 0 && env.EMAILS) {
        try {
          const list = await env.EMAILS.list({ prefix: 'msg:' });
          for (const key of list.keys) {
            const item = (await env.EMAILS.get(key.name, 'json')) as any;
            if (item) {
              if (!item.account) {
                item.account = resolveAccount(item.from, item.to);
              }
              allFetched.push(item);
            }
          }
        } catch (kvErr) {
          console.error('KV list error:', kvErr);
          try {
            const index = (await env.EMAILS.get('index:messages', 'json')) || [];
            for (const entry of index) {
              const keyName = entry.startsWith('msg:') ? entry : `msg:${entry}`;
              const item = (await env.EMAILS.get(keyName, 'json')) as any;
              if (item && !allFetched.some((m) => m.id === item.id)) {
                if (!item.account) {
                  item.account = resolveAccount(item.from, item.to);
                }
                allFetched.push(item);
              }
            }
          } catch (e) {}
        }
      }

      // Compute statistics per account and folder (filtered by user permissions)
      const stats: Record<string, { unread: number; total: number }> = {
        'all': { unread: 0, total: 0 },
      };
      userAccessibleAccounts.forEach((acc) => {
        stats[acc.email.toLowerCase()] = { unread: 0, total: 0 };
      });

      const folderCounts = {
        inbox: 0,
        drafts: 0,
        sent: 0,
        spam: 0,
      };

      for (const item of allFetched) {
        const itemAcc = (item.account || resolveAccount(item.from || item.to)).toLowerCase();
        
        // Skip messages the user is not allowed to see
        if (!hasFullAccess && !userPerms.allowedAccounts.includes(itemAcc)) {
          continue;
        }

        const matchesCurrentAcc = selectedAccount === 'all' || itemAcc === selectedAccount;

        if (matchesCurrentAcc) {
          if (item.folder === 'inbox') folderCounts.inbox++;
          if (item.folder === 'drafts') folderCounts.drafts++;
          if (item.folder === 'sent') folderCounts.sent++;
          if (item.folder === 'spam') folderCounts.spam++;
        }

        if (item.folder === 'inbox') {
          if (stats[itemAcc]) {
            stats[itemAcc].total++;
            if (!item.isRead) stats[itemAcc].unread++;
          }
          stats['all'].total++;
          if (!item.isRead) stats['all'].unread++;
        }
      }

      // Filter messages for current view
      const messages = allFetched.filter((item) => {
        const itemAcc = (item.account || resolveAccount(item.folder === 'sent' || item.folder === 'drafts' ? item.from : item.to)).toLowerCase();
        
        // Strict role permission filter
        if (!hasFullAccess && !userPerms.allowedAccounts.includes(itemAcc)) {
          return false;
        }

        if (folder && item.folder !== folder) return false;
        if (selectedAccount !== 'all') {
          const toStr = (item.to || '').toLowerCase();
          const fromStr = (item.from || '').toLowerCase();
          return itemAcc === selectedAccount || toStr.includes(selectedAccount) || fromStr.includes(selectedAccount);
        }
        return true;
      });

      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return new Response(
        JSON.stringify({
          messages,
          stats,
          folderCounts,
          accounts: userAccessibleAccounts,
          currentUser: userPerms,
        }),
        {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // API: POST /api/drafts (Save or update draft in KV)
    if (request.method === 'POST' && url.pathname === '/api/drafts') {
      try {
        const body = (await request.json()) as any;
        const { id, from, to, cc, bcc, subject, html, text, attachments } = body;

        let senderEmail = 'info@devgeeksnexus.com';
        let senderDisplayName = 'DevGeeksNexus Team';

        if (userPerms.role === 'student') {
          senderEmail = userPerms.email.toLowerCase();
          senderDisplayName = userPerms.name;
        } else {
          const matchedAccount = KNOWN_ACCOUNTS.find(
            (acc) => acc.email.toLowerCase() === (from || '').trim().toLowerCase()
          );
          if (matchedAccount) {
            senderEmail = matchedAccount.email;
            senderDisplayName = matchedAccount.name;
          } else if (from && from.toLowerCase().endsWith('@devgeeksnexus.com')) {
            senderEmail = from.trim().toLowerCase();
            senderDisplayName = senderEmail.split('@')[0];
          }
        }

        const draftId = id || `draft_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const draftDate = new Date().toISOString();

        const draftMsg = {
          id: draftId,
          account: senderEmail,
          from: senderEmail,
          fromName: senderDisplayName,
          to: to || '',
          cc: cc || '',
          bcc: bcc || '',
          subject: subject || '(Draft)',
          text: text || '',
          html: html || '',
          date: draftDate,
          folder: 'drafts',
          isRead: true,
          isStarred: false,
          attachments: attachments || [],
        };

        if (env.DB) {
          try {
            await saveMessageToDB(env.DB, draftMsg);
          } catch (dbErr) {
            console.error('Error saving draft to D1:', dbErr);
          }
        }
        if (env.EMAILS) {
          if (id) {
            try {
              const list = await env.EMAILS.list({ prefix: 'msg:' });
              const oldKey = list.keys.find((k) => k.name.endsWith(id));
              if (oldKey) {
                await env.EMAILS.delete(oldKey.name);
              }
            } catch (e) {}
          }
          try {
            await env.EMAILS.put(`msg:${draftDate}:${draftId}`, JSON.stringify(draftMsg));
          } catch (e) {}
        }

        return new Response(JSON.stringify({ success: true, draft: draftMsg }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // API: POST /api/send (Sends live via Resend REST API or Schedules)
    if (request.method === 'POST' && url.pathname === '/api/send') {
      try {
        const body = (await request.json()) as any;
        const { from, to, cc, bcc, subject, html, text, attachments, draftId, scheduledAt, trackOpens, trackClicks } = body;

        const toList = parseEmailList(to);
        const ccList = parseEmailList(cc);
        const bccList = parseEmailList(bcc);

        if (toList.length === 0) {
          return new Response(JSON.stringify({ error: 'At least one recipient "to" address is required.' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Resolve active sender account
        let senderEmail = 'info@devgeeksnexus.com';
        let senderDisplayName = 'DevGeeksNexus Team';

        if (userPerms.role === 'student') {
          // Strict sandboxing: student can only send from their assigned student email
          if (from && from.trim().toLowerCase() !== userPerms.email.toLowerCase()) {
            return new Response(JSON.stringify({ error: 'Permission denied. Students can only send from their assigned student address.' }), {
              status: 403,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          senderEmail = userPerms.email.toLowerCase();
          senderDisplayName = userPerms.name;
        } else {
          const matchedAccount = KNOWN_ACCOUNTS.find(
            (acc) => acc.email.toLowerCase() === (from || '').trim().toLowerCase()
          );

          if (matchedAccount) {
            senderEmail = matchedAccount.email;
            senderDisplayName = matchedAccount.name;
          } else if (from && from.toLowerCase().endsWith('@devgeeksnexus.com')) {
            senderEmail = from.trim().toLowerCase();
            senderDisplayName = senderEmail.split('@')[0];
          }
        }

        // Generate tracking ID if tracking is enabled
        const trackingId = (trackOpens || trackClicks) ? `trk_${Date.now()}_${Math.random().toString(36).substring(7)}` : null;
        let finalHtml = html || (text ? `<p>${text}</p>` : '');

        if (trackingId) {
          const origin = url.origin;
          // Wrap links for click tracking if requested
          if (trackClicks) {
            finalHtml = finalHtml.replace(/href=["'](https?:\/\/[^"']+)["']/gi, (match: string, p1: string) => {
              // Skip tracking URLs that are already tracking links or internal
              if (p1.includes('/api/track/')) return match;
              return `href="${origin}/api/track/click?tid=${trackingId}&url=${encodeURIComponent(p1)}"`;
            });
          }
          // Append 1x1 transparent tracking pixel for open tracking if requested
          if (trackOpens) {
            finalHtml += `<img src="${origin}/api/track/open?tid=${trackingId}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
          }
          if (env.DB) {
            await env.DB.prepare(`
              INSERT INTO tracking (id, opens, clicks, recipient, subject, updated_at)
              VALUES (?, 0, 0, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET recipient = excluded.recipient, subject = excluded.subject, updated_at = excluded.updated_at
            `).bind(trackingId, toList.join(', '), subject || '', new Date().toISOString()).run();
          } else if (env.EMAILS) {
            await env.EMAILS.put(`track:${trackingId}`, JSON.stringify({ opens: 0, clicks: 0, recipient: toList.join(', '), subject: subject || '' }));
          }
        }

        // SCHEDULED SENDING
        if (scheduledAt) {
          const schedTime = new Date(scheduledAt).getTime();
          if (schedTime > Date.now() + 30000) { // More than 30s in future
            const schedId = `sched_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const schedPayload = {
              id: schedId,
              scheduledTime: schedTime,
              scheduledAtIso: new Date(schedTime).toISOString(),
              from: senderEmail,
              fromName: senderDisplayName,
              fromFormatted: `${senderDisplayName} <${senderEmail}>`,
              toList,
              ccList,
              bccList,
              subject: subject || '(No Subject)',
              html: html || '',
              htmlWithTracking: finalHtml,
              text: text || '',
              attachments: attachments || [],
              trackingId,
            };

            if (env.EMAILS) {
              await env.EMAILS.put(`scheduled:${schedTime}:${schedId}`, JSON.stringify(schedPayload));
              // Also store in Drafts/Scheduled so user sees it in their mailbox
              const schedMsg = {
                id: schedId,
                account: senderEmail,
                from: senderEmail,
                fromName: senderDisplayName,
                to: toList.join(', '),
                subject: `[Scheduled: ${new Date(schedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}] ` + (subject || ''),
                text: text || '',
                html: html || '',
                date: new Date().toISOString(),
                folder: 'drafts',
                isRead: true,
                isStarred: false,
                isScheduled: true,
                scheduledTime: schedTime,
                attachments: attachments || [],
              };
              await env.EMAILS.put(`msg:${schedMsg.date}:${schedId}`, JSON.stringify(schedMsg));
            }

            return new Response(JSON.stringify({ success: true, scheduled: true, scheduledAt: new Date(schedTime).toISOString() }), {
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
        }

        // IMMEDIATE DISPATCH VIA RESEND
        const resendPayload: any = {
          from: `${senderDisplayName} <${senderEmail}>`,
          to: toList,
          subject: subject || '(No Subject)',
          html: finalHtml,
        };

        if (ccList.length > 0) resendPayload.cc = ccList;
        if (bccList.length > 0) resendPayload.bcc = bccList;

        if (attachments && attachments.length > 0) {
          resendPayload.attachments = attachments.map((att: any) => ({
            filename: att.filename,
            content: att.contentBase64,
          }));
        }

        const apiKey = env.RESEND_API_KEY || env.SMTP_PASS;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: 'Resend API key is not configured in worker environment.' }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(resendPayload),
        });

        const resendData = (await resendRes.json()) as any;

        if (!resendRes.ok) {
          return new Response(JSON.stringify({ error: resendData.message || 'Resend API failed' }), {
            status: resendRes.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // If this message was sent from a saved draft, delete the draft now
        if (draftId) {
          if (env.DB) {
            try {
              await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(draftId).run();
            } catch (e) {}
          }
          if (env.EMAILS) {
            try {
              const list = await env.EMAILS.list({ prefix: 'msg:' });
              const draftKey = list.keys.find((k) => k.name.endsWith(draftId));
              if (draftKey) {
                await env.EMAILS.delete(draftKey.name);
              }
            } catch (e) {}
          }
        }

        // Store copy in Sent folder
        const sentId = `sent_${Date.now()}`;
        const sentMsg = {
          id: sentId,
          account: senderEmail,
          from: senderEmail,
          fromName: senderDisplayName,
          to: toList.join(', '),
          cc: ccList.join(', '),
          bcc: bccList.join(', '),
          subject,
          text: text || '',
          html: html || '',
          date: new Date().toISOString(),
          folder: 'sent',
          isRead: true,
          isStarred: false,
          attachments: attachments || [],
          messageId: resendData.id,
          trackingId: trackingId || null,
        };

        if (env.DB) {
          try {
            await saveMessageToDB(env.DB, sentMsg);
          } catch (dbErr) {
            console.error('Error saving sent email to D1:', dbErr);
          }
        }
        if (env.EMAILS) {
          try {
            await env.EMAILS.put(`msg:${sentMsg.date}:${sentId}`, JSON.stringify(sentMsg));
          } catch (e) {}
        }

        return new Response(JSON.stringify({ success: true, message: sentMsg }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // API: PATCH /api/messages (delete or toggle read/star)
    if (request.method === 'PATCH' && url.pathname === '/api/messages') {
      try {
        const body = (await request.json()) as any;
        const { id, action, isRead } = body;

        if (env.DB) {
          try {
            if (action === 'delete') {
              await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
            } else {
              if (typeof isRead === 'boolean') {
                await env.DB.prepare('UPDATE messages SET is_read = ? WHERE id = ?').bind(isRead ? 1 : 0, id).run();
              }
              if (action === 'toggleStar') {
                await env.DB.prepare('UPDATE messages SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END WHERE id = ?').bind(id).run();
              }
              if (body.folder) {
                await env.DB.prepare('UPDATE messages SET folder = ? WHERE id = ?').bind(body.folder, id).run();
              }
              if (typeof body.isSpam === 'boolean') {
                await env.DB.prepare('UPDATE messages SET is_spam = ? WHERE id = ?').bind(body.isSpam ? 1 : 0, id).run();
              }
            }
          } catch (dbErr) {
            console.error('D1 PATCH error:', dbErr);
          }
        }

        if (env.EMAILS) {
          try {
            const list = await env.EMAILS.list({ prefix: 'msg:' });
            const target = list.keys.find((k) => k.name.endsWith(id));

            if (target) {
              if (action === 'delete') {
                await env.EMAILS.delete(target.name);
              } else {
                const item = (await env.EMAILS.get(target.name, 'json'));
                if (item) {
                  if (typeof isRead === 'boolean') item.isRead = isRead;
                  if (action === 'toggleStar') item.isStarred = !item.isStarred;
                  if (body.folder) item.folder = body.folder;
                  if (typeof body.isSpam === 'boolean') item.isSpam = body.isSpam;
                  await env.EMAILS.put(target.name, JSON.stringify(item));
                }
              }
            }
          } catch (e) {
            console.error('KV PATCH error:', e);
          }
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // API: POST /api/ai/process (Gemini AI Smart Reply, Summarization, Tone Polish)
    if (request.method === 'POST' && url.pathname === '/api/ai/process') {
      try {
        const body = (await request.json()) as any;
        const { action, text, context, tone } = body;
        const geminiKey = (env.GEMINI_API_KEY || '').trim();

        // Helper to strip HTML tags, script, style blocks, and excess whitespace
        const cleanPlainText = (input: string): string => {
          if (!input) return '';
          return input
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/\s+/g, ' ')
            .trim();
        };

        const sanitizedText = cleanPlainText(text);

        if (geminiKey) {
          // Use official Gemini 1.5 Flash endpoint
          let prompt = '';
          if (action === 'summarize') {
            prompt = `You are an executive email assistant. Provide a concise, bulleted executive summary (max 3 bullets) of the following email, highlighting action items and the core message. Ignore disclaimer boilerplate like "do not respond":\n\n${sanitizedText}`;
          } else if (action === 'reply') {
            prompt = `You are a professional email assistant. Draft a courteous, clear, and relevant email reply to this email:\nContext: ${context || ''}\nEmail received:\n${sanitizedText}\nKeep it professional and concise.`;
          } else if (action === 'polish') {
            prompt = `You are an expert editor. Rewrite and polish this email draft to make it sound ${tone || 'Professional, crisp, and persuasive'}:\n\nDraft:\n${sanitizedText}\n\nReturn only the polished email text.`;
          }

          const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 600 }
            })
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json() as any;
            const replyContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return new Response(JSON.stringify({ success: true, result: replyContent.trim() }), {
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
        }

        // High-fidelity Built-in Fallback NLP Engine (Zero API Key needed)
        let fallbackResult = '';
        if (action === 'summarize') {
          // Filter out disclaimers and boilerplate lines
          const sentences = sanitizedText
            .split(/(?<=[.!?])\s+/)
            .map((s: string) => s.trim())
            .filter((s: string) => {
              if (s.length < 15) return false;
              const lower = s.toLowerCase();
              if (lower.includes('do not respond') || lower.includes('system generated') || lower.includes('html') || lower.includes('style>')) {
                return false;
              }
              return true;
            });

          const topSentences = sentences.slice(0, 3);
          fallbackResult = topSentences.length > 0 ?
            topSentences.map((s: string) => `• ${s.replace(/\.?$/, '.')}`).join('\n') :
            '• Automated notification received from sender.\n• Please review the attached document or message body for transaction records.';
        } else if (action === 'reply') {
          fallbackResult = `Hi there,\n\nThank you for reaching out to DevGeeksNexus. I have received your message regarding this matter and will review the details promptly.\n\nBest regards,\nDevGeeksNexus Team`;
        } else if (action === 'polish') {
          const clean = (text || '').trim();
          if (tone === 'Concise') {
            fallbackResult = clean.split('\n').filter((l: string) => l.trim().length > 0).slice(0, 4).join('\n');
          } else if (tone === 'Friendly') {
            fallbackResult = `Hi!\n\n${clean}\n\nThanks so much, and have a wonderful day!`;
          } else {
            fallbackResult = `Dear recipient,\n\n${clean}\n\nSincerely,\nDevGeeksNexus`;
          }
        }

        return new Response(JSON.stringify({ success: true, result: fallbackResult, isFallback: !geminiKey }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // Default: Serve the complete Nexus Suite for Authenticated User
    const currentStudent = studentsList.find(s => s.studentEmail.toLowerCase() === authEmail.toLowerCase());
    return new Response(renderWebAppHtml(authEmail, currentStudent), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
      },
    });
  },
};

function renderWebAppHtml(currentUserEmail?: string, currentStudent?: StudentAccount | null): string {
  const isStudent = !!currentStudent;
  const studentEmail = currentStudent ? currentStudent.studentEmail : '';
  const studentInitial = currentStudent && currentStudent.firstName ? currentStudent.firstName[0].toUpperCase() : 'S';
  const studentDisplayName = currentStudent ? `${currentStudent.firstName} ${currentStudent.lastName}`.trim() : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Nexus Suite | Mail & Video Training Meetings</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <!-- Jitsi Meet WebRTC Video & Screen Share Engine -->
  <script src="https://meet.jit.si/external_api.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }
    .custom-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    .touch-scroll { -webkit-overflow-scrolling: touch; }
    @supports (-webkit-touch-callout: none) {
      .h-screen-ios { height: -webkit-fill-available; }
    }
    /* Ensure email reading pane, body, headers, and code snippets can be freely highlighted and copied */
    #reading-pane, #reading-pane *, #message-detail, #message-detail * {
      user-select: text !important;
      -webkit-user-select: text !important;
    }
    /* WebRTC Meet stage and frame sizing */
    #meet-active-stage, #meet-container {
      position: relative !important;
      width: 100% !important;
      height: 100% !important;
      flex: 1 1 0% !important;
      overflow: hidden !important;
    }
    #meet-container iframe {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      border: none !important;
      display: block !important;
    }
    /* Theme Toggle Dark Styles */
    body.theme-dark { background-color: #020617 !important; color: #f8fafc !important; }
    body.theme-dark #email-list-section { background-color: #0f172a !important; border-color: #1e293b !important; }
    body.theme-dark #email-list-section .border-b { border-color: #1e293b !important; }
    body.theme-dark #email-list-section .bg-slate-50 { background-color: #1e293b !important; }
    body.theme-dark #email-list-section input { background-color: #1e293b !important; border-color: #334155 !important; color: #f8fafc !important; }
    body.theme-dark #reading-pane { background-color: #0f172a !important; border-color: #1e293b !important; color: #f8fafc !important; }
    body.theme-dark #reading-pane .border-b, body.theme-dark #reading-pane .border-t { border-color: #1e293b !important; }
    body.theme-dark #reading-pane .bg-slate-50 { background-color: #1e293b !important; color: #cbd5e1 !important; }
    body.theme-dark #reading-pane .text-slate-900, body.theme-dark #reading-pane .text-slate-800 { color: #f8fafc !important; }
    body.theme-dark #reading-pane .text-slate-600, body.theme-dark #reading-pane .text-slate-700 { color: #cbd5e1 !important; }
    body.theme-dark #dns-view, body.theme-dark #security-view { background-color: #020617 !important; color: #f8fafc !important; }
    body.theme-dark #dns-view .bg-white, body.theme-dark #security-view .bg-white { background-color: #0f172a !important; border-color: #1e293b !important; color: #f8fafc !important; }
    body.theme-dark #dns-view .text-slate-900, body.theme-dark #security-view .text-slate-900 { color: #f8fafc !important; }
    body.theme-dark #security-view textarea { background-color: #1e293b !important; border-color: #334155 !important; color: #f8fafc !important; }
    body.theme-dark #security-view input, body.theme-dark #security-view select { background-color: #1e293b !important; border-color: #334155 !important; color: #f8fafc !important; }
    body.theme-dark #security-view table tr { border-color: #1e293b !important; }
    body.theme-dark #security-view table th { color: #94a3b8 !important; }
    body.theme-dark #security-view table td { color: #cbd5e1 !important; }
    /* Community Hub Dark Theme */
    body.theme-dark #community-view { background-color: #020617 !important; color: #f8fafc !important; }
    body.theme-dark #community-view .bg-white { background-color: #0f172a !important; border-color: #1e293b !important; color: #f8fafc !important; }
    body.theme-dark #community-view .bg-slate-50 { background-color: #1e293b !important; }
    body.theme-dark #community-view .text-slate-900, body.theme-dark #community-view .text-slate-800 { color: #f8fafc !important; }
    body.theme-dark #community-view .text-slate-600, body.theme-dark #community-view .text-slate-700 { color: #cbd5e1 !important; }
    body.theme-dark #community-view .border-slate-100, body.theme-dark #community-view .border-slate-200 { border-color: #1e293b !important; }
    body.theme-dark #community-modal .bg-white { background-color: #0f172a !important; border-color: #1e293b !important; color: #f8fafc !important; }
    body.theme-dark #community-modal .bg-slate-50\/50 { background-color: #1e293b !important; }
    body.theme-dark #community-modal input, body.theme-dark #community-modal select, body.theme-dark #community-modal textarea { background-color: #1e293b !important; border-color: #334155 !important; color: #f8fafc !important; }
    body.theme-dark #security-view table tr:hover { background-color: #1e293b/50 !important; }
    body.theme-dark #student-modal .bg-white { background-color: #0f172a !important; border-color: #1e293b !important; color: #f8fafc !important; }
    body.theme-dark #student-modal .bg-slate-50\/50 { background-color: #1e293b !important; border-color: #334155 !important; }
    body.theme-dark #student-modal input, body.theme-dark #student-modal select { background-color: #020617 !important; border-color: #334155 !important; color: #f8fafc !important; }
    body.theme-dark #student-modal label { color: #cbd5e1 !important; }
    body.theme-dark #student-modal .text-slate-900 { color: #f8fafc !important; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 h-screen h-screen-ios flex flex-col md:flex-row overflow-hidden">

  <!-- MOBILE TOPBAR -->
  <header class="md:hidden h-14 bg-slate-900 text-white flex items-center justify-between px-3.5 border-b border-slate-800 flex-shrink-0 z-30 shadow-sm">
    <div class="flex items-center space-x-2.5">
      <button onclick="toggleSidebar(true)" class="p-2 -ml-1 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 active:scale-90 transition-all" aria-label="Open Menu">
        <i class="fa-solid fa-bars text-lg"></i>
      </button>
      <div class="flex items-center space-x-2">
        <div class="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-indigo-600/30">N</div>
        <div class="leading-tight">
          <h1 class="font-semibold text-xs text-white">Nexus Suite</h1>
          <span id="mobile-top-account" class="text-[10px] text-indigo-300 font-mono block truncate max-w-[140px]">All Mailboxes</span>
        </div>
      </div>
    </div>
    <div class="flex items-center space-x-1.5">
      <!-- Quick Meet button on mobile -->
      <button onclick="switchTab('meet')" class="p-2 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-slate-800 active:scale-95 transition-all" title="Nexus Meet">
        <i class="fa-solid fa-video text-xs"></i>
      </button>
      <button onclick="loadMessages()" class="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 active:rotate-180 transition-all" title="Refresh">
        <i id="mobile-refresh-icon" class="fa-solid fa-rotate-right text-xs"></i>
      </button>
      <button onclick="openCompose()" class="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/30 active:scale-95 transition-all">
        <i class="fa-solid fa-pen text-[10px]"></i>
        <span>Compose</span>
      </button>
    </div>
  </header>

  <!-- SIDEBAR BACKDROP OVERLAY -->
  <div id="sidebar-backdrop" onclick="toggleSidebar(false)" class="hidden fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden transition-opacity"></div>

  <!-- SIDEBAR -->
  <aside id="app-sidebar" class="fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 select-none transform -translate-x-full md:relative md:translate-x-0 transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none flex-shrink-0">
    <!-- Brand Header -->
    <div class="p-4 border-b border-slate-800 flex items-center justify-between">
      <div class="flex items-center space-x-2.5">
        <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">N</div>
        <div>
          <h1 class="font-semibold text-sm leading-tight text-white">Nexus Suite</h1>
          <p class="text-xs text-slate-400">Mail & Video Training</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">Live</span>
        <button onclick="toggleSidebar(false)" class="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Close Menu">
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>
    </div>

    <!-- ACCOUNT SWITCHER SECTION -->
    <div class="p-3 border-b border-slate-800 bg-slate-950/40">
      <div class="flex items-center justify-between mb-2 px-1">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mailbox Accounts</span>
        <span id="active-badge" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">Active</span>
      </div>

      <div class="space-y-1">
        ${isStudent ? `
        <!-- Student Mailbox -->
        <button onclick="switchAccount('${studentEmail}')" id="acc-student" class="w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-all bg-sky-600/20 text-sky-300 border border-sky-500/30">
          <div class="flex items-center space-x-2.5 truncate">
            <div class="w-6 h-6 rounded-md bg-sky-900/60 text-sky-300 border border-sky-700/40 flex items-center justify-center text-[11px] font-bold">
              ${studentInitial}
            </div>
            <div class="text-left truncate">
              <div class="text-xs font-semibold leading-tight text-white">${studentDisplayName}</div>
              <div class="text-[10px] text-slate-400 truncate font-mono">${studentEmail}</div>
            </div>
          </div>
          <span id="badge-acc-student" class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
        </button>
        ` : `
        <!-- All Mailboxes -->
        <button onclick="switchAccount('all')" id="acc-all" class="w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-all bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
          <div class="flex items-center space-x-2.5 truncate">
            <div class="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center text-slate-300 text-[11px] font-bold">
              <i class="fa-solid fa-layer-group text-[10px]"></i>
            </div>
            <div class="text-left truncate">
              <div class="text-xs font-semibold leading-tight">All Mailboxes</div>
              <div class="text-[10px] text-slate-400">Unified Overview</div>
            </div>
          </div>
          <span id="badge-acc-all" class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
        </button>

        <!-- info@devgeeksnexus.com -->
        <button onclick="switchAccount('info@devgeeksnexus.com')" id="acc-info" class="w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-all text-slate-300 hover:bg-slate-800/80">
          <div class="flex items-center space-x-2.5 truncate">
            <div class="w-6 h-6 rounded-md bg-indigo-900/60 text-indigo-300 border border-indigo-700/40 flex items-center justify-center text-[11px] font-bold">
              I
            </div>
            <div class="text-left truncate">
              <div class="text-xs font-semibold leading-tight text-white">Info Desk</div>
              <div class="text-[10px] text-slate-400 truncate font-mono">info@devgeeksnexus.com</div>
            </div>
          </div>
          <span id="badge-acc-info" class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
        </button>

        <!-- ayomidebobani@devgeeksnexus.com -->
        <button onclick="switchAccount('ayomidebobani@devgeeksnexus.com')" id="acc-ayomide" class="w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-all text-slate-300 hover:bg-slate-800/80">
          <div class="flex items-center space-x-2.5 truncate">
            <div class="w-6 h-6 rounded-md bg-emerald-900/60 text-emerald-300 border border-emerald-700/40 flex items-center justify-center text-[11px] font-bold">
              A
            </div>
            <div class="text-left truncate">
              <div class="text-xs font-semibold leading-tight text-white">Ayomide Bobani</div>
              <div class="text-[10px] text-slate-400 truncate font-mono">ayomidebobani@devgeeksnexus.com</div>
            </div>
          </div>
          <span id="badge-acc-ayomide" class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
        </button>

        <!-- admin@devgeeksnexus.com -->
        <button onclick="switchAccount('admin@devgeeksnexus.com')" id="acc-admin" class="w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-all text-slate-300 hover:bg-slate-800/80">
          <div class="flex items-center space-x-2.5 truncate">
            <div class="w-6 h-6 rounded-md bg-amber-900/60 text-amber-300 border border-amber-700/40 flex items-center justify-center text-[11px] font-bold">
              🛡️
            </div>
            <div class="text-left truncate">
              <div class="text-xs font-semibold leading-tight text-white">Administrator</div>
              <div class="text-[10px] text-slate-400 truncate font-mono">admin@devgeeksnexus.com</div>
            </div>
          </div>
          <span id="badge-acc-admin" class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
        </button>
        `}
      </div>
    </div>

    <!-- Desktop Compose Button -->
    <div class="p-3 hidden md:block">
      <button onclick="openCompose()" class="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg shadow-md shadow-indigo-600/20 transition-all active:scale-[0.98]">
        <i class="fa-solid fa-plus text-xs"></i>
        <span class="text-sm">Compose Email</span>
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 px-3 space-y-1 overflow-y-auto custom-scroll">
      <!-- Inbox -->
      <button onclick="switchFolder('inbox')" id="btn-inbox" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-inbox w-4"></i>
          <span>Inbox</span>
        </div>
        <span id="unread-count" class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
      </button>

      <!-- Drafts -->
      <button onclick="switchFolder('drafts')" id="btn-drafts" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-file-pen w-4 text-amber-400"></i>
          <span>Drafts</span>
        </div>
        <span id="drafts-count" class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
      </button>

      <!-- Sent -->
      <button onclick="switchFolder('sent')" id="btn-sent" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-paper-plane w-4 text-slate-400"></i>
          <span>Sent Messages</span>
        </div>
        <span id="sent-count" class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
      </button>

      <!-- Spam / Quarantine -->
      <button onclick="switchFolder('spam')" id="btn-spam" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-ban w-4 text-rose-400"></i>
          <span>Spam / Junk</span>
        </div>
        <span id="spam-count" class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-rose-300 font-mono">0</span>
      </button>

      <div class="pt-2 pb-1 px-3">
        <div class="border-t border-slate-800"></div>
      </div>

      <!-- General Group & Community Hub (Students, Staff & Admins) -->
      <button onclick="switchTab('community')" id="btn-community" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-comments w-4 text-sky-400"></i>
          <span class="font-medium">General Group</span>
        </div>
        <span class="px-1.5 py-0.2 rounded text-[9px] bg-sky-950 text-sky-300 border border-sky-800/60 font-semibold uppercase">Community</span>
      </button>

      <!-- Nexus Meet (Video Training & Screen Sharing) -->
      <button onclick="switchTab('meet')" id="btn-meet" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-video w-4 text-rose-400"></i>
          <span class="font-medium">Nexus Meet</span>
        </div>
        <span class="px-1.5 py-0.2 rounded text-[9px] bg-rose-950 text-rose-300 border border-rose-800/60 font-semibold uppercase">Live</span>
      </button>

      ${!isStudent ? `
      <!-- Security & Administration (Roles, Spam blocklist, allowlist) -->
      <button onclick="switchTab('security')" id="btn-security" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-user-shield w-4 text-amber-400"></i>
          <span>Security & Roles</span>
        </div>
        <span class="px-1.5 py-0.2 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-800/60 font-semibold uppercase">Admin</span>
      </button>

      <!-- DNS -->
      <button onclick="switchTab('dns')" id="btn-dns" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-shield-halved w-4 text-emerald-400"></i>
          <span>DNS Verification</span>
        </div>
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
      </button>
      ` : ''}

      <div class="pt-2 pb-1 px-3">
        <div class="border-t border-slate-800"></div>
      </div>

      <!-- Theme Switcher (Dark / Light mode) -->
      <div class="px-3 py-1 flex items-center justify-between text-xs text-slate-400">
        <span class="flex items-center gap-2">
          <i id="theme-icon" class="fa-solid fa-moon text-indigo-400"></i>
          <span id="theme-label">Theme</span>
        </span>
        <button onclick="toggleTheme()" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1.5 transition-colors">
          <span id="theme-btn-text">Light Mode</span>
        </button>
      </div>

      <div class="pt-1 pb-1 px-3">
        <div class="border-t border-slate-800"></div>
      </div>

      <!-- Logout Button -->
      <button onclick="handleLogout()" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-arrow-right-from-bracket w-4"></i>
          <span>Sign Out</span>
        </div>
        <i class="fa-solid fa-lock text-xs text-slate-500"></i>
      </button>
    </nav>

    <!-- Footer Status & User Info -->
    <div class="p-3 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-1.5 truncate">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="text-[11px] text-slate-300 font-mono truncate">${currentUserEmail || 'Authenticated'}</span>
        </div>
        <span class="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800/50 font-mono">2FA Active</span>
      </div>
    </div>
  </aside>

  <!-- MAIN APP CONTAINER (MAIL VIEW) -->
  <div id="mail-view" class="flex-1 flex flex-col md:flex-row overflow-hidden relative">
    
    <!-- Email List Section -->
    <section id="email-list-section" class="w-full md:w-96 border-r border-slate-200 bg-white flex flex-col h-full flex-shrink-0">
      <!-- Search and Filter Bar -->
      <div class="p-2.5 sm:p-3 border-b border-slate-200 bg-white space-y-2">
        <div class="flex items-center space-x-2">
          <div class="relative flex-1">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
            <input type="text" id="search-input" oninput="renderList()" placeholder="Search sender, subject, content..." class="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 text-slate-800" />
          </div>
          <button onclick="toggleAdvancedFilter()" id="btn-toggle-filters" title="Filter emails" class="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg transition-colors text-xs flex items-center gap-1">
            <i class="fa-solid fa-sliders"></i>
          </button>
          <button onclick="loadMessages()" title="Refresh Mailbox" class="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
            <i id="refresh-icon" class="fa-solid fa-rotate-right text-xs"></i>
          </button>
        </div>

        <!-- Advanced Filter Chips Tray -->
        <div id="filter-chips-tray" class="hidden flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
          <button onclick="toggleFilterType('unread')" id="filter-chip-unread" class="px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors">
            <i class="fa-solid fa-envelope mr-1 text-[10px]"></i>Unread
          </button>
          <button onclick="toggleFilterType('hasAttachment')" id="filter-chip-hasAttachment" class="px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors">
            <i class="fa-solid fa-paperclip mr-1 text-[10px]"></i>Attachments
          </button>
          <button onclick="toggleFilterType('starred')" id="filter-chip-starred" class="px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors">
            <i class="fa-solid fa-star mr-1 text-[10px] text-amber-400"></i>Starred
          </button>
          <button onclick="resetFilters()" class="text-slate-400 hover:text-rose-500 ml-auto text-[10px]">Clear</button>
        </div>
      </div>

      <!-- Current Filter Header -->
      <div class="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
        <div class="flex items-center space-x-2">
          <span id="folder-title" class="font-bold uppercase text-slate-700 tracking-wider">Inbox</span>
          <span class="text-slate-300">•</span>
          <span id="current-acc-label" class="font-semibold text-indigo-600 truncate max-w-[140px] sm:max-w-[180px]">All Mailboxes</span>
        </div>
        <span id="list-count-badge" class="text-[11px] text-slate-400 font-mono">0 msgs</span>
      </div>

      <!-- Messages List -->
      <div id="email-list" class="flex-1 overflow-y-auto divide-y divide-slate-100 custom-scroll touch-scroll">
        <!-- Dynamic emails load here -->
      </div>
    </section>

    <!-- Reading Pane -->
    <main id="reading-pane" class="hidden md:flex flex-1 bg-white flex-col overflow-hidden h-full">
      <div id="empty-state" class="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
        <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <i class="fa-regular fa-envelope text-3xl text-slate-400"></i>
        </div>
        <p class="text-sm font-semibold text-slate-700">Select an email to read</p>
        <p class="text-xs text-slate-400 mt-1">Multi-account routing & video meetings active.</p>
      </div>

      <!-- Email Detail Container -->
      <div id="message-detail" class="hidden flex-1 flex flex-col h-full overflow-hidden">
        <!-- Action Header -->
        <div class="p-2.5 sm:p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
          <div class="flex items-center space-x-1.5 sm:space-x-2">
            <button onclick="backToList()" class="md:hidden flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-xs active:scale-95 transition-all mr-1">
              <i class="fa-solid fa-arrow-left text-xs text-indigo-600"></i>
              <span>Back</span>
            </button>

            <!-- Edit Draft Button (shown when viewing draft) -->
            <button id="btn-detail-edit-draft" onclick="editSelectedDraft()" class="hidden px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-sm active:scale-95 transition-all">
              <i class="fa-solid fa-pen-to-square text-xs"></i>
              <span>Resume Draft</span>
            </button>

            <button onclick="deleteCurrentMessage()" class="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete">
              <i class="fa-solid fa-trash-can text-sm"></i>
            </button>
            <button id="btn-detail-reply" onclick="replyToCurrentMessage()" class="px-2.5 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg text-xs font-medium text-indigo-600 flex items-center space-x-1.5 active:scale-95 transition-all" title="Reply">
              <i class="fa-solid fa-reply text-xs"></i>
              <span>Reply</span>
            </button>
            <button id="btn-detail-forward" onclick="forwardCurrentMessage()" class="px-2.5 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:text-indigo-600 flex items-center space-x-1.5 active:scale-95 transition-all" title="Forward">
              <i class="fa-solid fa-share text-xs"></i>
              <span>Forward</span>
            </button>

            <!-- AI Summary and Smart Reply Action Dropdown -->
            <div class="relative inline-block text-left">
              <button onclick="toggleAiMenu()" class="px-2.5 py-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-lg text-xs font-semibold text-indigo-700 flex items-center space-x-1.5 active:scale-95 transition-all shadow-xs">
                <i class="fa-solid fa-wand-magic-sparkles text-indigo-500"></i>
                <span class="hidden sm:inline">AI Assist</span>
                <i class="fa-solid fa-chevron-down text-[10px]"></i>
              </button>
              <div id="ai-dropdown-menu" class="hidden absolute left-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 text-xs">
                <button onclick="triggerAiAction('summarize')" class="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center space-x-2 text-slate-700">
                  <i class="fa-solid fa-list-check text-indigo-600 w-4"></i>
                  <span>Summarize Thread</span>
                </button>
                <button onclick="triggerAiAction('smart-reply')" class="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center space-x-2 text-slate-700">
                  <i class="fa-solid fa-reply-all text-purple-600 w-4"></i>
                  <span>AI Smart Reply</span>
                </button>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-1.5 overflow-hidden">
            <span id="detail-account-badge" class="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-medium truncate max-w-[130px] sm:max-w-none"></span>
            <span id="detail-id" class="hidden lg:inline text-xs text-slate-400 font-mono"></span>
          </div>
        </div>

            <!-- Detail Content -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-6 custom-scroll touch-scroll">
          
          <!-- Quarantined Spam Warning Banner -->
          <div id="detail-spam-notice" class="hidden mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
            <div class="flex items-center space-x-2.5">
              <i class="fa-solid fa-shield-virus text-rose-600 text-base"></i>
              <div>
                <span class="font-bold">Quarantined Spam Message</span>
                <p id="spam-reason-text" class="text-[11px] text-rose-700 mt-0.5">Automated security rule match</p>
              </div>
            </div>
            <button onclick="markNotSpam()" class="px-3 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto">
              <i class="fa-solid fa-inbox mr-1"></i> Not Spam (Move to Inbox)
            </button>
          </div>

          <!-- AI Summary Box (dynamically populated) -->
          <div id="ai-summary-box" class="hidden mb-4 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 text-slate-800 text-xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-bold text-indigo-700 flex items-center gap-1.5 text-xs">
                <i class="fa-solid fa-wand-magic-sparkles text-indigo-500"></i>
                <span>Executive Summary (AI)</span>
              </span>
              <button onclick="document.getElementById('ai-summary-box').classList.add('hidden')" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div id="ai-summary-text" class="text-xs text-slate-700 leading-relaxed whitespace-pre-line"></div>
          </div>

          <div class="border-b border-slate-100 pb-4 mb-4 sm:mb-6">
            <h2 id="detail-subject" class="text-base sm:text-xl font-bold text-slate-900 mb-3 break-words"></h2>
            <div class="flex items-start justify-between">
              <div class="flex items-center space-x-3 min-w-0">
                <div id="detail-avatar" class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0"></div>
                <div class="min-w-0 flex-1">
                  <div id="detail-from-name" class="text-xs sm:text-sm font-semibold text-slate-900 truncate"></div>
                  <div class="text-[11px] sm:text-xs text-slate-500 truncate">From: <span id="detail-from" class="font-mono text-slate-700"></span></div>
                  <div class="text-[11px] sm:text-xs text-slate-500 truncate">To: <span id="detail-to" class="font-mono text-slate-700"></span></div>
                  <div id="detail-cc-container" class="hidden text-[11px] sm:text-xs text-slate-500 truncate">Cc: <span id="detail-cc" class="font-mono text-slate-700"></span></div>
                  <div id="detail-bcc-container" class="hidden text-[11px] sm:text-xs text-slate-500 truncate">Bcc: <span id="detail-bcc" class="font-mono text-slate-700"></span></div>
                </div>
              </div>
              <div id="detail-date" class="text-[10px] sm:text-xs text-slate-400 flex-shrink-0 ml-2"></div>
            </div>
          </div>

          <div id="detail-body" class="prose max-w-none text-slate-800 text-xs sm:text-sm leading-relaxed mb-6 overflow-x-auto"></div>

          <div id="detail-attachments" class="hidden pt-4 sm:pt-6 border-t border-slate-200">
            <h3 class="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-3">
              <i class="fa-solid fa-paperclip mr-1 text-indigo-600"></i> Attachments
            </h3>
            <div id="attachments-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5"></div>
          </div>

          <!-- Bottom Action Buttons: Quick Reply & Forward -->
          <div id="detail-bottom-actions" class="pt-6 mt-6 border-t border-slate-200 flex items-center space-x-3">
            <button onclick="replyToCurrentMessage()" class="px-3.5 py-2 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-semibold text-indigo-600 flex items-center space-x-2 shadow-xs active:scale-95 transition-all">
              <i class="fa-solid fa-reply text-xs"></i>
              <span>Reply</span>
            </button>
            <button onclick="forwardCurrentMessage()" class="px-3.5 py-2 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-semibold text-slate-700 hover:text-indigo-600 flex items-center space-x-2 shadow-xs active:scale-95 transition-all">
              <i class="fa-solid fa-share text-xs"></i>
              <span>Forward</span>
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- MOBILE FAB -->
    <button onclick="openCompose()" class="md:hidden fixed bottom-5 right-5 w-13 h-13 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/40 flex items-center justify-center text-lg z-30 active:scale-90 transition-all" aria-label="Compose New Email">
      <i class="fa-solid fa-plus text-xl"></i>
    </button>
  </div>

  <!-- NEXUS MEET VIEW (GOOGLE MEET-LIKE VIDEO TRAINING & SCREEN SHARING) -->
  <div id="meet-view" class="hidden flex-1 flex flex-col bg-slate-900 overflow-hidden relative">
    
    <!-- LOBBY / HUB VIEW -->
    <div id="meet-lobby" class="flex-1 overflow-y-auto p-4 sm:p-8 flex items-center justify-center custom-scroll touch-scroll">
      <div class="max-w-2xl w-full space-y-6">
        
        <!-- Header -->
        <div class="text-center space-y-2">
          <div class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-800/60 text-rose-300 text-xs font-semibold mb-1">
            <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            <span>Nexus Meet • Video Calls & Screen Sharing</span>
          </div>
          <h2 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Team Video Training & Collaboration</h2>
          <p class="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
            Host live training sessions, share your screen in high definition, chat, and collaborate with zero software downloads.
          </p>
        </div>

        <!-- Action Cards Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Instant Meeting Card -->
          <div class="bg-slate-800/80 border border-slate-750 rounded-2xl p-5 flex flex-col justify-between hover:border-indigo-500/50 transition-all shadow-lg">
            <div class="space-y-3">
              <div class="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-lg">
                <i class="fa-solid fa-video"></i>
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">Start Instant Training Call</h3>
                <p class="text-xs text-slate-400 mt-0.5">Generate a secure room with camera, audio & screen sharing.</p>
              </div>
            </div>
            <button onclick="startInstantMeeting()" class="mt-4 w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 shadow-md shadow-indigo-600/30 active:scale-95 transition-all">
              <i class="fa-solid fa-play text-xs"></i>
              <span>Start New Meeting</span>
            </button>
          </div>

          <!-- Join with Code Card -->
          <div class="bg-slate-800/80 border border-slate-750 rounded-2xl p-5 flex flex-col justify-between hover:border-rose-500/50 transition-all shadow-lg">
            <div class="space-y-3">
              <div class="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center text-lg">
                <i class="fa-solid fa-keyboard"></i>
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">Join with a Code or Link</h3>
                <p class="text-xs text-slate-400 mt-0.5">Enter a room code or paste an invitation link to enter an active training.</p>
              </div>
            </div>
            <form onsubmit="handleJoinCode(event)" class="mt-4 flex space-x-2">
              <input type="text" id="join-room-input" placeholder="e.g. devgeeksnexus-training" required class="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-rose-500" />
              <button type="submit" class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold active:scale-95 transition-all">Join</button>
            </form>
          </div>
        </div>

        <!-- Permanent Organization Rooms -->
        <div class="bg-slate-800/50 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
              <i class="fa-solid fa-bookmark text-indigo-400"></i>
              <span>Permanent Organization Rooms</span>
            </span>
            <span class="text-[10px] text-slate-500 font-mono">devgeeksnexus.com</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div class="p-3 bg-slate-900/60 rounded-xl border border-slate-750 flex items-center justify-between hover:border-slate-600 transition-colors">
              <div class="truncate mr-2">
                <p class="text-xs font-semibold text-white truncate">DevGeeks Training Room</p>
                <p class="text-[10px] text-slate-400 font-mono truncate">devgeeksnexus-training</p>
              </div>
              <button onclick="joinRoom('devgeeksnexus-training')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg active:scale-95 transition-all">Enter</button>
            </div>

            <div class="p-3 bg-slate-900/60 rounded-xl border border-slate-750 flex items-center justify-between hover:border-slate-600 transition-colors">
              <div class="truncate mr-2">
                <p class="text-xs font-semibold text-white truncate">Tech & Code Review</p>
                <p class="text-[10px] text-slate-400 font-mono truncate">devgeeksnexus-tech</p>
              </div>
              <button onclick="joinRoom('devgeeksnexus-tech')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg active:scale-95 transition-all">Enter</button>
            </div>
          </div>
        </div>

        <!-- Features Overview Pills -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-slate-400 text-[11px]">
          <div class="p-2.5 bg-slate-800/40 rounded-xl border border-slate-800 flex flex-col items-center">
            <i class="fa-solid fa-desktop text-emerald-400 mb-1 text-sm"></i>
            <span>Screen Sharing</span>
          </div>
          <div class="p-2.5 bg-slate-800/40 rounded-xl border border-slate-800 flex flex-col items-center">
            <i class="fa-solid fa-video text-indigo-400 mb-1 text-sm"></i>
            <span>HD Video & Audio</span>
          </div>
          <div class="p-2.5 bg-slate-800/40 rounded-xl border border-slate-800 flex flex-col items-center">
            <i class="fa-solid fa-comments text-rose-400 mb-1 text-sm"></i>
            <span>Live Group Chat</span>
          </div>
          <div class="p-2.5 bg-slate-800/40 rounded-xl border border-slate-800 flex flex-col items-center">
            <i class="fa-solid fa-hand text-amber-400 mb-1 text-sm"></i>
            <span>Hand Raising</span>
          </div>
        </div>

      </div>
    </div>

    <!-- ACTIVE MEETING STAGE -->
    <div id="meet-active-stage" class="hidden flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      <!-- Top Action Bar inside active meeting -->
      <div class="h-12 bg-slate-900/90 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between flex-shrink-0 z-20">
        <div class="flex items-center space-x-2.5 truncate">
          <div class="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></div>
          <span id="active-room-title" class="text-xs sm:text-sm font-bold text-white font-mono truncate">devgeeksnexus-room</span>
        </div>

        <div class="flex items-center space-x-1.5 sm:space-x-2">
          <!-- Record Meeting Button -->
          <button id="btn-toggle-record-admin" onclick="toggleMeetingRecording('admin')" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 hover:text-rose-300 text-xs font-medium rounded-lg flex items-center space-x-1.5 active:scale-95 transition-all shadow-sm" title="Record meeting and save to your computer">
            <span id="record-dot-admin" class="w-2 h-2 rounded-full bg-rose-500"></span>
            <span id="record-text-admin">Record</span>
            <span id="record-timer-admin" class="hidden font-mono text-[11px] text-white bg-rose-600/30 px-1 rounded">00:00</span>
          </button>

          <!-- Copy Invite Link -->
          <button onclick="copyMeetingLink()" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center space-x-1.5 active:scale-95 transition-all" title="Copy Invite Link">
            <i class="fa-solid fa-link text-[10px]"></i>
            <span class="hidden sm:inline" id="copy-link-text">Copy Link</span>
          </button>

          <!-- Invite by Email -->
          <button onclick="inviteByEmail()" class="px-2.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-300 text-xs font-medium rounded-lg flex items-center space-x-1.5 active:scale-95 transition-all" title="Send Email Invite">
            <i class="fa-solid fa-envelope text-[10px]"></i>
            <span class="hidden sm:inline">Email Invite</span>
          </button>

          <!-- Leave Meeting -->
          <button onclick="leaveMeeting()" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 active:scale-95 transition-all shadow-sm shadow-rose-600/30" title="Leave Call">
            <i class="fa-solid fa-phone-slash text-xs"></i>
            <span>Leave</span>
          </button>
        </div>
      </div>

      <!-- Video & Screen Share Container -->
      <div id="meet-container" class="flex-1 w-full h-full bg-slate-950 overflow-hidden relative">
        <!-- WebRTC frame mounts here -->
      </div>
    </div>

  </div>

  <!-- DNS VIEW -->
  <div id="dns-view" class="hidden flex-1 p-4 sm:p-8 overflow-y-auto bg-slate-50 touch-scroll">
    <div class="max-w-3xl mx-auto space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-slate-900">DNS Authentication</h2>
          <p class="text-xs sm:text-sm text-slate-500">Authentication status for <strong>devgeeksnexus.com</strong>.</p>
        </div>
        <button onclick="switchTab('mail')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg active:scale-95 transition-all">Back to Mailbox</button>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <span class="font-mono font-bold text-base sm:text-lg text-slate-900">devgeeksnexus.com</span>
            <span class="block text-xs text-slate-500">Supports info@, ayomidebobani@, and admin@</span>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 flex items-center">
            <i class="fa-solid fa-circle-check mr-1.5 text-emerald-600"></i> 100% Verified
          </span>
        </div>
        <p class="text-xs text-slate-600">SPF, DKIM, and DMARC are fully authenticated on Cloudflare and Resend.</p>
        <div class="space-y-2 text-xs font-mono">
          <div class="p-2.5 bg-slate-50 rounded border border-slate-200 flex flex-col sm:flex-row justify-between gap-1">
            <span class="break-all"><strong>SPF:</strong> v=spf1 include:_spf.mx.cloudflare.net include:resend.com ~all</span>
            <span class="text-emerald-600 font-bold self-end sm:self-auto">PASS</span>
          </div>
          <div class="p-2.5 bg-slate-50 rounded border border-slate-200 flex flex-col sm:flex-row justify-between gap-1">
            <span class="break-all"><strong>DKIM:</strong> resend._domainkey.devgeeksnexus.com</span>
            <span class="text-emerald-600 font-bold self-end sm:self-auto">PASS</span>
          </div>
          <div class="p-2.5 bg-slate-50 rounded border border-slate-200 flex flex-col sm:flex-row justify-between gap-1">
            <span class="break-all"><strong>DMARC:</strong> v=DMARC1; p=none; ...</span>
            <span class="text-emerald-600 font-bold self-end sm:self-auto">PASS</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- SECURITY & ROLES GOVERNANCE VIEW -->
  <div id="security-view" class="hidden flex-1 p-4 sm:p-8 overflow-y-auto bg-slate-50 touch-scroll">
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-slate-900">Enterprise Security & Role Governance</h2>
          <p class="text-xs sm:text-sm text-slate-500">Manage multi-user access permissions and automated inbound spam/phishing filtering.</p>
        </div>
        <button onclick="switchTab('mail')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg active:scale-95 transition-all">Back to Mailbox</button>
      </div>

      <!-- Student Temporary Mailboxes Governance -->
      <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div class="flex items-center space-x-3">
            <div class="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center text-base font-semibold">
              <i class="fa-solid fa-graduation-cap"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-sm text-slate-900">Student Temporary Mailboxes</h3>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 uppercase">Super Admin</span>
              </div>
              <p class="text-xs text-slate-500">Create, edit, and manage isolated @devgeeksnexus.com mailboxes for students with OTP forwarded to their active emails.</p>
            </div>
          </div>
          <button onclick="openCreateStudentModal()" class="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center space-x-1.5 flex-shrink-0">
            <i class="fa-solid fa-user-plus text-xs"></i>
            <span>Create Student Mailbox</span>
          </button>
        </div>

        <!-- Filter bar -->
        <div class="flex items-center justify-between gap-3">
          <div class="relative flex-1 max-w-sm">
            <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
              <i class="fa-solid fa-magnifying-glass text-xs"></i>
            </span>
            <input type="text" id="student-search-input" oninput="filterStudents()" placeholder="Search students by name or email..." class="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-sky-500" />
          </div>
          <div class="flex items-center space-x-2 text-xs text-slate-500">
            <span>Total: <strong id="student-total-count" class="font-mono text-slate-800">0</strong></span>
          </div>
        </div>

        <!-- Students Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                <th class="py-2.5 px-3">Student Name</th>
                <th class="py-2.5 px-3">Temporary Email</th>
                <th class="py-2.5 px-3">Active (Personal) Email</th>
                <th class="py-2.5 px-3">Expires</th>
                <th class="py-2.5 px-3">Status</th>
                <th class="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="student-members-table-body" class="divide-y divide-slate-100">
              <tr>
                <td colspan="6" class="py-6 text-center text-slate-400">Loading student accounts...</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-[11px] text-slate-500 italic"><i class="fa-solid fa-shield-halved mr-1 text-sky-500"></i> Students are strictly sandboxed to their own temporary mailbox with zero visibility of info@ or admin@ mailboxes, and can log in via OTP sent to their active personal email.</p>
      </div>

      <!-- Team Role Management Table -->
      <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-semibold">
              <i class="fa-solid fa-users-gear"></i>
            </div>
            <div>
              <h3 class="font-bold text-sm text-slate-900">Multi-User Role Management</h3>
              <p class="text-xs text-slate-500">Restricts mailbox access and administrative privileges per authenticated user.</p>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800">RBAC Active</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                <th class="py-2.5 px-3">Team Member</th>
                <th class="py-2.5 px-3">Login Email</th>
                <th class="py-2.5 px-3">Assigned Role</th>
                <th class="py-2.5 px-3">Permitted Mailboxes</th>
                <th class="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody id="team-members-table-body" class="divide-y divide-slate-100">
              <!-- Dynamically populated by loadSecuritySettings() -->
            </tbody>
          </table>
        </div>
        <p class="text-[11px] text-slate-500 italic"><i class="fa-solid fa-circle-info mr-1 text-indigo-500"></i> Members are strictly isolated to their assigned departmental mailbox (e.g., info@devgeeksnexus.com) and cannot access or read admin@devgeeksnexus.com or ayomidebobani@.</p>
      </div>

      <!-- Automated Spam & Phishing Filtering Rules -->
      <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center text-sm font-semibold">
              <i class="fa-solid fa-shield-virus"></i>
            </div>
            <div>
              <h3 class="font-bold text-sm text-slate-900">Automated Spam & Phishing Filters</h3>
              <p class="text-xs text-slate-500">Configure real-time automated quarantine rules for all incoming messages.</p>
            </div>
          </div>
          <button onclick="saveSecuritySettings()" id="btn-save-security" class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm active:scale-95 transition-all flex items-center space-x-1.5">
            <i class="fa-solid fa-floppy-disk"></i>
            <span>Save Security Rules</span>
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Blocklist -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <i class="fa-solid fa-ban text-rose-500"></i>
              <span>Sender Blocklist (Domains or Emails)</span>
            </label>
            <p class="text-[11px] text-slate-500">One per line. Any incoming mail matching these addresses or domains will be immediately quarantined to Spam.</p>
            <textarea id="security-blocklist" rows="5" class="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="bad-spammer.com&#10;phishing-alert@unknown.net"></textarea>
          </div>

          <!-- Allowlist -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-emerald-500"></i>
              <span>Trusted Senders (Allowlist)</span>
            </label>
            <p class="text-[11px] text-slate-500">One per line. Trusted partner domains that always bypass spam filters directly to Inbox.</p>
            <textarea id="security-allowlist" rows="5" class="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="google.com&#10;resend.com&#10;client-partner.org"></textarea>
          </div>
        </div>

        <!-- Phishing & Spam Keywords -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <i class="fa-solid fa-triangle-exclamation text-amber-500"></i>
            <span>Phishing & Spam Trigger Keywords</span>
          </label>
          <p class="text-[11px] text-slate-500">Comma-separated terms. Inbound emails with these phrases in the subject or body will be quarantined as Spam.</p>
          <textarea id="security-keywords" rows="3" class="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="claim prize, wire money, crypto investment, bitcoin bonus, verify bank login, account suspended click here"></textarea>
        </div>

        <div id="security-save-feedback" class="hidden text-xs font-medium text-emerald-600 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-check"></i>
          <span>Security rules saved successfully and updated in Cloudflare KV!</span>
        </div>
      </div>
    </div>
  </div>

  <!-- GENERAL GROUP & COMMUNITY HUB VIEW (Accessible by Students, Staff, and Admins) -->
  <div id="community-view" class="hidden flex-1 flex flex-col bg-slate-50 h-full overflow-hidden">
    <!-- View Header -->
    <div class="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center text-lg font-bold shadow-sm">
          <i class="fa-solid fa-comments"></i>
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h2 class="text-base font-bold text-slate-900">Nexus Community Hub & General Group</h2>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">All Members</span>
          </div>
          <p class="text-xs text-slate-500">Ask questions, submit and track student reports, participate in technical discussions, and view official broadcasts.</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <button onclick="loadCommunityPosts()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors flex items-center space-x-1.5" title="Refresh feed">
          <i class="fa-solid fa-arrows-rotate"></i>
          <span>Refresh</span>
        </button>
        <button onclick="openCommunityModal()" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow-sm active:scale-95 transition-all flex items-center space-x-1.5">
          <i class="fa-solid fa-plus"></i>
          <span>New Post or Report</span>
        </button>
      </div>
    </div>

    <!-- Filter Pills & Search Bar -->
    <div class="bg-white border-b border-slate-200 px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
      <!-- Category Filter Pills -->
      <div class="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 custom-scroll">
        <button onclick="filterCommunityCategory('all')" id="com-pill-all" class="px-3 py-1 rounded-full text-xs font-semibold bg-sky-600 text-white shadow-sm transition-all whitespace-nowrap">
          All Posts (<span id="com-count-all">0</span>)
        </button>
        <button onclick="filterCommunityCategory('question')" id="com-pill-question" class="px-3 py-1 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-all whitespace-nowrap flex items-center space-x-1">
          <i class="fa-solid fa-circle-question text-indigo-500"></i>
          <span>Questions</span>
          <span id="com-count-question" class="text-[10px] font-mono ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-100">0</span>
        </button>
        <button onclick="filterCommunityCategory('report')" id="com-pill-report" class="px-3 py-1 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-all whitespace-nowrap flex items-center space-x-1">
          <i class="fa-solid fa-file-invoice text-amber-500"></i>
          <span>Reports</span>
          <span id="com-count-report" class="text-[10px] font-mono ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-100">0</span>
        </button>
        <button onclick="filterCommunityCategory('announcement')" id="com-pill-announcement" class="px-3 py-1 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-all whitespace-nowrap flex items-center space-x-1">
          <i class="fa-solid fa-bullhorn text-rose-500"></i>
          <span>Announcements</span>
          <span id="com-count-announcement" class="text-[10px] font-mono ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-100">0</span>
        </button>
        <button onclick="filterCommunityCategory('general')" id="com-pill-general" class="px-3 py-1 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-all whitespace-nowrap flex items-center space-x-1">
          <i class="fa-solid fa-hashtag text-slate-500"></i>
          <span>General</span>
          <span id="com-count-general" class="text-[10px] font-mono ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-100">0</span>
        </button>
      </div>

      <!-- Search Input -->
      <div class="relative w-full sm:w-64">
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
        <input type="text" id="community-search-input" oninput="filterCommunitySearch()" placeholder="Search discussions & reports..." class="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-slate-50 focus:bg-white" />
      </div>
    </div>

    <!-- Feed Container -->
    <div class="flex-1 overflow-y-auto custom-scroll p-6">
      <div class="max-w-4xl mx-auto space-y-4" id="community-posts-feed">
        <!-- Dynamically rendered by renderCommunityFeed() -->
        <div class="p-8 text-center text-slate-400 text-xs">
          <i class="fa-solid fa-spinner fa-spin text-lg mb-2 text-sky-500"></i>
          <p>Loading community posts and discussions...</p>
        </div>
      </div>
    </div>
  </div>

  <!-- CREATE COMMUNITY POST / REPORT MODAL -->
  <div id="community-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
    <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-sm">
            <i class="fa-solid fa-pen-nib"></i>
          </div>
          <div>
            <h3 class="font-bold text-sm text-slate-900">Create Community Post</h3>
            <p class="text-[11px] text-slate-500">Share with students, instructors, and the DevGeeksNexus team</p>
          </div>
        </div>
        <button onclick="closeCommunityModal()" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>

      <!-- Form Body -->
      <form id="community-form" onsubmit="submitCommunityPost(event)" class="p-5 space-y-4 overflow-y-auto">
        <!-- Category Selector -->
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Post Category *</label>
          <select id="com-category-select" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
            <option value="question">❓ Ask a Question (Coursework, Code, Help)</option>
            <option value="report">📋 Submit a Report (Project, Assignment, Issue)</option>
            <option value="general">💬 General Interaction & Discussion</option>
            ${!isStudent ? '<option value="announcement">📢 Official Announcement (Admins Only)</option>' : ''}
          </select>
        </div>

        <!-- Title -->
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
          <input type="text" id="com-post-title" required placeholder="e.g. Question on React Hooks or Project Report: Task 3" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>

        <!-- Content -->
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Details / Report Content *</label>
          <textarea id="com-post-content" rows="6" required placeholder="Provide clear details, code examples, steps, or report findings..." class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans"></textarea>
        </div>

        ${!isStudent ? `
        <!-- Admin Pin Checkbox -->
        <div class="flex items-center space-x-2 pt-1">
          <input type="checkbox" id="com-post-pinned" class="rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
          <label for="com-post-pinned" class="text-xs font-medium text-slate-700">Pin this post to the top of the group</label>
        </div>
        ` : ''}

        <div id="com-post-error" class="hidden text-xs text-rose-600 font-medium p-2 bg-rose-50 rounded-lg border border-rose-100"></div>

        <!-- Modal Footer -->
        <div class="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
          <button type="button" onclick="closeCommunityModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button type="submit" id="btn-submit-community-post" class="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm active:scale-95 transition-all flex items-center space-x-1.5">
            <i class="fa-solid fa-paper-plane"></i>
            <span>Publish Post</span>
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- CREATE / EDIT STUDENT MODAL -->
  <div id="student-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
    <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-sm">
            <i class="fa-solid fa-user-graduate"></i>
          </div>
          <div>
            <h3 id="student-modal-title" class="font-bold text-sm text-slate-900">Create Student Mailbox</h3>
            <p class="text-[11px] text-slate-500">Assign temporary @devgeeksnexus.com email and active OTP destination</p>
          </div>
        </div>
        <button onclick="closeStudentModal()" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>

      <!-- Form Body -->
      <form id="student-form" onsubmit="saveStudentModal(event)" class="p-5 space-y-4 overflow-y-auto">
        <input type="hidden" id="student-id" value="" />
        
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">First Name *</label>
            <input type="text" id="student-firstname" oninput="updateStudentEmailPreview()" required placeholder="e.g. John" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Last Name *</label>
            <input type="text" id="student-lastname" oninput="updateStudentEmailPreview()" required placeholder="e.g. Doe" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>

        <!-- Generated Mailbox Address Preview -->
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Assigned Temporary Mailbox</label>
          <div class="p-2.5 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between text-xs font-mono text-sky-400">
            <span id="student-email-preview">firstname.lastname@devgeeksnexus.com</span>
            <span class="text-[10px] text-slate-400 font-sans px-1.5 py-0.5 rounded bg-slate-800">Auto-Generated</span>
          </div>
        </div>

        <!-- Active (Personal) Email -->
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Active Email Address (Personal / Real) *</label>
          <input type="email" id="student-active-email" required placeholder="e.g. student@gmail.com" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <p class="text-[11px] text-slate-500 mt-1">The student can enter this email at login to receive their 6-digit OTP code.</p>
        </div>

        <!-- Expiration & Status -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Mailbox Validity</label>
            <select id="student-validity" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="30">30 Days</option>
              <option value="60">60 Days</option>
              <option value="90">90 Days</option>
              <option value="180">180 Days (6 Months)</option>
              <option value="365">1 Year</option>
              <option value="-1">No Expiration (Permanent)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Account Status</label>
            <select id="student-status" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div id="student-modal-error" class="hidden p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-xs"></div>

        <!-- Footer Actions -->
        <div class="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
          <button type="button" onclick="closeStudentModal()" class="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
          <button type="submit" id="btn-save-student" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm active:scale-95 transition-all flex items-center space-x-1.5">
            <i class="fa-solid fa-check"></i>
            <span id="btn-save-student-text">Save Student Mailbox</span>
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- COMPOSE MODAL (WITH DRAFT SAVING SUPPORT) -->
  <div id="compose-modal" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 transition-all">
    <div class="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl border border-slate-200 w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] h-[88vh] sm:h-auto overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95 duration-200">
      
      <!-- Modal Header -->
      <div class="px-4 py-3 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
        <span class="text-xs sm:text-sm font-semibold flex items-center space-x-2">
          <i class="fa-solid fa-paper-plane text-indigo-400"></i>
          <span id="compose-modal-title">New Email Message</span>
        </span>
        <div class="flex items-center space-x-2">
          <span id="draft-status-pill" class="hidden px-2 py-0.5 rounded text-[10px] bg-slate-800 text-amber-300 font-mono">Draft</span>
          <button onclick="closeCompose()" class="p-1 text-slate-400 hover:text-white rounded-md active:scale-95" aria-label="Close">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>
      </div>

      <form onsubmit="handleSend(event)" class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3 custom-scroll touch-scroll">
          <div id="send-alert" class="hidden p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center space-x-2">
            <i class="fa-solid fa-circle-check text-emerald-600"></i>
            <span id="send-alert-text">Email dispatched successfully!</span>
          </div>

          <!-- From Dropdown Selector -->
          <div class="flex items-center space-x-2 sm:space-x-3 text-xs">
            <label class="w-12 sm:w-14 font-semibold text-slate-500 text-right flex-shrink-0">From:</label>
            <div class="flex-1 relative">
              <select id="compose-from" class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800 bg-white font-medium cursor-pointer">
                ${isStudent ? `
                <option value="${studentEmail}">${studentDisplayName} &lt;${studentEmail}&gt;</option>
                ` : `
                <option value="info@devgeeksnexus.com">DevGeeksNexus Team &lt;info@devgeeksnexus.com&gt;</option>
                <option value="ayomidebobani@devgeeksnexus.com">Ayomide Bobani &lt;ayomidebobani@devgeeksnexus.com&gt;</option>
                <option value="admin@devgeeksnexus.com">Admin | DevGeeksNexus &lt;admin@devgeeksnexus.com&gt;</option>
                `}
              </select>
            </div>
            <span class="hidden sm:flex text-[11px] text-emerald-600 font-medium items-center space-x-1">
              <i class="fa-solid fa-circle-check text-[10px]"></i>
              <span>Verified</span>
            </span>
          </div>

          <!-- To with CC/BCC toggles -->
          <div class="flex items-center space-x-2 sm:space-x-3 text-xs">
            <label class="w-12 sm:w-14 font-semibold text-slate-500 text-right flex-shrink-0">To:</label>
            <input type="text" id="compose-to" required placeholder="recipient@example.com" class="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800" />
            <div class="flex space-x-1 text-slate-400 text-xs font-semibold flex-shrink-0">
              <button type="button" onclick="toggleField('cc')" class="px-1.5 py-0.5 rounded hover:bg-slate-100 hover:text-indigo-600">Cc</button>
              <button type="button" onclick="toggleField('bcc')" class="px-1.5 py-0.5 rounded hover:bg-slate-100 hover:text-indigo-600">Bcc</button>
            </div>
          </div>

          <!-- CC (Hidden by default) -->
          <div id="field-cc" class="hidden flex items-center space-x-2 sm:space-x-3 text-xs">
            <label class="w-12 sm:w-14 font-semibold text-slate-500 text-right flex-shrink-0">Cc:</label>
            <input type="text" id="compose-cc" placeholder="colleague@example.com" class="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800" />
            <button type="button" onclick="hideField('cc')" class="text-slate-400 hover:text-red-500 px-1"><i class="fa-solid fa-xmark text-xs"></i></button>
          </div>

          <!-- BCC (Hidden by default) -->
          <div id="field-bcc" class="hidden flex items-center space-x-2 sm:space-x-3 text-xs">
            <label class="w-12 sm:w-14 font-semibold text-slate-500 text-right flex-shrink-0">Bcc:</label>
            <input type="text" id="compose-bcc" placeholder="private@example.com" class="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800" />
            <button type="button" onclick="hideField('bcc')" class="text-slate-400 hover:text-red-500 px-1"><i class="fa-solid fa-xmark text-xs"></i></button>
          </div>

          <!-- Subject -->
          <div class="flex items-center space-x-2 sm:space-x-3 text-xs">
            <label class="w-12 sm:w-14 font-semibold text-slate-500 text-right flex-shrink-0">Subject:</label>
            <input type="text" id="compose-subject" placeholder="Subject of your message..." class="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800" />
          </div>

          <!-- Full WYSIWYG Formatting & AI Polish Toolbar -->
          <div class="flex items-center justify-between flex-wrap gap-1.5 border-y border-slate-200 py-1.5 bg-slate-50 px-2 rounded-md">
            <div class="flex items-center space-x-0.5 sm:space-x-1 flex-wrap">
              <button type="button" onclick="formatEditor('bold')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs font-bold" title="Bold (Ctrl+B)"><i class="fa-solid fa-bold"></i></button>
              <button type="button" onclick="formatEditor('italic')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs" title="Italic (Ctrl+I)"><i class="fa-solid fa-italic"></i></button>
              <button type="button" onclick="formatEditor('underline')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs" title="Underline"><i class="fa-solid fa-underline"></i></button>
              <button type="button" onclick="formatEditor('strikeThrough')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs" title="Strikethrough"><i class="fa-solid fa-strikethrough"></i></button>
              <div class="w-px h-4 bg-slate-300 mx-0.5"></div>
              <button type="button" onclick="formatEditor('insertUnorderedList')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs" title="Bullet List"><i class="fa-solid fa-list-ul"></i></button>
              <button type="button" onclick="formatEditor('insertOrderedList')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs" title="Numbered List"><i class="fa-solid fa-list-ol"></i></button>
              <button type="button" onclick="formatCodeBlock()" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs" title="Code Block"><i class="fa-solid fa-code"></i></button>
              <div class="w-px h-4 bg-slate-300 mx-0.5"></div>
              <button type="button" onclick="promptEditorLink()" class="px-2 py-1 hover:bg-slate-200 rounded text-xs text-indigo-600 font-medium" title="Add Hyperlink"><i class="fa-solid fa-link mr-1"></i> Link</button>
              <button type="button" onclick="promptEditorImage()" class="px-2 py-1 hover:bg-slate-200 rounded text-xs text-indigo-600 font-medium" title="Insert Image URL"><i class="fa-regular fa-image mr-1"></i> Image</button>

              <!-- AI Tone Polish Pill Dropdown -->
              <div class="relative inline-block text-left ml-1">
                <button type="button" onclick="togglePolishMenu()" class="px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-semibold flex items-center space-x-1">
                  <i class="fa-solid fa-wand-magic-sparkles text-[11px] text-purple-600"></i>
                  <span>AI Polish</span>
                  <i class="fa-solid fa-chevron-down text-[9px]"></i>
                </button>
                <div id="ai-polish-menu" class="hidden absolute left-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-xl z-30 py-1 text-xs">
                  <button type="button" onclick="polishDraftText('Professional')" class="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-slate-700">👔 Professional</button>
                  <button type="button" onclick="polishDraftText('Friendly')" class="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-slate-700">🤝 Friendly</button>
                  <button type="button" onclick="polishDraftText('Concise')" class="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-slate-700">⚡ Concise</button>
                </div>
              </div>
            </div>

            <div class="flex items-center space-x-1.5">
              <!-- Signature Button -->
              <button type="button" onclick="insertSignature()" class="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-xs font-medium text-slate-700 shadow-xs" title="Insert Account Signature">
                <i class="fa-solid fa-signature text-indigo-500 mr-1"></i>
                <span class="hidden sm:inline">Signature</span>
              </button>

              <input type="file" id="file-input" onchange="handleFileSelected(event)" multiple class="hidden" />
              <button type="button" onclick="document.getElementById('file-input').click()" class="flex items-center space-x-1 px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-xs font-medium text-slate-700 shadow-xs">
                <i class="fa-solid fa-paperclip text-slate-500"></i>
                <span class="hidden sm:inline">Attach</span>
              </button>
            </div>
          </div>

          <!-- Rich Text WYSIWYG ContentEditable Body -->
          <div class="relative min-h-[160px] border border-slate-200 rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
            <div id="compose-editor" contenteditable="true" class="p-3 min-h-[160px] max-h-[340px] overflow-y-auto text-xs sm:text-sm text-slate-800 focus:outline-none custom-scroll leading-relaxed" placeholder="Write your message here..."></div>
          </div>

          <!-- Options Drawer: Tracking & Schedule -->
          <div class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <!-- Tracking Checkboxes -->
              <div class="flex items-center space-x-3 text-slate-600">
                <label class="flex items-center space-x-1.5 cursor-pointer">
                  <input type="checkbox" id="check-track-opens" checked class="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5" />
                  <span class="text-[11px] font-medium"><i class="fa-regular fa-eye mr-1 text-indigo-500"></i> Track Opens</span>
                </label>
                <label class="flex items-center space-x-1.5 cursor-pointer">
                  <input type="checkbox" id="check-track-clicks" checked class="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5" />
                  <span class="text-[11px] font-medium"><i class="fa-solid fa-arrow-pointer mr-1 text-indigo-500"></i> Track Clicks</span>
                </label>
              </div>

              <!-- Scheduled Send Toggle -->
              <div class="flex items-center space-x-1.5">
                <button type="button" onclick="toggleScheduleInput()" class="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1">
                  <i class="fa-regular fa-clock"></i>
                  <span id="schedule-btn-label">Schedule Send</span>
                </button>
              </div>
            </div>

            <div id="schedule-input-container" class="hidden pt-1.5 border-t border-slate-200 flex items-center gap-2">
              <span class="text-[11px] text-slate-500">Send on:</span>
              <input type="datetime-local" id="compose-schedule-time" class="px-2 py-1 border border-slate-200 rounded text-xs text-slate-700 bg-white" />
              <button type="button" onclick="cancelSchedule()" class="text-rose-500 text-xs hover:underline">Cancel</button>
            </div>
          </div>

          <!-- Attachment Tray -->
          <div id="compose-attachments-tray" class="hidden p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex justify-between">
              <span>Attached Files</span>
              <button type="button" onclick="clearAttachments()" class="text-red-500 hover:underline text-[10px]">Clear</button>
            </div>
            <div id="compose-attachments-list" class="flex flex-wrap gap-2"></div>
          </div>
        </div>

        <!-- Modal Footer Actions (Save Draft + Send) -->
        <div class="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center space-x-2">
            <button type="button" onclick="handleSaveDraft()" id="btn-save-draft" class="flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-xs active:scale-95 transition-all">
              <i class="fa-solid fa-floppy-disk text-slate-400"></i>
              <span id="btn-save-draft-text">Save Draft</span>
            </button>
            <span id="draft-saved-notice" class="hidden text-[11px] text-emerald-600 font-medium">✓ Saved</span>
          </div>

          <div class="flex items-center space-x-2">
            <button type="button" onclick="closeCompose()" class="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg active:scale-95 transition-all">Discard</button>
            <button type="submit" id="btn-submit" class="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm active:scale-95 transition-all">
              <i id="btn-submit-icon" class="fa-solid fa-paper-plane text-xs"></i>
              <span id="btn-submit-text">Send Email</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>

  <script>
    let allMessages = [];
    let currentFolder = 'inbox';
    let currentAccount = ${isStudent ? `'${studentEmail}'` : `'all'`}; // 'all' | individual mailbox
    let selectedMsg = null;
    let attachedFiles = [];
    let currentDraftId = null;

    // NEXUS MEET STATE
    let jitsiApi = null;
    let currentMeetRoom = null;

    // SIDEBAR DRAWER (MOBILE)
    function toggleSidebar(open) {
      const sb = document.getElementById('app-sidebar');
      const bd = document.getElementById('sidebar-backdrop');
      if (open) {
        sb.classList.remove('-translate-x-full');
        bd.classList.remove('hidden');
      } else {
        sb.classList.add('-translate-x-full');
        bd.classList.add('hidden');
      }
    }

    // BACK TO LIST (MOBILE)
    function backToList() {
      const listSec = document.getElementById('email-list-section');
      const readingPane = document.getElementById('reading-pane');
      listSec.classList.remove('hidden');
      if (window.innerWidth < 768) {
        readingPane.classList.add('hidden');
      }
    }

    async function loadMessages() {
      const icon = document.getElementById('refresh-icon');
      const mobIcon = document.getElementById('mobile-refresh-icon');
      if (icon) icon.classList.add('fa-spin');
      if (mobIcon) mobIcon.classList.add('fa-spin');
      try {
        const url = '/api/messages?folder=' + currentFolder + '&account=' + encodeURIComponent(currentAccount);
        const res = await fetch(url);
        const data = await res.json();
        allMessages = data.messages || [];
        updateAccountStats(data.stats, data.folderCounts);
        renderList();
      } catch (e) {
        console.error('Failed to load messages', e);
      } finally {
        if (icon) icon.classList.remove('fa-spin');
        if (mobIcon) mobIcon.classList.remove('fa-spin');
      }
    }

    function updateAccountStats(stats, folderCounts) {
      if (!stats) return;
      const allUnread = stats['all'] ? stats['all'].unread : 0;
      const infoUnread = stats['info@devgeeksnexus.com'] ? stats['info@devgeeksnexus.com'].unread : 0;
      const ayoUnread = stats['ayomidebobani@devgeeksnexus.com'] ? stats['ayomidebobani@devgeeksnexus.com'].unread : 0;
      const adminUnread = stats['admin@devgeeksnexus.com'] ? stats['admin@devgeeksnexus.com'].unread : 0;

      const bAll = document.getElementById('badge-acc-all'); if (bAll) bAll.textContent = allUnread;
      const bInfo = document.getElementById('badge-acc-info'); if (bInfo) bInfo.textContent = infoUnread;
      const bAyo = document.getElementById('badge-acc-ayomide'); if (bAyo) bAyo.textContent = ayoUnread;
      const bAdmin = document.getElementById('badge-acc-admin'); if (bAdmin) bAdmin.textContent = adminUnread;
      const bStudent = document.getElementById('badge-acc-student');
      if (bStudent && stats[currentAccount.toLowerCase()]) {
        bStudent.textContent = stats[currentAccount.toLowerCase()].unread || 0;
      }

      if (currentAccount === 'all') {
        const unreadEl = document.getElementById('unread-count');
        if (unreadEl) unreadEl.textContent = allUnread;
      } else if (stats[currentAccount.toLowerCase()]) {
        const unreadEl = document.getElementById('unread-count');
        if (unreadEl) unreadEl.textContent = stats[currentAccount.toLowerCase()].unread;
      }

      // Update folder counts
      if (folderCounts) {
        const dEl = document.getElementById('drafts-count'); if (dEl) dEl.textContent = folderCounts.drafts || 0;
        const sEl = document.getElementById('sent-count'); if (sEl) sEl.textContent = folderCounts.sent || 0;
        const spamEl = document.getElementById('spam-count');
        if (spamEl) spamEl.textContent = folderCounts.spam || 0;
      }
    }

    function switchAccount(acc) {
      currentAccount = acc;

      const buttons = [
        { id: 'acc-all', target: 'all', label: 'All Mailboxes' },
        { id: 'acc-info', target: 'info@devgeeksnexus.com', label: 'Info Desk' },
        { id: 'acc-ayomide', target: 'ayomidebobani@devgeeksnexus.com', label: 'Ayomide Bobani' },
        { id: 'acc-admin', target: 'admin@devgeeksnexus.com', label: 'Admin' },
        { id: 'acc-student', target: '${studentEmail}', label: '${studentDisplayName || "Student Mailbox"}' },
      ];

      buttons.forEach(b => {
        const el = document.getElementById(b.id);
        if (!el) return;
        if (b.target === acc) {
          el.className = 'w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-all bg-sky-600/20 text-sky-300 border border-sky-500/30';
          const curLbl = document.getElementById('current-acc-label');
          if (curLbl) curLbl.textContent = b.label;
          const mobLbl = document.getElementById('mobile-top-account');
          if (mobLbl) mobLbl.textContent = b.label;
        } else {
          el.className = 'w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-all text-slate-300 hover:bg-slate-800/80 border border-transparent';
        }
      });

      selectedMsg = null;
      document.getElementById('message-detail').classList.add('hidden');
      document.getElementById('empty-state').classList.remove('hidden');

      toggleSidebar(false);
      backToList();
      loadMessages();
    }

    let activeFilters = {
      unread: false,
      hasAttachment: false,
      starred: false,
    };

    function toggleAdvancedFilter() {
      const tray = document.getElementById('filter-chips-tray');
      tray.classList.toggle('hidden');
    }

    function toggleFilterType(type) {
      activeFilters[type] = !activeFilters[type];
      const chip = document.getElementById('filter-chip-' + type);
      if (activeFilters[type]) {
        chip.className = 'px-2 py-0.5 rounded-full border border-indigo-500 text-indigo-700 bg-indigo-50 font-semibold transition-colors';
      } else {
        chip.className = 'px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors';
      }
      renderList();
    }

    function resetFilters() {
      activeFilters = { unread: false, hasAttachment: false, starred: false };
      ['unread', 'hasAttachment', 'starred'].forEach(type => {
        const chip = document.getElementById('filter-chip-' + type);
        if (chip) chip.className = 'px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors';
      });
      document.getElementById('search-input').value = '';
      renderList();
    }

    function renderList() {
      const listEl = document.getElementById('email-list');
      const q = (document.getElementById('search-input').value || '').toLowerCase();
      const filtered = allMessages.filter(m => {
        // Keyword Search
        if (q) {
          const matched = (m.subject || '').toLowerCase().includes(q) ||
                          (m.from || '').toLowerCase().includes(q) ||
                          (m.to || '').toLowerCase().includes(q) ||
                          (m.text || '').toLowerCase().includes(q);
          if (!matched) return false;
        }

        // Active Filter Chips
        if (activeFilters.unread && m.isRead) return false;
        if (activeFilters.hasAttachment && (!m.attachments || m.attachments.length === 0)) return false;
        if (activeFilters.starred && !m.isStarred) return false;

        return true;
      });

      document.getElementById('list-count-badge').textContent = filtered.length + ' msgs';

      if (filtered.length === 0) {
        listEl.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm"><i class="fa-regular fa-envelope text-3xl mb-2 opacity-30 block"></i>No messages found in ' + currentFolder + '</div>';
        return;
      }

      listEl.innerHTML = filtered.map(m => {
        const isSelected = selectedMsg && selectedMsg.id === m.id;
        const dateStr = new Date(m.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
        
        let senderText = m.fromName || m.from;
        if (currentFolder === 'sent') {
          senderText = 'To: ' + (m.to || '(No Recipient)');
        } else if (currentFolder === 'drafts') {
          senderText = 'Draft: ' + (m.to ? 'To ' + m.to : '(No Recipient)');
        }
        
        const accKey = (m.account || (m.folder === 'sent' || m.folder === 'drafts' ? m.from : m.to) || '').toLowerCase();
        let badgeText = 'info';
        let badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';

        if (accKey.includes('ayomidebobani')) {
          badgeText = 'ayomide';
          badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        } else if (accKey.includes('admin')) {
          badgeText = 'admin';
          badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
        }

        const isDraft = currentFolder === 'drafts' || m.folder === 'drafts';

        return \`
          <div onclick="selectMessage('\${m.id}')" class="p-3 sm:p-3.5 cursor-pointer transition-colors border-l-4 \${
            isSelected ? 'bg-indigo-50/70 border-l-indigo-600' :
            m.isRead ? 'bg-white hover:bg-slate-50 border-l-transparent' :
            'bg-indigo-50/30 hover:bg-indigo-50/50 border-l-indigo-500 font-semibold'
          }">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold text-slate-900 truncate max-w-[200px] sm:max-w-[190px] \${isDraft ? 'text-amber-800' : ''}">\${escapeHtml(senderText)}</span>
              <span class="text-[10px] text-slate-400">\${dateStr}</span>
            </div>
            <div class="text-xs font-medium text-slate-800 truncate mb-1">\${escapeHtml(m.subject || (isDraft ? '(Draft - No Subject)' : '(No Subject)'))}</div>
            <div class="text-xs text-slate-500 line-clamp-2 mb-2">\${escapeHtml(m.text || '')}</div>
            <div class="flex items-center justify-between pt-1 text-[10px]">
              <div class="flex items-center space-x-1.5">
                <span class="px-1.5 py-0.5 rounded border text-[9px] font-mono font-medium uppercase \${badgeClass}">\${badgeText}</span>
                \${isDraft ? '<span class="px-1.5 py-0.5 rounded border text-[9px] font-semibold bg-amber-100 text-amber-800 border-amber-300">DRAFT</span>' : ''}
                \${m.isSpam ? '<span class="px-1.5 py-0.5 rounded border text-[9px] font-semibold bg-rose-100 text-rose-800 border-rose-300">SPAM</span>' : ''}
              </div>
              <div class="flex items-center space-x-2 text-slate-400">
                \${(m.attachments && m.attachments.length > 0) ? '<span><i class="fa-solid fa-paperclip mr-1"></i>' + m.attachments.length + '</span>' : ''}
                \${!m.isRead && !isDraft ? '<span class="w-2 h-2 rounded-full bg-indigo-600 inline-block"></span>' : ''}
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function selectMessage(id) {
      selectedMsg = allMessages.find(m => m.id === id);
      if (!selectedMsg) return;

      if (!selectedMsg.isRead && selectedMsg.folder !== 'drafts') {
        selectedMsg.isRead = true;
        fetch('/api/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, isRead: true })
        });
      }

      renderList();

      const listSec = document.getElementById('email-list-section');
      const readingPane = document.getElementById('reading-pane');
      if (window.innerWidth < 768) {
        listSec.classList.add('hidden');
        readingPane.classList.remove('hidden');
      }

      document.getElementById('empty-state').classList.add('hidden');
      document.getElementById('message-detail').classList.remove('hidden');

      document.getElementById('detail-subject').textContent = selectedMsg.subject || '(Draft)';
      document.getElementById('detail-id').textContent = selectedMsg.id;
      document.getElementById('detail-from-name').textContent = selectedMsg.fromName || selectedMsg.from;
      document.getElementById('detail-from').textContent = selectedMsg.from;
      document.getElementById('detail-to').textContent = selectedMsg.to || '(No Recipient)';

      // Quarantined Spam Notice
      const spamNotice = document.getElementById('detail-spam-notice');
      if (selectedMsg.isSpam || selectedMsg.folder === 'spam') {
        if (spamNotice) {
          spamNotice.classList.remove('hidden');
          const reasonEl = document.getElementById('spam-reason-text');
          if (reasonEl) reasonEl.textContent = selectedMsg.spamReason || 'Sender or content matched automated security quarantine rule';
        }
      } else {
        if (spamNotice) spamNotice.classList.add('hidden');
      }

      // Action buttons adaptation for Drafts
      const isDraft = selectedMsg.folder === 'drafts';
      const editDraftBtn = document.getElementById('btn-detail-edit-draft');
      const replyBtn = document.getElementById('btn-detail-reply');
      const forwardBtn = document.getElementById('btn-detail-forward');
      const bottomActions = document.getElementById('detail-bottom-actions');

      if (isDraft) {
        editDraftBtn.classList.remove('hidden');
        replyBtn.classList.add('hidden');
        if (forwardBtn) forwardBtn.classList.add('hidden');
        if (bottomActions) bottomActions.classList.add('hidden');
      } else {
        editDraftBtn.classList.add('hidden');
        replyBtn.classList.remove('hidden');
        if (forwardBtn) forwardBtn.classList.remove('hidden');
        if (bottomActions) bottomActions.classList.remove('hidden');
      }

      // Mailbox Badge
      const accKey = (selectedMsg.account || (selectedMsg.folder === 'sent' || selectedMsg.folder === 'drafts' ? selectedMsg.from : selectedMsg.to) || '').toLowerCase();
      const badgeEl = document.getElementById('detail-account-badge');
      if (accKey.includes('ayomidebobani')) {
        badgeEl.textContent = 'ayomidebobani@devgeeksnexus.com';
        badgeEl.className = 'px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-medium bg-emerald-100 text-emerald-800 border border-emerald-200';
      } else if (accKey.includes('admin')) {
        badgeEl.textContent = 'admin@devgeeksnexus.com';
        badgeEl.className = 'px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-medium bg-amber-100 text-amber-800 border border-amber-200';
      } else {
        badgeEl.textContent = 'info@devgeeksnexus.com';
        badgeEl.className = 'px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-medium bg-indigo-100 text-indigo-800 border border-indigo-200';
      }

      // Handle CC & BCC
      const ccEl = document.getElementById('detail-cc-container');
      if (selectedMsg.cc) {
        ccEl.classList.remove('hidden');
        document.getElementById('detail-cc').textContent = selectedMsg.cc;
      } else {
        ccEl.classList.add('hidden');
      }

      const bccEl = document.getElementById('detail-bcc-container');
      if (selectedMsg.bcc) {
        bccEl.classList.remove('hidden');
        document.getElementById('detail-bcc').textContent = selectedMsg.bcc;
      } else {
        bccEl.classList.add('hidden');
      }

      document.getElementById('detail-date').textContent = new Date(selectedMsg.date).toLocaleString();
      document.getElementById('detail-avatar').textContent = (selectedMsg.fromName || selectedMsg.from || 'D').charAt(0).toUpperCase();
      
      // Smart formatting for DMARC aggregate reports / XML files
      let renderedBody = selectedMsg.html || escapeHtml(selectedMsg.text) || '<p class="text-slate-400 italic">(Empty message body)</p>';
      const rawText = selectedMsg.text || '';
      if ((rawText.includes('<feedback>') && rawText.includes('<report_metadata>')) || (selectedMsg.subject || '').includes('Report Domain:')) {
        renderedBody = \`
          <div class="mb-4 p-4 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-md">
            <div class="flex items-center gap-2 mb-2 text-emerald-400 font-bold text-sm">
              <i class="fa-solid fa-circle-check"></i>
              <span>Google Mail Authentication Report (DMARC Aggregate)</span>
            </div>
            <p class="text-xs text-slate-300 mb-3">Google and recipient mail servers send this automated daily summary to confirm your domain's email health.</p>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div class="p-2 bg-slate-800/80 rounded-lg">
                <span class="text-[10px] text-slate-400 uppercase block font-semibold">SPF Status</span>
                <span class="text-emerald-400 font-bold text-sm">100% PASS</span>
              </div>
              <div class="p-2 bg-slate-800/80 rounded-lg">
                <span class="text-[10px] text-slate-400 uppercase block font-semibold">DKIM Status</span>
                <span class="text-emerald-400 font-bold text-sm">100% PASS</span>
              </div>
              <div class="p-2 bg-slate-800/80 rounded-lg">
                <span class="text-[10px] text-slate-400 uppercase block font-semibold">Sender</span>
                <span class="text-sky-300 font-mono text-[11px] truncate block">google.com</span>
              </div>
              <div class="p-2 bg-slate-800/80 rounded-lg">
                <span class="text-[10px] text-slate-400 uppercase block font-semibold">Policy</span>
                <span class="text-indigo-300 font-semibold text-xs">p=none</span>
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800">
              <i class="fa-solid fa-circle-info mr-1 text-slate-400"></i>
              To stop receiving these automated XML reports in your inbox, remove the <code>rua=</code> tag from your <code>_dmarc</code> DNS record in Cloudflare.
            </p>
          </div>
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span class="text-xs font-semibold text-slate-600 block mb-1">Raw Report Content:</span>
            <pre class="text-xs font-mono text-slate-700 whitespace-pre-wrap max-h-96 overflow-y-auto">\${escapeHtml(rawText)}</pre>
          </div>
        \`;
      }
      document.getElementById('detail-body').innerHTML = renderedBody;

      const attSection = document.getElementById('detail-attachments');
      const attGrid = document.getElementById('attachments-grid');
      if (selectedMsg.attachments && selectedMsg.attachments.length > 0) {
        attSection.classList.remove('hidden');
        attGrid.innerHTML = selectedMsg.attachments.map(att => {
          const isImg = att.mimeType && att.mimeType.startsWith('image/');
          const href = att.contentBase64 ? 'data:' + att.mimeType + ';base64,' + att.contentBase64 : '#';
          return \`
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3 flex flex-col justify-between">
              <div class="flex items-center space-x-2.5">
                \${isImg && att.contentBase64 ?
                  '<img src="' + href + '" class="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-lg border border-slate-200"/>' :
                  '<div class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0"><i class="fa-regular fa-file text-base sm:text-lg"></i></div>'
                }
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-semibold text-slate-800 truncate">\${escapeHtml(att.filename)}</p>
                  <p class="text-[10px] text-slate-400 font-mono">\${formatBytes(att.size)}</p>
                </div>
              </div>
              \${att.contentBase64 ? '<a href="' + href + '" download="' + escapeHtml(att.filename) + '" class="mt-2 py-1 px-2.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded text-xs font-medium text-slate-700 text-center block"><i class="fa-solid fa-download mr-1 text-[10px]"></i> Download</a>' : ''}
            </div>
          \`;
        }).join('');
      } else {
        attSection.classList.add('hidden');
      }
    }

    function editSelectedDraft() {
      if (!selectedMsg) return;
      openCompose(selectedMsg);
    }

    function nl2br(str) {
      if (!str) return '';
      return String(str).split(String.fromCharCode(10)).join('<br/>');
    }

    function replyToCurrentMessage() {
      if (!selectedMsg) return;
      openCompose();
      document.getElementById('compose-to').value = selectedMsg.from || '';
      const subj = selectedMsg.subject || '';
      document.getElementById('compose-subject').value = subj.startsWith('Re:') ? subj : 'Re: ' + subj;
      
      const accKey = (selectedMsg.account || selectedMsg.to || '').toLowerCase();
      if (accKey.includes('ayomidebobani')) {
        document.getElementById('compose-from').value = 'ayomidebobani@devgeeksnexus.com';
      } else if (accKey.includes('admin')) {
        document.getElementById('compose-from').value = 'admin@devgeeksnexus.com';
      } else {
        document.getElementById('compose-from').value = 'info@devgeeksnexus.com';
      }

      const editor = document.getElementById('compose-editor');
      const senderDisplay = selectedMsg.fromName ? (selectedMsg.fromName + ' &lt;' + selectedMsg.from + '&gt;') : selectedMsg.from;
      const formattedDate = new Date(selectedMsg.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      const origBody = selectedMsg.html || (selectedMsg.text ? '<p>' + nl2br(selectedMsg.text) + '</p>' : '');

      editor.innerHTML = '<p></p><br><div class="gmail_quote" style="border-left: 2px solid #cbd5e1; padding-left: 10px; margin-left: 2px; color: #64748b; font-size: 13px;"><p style="margin: 0 0 6px 0;">On ' + formattedDate + ', ' + senderDisplay + ' wrote:</p><div>' + origBody + '</div></div>';
      setTimeout(function() {
        editor.focus();
      }, 100);
    }

    function forwardCurrentMessage() {
      if (!selectedMsg) return;
      openCompose();
      document.getElementById('compose-to').value = '';
      setTimeout(function() {
        var toInput = document.getElementById('compose-to');
        if (toInput) toInput.focus();
      }, 100);

      const origSubject = selectedMsg.subject || '';
      document.getElementById('compose-subject').value = origSubject.toLowerCase().startsWith('fwd:') ? origSubject : 'Fwd: ' + origSubject;

      const accKey = (selectedMsg.account || selectedMsg.to || '').toLowerCase();
      if (accKey.includes('ayomidebobani')) {
        document.getElementById('compose-from').value = 'ayomidebobani@devgeeksnexus.com';
      } else if (accKey.includes('admin')) {
        document.getElementById('compose-from').value = 'admin@devgeeksnexus.com';
      } else {
        document.getElementById('compose-from').value = 'info@devgeeksnexus.com';
      }

      // Carry forward attachments if present
      if (selectedMsg.attachments && selectedMsg.attachments.length > 0) {
        attachedFiles = selectedMsg.attachments.slice();
        renderAttachmentTray();
      }

      const editor = document.getElementById('compose-editor');
      const senderDisplay = selectedMsg.fromName ? (selectedMsg.fromName + ' &lt;' + selectedMsg.from + '&gt;') : selectedMsg.from;
      const formattedDate = new Date(selectedMsg.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      const origTo = selectedMsg.to ? '<br><strong>To:</strong> ' + selectedMsg.to : '';
      const origBody = selectedMsg.html || (selectedMsg.text ? '<p>' + nl2br(selectedMsg.text) + '</p>' : '');

      editor.innerHTML = '<p></p><br><div class="forwarded_message" style="border-left: 2px solid #cbd5e1; padding-left: 12px; margin-left: 2px; color: #475569; font-size: 13px;">' +
        '<p style="margin: 0 0 8px 0; color: #64748b; font-size: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">' +
        '---------- Forwarded message ---------<br>' +
        '<strong>From:</strong> ' + senderDisplay + '<br>' +
        '<strong>Date:</strong> ' + formattedDate + '<br>' +
        '<strong>Subject:</strong> ' + origSubject + origTo +
        '</p>' +
        '<div>' + origBody + '</div>' +
      '</div>';
    }

    async function deleteCurrentMessage() {
      if (!selectedMsg) return;
      await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedMsg.id, action: 'delete' })
      });
      allMessages = allMessages.filter(m => m.id !== selectedMsg.id);
      selectedMsg = null;
      document.getElementById('message-detail').classList.add('hidden');
      document.getElementById('empty-state').classList.remove('hidden');
      backToList();
      loadMessages();
    }

    async function markNotSpam() {
      if (!selectedMsg) return;
      try {
        await fetch('/api/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedMsg.id, folder: 'inbox', isSpam: false })
        });
        selectedMsg.folder = 'inbox';
        selectedMsg.isSpam = false;
        const spamNotice = document.getElementById('detail-spam-notice');
        if (spamNotice) spamNotice.classList.add('hidden');
        alert('Message moved back to Inbox successfully.');
        loadMessages();
      } catch (e) {
        alert('Failed to move message to inbox');
      }
    }

    async function loadSecuritySettings() {
      try {
        const res = await fetch('/api/admin/security-settings');
        if (!res.ok) return;
        const data = await res.json();
        
        // Populate Team Member Roster
        const tbody = document.getElementById('team-members-table-body');
        const teamList = data.team || data.teamMembers || [];
        if (tbody && teamList.length > 0) {
          tbody.innerHTML = teamList.map(m => {
            const roleBadge = m.role === 'superadmin' 
              ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">Superadmin</span>'
              : m.role === 'admin'
              ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">Admin</span>'
              : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Member</span>';
            const accs = m.allowedAccounts.includes('*')
              ? '<span class="font-mono text-emerald-600 font-semibold">All Mailboxes (*)</span>'
              : '<span class="font-mono text-slate-600">' + m.allowedAccounts.join(', ') + '</span>';
            return '<tr class="hover:bg-slate-50/50 transition-colors">' +
              '<td class="py-2.5 px-3 font-semibold text-slate-900">' + m.name + '</td>' +
              '<td class="py-2.5 px-3 font-mono text-slate-600">' + m.email + '</td>' +
              '<td class="py-2.5 px-3">' + roleBadge + '</td>' +
              '<td class="py-2.5 px-3">' + accs + '</td>' +
              '<td class="py-2.5 px-3"><span class="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1"></span> Active</td>' +
              '</tr>';
          }).join('');
        }

        // Populate Security Rules
        if (data.settings) {
          const bl = document.getElementById('security-blocklist');
          const al = document.getElementById('security-allowlist');
          const kw = document.getElementById('security-keywords');
          if (bl) bl.value = (data.settings.blocklist || []).join(String.fromCharCode(10));
          if (al) al.value = (data.settings.allowlist || []).join(String.fromCharCode(10));
          if (kw) kw.value = (data.settings.spamKeywords || []).join(', ');
        }
      } catch (err) {
        console.error('Failed to load security settings:', err);
      }
    }

    async function saveSecuritySettings() {
      const btn = document.getElementById('btn-save-security');
      const feedback = document.getElementById('security-save-feedback');
      const bl = document.getElementById('security-blocklist');
      const al = document.getElementById('security-allowlist');
      const kw = document.getElementById('security-keywords');

      const nl = String.fromCharCode(10);
      const blocklist = (bl ? bl.value : '').split(nl).map(s => s.trim().toLowerCase()).filter(Boolean);
      const allowlist = (al ? al.value : '').split(nl).map(s => s.trim().toLowerCase()).filter(Boolean);
      const spamKeywords = (kw ? kw.value : '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

      if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      try {
        const res = await fetch('/api/admin/security-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocklist, allowlist, spamKeywords })
        });
        if (res.ok) {
          if (feedback) {
            feedback.classList.remove('hidden');
            setTimeout(() => feedback.classList.add('hidden'), 4000);
          }
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to save security settings');
        }
      } catch (e) {
        alert('Network error while saving security rules');
      } finally {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Save Security Rules</span>';
      }
    }

    // ==========================================
    // COMMUNITY & GENERAL GROUP ENGINE
    // ==========================================
    let allCommunityPosts = [];
    let currentCommunityFilter = 'all';
    let currentCommunitySearch = '';
    let currentCommunityUser = null;

    function escapeHtmlText(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function nl2br(str) {
      if (!str) return '';
      return escapeHtmlText(str).split(String.fromCharCode(10)).join('<br/>');
    }

    async function loadCommunityPosts() {
      const feed = document.getElementById('community-posts-feed');
      try {
        const res = await fetch('/api/community/posts');
        if (!res.ok) throw new Error('Failed to fetch posts');
        const data = await res.json();
        allCommunityPosts = data.posts || [];
        currentCommunityUser = data.currentUser || null;
        updateCommunityCounts();
        renderCommunityFeed();
      } catch (err) {
        console.error('loadCommunityPosts error:', err);
        if (feed) {
          feed.innerHTML = '<div class="p-8 text-center text-rose-500 text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> Failed to load community posts. Please click Refresh above.</div>';
        }
      }
    }

    function updateCommunityCounts() {
      const counts = { all: allCommunityPosts.length, question: 0, report: 0, announcement: 0, general: 0 };
      allCommunityPosts.forEach(p => {
        if (counts[p.category] !== undefined) counts[p.category]++;
      });
      ['all', 'question', 'report', 'announcement', 'general'].forEach(cat => {
        const el = document.getElementById('com-count-' + cat);
        if (el) el.textContent = counts[cat];
      });
    }

    function filterCommunityCategory(cat) {
      currentCommunityFilter = cat;
      ['all', 'question', 'report', 'announcement', 'general'].forEach(c => {
        const pill = document.getElementById('com-pill-' + c);
        if (pill) {
          if (c === cat) {
            pill.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-sky-600 text-white shadow-sm transition-all whitespace-nowrap flex items-center space-x-1';
          } else {
            pill.className = 'px-3 py-1 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-all whitespace-nowrap flex items-center space-x-1';
          }
        }
      });
      renderCommunityFeed();
    }

    function filterCommunitySearch() {
      const el = document.getElementById('community-search-input');
      currentCommunitySearch = (el ? el.value : '').trim().toLowerCase();
      renderCommunityFeed();
    }

    function renderCommunityFeed() {
      const feed = document.getElementById('community-posts-feed');
      if (!feed) return;

      let filtered = allCommunityPosts.filter(p => {
        if (currentCommunityFilter !== 'all' && p.category !== currentCommunityFilter) return false;
        if (currentCommunitySearch) {
          const matchTitle = (p.title || '').toLowerCase().includes(currentCommunitySearch);
          const matchContent = (p.content || '').toLowerCase().includes(currentCommunitySearch);
          const matchAuthor = (p.authorName || '').toLowerCase().includes(currentCommunitySearch) || (p.authorEmail || '').toLowerCase().includes(currentCommunitySearch);
          if (!matchTitle && !matchContent && !matchAuthor) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        feed.innerHTML = '<div class="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-xs">' +
          '<i class="fa-solid fa-comments text-3xl mb-3 text-slate-300"></i>' +
          '<p class="font-semibold text-slate-600 text-sm">No community posts found</p>' +
          '<p class="mt-1 text-slate-400">Be the first to ask a question, submit a student report, or start a discussion!</p>' +
          '<button onclick="openCommunityModal()" class="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium text-xs shadow-sm transition-all">' +
            '<i class="fa-solid fa-plus mr-1"></i> Create Post / Report' +
          '</button>' +
        '</div>';
        return;
      }

      feed.innerHTML = filtered.map(p => {
        // Category styling badge
        let catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 uppercase tracking-wide">General</span>';
        if (p.category === 'question') {
          catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 uppercase tracking-wide flex items-center space-x-1"><i class="fa-solid fa-circle-question mr-1"></i> Question</span>';
        } else if (p.category === 'report') {
          catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 uppercase tracking-wide flex items-center space-x-1"><i class="fa-solid fa-file-invoice mr-1"></i> Student Report</span>';
        } else if (p.category === 'announcement') {
          catBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700 uppercase tracking-wide flex items-center space-x-1"><i class="fa-solid fa-bullhorn mr-1"></i> Announcement</span>';
        }

        // Status badge for reports / questions
        let statusBadge = '';
        if (p.status) {
          if (p.status === 'pending') {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1"><i class="fa-solid fa-clock"></i> Pending Review</span>';
          } else if (p.status === 'reviewed') {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 flex items-center gap-1"><i class="fa-solid fa-clipboard-check"></i> Reviewed</span>';
          } else if (p.status === 'resolved') {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> Resolved</span>';
          } else if (p.status === 'open') {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1"><i class="fa-solid fa-envelope-open-text"></i> Open</span>';
          }
        }

        // Author Role Badge
        let roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold bg-slate-100 text-slate-600">Member</span>';
        if (p.authorRole === 'superadmin' || p.authorRole === 'admin') {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">Instructor / Admin</span>';
        } else if (p.authorRole === 'student') {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold bg-sky-100 text-sky-700 border border-sky-200">Student</span>';
        }

        const isAdmin = currentCommunityUser && (currentCommunityUser.role === 'superadmin' || currentCommunityUser.role === 'admin');
        const isAuthor = currentCommunityUser && (currentCommunityUser.email.toLowerCase() === p.authorEmail.toLowerCase());

        // Status update dropdown for Admins or author resolution
        let statusControls = '';
        if (isAdmin && (p.category === 'report' || p.category === 'question')) {
          statusControls = '<div class="flex items-center space-x-1">' +
            '<span class="text-[10px] text-slate-400 font-medium">Status:</span>' +
            '<select data-id="' + p.id + '" onchange="changeCommunityStatus(this.dataset.id, this.value)" class="text-[11px] font-semibold rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500">' +
              '<option value="pending"' + (p.status === 'pending' ? ' selected' : '') + '>Pending Review</option>' +
              '<option value="reviewed"' + (p.status === 'reviewed' ? ' selected' : '') + '>Reviewed</option>' +
              '<option value="resolved"' + (p.status === 'resolved' ? ' selected' : '') + '>Resolved</option>' +
              '<option value="open"' + (p.status === 'open' ? ' selected' : '') + '>Open</option>' +
            '</select>' +
          '</div>';
        } else if (isAuthor && p.status !== 'resolved' && (p.category === 'report' || p.category === 'question')) {
          statusControls = '<button data-id="' + p.id + '" data-status="resolved" onclick="changeCommunityStatus(this.dataset.id, this.dataset.status)" class="px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors">' +
            '<i class="fa-solid fa-check mr-1"></i> Mark Resolved' +
          '</button>';
        }

        // Delete button for Admin or Author
        let deleteBtn = '';
        if (isAdmin || isAuthor) {
          deleteBtn = '<button data-id="' + p.id + '" onclick="deleteCommunityPost(this.dataset.id)" class="text-slate-400 hover:text-rose-600 transition-colors p-1" title="Delete post">' +
            '<i class="fa-solid fa-trash-can text-xs"></i>' +
          '</button>';
        }

        // Pinned ribbon
        let pinnedRibbon = '';
        if (p.isPinned) {
          pinnedRibbon = '<span class="flex items-center space-x-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">' +
            '<i class="fa-solid fa-thumbtack text-amber-500"></i>' +
            '<span>Pinned Announcement</span>' +
          '</span>';
        }

        // Replies list HTML
        const replies = p.replies || [];
        let repliesHtml = '';
        if (replies.length > 0) {
          repliesHtml = '<div class="mt-4 pt-3 border-t border-slate-100 space-y-2.5">' +
            '<h5 class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Replies & Discussion (' + replies.length + ')</h5>' +
            replies.map(r => {
              let rRoleBadge = '<span class="text-[9px] px-1 py-0.2 rounded font-mono text-slate-500 bg-slate-100">Member</span>';
              if (r.authorRole === 'superadmin' || r.authorRole === 'admin') {
                rRoleBadge = '<span class="text-[9px] px-1 py-0.2 rounded font-mono font-bold bg-amber-100 text-amber-800">Admin</span>';
              } else if (r.authorRole === 'student') {
                rRoleBadge = '<span class="text-[9px] px-1 py-0.2 rounded font-mono text-sky-700 bg-sky-100">Student</span>';
              }
              const rDate = new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              return '<div class="bg-slate-50/80 rounded-lg p-3 border border-slate-100 text-xs">' +
                '<div class="flex items-center justify-between mb-1">' +
                  '<div class="flex items-center space-x-2">' +
                    '<span class="font-bold text-slate-800">' + escapeHtmlText(r.authorName) + '</span>' +
                    rRoleBadge +
                  '</div>' +
                  '<span class="text-[10px] text-slate-400 font-mono">' + rDate + '</span>' +
                '</div>' +
                '<div class="text-slate-700 leading-relaxed font-sans">' + nl2br(r.content) + '</div>' +
              '</div>';
            }).join('') +
          '</div>';
        }

        const pDate = new Date(p.createdAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        return '<div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3 transition-all hover:border-slate-300" id="com-card-' + p.id + '">' +
          '<!-- Top Card Header -->' +
          '<div class="flex items-start justify-between gap-2">' +
            '<div class="space-y-1">' +
              '<div class="flex items-center flex-wrap gap-2">' +
                catBadge +
                statusBadge +
                pinnedRibbon +
              '</div>' +
              '<h4 class="text-sm font-bold text-slate-900 mt-1">' + escapeHtmlText(p.title) + '</h4>' +
            '</div>' +
            '<div class="flex items-center space-x-2 shrink-0">' +
              statusControls +
              deleteBtn +
            '</div>' +
          '</div>' +

          '<!-- Author Meta -->' +
          '<div class="flex items-center space-x-2 text-xs text-slate-500">' +
            '<div class="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px]">' +
              escapeHtmlText((p.authorName || p.authorEmail).charAt(0).toUpperCase()) +
            '</div>' +
            '<span class="font-semibold text-slate-700">' + escapeHtmlText(p.authorName) + '</span>' +
            '<span class="text-slate-400 font-mono text-[11px]">&lt;' + escapeHtmlText(p.authorEmail) + '&gt;</span>' +
            roleBadge +
            '<span class="text-slate-300">•</span>' +
            '<span class="text-[11px] text-slate-400 font-mono">' + pDate + '</span>' +
          '</div>' +

          '<!-- Body Content -->' +
          '<div class="text-xs text-slate-700 leading-relaxed font-sans bg-slate-50/50 p-3 rounded-lg border border-slate-100 select-text">' +
            nl2br(p.content) +
          '</div>' +

          '<!-- Replies Thread -->' +
          repliesHtml +

          '<!-- Inline Quick Reply Box -->' +
          '<form data-id="' + p.id + '" onsubmit="submitCommunityReply(event, this.dataset.id)" class="pt-2 flex items-center space-x-2">' +
            '<input type="text" id="reply-input-' + p.id + '" required placeholder="Write a reply or answer to this topic..." class="flex-1 text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-slate-50 focus:bg-white" />' +
            '<button type="submit" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1 shrink-0">' +
              '<i class="fa-solid fa-reply text-[10px]"></i>' +
              '<span>Reply</span>' +
            '</button>' +
          '</form>' +
        '</div>';
      }).join('');
    }

    function openCommunityModal() {
      const modal = document.getElementById('community-modal');
      const err = document.getElementById('com-post-error');
      if (err) err.classList.add('hidden');
      if (modal) modal.classList.remove('hidden');
      const titleInput = document.getElementById('com-post-title');
      if (titleInput) {
        titleInput.value = '';
        titleInput.focus();
      }
      const contentInput = document.getElementById('com-post-content');
      if (contentInput) contentInput.value = '';
    }

    function closeCommunityModal() {
      const modal = document.getElementById('community-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function submitCommunityPost(e) {
      e.preventDefault();
      const cat = document.getElementById('com-category-select').value;
      const title = document.getElementById('com-post-title').value.trim();
      const content = document.getElementById('com-post-content').value.trim();
      const pinEl = document.getElementById('com-post-pinned');
      const isPinned = pinEl ? pinEl.checked : false;
      const btn = document.getElementById('btn-submit-community-post');
      const errEl = document.getElementById('com-post-error');

      if (!title || !content) {
        if (errEl) {
          errEl.textContent = 'Please fill out both the title and details.';
          errEl.classList.remove('hidden');
        }
        return;
      }

      try {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Publishing...</span>';
        const res = await fetch('/api/community/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, title, content, isPinned }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to publish post');

        closeCommunityModal();
        await loadCommunityPosts();
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || 'Error creating post';
          errEl.classList.remove('hidden');
        }
      } finally {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Publish Post</span>';
      }
    }

    async function submitCommunityReply(e, postId) {
      e.preventDefault();
      const input = document.getElementById('reply-input-' + postId);
      if (!input) return;
      const content = input.value.trim();
      if (!content) return;

      try {
        input.disabled = true;
        const res = await fetch('/api/community/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId, content }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to submit reply');
        input.value = '';
        await loadCommunityPosts();
      } catch (err) {
        alert('Could not submit reply: ' + err.message);
      } finally {
        if (input) input.disabled = false;
      }
    }

    async function changeCommunityStatus(postId, newStatus) {
      try {
        const res = await fetch('/api/community/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId, status: newStatus }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update status');
        await loadCommunityPosts();
      } catch (err) {
        alert('Could not update status: ' + err.message);
      }
    }

    async function deleteCommunityPost(postId) {
      if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) return;
      try {
        const res = await fetch('/api/community/posts?id=' + encodeURIComponent(postId), {
          method: 'DELETE',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete post');
        await loadCommunityPosts();
      } catch (err) {
        alert('Could not delete post: ' + err.message);
      }
    }

    // STUDENT TEMPORARY MAILBOX MANAGEMENT
    let allStudents = [];

    async function loadStudentAccounts() {
      const tbody = document.getElementById('student-members-table-body');
      if (!tbody) return;
      try {
        const res = await fetch('/api/admin/students');
        if (!res.ok) return;
        const data = await res.json();
        allStudents = data.students || [];
        renderStudentTable(allStudents);
      } catch (e) {
        console.error('Error loading student accounts:', e);
      }
    }

    function renderStudentTable(students) {
      const tbody = document.getElementById('student-members-table-body');
      const countEl = document.getElementById('student-total-count');
      if (countEl) countEl.textContent = students ? students.length : 0;
      if (!tbody) return;

      if (!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400 text-xs">No student mailboxes created yet. Click "Create Student Mailbox" above.</td></tr>';
        return;
      }

      tbody.innerHTML = students.map(s => {
        let statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Active</span>';
        if (s.status === 'suspended') {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Suspended</span>';
        } else if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">Expired</span>';
        }

        let expiryDisplay = '<span class="text-slate-400 font-medium">Permanent</span>';
        if (s.expiresAt) {
          const expDate = new Date(s.expiresAt);
          const daysLeft = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysLeft > 0) {
            expiryDisplay = '<span class="font-mono text-slate-700">' + expDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + '</span> <span class="text-[10px] text-indigo-600 font-semibold">(' + daysLeft + 'd left)</span>';
          } else {
            expiryDisplay = '<span class="text-rose-600 font-semibold">Expired</span>';
          }
        }

        return '<tr class="hover:bg-slate-50/50 transition-colors">' +
          '<td class="py-2.5 px-3 font-semibold text-slate-900">' + s.firstName + ' ' + s.lastName + '</td>' +
          '<td class="py-2.5 px-3 font-mono text-sky-700 font-medium">' + s.studentEmail + '</td>' +
          '<td class="py-2.5 px-3 font-mono text-slate-600">' + s.activeEmail + '</td>' +
          '<td class="py-2.5 px-3">' + expiryDisplay + '</td>' +
          '<td class="py-2.5 px-3">' + statusBadge + '</td>' +
          '<td class="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">' +
            '<button data-id="' + s.id + '" onclick="openEditStudentModal(this.dataset.id)" class="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors" title="Edit Student Mailbox"><i class="fa-solid fa-pen-to-square"></i></button>' +
            '<button data-id="' + s.id + '" data-name="' + encodeURIComponent(s.firstName + ' ' + s.lastName) + '" onclick="deleteStudentAccount(this.dataset.id, decodeURIComponent(this.dataset.name))" class="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors" title="Delete Student Mailbox"><i class="fa-solid fa-trash-can"></i></button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function filterStudents() {
      const q = (document.getElementById('student-search-input').value || '').trim().toLowerCase();
      if (!q) {
        renderStudentTable(allStudents);
        return;
      }
      const filtered = allStudents.filter(s => 
        (s.firstName + ' ' + s.lastName).toLowerCase().includes(q) ||
        (s.studentEmail || '').toLowerCase().includes(q) ||
        (s.activeEmail || '').toLowerCase().includes(q)
      );
      renderStudentTable(filtered);
    }

    function openCreateStudentModal() {
      document.getElementById('student-modal-title').textContent = 'Create Student Mailbox';
      document.getElementById('btn-save-student-text').textContent = 'Create Student Mailbox';
      document.getElementById('student-id').value = '';
      document.getElementById('student-firstname').value = '';
      document.getElementById('student-lastname').value = '';
      document.getElementById('student-active-email').value = '';
      document.getElementById('student-validity').value = '30';
      document.getElementById('student-status').value = 'active';
      document.getElementById('student-email-preview').textContent = 'firstname.lastname@devgeeksnexus.com';
      document.getElementById('student-modal-error').classList.add('hidden');
      document.getElementById('student-modal').classList.remove('hidden');
    }

    function openEditStudentModal(id) {
      const student = allStudents.find(s => s.id === id);
      if (!student) return;
      document.getElementById('student-modal-title').textContent = 'Edit Student Mailbox';
      document.getElementById('btn-save-student-text').textContent = 'Save Changes';
      document.getElementById('student-id').value = student.id;
      document.getElementById('student-firstname').value = student.firstName;
      document.getElementById('student-lastname').value = student.lastName;
      document.getElementById('student-active-email').value = student.activeEmail;
      document.getElementById('student-status').value = student.status || 'active';
      document.getElementById('student-email-preview').textContent = student.studentEmail;
      document.getElementById('student-validity').value = '30';
      document.getElementById('student-modal-error').classList.add('hidden');
      document.getElementById('student-modal').classList.remove('hidden');
    }

    function closeStudentModal() {
      document.getElementById('student-modal').classList.add('hidden');
    }

    function updateStudentEmailPreview() {
      const editId = document.getElementById('student-id').value;
      if (editId) return; // Keep existing assigned mailbox address when editing
      const f = (document.getElementById('student-firstname').value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      const l = (document.getElementById('student-lastname').value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      const handle = (f && l) ? (f + '.' + l) : (f || l || 'firstname.lastname');
      document.getElementById('student-email-preview').textContent = handle + '@devgeeksnexus.com';
    }

    async function saveStudentModal(e) {
      e.preventDefault();
      const id = document.getElementById('student-id').value;
      const firstName = document.getElementById('student-firstname').value.trim();
      const lastName = document.getElementById('student-lastname').value.trim();
      const activeEmail = document.getElementById('student-active-email').value.trim();
      const validityDays = document.getElementById('student-validity').value;
      const status = document.getElementById('student-status').value;
      const errEl = document.getElementById('student-modal-error');
      const btnText = document.getElementById('btn-save-student-text');

      errEl.classList.add('hidden');
      btnText.textContent = 'Saving...';

      try {
        const url = '/api/admin/students';
        const method = id ? 'PUT' : 'POST';
        const payload = { id, firstName, lastName, activeEmail, validityDays, status };
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          closeStudentModal();
          loadStudentAccounts();
        } else {
          errEl.textContent = data.error || 'Failed to save student account';
          errEl.classList.remove('hidden');
        }
      } catch (err) {
        errEl.textContent = 'Network error saving student mailbox';
        errEl.classList.remove('hidden');
      } finally {
        btnText.textContent = id ? 'Save Changes' : 'Create Student Mailbox';
      }
    }

    async function deleteStudentAccount(id, name) {
      if (!confirm('Are you sure you want to permanently delete student account for ' + name + '? They will no longer be able to log in.')) {
        return;
      }
      try {
        const res = await fetch('/api/admin/students?id=' + encodeURIComponent(id), { method: 'DELETE' });
        if (res.ok) {
          loadStudentAccounts();
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to delete student');
        }
      } catch (e) {
        alert('Network error deleting student account');
      }
    }

    function toggleTheme() {
      const isDark = document.body.classList.toggle('theme-dark');
      const text = document.getElementById('theme-btn-text');
      const icon = document.getElementById('theme-icon');
      if (isDark) {
        if (text) text.textContent = 'Light Mode';
        if (icon) icon.className = 'fa-solid fa-sun text-amber-400';
        localStorage.setItem('nexus_theme', 'dark');
      } else {
        if (text) text.textContent = 'Dark Mode';
        if (icon) icon.className = 'fa-solid fa-moon text-indigo-400';
        localStorage.setItem('nexus_theme', 'light');
      }
    }

    function initTheme() {
      const saved = localStorage.getItem('nexus_theme');
      if (saved === 'dark') {
        document.body.classList.add('theme-dark');
        const text = document.getElementById('theme-btn-text');
        const icon = document.getElementById('theme-icon');
        if (text) text.textContent = 'Light Mode';
        if (icon) icon.className = 'fa-solid fa-sun text-amber-400';
      }
    }

    function switchFolder(f) {
      currentFolder = f;
      document.getElementById('folder-title').textContent = f.toUpperCase();
      
      const folders = ['inbox', 'drafts', 'sent', 'spam'];
      folders.forEach(fold => {
        const btn = document.getElementById('btn-' + fold);
        if (!btn) return;
        if (fold === f) {
          btn.className = fold === 'spam'
            ? 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-rose-600/20 text-rose-300 font-semibold'
            : 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium';
        } else {
          btn.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors';
        }
      });

      switchTab('mail');
      toggleSidebar(false);
      backToList();
      loadMessages();
    }

    function switchTab(t) {
      const mailView = document.getElementById('mail-view');
      const dnsView = document.getElementById('dns-view');
      const meetView = document.getElementById('meet-view');
      const securityView = document.getElementById('security-view');
      const communityView = document.getElementById('community-view');
      const btnCommunity = document.getElementById('btn-community');
      const btnMeet = document.getElementById('btn-meet');
      const btnDns = document.getElementById('btn-dns');
      const btnSecurity = document.getElementById('btn-security');

      if (mailView) mailView.classList.add('hidden');
      if (dnsView) dnsView.classList.add('hidden');
      if (meetView) meetView.classList.add('hidden');
      if (securityView) securityView.classList.add('hidden');
      if (communityView) communityView.classList.add('hidden');

      if (btnCommunity) btnCommunity.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors';
      if (btnMeet) btnMeet.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors';
      if (btnDns) btnDns.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors';
      if (btnSecurity) btnSecurity.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors';

      if (t === 'community') {
        if (communityView) communityView.classList.remove('hidden');
        if (btnCommunity) btnCommunity.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-sky-600/20 text-sky-400 font-semibold';
        loadCommunityPosts();
      } else if (t === 'meet') {
        if (meetView) meetView.classList.remove('hidden');
        if (btnMeet) btnMeet.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-rose-600/20 text-rose-300 font-semibold';
      } else if (t === 'dns') {
        if (dnsView) dnsView.classList.remove('hidden');
        if (btnDns) btnDns.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium';
      } else if (t === 'security') {
        if (securityView) securityView.classList.remove('hidden');
        if (btnSecurity) btnSecurity.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-amber-600/20 text-amber-300 font-medium';
        loadSecuritySettings();
        loadStudentAccounts();
      } else {
        if (mailView) mailView.classList.remove('hidden');
      }
      toggleSidebar(false);
    }

    // NEXUS MEET VIDEO CALLING & SCREEN SHARING ENGINE
    function startInstantMeeting() {
      const room = 'devgeeksnexus-' + Math.random().toString(36).substring(2, 9);
      joinRoom(room);
    }

    function handleJoinCode(e) {
      e.preventDefault();
      const code = document.getElementById('join-room-input').value.trim();
      if (!code) return;
      joinRoom(code.startsWith('devgeeksnexus-') ? code : 'devgeeksnexus-' + code);
    }

    function joinRoom(roomName) {
      currentMeetRoom = roomName.toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!currentMeetRoom) return;

      switchTab('meet');

      document.getElementById('meet-lobby').classList.add('hidden');
      document.getElementById('meet-active-stage').classList.remove('hidden');
      document.getElementById('active-room-title').textContent = currentMeetRoom;

      // Mount Jitsi Meet WebRTC Call Frame
      const container = document.getElementById('meet-container');
      container.innerHTML = '';

      if (typeof JitsiMeetExternalAPI === 'undefined') {
        container.innerHTML = '<div class="p-8 text-center text-white"><p>Loading video conferencing engine...</p></div>';
        return;
      }

      const domain = 'meet.jit.si';
      const userDisplay = currentAccount !== 'all' ? currentAccount.split('@')[0] : 'DevGeeks Nexus';
      const userEmail = currentAccount !== 'all' ? currentAccount : 'info@devgeeksnexus.com';

      const options = {
        roomName: currentMeetRoom,
        width: '100%',
        height: '100%',
        parentNode: container,
        userInfo: {
          displayName: userDisplay,
          email: userEmail
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinConfig: {
            enabled: false
          },
          prejoinPageEnabled: false,
          skipPrejoin: true,
          disableDeepLinking: true,
          enableWelcomePage: false,
          enableClosePage: false
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'desktop', 'chat', 'raisehand',
            'tileview', 'fullscreen', 'settings', 'hangup', 'videoquality',
            'participants-pane', 'recording'
          ],
        }
      };

      try {
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
        jitsiApi.addEventListener('videoConferenceLeft', () => {
          leaveMeeting();
        });
      } catch (err) {
        console.error('Failed to init conference', err);
        container.innerHTML = '<div class="p-8 text-center text-rose-400"><p>Unable to load meeting frame.</p></div>';
      }
    }

    function copyMeetingLink() {
      if (!currentMeetRoom) return;
      const link = window.location.origin + '/meet?room=' + encodeURIComponent(currentMeetRoom);
      navigator.clipboard.writeText(link).then(() => {
        const textSpan = document.getElementById('copy-link-text');
        if (textSpan) {
          const original = textSpan.textContent;
          textSpan.textContent = 'Copied!';
          setTimeout(() => { textSpan.textContent = original; }, 2000);
        }
        alert('Guest meeting link copied to clipboard:\\n' + link + '\\n\\nNote: Guests will only see the meeting and have zero access to your emails.');
      });
    }

    function inviteByEmail() {
      if (!currentMeetRoom) return;
      const link = window.location.origin + '/meet?room=' + encodeURIComponent(currentMeetRoom);
      openCompose();
      document.getElementById('compose-subject').value = 'Invitation: DevGeeksNexus Live Video Training Session';
      document.getElementById('compose-body').value = 
        'Hello,\\n\\nYou are invited to join our live video training and collaboration session on Nexus Meet.\\n\\n' +
        '🔗 Click here to join directly in your browser:\\n' + link + '\\n\\n' +
        'Meeting Highlights:\\n' +
        '- High-definition Screen Sharing (code, slides, presentations)\\n' +
        '- Two-way Audio & Video Call\\n' +
        '- Real-time In-Meeting Group Messaging\\n' +
        '- Zero downloads required — join from phone or laptop.\\n\\n' +
        'Looking forward to seeing you there!\\n\\n' +
        'Best regards,\\nDevGeeksNexus Team';
    }

    function leaveMeeting() {
      if (recorderMediaRecorder && recorderMediaRecorder.state !== 'inactive') {
        if (confirm('Recording is in progress. Do you want to stop recording and download your video before leaving?')) {
          stopMeetingRecording('admin');
        }
      }
      if (jitsiApi) {
        try { jitsiApi.dispose(); } catch (e) {}
        jitsiApi = null;
      }
      currentMeetRoom = null;
      document.getElementById('meet-container').innerHTML = '';
      document.getElementById('meet-active-stage').classList.add('hidden');
      document.getElementById('meet-lobby').classList.remove('hidden');
    }

    // In-browser Meeting Recorder Engine (WebM/MP4 format ready for YouTube)
    let recorderMediaRecorder = null;
    let recorderRecordedChunks = [];
    let recorderTimerInterval = null;
    let recorderSeconds = 0;

    async function toggleMeetingRecording(scope) {
      if (recorderMediaRecorder && recorderMediaRecorder.state === 'recording') {
        stopMeetingRecording(scope);
      } else {
        await startMeetingRecording(scope);
      }
    }

    async function startMeetingRecording(scope) {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          alert('Screen recording is not supported in this browser. Please use Chrome, Edge, or Firefox on desktop.');
          return;
        }

        // 1. Capture system screen/tab video & meeting audio
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
            frameRate: { ideal: 30, max: 60 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          }
        });

        // 2. Capture local host/speaker microphone audio to mix with system audio
        let micStream = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true
            }
          });
        } catch (micErr) {
          console.warn('Microphone stream access skipped or not available', micErr);
        }

        // Combine display audio and mic audio via AudioContext
        const audioTracks = [];
        const displayAudioTracks = displayStream.getAudioTracks();
        const micAudioTracks = micStream ? micStream.getAudioTracks() : [];

        let mixedStream = displayStream;

        if (displayAudioTracks.length > 0 && micAudioTracks.length > 0) {
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const dest = audioCtx.createMediaStreamDestination();

            const sysSource = audioCtx.createMediaStreamSource(new MediaStream([displayAudioTracks[0]]));
            sysSource.connect(dest);

            const micSource = audioCtx.createMediaStreamSource(new MediaStream([micAudioTracks[0]]));
            micSource.connect(dest);

            const combinedAudioTrack = dest.stream.getAudioTracks()[0];
            mixedStream = new MediaStream([
              displayStream.getVideoTracks()[0],
              combinedAudioTrack
            ]);
          } catch (mixErr) {
            console.warn('Audio mixing fallback to display tracks', mixErr);
            mixedStream = displayStream;
          }
        } else if (micAudioTracks.length > 0 && displayAudioTracks.length === 0) {
          mixedStream = new MediaStream([
            displayStream.getVideoTracks()[0],
            micAudioTracks[0]
          ]);
        }

        // Choose supported codec
        let mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8,opus';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }

        recorderRecordedChunks = [];
        recorderMediaRecorder = new MediaRecorder(mixedStream, {
          mimeType,
          videoBitsPerSecond: 2500000 // 2.5 Mbps crisp HD suitable for YouTube
        });

        recorderMediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recorderRecordedChunks.push(e.data);
          }
        };

        recorderMediaRecorder.onstop = () => {
          saveRecordingToDevice(scope);
          displayStream.getTracks().forEach(t => t.stop());
          if (micStream) micStream.getTracks().forEach(t => t.stop());
        };

        // If user clicks browser's native "Stop sharing" button
        displayStream.getVideoTracks()[0].onended = () => {
          if (recorderMediaRecorder && recorderMediaRecorder.state !== 'inactive') {
            stopMeetingRecording(scope);
          }
        };

        recorderMediaRecorder.start(1000); // 1-sec chunks
        updateRecordingUI(scope, true);

        // Timer
        recorderSeconds = 0;
        clearInterval(recorderTimerInterval);
        recorderTimerInterval = setInterval(() => {
          recorderSeconds++;
          const mins = String(Math.floor(recorderSeconds / 60)).padStart(2, '0');
          const secs = String(recorderSeconds % 60).padStart(2, '0');
          const timerEl = document.getElementById('record-timer-' + scope);
          if (timerEl) timerEl.textContent = mins + ':' + secs;
        }, 1000);

      } catch (err) {
        console.error('Recording initialization error:', err);
        if (err.name !== 'NotAllowedError') {
          alert('Could not start screen recording: ' + err.message);
        }
        updateRecordingUI(scope, false);
      }
    }

    function stopMeetingRecording(scope) {
      if (recorderMediaRecorder && recorderMediaRecorder.state !== 'inactive') {
        recorderMediaRecorder.stop();
      }
      clearInterval(recorderTimerInterval);
      updateRecordingUI(scope, false);
    }

    function updateRecordingUI(scope, isRecording) {
      const btn = document.getElementById('btn-toggle-record-' + scope);
      const dot = document.getElementById('record-dot-' + scope);
      const text = document.getElementById('record-text-' + scope);
      const timer = document.getElementById('record-timer-' + scope);

      if (!btn) return;

      if (isRecording) {
        btn.classList.add('bg-rose-950/80', 'border-rose-500', 'text-rose-300');
        btn.classList.remove('bg-slate-800', 'border-slate-700');
        if (dot) dot.classList.add('animate-ping');
        if (text) text.textContent = 'Stop Rec';
        if (timer) {
          timer.classList.remove('hidden');
          timer.textContent = '00:00';
        }
      } else {
        btn.classList.remove('bg-rose-950/80', 'border-rose-500', 'text-rose-300');
        btn.classList.add('bg-slate-800', 'border-slate-700');
        if (dot) dot.classList.remove('animate-ping');
        if (text) text.textContent = 'Record';
        if (timer) timer.classList.add('hidden');
      }
    }

    function saveRecordingToDevice(scope) {
      if (recorderRecordedChunks.length === 0) return;
      const blob = new Blob(recorderRecordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = 'devgeeksnexus-training-' + (currentMeetRoom || 'session') + '-' + dateStr + '.webm';

      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 1000);

      alert('Recording completed and downloaded!\\n\\nSaved file: ' + filename + '\\n\\nThis video file is ready to be uploaded directly to YouTube.');
    }

    // TOGGLE CC & BCC
    function toggleField(type) {
      const el = document.getElementById('field-' + type);
      if (el) {
        el.classList.remove('hidden');
        document.getElementById('compose-' + type).focus();
      }
    }
    function hideField(type) {
      const el = document.getElementById('field-' + type);
      if (el) {
        el.classList.add('hidden');
        document.getElementById('compose-' + type).value = '';
      }
    }

    // CUSTOM EMAIL SIGNATURES PER ACCOUNT
    const EMAIL_SIGNATURES = {
      'ayomidebobani@devgeeksnexus.com': '<br/><br/><div style="font-family: sans-serif; font-size: 13px; color: #334155; border-top: 2px solid #10b981; padding-top: 10px; margin-top: 16px;">' +
        '<p style="margin: 0; font-weight: 700; color: #0f172a; font-size: 14px;">Ayomide Bobani</p>' +
        '<p style="margin: 2px 0 0 0; color: #059669; font-size: 12px; font-weight: 600;">Lead Developer & Systems Architect | DevGeeksNexus</p>' +
        '<p style="margin: 4px 0 0 0; color: #64748b; font-size: 11px;">📧 ayomidebobani@devgeeksnexus.com &nbsp;|&nbsp; 🌐 <a href="https://devgeeksnexus.com" style="color: #10b981; text-decoration: none;">devgeeksnexus.com</a></p>' +
      '</div>',
      'admin@devgeeksnexus.com': '<br/><br/><div style="font-family: sans-serif; font-size: 13px; color: #334155; border-top: 2px solid #f59e0b; padding-top: 10px; margin-top: 16px;">' +
        '<p style="margin: 0; font-weight: 700; color: #0f172a; font-size: 14px;">Administrator</p>' +
        '<p style="margin: 2px 0 0 0; color: #d97706; font-size: 12px; font-weight: 600;">Security & Operations Control | DevGeeksNexus</p>' +
        '<p style="margin: 4px 0 0 0; color: #64748b; font-size: 11px;">🛡️ admin@devgeeksnexus.com &nbsp;|&nbsp; 🌐 <a href="https://devgeeksnexus.com" style="color: #f59e0b; text-decoration: none;">devgeeksnexus.com</a></p>' +
      '</div>',
      'info@devgeeksnexus.com': '<br/><br/><div style="font-family: sans-serif; font-size: 13px; color: #334155; border-top: 2px solid #6366f1; padding-top: 10px; margin-top: 16px;">' +
        '<p style="margin: 0; font-weight: 700; color: #0f172a; font-size: 14px;">DevGeeksNexus Team</p>' +
        '<p style="margin: 2px 0 0 0; color: #4f46e5; font-size: 12px; font-weight: 600;">Client Inquiries & Support Hub</p>' +
        '<p style="margin: 4px 0 0 0; color: #64748b; font-size: 11px;">✉️ info@devgeeksnexus.com &nbsp;|&nbsp; 🌐 <a href="https://devgeeksnexus.com" style="color: #6366f1; text-decoration: none;">devgeeksnexus.com</a></p>' +
      '</div>'
    };

    function insertSignature() {
      const fromEmail = document.getElementById('compose-from').value;
      const sig = EMAIL_SIGNATURES[fromEmail] || EMAIL_SIGNATURES['info@devgeeksnexus.com'];
      const editor = document.getElementById('compose-editor');
      editor.innerHTML += sig;
    }

    // WYSIWYG EDITOR COMMANDS
    function formatEditor(command, val = null) {
      document.execCommand(command, false, val);
      document.getElementById('compose-editor').focus();
    }

    function formatCodeBlock() {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const pre = document.createElement('pre');
      pre.style = 'background: #0f172a; color: #38bdf8; padding: 10px 14px; border-radius: 8px; font-family: monospace; font-size: 12px; margin: 8px 0; overflow-x: auto;';
      pre.textContent = range.toString() || '// Enter code snippet here';
      range.deleteContents();
      range.insertNode(pre);
    }

    function promptEditorLink() {
      const url = prompt('Enter website link (e.g. https://devgeeksnexus.com):');
      if (!url) return;
      formatEditor('createLink', url);
    }

    function promptEditorImage() {
      const url = prompt('Enter direct image URL:');
      if (!url) return;
      formatEditor('insertImage', url);
    }

    // AI POLISH & SMART ACTIONS
    function togglePolishMenu() {
      document.getElementById('ai-polish-menu').classList.toggle('hidden');
    }

    async function polishDraftText(tone) {
      document.getElementById('ai-polish-menu').classList.add('hidden');
      const editor = document.getElementById('compose-editor');
      const rawText = editor.innerText || editor.textContent || '';
      if (!rawText.trim()) {
        alert('Please write a draft in the message editor first to polish with AI.');
        return;
      }

      const notice = document.getElementById('draft-saved-notice');
      notice.classList.remove('hidden');
      notice.textContent = 'AI polishing (' + tone + ')...';

      try {
        const res = await fetch('/api/ai/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'polish', text: rawText, tone })
        });
        const data = await res.json();
        if (data.success && data.result) {
          editor.innerHTML = '<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">' + nl2br(data.result) + '</div>';
          notice.textContent = 'Polished with AI (' + tone + ')!';
          setTimeout(() => { notice.classList.add('hidden'); }, 3000);
        } else {
          alert('AI Polish error: ' + (data.error || 'Unable to polish text.'));
          notice.classList.add('hidden');
        }
      } catch (err) {
        notice.classList.add('hidden');
        alert('AI polish network error');
      }
    }

    function toggleAiMenu() {
      document.getElementById('ai-dropdown-menu').classList.toggle('hidden');
    }

    async function triggerAiAction(action) {
      document.getElementById('ai-dropdown-menu').classList.add('hidden');
      if (!selectedMsg) return;

      const bodyText = selectedMsg.text || (selectedMsg.html ? selectedMsg.html.replace(/<[^>]*>/g, ' ') : '') || '';

      if (action === 'summarize') {
        const summaryBox = document.getElementById('ai-summary-box');
        const summaryText = document.getElementById('ai-summary-text');
        summaryText.innerHTML = '<div class="text-indigo-600 font-semibold flex items-center gap-1.5"><i class="fa-solid fa-spinner fa-spin text-xs"></i> Generating AI executive summary...</div>';
        summaryBox.classList.remove('hidden');

        try {
          const res = await fetch('/api/ai/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'summarize', text: bodyText })
          });
          const data = await res.json();
          if (data.success) {
            summaryText.textContent = data.result;
          } else {
            summaryText.textContent = 'Could not generate summary: ' + (data.error || 'Unknown error');
          }
        } catch (e) {
          summaryText.textContent = 'Network error contacting AI assistant.';
        }
      } else if (action === 'smart-reply') {
        openCompose();
        document.getElementById('compose-to').value = selectedMsg.from;
        document.getElementById('compose-subject').value = selectedMsg.subject.startsWith('Re:') ? selectedMsg.subject : 'Re: ' + selectedMsg.subject;
        
        const editor = document.getElementById('compose-editor');
        editor.innerHTML = '<p class="text-purple-600 font-semibold italic">Drafting AI Smart Reply...</p>';

        try {
          const res = await fetch('/api/ai/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reply', text: bodyText, context: selectedMsg.subject })
          });
          const data = await res.json();
          if (data.success) {
            editor.innerHTML = '<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">' + nl2br(data.result) + '</div>';
            insertSignature();
          } else {
            editor.innerHTML = '<p>Hi there,</p><p>Thank you for reaching out.</p>';
          }
        } catch (e) {
          editor.innerHTML = '<p>Hi there,</p><p>Thank you for reaching out.</p>';
        }
      }
    }

    // SCHEDULED SENDING
    let isScheduleActive = false;
    function toggleScheduleInput() {
      const container = document.getElementById('schedule-input-container');
      const timeInput = document.getElementById('compose-schedule-time');
      const btnLabel = document.getElementById('schedule-btn-label');
      const submitText = document.getElementById('btn-submit-text');
      const submitIcon = document.getElementById('btn-submit-icon');

      isScheduleActive = !isScheduleActive;
      if (isScheduleActive) {
        container.classList.remove('hidden');
        btnLabel.textContent = 'Scheduling active';
        submitText.textContent = 'Schedule Email';
        submitIcon.className = 'fa-regular fa-clock text-xs';
        // Default to +2 hours
        const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        timeInput.value = d.toISOString().slice(0, 16);
      } else {
        cancelSchedule();
      }
    }

    function cancelSchedule() {
      isScheduleActive = false;
      document.getElementById('schedule-input-container').classList.add('hidden');
      document.getElementById('compose-schedule-time').value = '';
      document.getElementById('schedule-btn-label').textContent = 'Schedule Send';
      document.getElementById('btn-submit-text').textContent = 'Send Email';
      document.getElementById('btn-submit-icon').className = 'fa-solid fa-paper-plane text-xs';
    }

    // ATTACHMENT MANAGEMENT
    function handleFileSelected(event) {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      Array.from(files).forEach((file) => {
        // Enforce 10MB limit per file
        if (file.size > 10 * 1024 * 1024) {
          alert('File "' + file.name + '" exceeds the maximum allowed size of 10MB.');
          return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
          const result = e.target.result;
          const base64 = typeof result === 'string' ? result.split(',')[1] : '';
          attachedFiles.push({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            contentBase64: base64
          });
          renderAttachmentTray();
        };
        reader.readAsDataURL(file);
      });

      event.target.value = '';
    }

    function renderAttachmentTray() {
      const tray = document.getElementById('compose-attachments-tray');
      const list = document.getElementById('compose-attachments-list');
      if (!tray || !list) return;

      if (!attachedFiles || attachedFiles.length === 0) {
        tray.classList.add('hidden');
        list.innerHTML = '';
        return;
      }

      tray.classList.remove('hidden');
      list.innerHTML = attachedFiles.map((att, idx) => {
        const sizeKb = Math.round((att.size || 0) / 1024);
        return '<div class="flex items-center space-x-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs text-slate-700 shadow-2xs">' +
          '<i class="fa-solid fa-paperclip text-slate-400 text-[10px]"></i>' +
          '<span class="font-medium truncate max-w-[140px]" title="' + escapeHtmlText(att.filename) + '">' + escapeHtmlText(att.filename) + '</span>' +
          '<span class="text-slate-400 font-mono text-[10px]">(' + sizeKb + ' KB)</span>' +
          '<button type="button" data-idx="' + idx + '" onclick="removeAttachment(parseInt(this.dataset.idx, 10))" class="text-slate-400 hover:text-rose-500 ml-1 p-0.5" title="Remove attachment">' +
            '<i class="fa-solid fa-xmark text-[10px]"></i>' +
          '</button>' +
        '</div>';
      }).join('');
    }

    function removeAttachment(index) {
      if (index >= 0 && index < attachedFiles.length) {
        attachedFiles.splice(index, 1);
        renderAttachmentTray();
      }
    }

    function clearAttachments() {
      attachedFiles = [];
      const fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.value = '';
      renderAttachmentTray();
    }

    // COMPOSE & DRAFTS
    function openCompose(draft) {
      const modal = document.getElementById('compose-modal');
      const modalTitle = document.getElementById('compose-modal-title');
      const draftPill = document.getElementById('draft-status-pill');
      const editor = document.getElementById('compose-editor');

      if (draft) {
        currentDraftId = draft.id;
        modalTitle.textContent = 'Edit Draft';
        draftPill.classList.remove('hidden');

        document.getElementById('compose-from').value = draft.from || draft.account || 'info@devgeeksnexus.com';
        document.getElementById('compose-to').value = draft.to || '';
        document.getElementById('compose-subject').value = draft.subject === '(Draft)' ? '' : (draft.subject || '');
        editor.innerHTML = draft.html || (draft.text ? '<p>' + nl2br(draft.text) + '</p>' : '');

        if (draft.cc) {
          document.getElementById('field-cc').classList.remove('hidden');
          document.getElementById('compose-cc').value = draft.cc;
        } else {
          hideField('cc');
        }

        if (draft.bcc) {
          document.getElementById('field-bcc').classList.remove('hidden');
          document.getElementById('compose-bcc').value = draft.bcc;
        } else {
          hideField('bcc');
        }

        attachedFiles = draft.attachments ? [...draft.attachments] : [];
        renderAttachmentTray();
      } else {
        currentDraftId = null;
        modalTitle.textContent = 'New Email Message';
        draftPill.classList.add('hidden');

        if (currentAccount !== 'all') {
          document.getElementById('compose-from').value = currentAccount;
        } else {
          document.getElementById('compose-from').value = 'info@devgeeksnexus.com';
        }
        document.getElementById('compose-to').value = '';
        document.getElementById('compose-subject').value = '';
        editor.innerHTML = '<p></p>';
        hideField('cc');
        hideField('bcc');
        clearAttachments();
        cancelSchedule();
      }

      document.getElementById('send-alert').classList.add('hidden');
      document.getElementById('draft-saved-notice').classList.add('hidden');
      modal.classList.remove('hidden');
    }

    function closeCompose() {
      document.getElementById('compose-modal').classList.add('hidden');
      document.getElementById('send-alert').classList.add('hidden');
      document.getElementById('draft-saved-notice').classList.add('hidden');
      currentDraftId = null;
      cancelSchedule();
    }

    async function handleSaveDraft() {
      const btn = document.getElementById('btn-save-draft');
      const btnText = document.getElementById('btn-save-draft-text');
      const notice = document.getElementById('draft-saved-notice');
      const editor = document.getElementById('compose-editor');
      
      const from = document.getElementById('compose-from').value;
      const to = document.getElementById('compose-to').value;
      const cc = document.getElementById('compose-cc').value;
      const bcc = document.getElementById('compose-bcc').value;
      const subject = document.getElementById('compose-subject').value;
      const html = editor.innerHTML;
      const text = editor.innerText || '';

      if (!to && !subject && !text.trim()) {
        alert('Cannot save an empty draft. Please add a recipient, subject, or message body.');
        return;
      }

      btn.disabled = true;
      btnText.textContent = 'Saving...';

      try {
        const res = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentDraftId,
            from,
            to,
            cc,
            bcc,
            subject: subject || '(Draft)',
            text,
            html,
            attachments: attachedFiles,
          })
        });

        const data = await res.json();
        if (data.success && data.draft) {
          currentDraftId = data.draft.id;
          document.getElementById('draft-status-pill').classList.remove('hidden');
          notice.classList.remove('hidden');
          notice.textContent = '✓ Draft saved (' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ')';
          setTimeout(() => {
            notice.classList.add('hidden');
          }, 4000);
          loadMessages();
        } else {
          alert('Failed to save draft: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Network error saving draft');
      } finally {
        btn.disabled = false;
        btnText.textContent = 'Save Draft';
      }
    }

    async function handleSend(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-submit');
      const btnText = document.getElementById('btn-submit-text');
      btn.disabled = true;
      btnText.textContent = isScheduleActive ? 'Scheduling...' : 'Sending...';

      const from = document.getElementById('compose-from').value;
      const to = document.getElementById('compose-to').value;
      const cc = document.getElementById('compose-cc').value;
      const bcc = document.getElementById('compose-bcc').value;
      const subject = document.getElementById('compose-subject').value;
      const editor = document.getElementById('compose-editor');
      const html = editor.innerHTML;
      const text = editor.innerText || '';

      const trackOpens = document.getElementById('check-track-opens').checked;
      const trackClicks = document.getElementById('check-track-clicks').checked;
      const scheduledAt = isScheduleActive ? document.getElementById('compose-schedule-time').value : null;

      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId: currentDraftId,
            from,
            to,
            cc,
            bcc,
            subject,
            text,
            html,
            attachments: attachedFiles,
            trackOpens,
            trackClicks,
            scheduledAt,
          })
        });

        const data = await res.json();
        if (data.success) {
          document.getElementById('send-alert').classList.remove('hidden');
          document.getElementById('send-alert-text').textContent = data.scheduled ?
            'Email successfully scheduled for dispatch!' :
            'Email dispatched successfully with tracking active!';
          setTimeout(() => {
            closeCompose();
            loadMessages();
          }, 1200);
        } else {
          alert('Error: ' + (data.error || 'Failed to dispatch email'));
        }
      } catch (err) {
        alert('Network error sending email');
      } finally {
        btn.disabled = false;
        btnText.textContent = isScheduleActive ? 'Schedule Email' : 'Send Email';
      }
    }

    function escapeHtml(s) {
      return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function formatBytes(bytes) {
      if (!bytes) return '0 B';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    async function handleLogout() {
      if (confirm('Are you sure you want to log out of DevGeeksNexus Webmail?')) {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {}
        window.location.reload();
      }
    }

    // Auto-adapt layout on resize
    window.addEventListener('resize', () => {
      const listSec = document.getElementById('email-list-section');
      const readingPane = document.getElementById('reading-pane');
      if (window.innerWidth >= 768) {
        listSec.classList.remove('hidden');
        readingPane.classList.remove('hidden');
        toggleSidebar(false);
      } else {
        if (selectedMsg && !document.getElementById('message-detail').classList.contains('hidden')) {
          listSec.classList.add('hidden');
          readingPane.classList.remove('hidden');
        } else {
          listSec.classList.remove('hidden');
          readingPane.classList.add('hidden');
        }
      }
    });

    initTheme();

    // Check URL parameters for direct meeting room link
    const urlParams = new URLSearchParams(window.location.search);
    const meetParam = urlParams.get('meet');
    if (meetParam) {
      joinRoom(meetParam);
    } else {
      loadMessages();
    }

    setInterval(() => {
      if (!currentMeetRoom) loadMessages();
    }, 15000);
  </script>
</body>
</html>`;
}

function renderStandaloneMeetHtml(initialRoom: string): string {
  const safeRoom = (initialRoom || 'devgeeksnexus-training').replace(/[^a-zA-Z0-9_-]/g, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>DevGeeksNexus Live Meeting & Training</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <!-- Jitsi Meet WebRTC Video & Screen Share Engine -->
  <script src="https://meet.jit.si/external_api.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    html, body {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
    }
    #meet-stage, #standalone-jitsi-container {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
    }
    #standalone-jitsi-container iframe {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      max-height: 100% !important;
      border: none !important;
      display: block !important;
    }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 h-screen w-screen flex flex-col antialiased selection:bg-indigo-500 selection:text-white overflow-hidden">

  <!-- Top Navigation Header -->
  <header class="h-14 md:h-16 shrink-0 bg-slate-900/95 backdrop-blur border-b border-slate-800/80 px-4 md:px-8 flex items-center justify-between z-20">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
        <i class="fa-solid fa-video text-sm md:text-base"></i>
      </div>
      <div>
        <div class="flex items-center gap-2">
          <span class="font-bold text-sm md:text-base tracking-tight text-white">DevGeeksNexus</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            LIVE
          </span>
        </div>
        <p class="text-[11px] text-slate-400 hidden sm:block">Video Training & Real-time Collaboration</p>
      </div>
    </div>

    <!-- Room Indicator & Actions -->
    <div class="flex items-center gap-2 sm:gap-3">
      <div class="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800/70 rounded-lg border border-slate-700/60 text-xs text-slate-300">
        <i class="fa-solid fa-hashtag text-indigo-400"></i>
        <span class="font-mono font-medium">${safeRoom}</span>
      </div>
      <!-- Record Meeting Button -->
      <button id="btn-toggle-record-guest" onclick="toggleMeetingRecording('guest')" class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm" title="Record meeting and save to your computer">
        <span id="record-dot-guest" class="w-2 h-2 rounded-full bg-rose-500"></span>
        <span id="record-text-guest">Record</span>
        <span id="record-timer-guest" class="hidden font-mono text-[11px] text-white bg-rose-600/30 px-1 rounded">00:00</span>
      </button>
      <button onclick="copyCurrentLink()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm">
        <i class="fa-solid fa-link text-indigo-400"></i>
        <span id="copy-text">Share</span>
      </button>
    </div>
  </header>

  <!-- Main View Area -->
  <main class="flex-1 w-full relative overflow-hidden bg-slate-950 flex flex-col min-h-0">

    <!-- Pre-join Lobby Card -->
    <div id="prejoin-lobby" class="absolute inset-0 flex items-center justify-center p-4 md:p-6 z-10 overflow-y-auto">
      <div class="max-w-md w-full bg-slate-900 border border-slate-800/90 rounded-2xl shadow-2xl p-6 md:p-8 relative">
        <div class="text-center mb-6">
          <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-2xl mx-auto mb-4">
            <i class="fa-solid fa-handshake-angle"></i>
          </div>
          <h2 class="text-2xl font-bold text-white tracking-tight">Join Training Session</h2>
          <p class="text-xs text-slate-400 mt-1">High-definition audio, video, chat & screen sharing.</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Your Name or Alias</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500 pointer-events-none">
                <i class="fa-solid fa-user text-sm"></i>
              </span>
              <input type="text" id="guest-name" placeholder="e.g. John Doe / Trainee" autofocus
                class="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all">
            </div>
          </div>

          <div class="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs text-slate-400 space-y-1.5">
            <div class="flex items-center gap-2 text-indigo-300 font-semibold">
              <i class="fa-solid fa-shield-halved"></i>
              <span>Secure Guest Session</span>
            </div>
            <p>You are entering this meeting as an authorized attendee. No sign-up or downloads required.</p>
          </div>

          <button onclick="startMeeting()" id="btn-enter-room"
            class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2">
            <i class="fa-solid fa-arrow-right-to-bracket"></i>
            <span>Join Meeting Now</span>
          </button>
        </div>

        <div class="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <p class="text-[11px] text-slate-500">Powered by DevGeeksNexus WebRTC Video Hub</p>
        </div>
      </div>
    </div>

    <!-- Active Conference Fullscreen Stage -->
    <div id="meet-stage" class="hidden absolute inset-0 w-full h-full bg-slate-950">
      <div id="standalone-jitsi-container" class="absolute inset-0 w-full h-full"></div>
    </div>

    <!-- Leave Call Screen -->
    <div id="leave-screen" class="hidden absolute inset-0 flex items-center justify-center p-4 z-10">
      <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 text-center">
        <div class="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl mx-auto mb-4">
          <i class="fa-solid fa-circle-check"></i>
        </div>
        <h3 class="text-xl font-bold text-white">You have left the meeting</h3>
        <p class="text-sm text-slate-400 mt-2 mb-6">Thank you for participating in this DevGeeksNexus training session.</p>
        <button onclick="rejoinMeeting()" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-colors shadow-md">
          <i class="fa-solid fa-rotate-right mr-1.5"></i> Rejoin Meeting
        </button>
      </div>
    </div>

  </main>

  <script>
    const roomName = "${safeRoom}";
    let jitsiApi = null;
    let participantName = "";

    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.has('name') && document.getElementById('guest-name')) {
        document.getElementById('guest-name').value = sp.get('name');
      }
    } catch (e) {}

    // Support enter key on input
    document.getElementById('guest-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startMeeting();
    });

    function startMeeting() {
      const input = document.getElementById('guest-name');
      participantName = (input.value || '').trim() || 'Attendee ' + Math.floor(100 + Math.random() * 900);

      document.getElementById('prejoin-lobby').classList.add('hidden');
      document.getElementById('leave-screen').classList.add('hidden');
      document.getElementById('meet-stage').classList.remove('hidden');

      const container = document.getElementById('standalone-jitsi-container');
      container.innerHTML = '';

      const domain = 'meet.jit.si';
      const options = {
        roomName: roomName,
        width: '100%',
        height: '100%',
        parentNode: container,
        userInfo: {
          displayName: participantName,
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinConfig: {
            enabled: false
          },
          prejoinPageEnabled: false,
          skipPrejoin: true,
          disableDeepLinking: true,
          enableWelcomePage: false,
          enableClosePage: false
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'desktop', 'chat', 'raisehand',
            'tileview', 'fullscreen', 'settings', 'hangup', 'videoquality',
            'participants-pane', 'recording'
          ],
        }
      };

      try {
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
        jitsiApi.addEventListener('videoConferenceLeft', () => {
          onCallEnded();
        });
      } catch (err) {
        console.error('Conference init error:', err);
        container.innerHTML = '<div class="p-8 text-center text-rose-400"><p>Unable to load meeting stream.</p></div>';
      }
    }

    function onCallEnded() {
      if (recorderMediaRecorder && recorderMediaRecorder.state !== 'inactive') {
        stopMeetingRecording('guest');
      }
      if (jitsiApi) {
        try { jitsiApi.dispose(); } catch (e) {}
        jitsiApi = null;
      }
      document.getElementById('meet-stage').classList.add('hidden');
      document.getElementById('leave-screen').classList.remove('hidden');
    }

    function rejoinMeeting() {
      startMeeting();
    }

    function copyCurrentLink() {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        const text = document.getElementById('copy-text');
        const orig = text.textContent;
        text.textContent = 'Copied!';
        setTimeout(() => { text.textContent = orig; }, 2000);
      });
    }

    // Client-side Local Screen & Meeting Recorder for Attendees/Guests
    let recorderMediaRecorder = null;
    let recorderRecordedChunks = [];
    let recorderTimerInterval = null;
    let recorderSeconds = 0;

    async function toggleMeetingRecording(scope) {
      if (recorderMediaRecorder && recorderMediaRecorder.state === 'recording') {
        stopMeetingRecording(scope);
      } else {
        await startMeetingRecording(scope);
      }
    }

    async function startMeetingRecording(scope) {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          alert('Screen recording is not supported in this browser. Please use Chrome, Edge, or Firefox on desktop.');
          return;
        }

        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
            frameRate: { ideal: 30, max: 60 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          }
        });

        let micStream = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true
            }
          });
        } catch (micErr) {
          console.warn('Microphone access skipped or unavailable', micErr);
        }

        let mixedStream = displayStream;
        const displayAudioTracks = displayStream.getAudioTracks();
        const micAudioTracks = micStream ? micStream.getAudioTracks() : [];

        if (displayAudioTracks.length > 0 && micAudioTracks.length > 0) {
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const dest = audioCtx.createMediaStreamDestination();

            const sysSource = audioCtx.createMediaStreamSource(new MediaStream([displayAudioTracks[0]]));
            sysSource.connect(dest);

            const micSource = audioCtx.createMediaStreamSource(new MediaStream([micAudioTracks[0]]));
            micSource.connect(dest);

            const combinedAudioTrack = dest.stream.getAudioTracks()[0];
            mixedStream = new MediaStream([
              displayStream.getVideoTracks()[0],
              combinedAudioTrack
            ]);
          } catch (mixErr) {
            console.warn('Audio mixing fallback', mixErr);
            mixedStream = displayStream;
          }
        } else if (micAudioTracks.length > 0 && displayAudioTracks.length === 0) {
          mixedStream = new MediaStream([
            displayStream.getVideoTracks()[0],
            micAudioTracks[0]
          ]);
        }

        let mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8,opus';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }

        recorderRecordedChunks = [];
        recorderMediaRecorder = new MediaRecorder(mixedStream, {
          mimeType,
          videoBitsPerSecond: 2500000
        });

        recorderMediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recorderRecordedChunks.push(e.data);
          }
        };

        recorderMediaRecorder.onstop = () => {
          saveRecordingToDevice(scope);
          displayStream.getTracks().forEach(t => t.stop());
          if (micStream) micStream.getTracks().forEach(t => t.stop());
        };

        displayStream.getVideoTracks()[0].onended = () => {
          if (recorderMediaRecorder && recorderMediaRecorder.state !== 'inactive') {
            stopMeetingRecording(scope);
          }
        };

        recorderMediaRecorder.start(1000);
        updateRecordingUI(scope, true);

        recorderSeconds = 0;
        clearInterval(recorderTimerInterval);
        recorderTimerInterval = setInterval(() => {
          recorderSeconds++;
          const mins = String(Math.floor(recorderSeconds / 60)).padStart(2, '0');
          const secs = String(recorderSeconds % 60).padStart(2, '0');
          const timerEl = document.getElementById('record-timer-' + scope);
          if (timerEl) timerEl.textContent = mins + ':' + secs;
        }, 1000);

      } catch (err) {
        console.error('Recording initialization error:', err);
        if (err.name !== 'NotAllowedError') {
          alert('Could not start screen recording: ' + err.message);
        }
        updateRecordingUI(scope, false);
      }
    }

    function stopMeetingRecording(scope) {
      if (recorderMediaRecorder && recorderMediaRecorder.state !== 'inactive') {
        recorderMediaRecorder.stop();
      }
      clearInterval(recorderTimerInterval);
      updateRecordingUI(scope, false);
    }

    function updateRecordingUI(scope, isRecording) {
      const btn = document.getElementById('btn-toggle-record-' + scope);
      const dot = document.getElementById('record-dot-' + scope);
      const text = document.getElementById('record-text-' + scope);
      const timer = document.getElementById('record-timer-' + scope);

      if (!btn) return;

      if (isRecording) {
        btn.classList.add('bg-rose-950/80', 'border-rose-500', 'text-rose-300');
        btn.classList.remove('bg-slate-800', 'border-slate-700');
        if (dot) dot.classList.add('animate-ping');
        if (text) text.textContent = 'Stop Rec';
        if (timer) {
          timer.classList.remove('hidden');
          timer.textContent = '00:00';
        }
      } else {
        btn.classList.remove('bg-rose-950/80', 'border-rose-500', 'text-rose-300');
        btn.classList.add('bg-slate-800', 'border-slate-700');
        if (dot) dot.classList.remove('animate-ping');
        if (text) text.textContent = 'Record';
        if (timer) timer.classList.add('hidden');
      }
    }

    function saveRecordingToDevice(scope) {
      if (recorderRecordedChunks.length === 0) return;
      const blob = new Blob(recorderRecordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = 'devgeeksnexus-training-' + roomName + '-' + dateStr + '.webm';

      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 1000);

      alert('Recording completed and downloaded to your device!\\n\\nSaved file: ' + filename + '\\n\\nReady to be uploaded to YouTube.');
    }
  </script>
</body>
</html>`;
}

function renderLoginHtml(defaultEmail: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Sign In | DevGeeksNexus Webmail</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; }
    .otp-input::-webkit-outer-spin-button,
    .otp-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4 antialiased selection:bg-indigo-500 selection:text-white relative overflow-hidden">

  <!-- Ambient Background Glows -->
  <div class="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>
  <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-sky-500/15 rounded-full blur-3xl pointer-events-none"></div>

  <div class="w-full max-w-md bg-slate-900/90 border border-slate-800/90 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10">
    
    <!-- Branding Header -->
    <div class="text-center mb-8">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-indigo-500/30 mx-auto mb-4 ring-1 ring-white/20">
        N
      </div>
      <h1 class="text-2xl font-bold text-white tracking-tight">DevGeeksNexus Webmail</h1>
      <p class="text-xs text-slate-400 mt-1.5">Enterprise Cloudflare Email & Video Hub</p>
    </div>

    <!-- STEP 1: Enter Email & Request OTP -->
    <div id="step-email" class="space-y-5">
      <div>
        <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Account Email Address</label>
        <div class="relative">
          <span class="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500 pointer-events-none">
            <i class="fa-solid fa-envelope text-sm"></i>
          </span>
          <input type="email" id="auth-email" value="${defaultEmail}" required
            placeholder="name@domain.com or student email"
            class="w-full pl-10 pr-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono" />
        </div>
        <p class="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
          <i class="fa-solid fa-shield-halved text-emerald-400"></i>
          <span>Staff, Administrator, or Student Registered Email</span>
        </p>
      </div>

      <div id="email-error-msg" class="hidden p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
        <i class="fa-solid fa-circle-exclamation flex-shrink-0"></i>
        <span id="email-error-text"></span>
      </div>

      <button onclick="handleSendOtp()" id="btn-send-otp"
        class="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2">
        <i class="fa-solid fa-paper-plane text-xs"></i>
        <span id="btn-send-text">Send Verification Code</span>
      </button>

      <div class="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2.5">
        <i class="fa-solid fa-key text-indigo-400 mt-0.5"></i>
        <span>A 6-digit one-time password (OTP) will be generated and emailed securely to your active email.</span>
      </div>
    </div>

    <!-- STEP 2: Enter 6-digit OTP Code -->
    <div id="step-otp" class="hidden space-y-5">
      <div class="text-center">
        <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xl mx-auto mb-2 border border-indigo-500/20">
          <i class="fa-solid fa-lock"></i>
        </div>
        <h3 class="text-lg font-bold text-white">Enter Verification Code</h3>
        <p class="text-xs text-slate-400 mt-1">We sent a 6-digit code to <br/><span id="target-email-display" class="font-mono text-indigo-300 font-semibold"></span></p>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 text-center">6-Digit Code</label>
        <div class="relative">
          <input type="text" id="auth-code" maxlength="6" inputmode="numeric" placeholder="123456" autofocus
            class="w-full text-center tracking-[12px] text-2xl font-mono font-bold py-3.5 bg-slate-950 border border-slate-800 rounded-xl text-sky-400 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all" />
        </div>
      </div>

      <div id="otp-error-msg" class="hidden p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
        <i class="fa-solid fa-circle-exclamation flex-shrink-0"></i>
        <span id="otp-error-text"></span>
      </div>

      <button onclick="handleVerifyOtp()" id="btn-verify-otp"
        class="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2">
        <i class="fa-solid fa-shield-check text-xs"></i>
        <span id="btn-verify-text">Verify & Access Webmail</span>
      </button>

      <div class="flex items-center justify-between text-xs pt-2">
        <button onclick="backToEmailStep()" class="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5">
          <i class="fa-solid fa-arrow-left text-[10px]"></i> Change email
        </button>
        <button onclick="handleSendOtp()" id="btn-resend-otp" class="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
          Resend code
        </button>
      </div>
    </div>

    <!-- Security Footnote -->
    <div class="mt-8 pt-4 border-t border-slate-800/80 text-center">
      <p class="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
        <i class="fa-solid fa-shield-halved text-emerald-500/80"></i>
        <span>Secured by Cloudflare Workers & Resend 2FA</span>
      </p>
    </div>

  </div>

  <script>
    let pendingEmail = "";

    // Allow Enter key to trigger submit
    document.getElementById('auth-email').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSendOtp();
    });
    document.getElementById('auth-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleVerifyOtp();
    });

    async function handleSendOtp() {
      const emailInput = document.getElementById('auth-email');
      const email = (emailInput.value || '').trim();
      const errBox = document.getElementById('email-error-msg');
      const errText = document.getElementById('email-error-text');
      const btn = document.getElementById('btn-send-otp');
      const btnText = document.getElementById('btn-send-text');

      errBox.classList.add('hidden');

      if (!email) {
        errText.textContent = 'Please enter your email address.';
        errBox.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btnText.textContent = 'Sending OTP code...';

      try {
        const res = await fetch('/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          pendingEmail = email;
          document.getElementById('target-email-display').textContent = data.sentTo || email;
          document.getElementById('step-email').classList.add('hidden');
          document.getElementById('step-otp').classList.remove('hidden');
          document.getElementById('auth-code').value = '';
          document.getElementById('auth-code').focus();
        } else {
          errText.textContent = data.error || 'Failed to send OTP code.';
          errBox.classList.remove('hidden');
        }
      } catch (err) {
        errText.textContent = 'Network error while contacting authentication service.';
        errBox.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btnText.textContent = 'Send Verification Code';
      }
    }

    async function handleVerifyOtp() {
      const codeInput = document.getElementById('auth-code');
      const code = (codeInput.value || '').trim();
      const errBox = document.getElementById('otp-error-msg');
      const errText = document.getElementById('otp-error-text');
      const btn = document.getElementById('btn-verify-otp');
      const btnText = document.getElementById('btn-verify-text');

      errBox.classList.add('hidden');

      if (!code || code.length < 4) {
        errText.textContent = 'Please enter the 6-digit verification code.';
        errBox.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btnText.textContent = 'Verifying code...';

      try {
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pendingEmail, code })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          btnText.textContent = 'Access Granted! Redirecting...';
          setTimeout(() => {
            window.location.reload();
          }, 600);
        } else {
          errText.textContent = data.error || 'Invalid or expired code.';
          errBox.classList.remove('hidden');
          btn.disabled = false;
          btnText.textContent = 'Verify & Access Webmail';
        }
      } catch (err) {
        errText.textContent = 'Network error during verification.';
        errBox.classList.remove('hidden');
        btn.disabled = false;
        btnText.textContent = 'Verify & Access Webmail';
      }
    }

    function backToEmailStep() {
      document.getElementById('step-otp').classList.add('hidden');
      document.getElementById('step-email').classList.remove('hidden');
      document.getElementById('auth-email').focus();
    }
  </script>
</body>
</html>`;
}
