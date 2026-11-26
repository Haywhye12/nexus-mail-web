import PostalMime from 'postal-mime';

export interface Env {
  RESEND_API_KEY?: string;
  SMTP_PASS?: string;
  EMAILS: any; // KVNamespace
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
        folder: 'inbox',
        isRead: false,
        isStarred: false,
      };

      if (env.EMAILS) {
        await env.EMAILS.put(`msg:${payload.date}:${msgId}`, JSON.stringify(payload));
        console.log(`Stored inbound email ${msgId} for mailbox ${targetAccount} in Cloudflare KV.`);
      }
    } catch (err: any) {
      console.error('Inbound email error:', err.message || err);
    }
  },

  // 2. HTTP FETCH HANDLER (Nexus Mail Web App & API)
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // API: GET /api/messages
    if (url.pathname === '/api/messages') {
      const folder = url.searchParams.get('folder') || 'inbox';
      const selectedAccount = (url.searchParams.get('account') || 'all').toLowerCase();
      const allFetched: any[] = [];

      if (env.EMAILS) {
        const list = await env.EMAILS.list({ prefix: 'msg:' });
        for (const key of list.keys) {
          const item = await env.EMAILS.get(key.name, 'json');
          if (item) {
            if (!item.account) {
              item.account = resolveAccount(item.folder === 'sent' || item.folder === 'drafts' ? item.from : item.to);
            }
            allFetched.push(item);
          }
        }
      }

      // Compute statistics per account and folder
      const stats: Record<string, { unread: number; total: number }> = {
        'all': { unread: 0, total: 0 },
      };
      KNOWN_ACCOUNTS.forEach((acc) => {
        stats[acc.email.toLowerCase()] = { unread: 0, total: 0 };
      });

      const folderCounts = {
        inbox: 0,
        drafts: 0,
        sent: 0,
      };

      for (const item of allFetched) {
        const itemAcc = (item.account || resolveAccount(item.from || item.to)).toLowerCase();
        const matchesCurrentAcc = selectedAccount === 'all' || itemAcc === selectedAccount;

        if (matchesCurrentAcc) {
          if (item.folder === 'inbox') folderCounts.inbox++;
          if (item.folder === 'drafts') folderCounts.drafts++;
          if (item.folder === 'sent') folderCounts.sent++;
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
        if (folder && item.folder !== folder) return false;
        if (selectedAccount !== 'all') {
          const itemAcc = (item.account || resolveAccount(item.folder === 'sent' || item.folder === 'drafts' ? item.from : item.to)).toLowerCase();
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
          accounts: KNOWN_ACCOUNTS,
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

        if (env.EMAILS) {
          if (id) {
            const list = await env.EMAILS.list({ prefix: 'msg:' });
            const oldKey = list.keys.find((k: any) => k.name.endsWith(id));
            if (oldKey) {
              await env.EMAILS.delete(oldKey.name);
            }
          }
          await env.EMAILS.put(`msg:${draftDate}:${draftId}`, JSON.stringify(draftMsg));
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

    // API: POST /api/send (Sends live via Resend REST API)
    if (request.method === 'POST' && url.pathname === '/api/send') {
      try {
        const body = (await request.json()) as any;
        const { from, to, cc, bcc, subject, html, text, attachments, draftId } = body;

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

        const resendPayload: any = {
          from: `${senderDisplayName} <${senderEmail}>`,
          to: toList,
          subject: subject || '(No Subject)',
          html: html || (text ? `<p>${text}</p>` : ''),
        };

        if (ccList.length > 0) resendPayload.cc = ccList;
        if (bccList.length > 0) resendPayload.bcc = bccList;

        if (attachments && attachments.length > 0) {
          resendPayload.attachments = attachments.map((att: any) => ({
            filename: att.filename,
            content: att.contentBase64,
          }));
        }

        // Call Resend REST API
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
        if (env.EMAILS && draftId) {
          const list = await env.EMAILS.list({ prefix: 'msg:' });
          const draftKey = list.keys.find((k: any) => k.name.endsWith(draftId));
          if (draftKey) {
            await env.EMAILS.delete(draftKey.name);
          }
        }

        // Store copy in Sent folder in KV
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
        };

        if (env.EMAILS) {
          await env.EMAILS.put(`msg:${sentMsg.date}:${sentId}`, JSON.stringify(sentMsg));
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

        if (env.EMAILS) {
          const list = await env.EMAILS.list({ prefix: 'msg:' });
          const target = list.keys.find((k: any) => k.name.endsWith(id));

          if (target) {
            if (action === 'delete') {
              await env.EMAILS.delete(target.name);
            } else {
              const item = await env.EMAILS.get(target.name, 'json');
              if (item) {
                if (typeof isRead === 'boolean') item.isRead = isRead;
                if (action === 'toggleStar') item.isStarred = !item.isStarred;
                await env.EMAILS.put(target.name, JSON.stringify(item));
              }
            }
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

    // Standalone Isolated Video Meeting / Training Room Route
    // Accessible via /meet, /meet?room=..., /meet/:room, or legacy /?meet=...
    // Fully isolated from email: participants have ZERO access to emails or mailbox APIs
    if (url.pathname.startsWith('/meet') || url.searchParams.has('meet')) {
      const roomParam =
        url.searchParams.get('room') ||
        url.searchParams.get('meet') ||
        url.pathname.replace(/^\/meet\/?/, '').trim();
      return new Response(renderStandaloneMeetHtml(roomParam || 'devgeeksnexus-training'), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Default: Serve the complete Nexus Suite for Mailbox Owners/Admins
    return new Response(renderWebAppHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};

function renderWebAppHtml(): string {
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
  </style>
</head>
<body class="bg-slate-50 text-slate-800 h-screen h-screen-ios flex flex-col md:flex-row overflow-hidden select-none">

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

      <div class="pt-2 pb-1 px-3">
        <div class="border-t border-slate-800"></div>
      </div>

      <!-- Nexus Meet (Video Training & Screen Sharing) -->
      <button onclick="switchTab('meet')" id="btn-meet" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-video w-4 text-rose-400"></i>
          <span class="font-medium">Nexus Meet</span>
        </div>
        <span class="px-1.5 py-0.2 rounded text-[9px] bg-rose-950 text-rose-300 border border-rose-800/60 font-semibold uppercase">Live</span>
      </button>

      <!-- DNS -->
      <button onclick="switchTab('dns')" id="btn-dns" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-shield-halved w-4 text-emerald-400"></i>
          <span>DNS Verification</span>
        </div>
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
      </button>
    </nav>

    <!-- Footer Status -->
    <div class="p-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-[11px] text-slate-300">Cloudflare 24/7 Live</span>
      </div>
      <span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">KV Storage</span>
    </div>
  </aside>

  <!-- MAIN APP CONTAINER (MAIL VIEW) -->
  <div id="mail-view" class="flex-1 flex flex-col md:flex-row overflow-hidden relative">
    
    <!-- Email List Section -->
    <section id="email-list-section" class="w-full md:w-96 border-r border-slate-200 bg-white flex flex-col h-full flex-shrink-0">
      <div class="p-2.5 sm:p-3 border-b border-slate-200 flex items-center space-x-2 bg-white">
        <div class="relative flex-1">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
          <input type="text" id="search-input" oninput="renderList()" placeholder="Search messages..." class="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 text-slate-800" />
        </div>
        <button onclick="loadMessages()" title="Refresh Mailbox" class="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
          <i id="refresh-icon" class="fa-solid fa-rotate-right text-xs"></i>
        </button>
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
          </div>
          <div class="flex items-center space-x-1.5 overflow-hidden">
            <span id="detail-account-badge" class="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-medium truncate max-w-[130px] sm:max-w-none"></span>
            <span id="detail-id" class="hidden lg:inline text-xs text-slate-400 font-mono"></span>
          </div>
        </div>

        <!-- Detail Content -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-6 custom-scroll touch-scroll">
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
                <option value="info@devgeeksnexus.com">DevGeeksNexus Team &lt;info@devgeeksnexus.com&gt;</option>
                <option value="ayomidebobani@devgeeksnexus.com">Ayomide Bobani &lt;ayomidebobani@devgeeksnexus.com&gt;</option>
                <option value="admin@devgeeksnexus.com">Admin | DevGeeksNexus &lt;admin@devgeeksnexus.com&gt;</option>
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

          <!-- Formatting & Attachment Toolbar -->
          <div class="flex items-center justify-between flex-wrap gap-1.5 border-y border-slate-200 py-1.5 bg-slate-50 px-2 rounded-md">
            <div class="flex items-center space-x-1">
              <button type="button" onclick="formatText('b')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs font-bold" title="Bold"><i class="fa-solid fa-bold"></i></button>
              <button type="button" onclick="formatText('i')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs" title="Italic"><i class="fa-solid fa-italic"></i></button>
              <button type="button" onclick="promptLink()" class="px-2 py-1 hover:bg-slate-200 rounded text-xs text-indigo-600 font-medium" title="Add Link"><i class="fa-solid fa-link mr-1"></i> Link</button>
              <button type="button" onclick="promptImage()" class="px-2 py-1 hover:bg-slate-200 rounded text-xs text-indigo-600 font-medium" title="Add Image URL"><i class="fa-regular fa-image mr-1"></i> Image</button>
            </div>
            <div>
              <input type="file" id="file-input" onchange="handleFileSelected(event)" multiple class="hidden" />
              <button type="button" onclick="document.getElementById('file-input').click()" class="flex items-center space-x-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-xs font-medium text-slate-700 shadow-xs">
                <i class="fa-solid fa-paperclip text-slate-500"></i>
                <span>Attach Files</span>
              </button>
            </div>
          </div>

          <!-- Body -->
          <div>
            <textarea id="compose-body" rows="6" placeholder="Write your message here..." class="w-full p-3 border border-slate-200 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 text-slate-800 font-sans leading-relaxed"></textarea>
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
              <i class="fa-solid fa-paper-plane text-xs"></i>
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
    let currentAccount = 'all'; // 'all' | 'info@devgeeksnexus.com' | 'ayomidebobani@devgeeksnexus.com' | 'admin@devgeeksnexus.com'
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

      document.getElementById('badge-acc-all').textContent = allUnread;
      document.getElementById('badge-acc-info').textContent = infoUnread;
      document.getElementById('badge-acc-ayomide').textContent = ayoUnread;
      document.getElementById('badge-acc-admin').textContent = adminUnread;

      if (currentAccount === 'all') {
        document.getElementById('unread-count').textContent = allUnread;
      } else if (stats[currentAccount.toLowerCase()]) {
        document.getElementById('unread-count').textContent = stats[currentAccount.toLowerCase()].unread;
      }

      // Update folder counts
      if (folderCounts) {
        document.getElementById('drafts-count').textContent = folderCounts.drafts || 0;
        document.getElementById('sent-count').textContent = folderCounts.sent || 0;
      }
    }

    function switchAccount(acc) {
      currentAccount = acc;

      const buttons = [
        { id: 'acc-all', target: 'all', label: 'All Mailboxes' },
        { id: 'acc-info', target: 'info@devgeeksnexus.com', label: 'Info Desk' },
        { id: 'acc-ayomide', target: 'ayomidebobani@devgeeksnexus.com', label: 'Ayomide Bobani' },
        { id: 'acc-admin', target: 'admin@devgeeksnexus.com', label: 'Admin' },
      ];

      buttons.forEach(b => {
        const el = document.getElementById(b.id);
        if (b.target === acc) {
          el.className = 'w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-all bg-indigo-600/20 text-indigo-300 border border-indigo-500/30';
          document.getElementById('current-acc-label').textContent = b.label;
          document.getElementById('mobile-top-account').textContent = b.label;
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

    function renderList() {
      const listEl = document.getElementById('email-list');
      const q = (document.getElementById('search-input').value || '').toLowerCase();
      const filtered = allMessages.filter(m => {
        if (!q) return true;
        return (m.subject || '').toLowerCase().includes(q) ||
               (m.from || '').toLowerCase().includes(q) ||
               (m.to || '').toLowerCase().includes(q) ||
               (m.text || '').toLowerCase().includes(q);
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

      // Action buttons adaptation for Drafts
      const isDraft = selectedMsg.folder === 'drafts';
      const editDraftBtn = document.getElementById('btn-detail-edit-draft');
      const replyBtn = document.getElementById('btn-detail-reply');

      if (isDraft) {
        editDraftBtn.classList.remove('hidden');
        replyBtn.classList.add('hidden');
      } else {
        editDraftBtn.classList.add('hidden');
        replyBtn.classList.remove('hidden');
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
      document.getElementById('detail-body').innerHTML = selectedMsg.html || escapeHtml(selectedMsg.text) || '<p class="text-slate-400 italic">(Empty message body)</p>';

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

    function replyToCurrentMessage() {
      if (!selectedMsg) return;
      openCompose();
      document.getElementById('compose-to').value = selectedMsg.from;
      document.getElementById('compose-subject').value = selectedMsg.subject.startsWith('Re:') ? selectedMsg.subject : 'Re: ' + selectedMsg.subject;
      
      const accKey = (selectedMsg.account || selectedMsg.to || '').toLowerCase();
      if (accKey.includes('ayomidebobani')) {
        document.getElementById('compose-from').value = 'ayomidebobani@devgeeksnexus.com';
      } else if (accKey.includes('admin')) {
        document.getElementById('compose-from').value = 'admin@devgeeksnexus.com';
      } else {
        document.getElementById('compose-from').value = 'info@devgeeksnexus.com';
      }
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

    function switchFolder(f) {
      currentFolder = f;
      document.getElementById('folder-title').textContent = f.toUpperCase();
      
      const folders = ['inbox', 'drafts', 'sent'];
      folders.forEach(fold => {
        const btn = document.getElementById('btn-' + fold);
        if (fold === f) {
          btn.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium';
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
      const btnMeet = document.getElementById('btn-meet');
      const btnDns = document.getElementById('btn-dns');

      mailView.classList.add('hidden');
      dnsView.classList.add('hidden');
      meetView.classList.add('hidden');

      btnMeet.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors';
      btnDns.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors';

      if (t === 'meet') {
        meetView.classList.remove('hidden');
        btnMeet.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-rose-600/20 text-rose-300 font-semibold';
      } else if (t === 'dns') {
        dnsView.classList.remove('hidden');
        btnDns.className = 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium';
      } else {
        mailView.classList.remove('hidden');
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
          prejoinPageEnabled: true,
          disableDeepLinking: true
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
      if (jitsiApi) {
        try { jitsiApi.dispose(); } catch (e) {}
        jitsiApi = null;
      }
      currentMeetRoom = null;
      document.getElementById('meet-container').innerHTML = '';
      document.getElementById('meet-active-stage').classList.add('hidden');
      document.getElementById('meet-lobby').classList.remove('hidden');
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

    // COMPOSE & DRAFTS
    function openCompose(draft) {
      const modal = document.getElementById('compose-modal');
      const modalTitle = document.getElementById('compose-modal-title');
      const draftPill = document.getElementById('draft-status-pill');

      if (draft) {
        currentDraftId = draft.id;
        modalTitle.textContent = 'Edit Draft';
        draftPill.classList.remove('hidden');

        document.getElementById('compose-from').value = draft.from || draft.account || 'info@devgeeksnexus.com';
        document.getElementById('compose-to').value = draft.to || '';
        document.getElementById('compose-subject').value = draft.subject === '(Draft)' ? '' : (draft.subject || '');
        document.getElementById('compose-body').value = draft.text || '';

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
        document.getElementById('compose-body').value = '';
        hideField('cc');
        hideField('bcc');
        clearAttachments();
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
    }

    async function handleSaveDraft() {
      const btn = document.getElementById('btn-save-draft');
      const btnText = document.getElementById('btn-save-draft-text');
      const notice = document.getElementById('draft-saved-notice');
      
      const from = document.getElementById('compose-from').value;
      const to = document.getElementById('compose-to').value;
      const cc = document.getElementById('compose-cc').value;
      const bcc = document.getElementById('compose-bcc').value;
      const subject = document.getElementById('compose-subject').value;
      const body = document.getElementById('compose-body').value;

      if (!to && !subject && !body) {
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
            text: body,
            html: body ? '<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">' + body.replace(/\\n/g, '<br/>') + '</div>' : '',
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

    function formatText(tag) {
      const area = document.getElementById('compose-body');
      area.value += '<' + tag + '>text</' + tag + '>';
      area.focus();
    }
    function promptLink() {
      const url = prompt('Enter URL (e.g. https://devgeeksnexus.com):');
      if (!url) return;
      const text = prompt('Enter link text:', url) || url;
      document.getElementById('compose-body').value += ' <a href="' + url + '" target="_blank" style="color: #4f46e5; text-decoration: underline;">' + text + '</a> ';
    }
    function promptImage() {
      const url = prompt('Enter image URL:');
      if (!url) return;
      document.getElementById('compose-body').value += '\\n<img src="' + url + '" style="max-width: 100%; border-radius: 8px;"/>\\n';
    }

    function handleFileSelected(e) {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          attachedFiles.push({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            contentBase64: reader.result.split(',')[1]
          });
          renderAttachmentTray();
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    }

    function renderAttachmentTray() {
      const tray = document.getElementById('compose-attachments-tray');
      const list = document.getElementById('compose-attachments-list');
      if (attachedFiles.length === 0) {
        tray.classList.add('hidden');
        return;
      }
      tray.classList.remove('hidden');
      list.innerHTML = attachedFiles.map((att, i) => \`
        <div class="flex items-center space-x-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs shadow-xs">
          <i class="fa-solid fa-paperclip text-slate-400"></i>
          <span class="max-w-[120px] truncate font-medium">\${escapeHtml(att.filename)}</span>
          <span class="text-[10px] text-slate-400 font-mono">(\${formatBytes(att.size)})</span>
          <button type="button" onclick="removeAtt(\${i})" class="text-slate-400 hover:text-red-500"><i class="fa-solid fa-xmark"></i></button>
        </div>
      \`).join('');
    }

    function removeAtt(i) {
      attachedFiles.splice(i, 1);
      renderAttachmentTray();
    }
    function clearAttachments() {
      attachedFiles = [];
      renderAttachmentTray();
    }

    async function handleSend(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-submit');
      const btnText = document.getElementById('btn-submit-text');
      btn.disabled = true;
      btnText.textContent = 'Sending...';

      const from = document.getElementById('compose-from').value;
      const to = document.getElementById('compose-to').value;
      const cc = document.getElementById('compose-cc').value;
      const bcc = document.getElementById('compose-bcc').value;
      const subject = document.getElementById('compose-subject').value;
      const body = document.getElementById('compose-body').value;

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
            text: body.replace(/<[^>]*>?/gm, ''),
            html: '<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">' + body.replace(/\\n/g, '<br/>') + '</div>',
            attachments: attachedFiles
          })
        });

        const data = await res.json();
        if (data.success) {
          document.getElementById('send-alert').classList.remove('hidden');
          setTimeout(() => {
            closeCompose();
            loadMessages();
          }, 1200);
        } else {
          alert('Error: ' + (data.error || 'Failed to send'));
        }
      } catch (err) {
        alert('Network error sending email');
      } finally {
        btn.disabled = false;
        btnText.textContent = 'Send Email';
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
    #meet-stage, #standalone-jitsi-container, #standalone-jitsi-container iframe {
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      border: none !important;
      display: block;
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
      <div id="standalone-jitsi-container" class="w-full h-full"></div>
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
          prejoinPageEnabled: false,
          disableDeepLinking: true
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
  </script>
</body>
</html>`;
}
