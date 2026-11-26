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

      // Resolve which mailbox this email was sent to
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
        account: targetAccount, // Target mailbox (info@, ayomidebobani@, admin@)
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
              item.account = resolveAccount(item.folder === 'sent' ? item.from : item.to);
            }
            allFetched.push(item);
          }
        }
      }

      // Compute statistics per account for badges
      const stats: Record<string, { unread: number; total: number }> = {
        'all': { unread: 0, total: 0 },
      };
      KNOWN_ACCOUNTS.forEach((acc) => {
        stats[acc.email.toLowerCase()] = { unread: 0, total: 0 };
      });

      for (const item of allFetched) {
        if (item.folder === 'inbox') {
          const itemAcc = (item.account || resolveAccount(item.to)).toLowerCase();
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
          const itemAcc = (item.account || resolveAccount(item.folder === 'sent' ? item.from : item.to)).toLowerCase();
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
          accounts: KNOWN_ACCOUNTS,
        }),
        {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // API: POST /api/send (Sends live via Resend REST API)
    if (request.method === 'POST' && url.pathname === '/api/send') {
      try {
        const body = (await request.json()) as any;
        const { from, to, cc, bcc, subject, html, text, attachments } = body;

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

    // Default: Serve the complete Nexus Mail Web Application (Mobile-Responsive)
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
  <title>Nexus Mail | devgeeksnexus.com</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
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

  <!-- MOBILE TOPBAR (Visible only on mobile screens < md) -->
  <header class="md:hidden h-14 bg-slate-900 text-white flex items-center justify-between px-3.5 border-b border-slate-800 flex-shrink-0 z-30 shadow-sm">
    <div class="flex items-center space-x-2.5">
      <button onclick="toggleSidebar(true)" class="p-2 -ml-1 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 active:scale-90 transition-all" aria-label="Open Mailboxes">
        <i class="fa-solid fa-bars text-lg"></i>
      </button>
      <div class="flex items-center space-x-2">
        <div class="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-indigo-600/30">N</div>
        <div class="leading-tight">
          <h1 class="font-semibold text-xs text-white">Nexus Mail</h1>
          <span id="mobile-top-account" class="text-[10px] text-indigo-300 font-mono block truncate max-w-[150px]">All Mailboxes</span>
        </div>
      </div>
    </div>
    <div class="flex items-center space-x-1.5">
      <button onclick="loadMessages()" class="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 active:rotate-180 transition-all" title="Refresh">
        <i id="mobile-refresh-icon" class="fa-solid fa-rotate-right text-xs"></i>
      </button>
      <button onclick="openCompose()" class="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/30 active:scale-95 transition-all">
        <i class="fa-solid fa-pen text-[10px]"></i>
        <span>Compose</span>
      </button>
    </div>
  </header>

  <!-- SIDEBAR BACKDROP OVERLAY (Mobile only) -->
  <div id="sidebar-backdrop" onclick="toggleSidebar(false)" class="hidden fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden transition-opacity"></div>

  <!-- SIDEBAR (Off-canvas drawer on mobile, static on desktop) -->
  <aside id="app-sidebar" class="fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 select-none transform -translate-x-full md:relative md:translate-x-0 transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none flex-shrink-0">
    <!-- Brand Header -->
    <div class="p-4 border-b border-slate-800 flex items-center justify-between">
      <div class="flex items-center space-x-2.5">
        <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">N</div>
        <div>
          <h1 class="font-semibold text-sm leading-tight text-white">Nexus Mail</h1>
          <p class="text-xs text-slate-400">Multi-Account Cloud Suite</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">Live</span>
        <!-- Close Drawer Button (Mobile only) -->
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
      <button onclick="switchFolder('inbox')" id="btn-inbox" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-inbox w-4"></i>
          <span>Inbox</span>
        </div>
        <span id="unread-count" class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
      </button>

      <button onclick="switchFolder('sent')" id="btn-sent" class="w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <i class="fa-solid fa-paper-plane w-4"></i>
        <span>Sent Messages</span>
      </button>

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

  <!-- MAIN APP CONTAINER -->
  <div id="mail-view" class="flex-1 flex flex-col md:flex-row overflow-hidden relative">
    
    <!-- Email List Section (Full width on mobile, w-96 on desktop) -->
    <section id="email-list-section" class="w-full md:w-96 border-r border-slate-200 bg-white flex flex-col h-full flex-shrink-0">
      <!-- Search & Refresh Bar -->
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

    <!-- Reading Pane (Hidden on mobile until email selected, full width on mobile) -->
    <main id="reading-pane" class="hidden md:flex flex-1 bg-white flex-col overflow-hidden h-full">
      <!-- Empty State (Desktop only) -->
      <div id="empty-state" class="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
        <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <i class="fa-regular fa-envelope text-3xl text-slate-400"></i>
        </div>
        <p class="text-sm font-semibold text-slate-700">Select an email to read</p>
        <p class="text-xs text-slate-400 mt-1">Multi-account routing active for devgeeksnexus.com.</p>
      </div>

      <!-- Email Detail Container -->
      <div id="message-detail" class="hidden flex-1 flex flex-col h-full overflow-hidden">
        <!-- Action Header -->
        <div class="p-2.5 sm:p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
          <div class="flex items-center space-x-1.5 sm:space-x-2">
            <!-- Back to List Button (Mobile only) -->
            <button onclick="backToList()" class="md:hidden flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-xs active:scale-95 transition-all mr-1">
              <i class="fa-solid fa-arrow-left text-xs text-indigo-600"></i>
              <span>Back</span>
            </button>

            <button onclick="deleteCurrentMessage()" class="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete">
              <i class="fa-solid fa-trash-can text-sm"></i>
            </button>
            <button onclick="replyToCurrentMessage()" class="px-2.5 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg text-xs font-medium text-indigo-600 flex items-center space-x-1.5 active:scale-95 transition-all" title="Reply">
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

    <!-- MOBILE FLOATING ACTION BUTTON (Compose FAB) -->
    <button onclick="openCompose()" class="md:hidden fixed bottom-5 right-5 w-13 h-13 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/40 flex items-center justify-center text-lg z-30 active:scale-90 transition-all" aria-label="Compose New Email">
      <i class="fa-solid fa-plus text-xl"></i>
    </button>
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

  <!-- COMPOSE MODAL (Responsive Bottom-Sheet on Mobile, Centered Modal on Desktop) -->
  <div id="compose-modal" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 transition-all">
    <div class="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl border border-slate-200 w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] h-[88vh] sm:h-auto overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95 duration-200">
      
      <!-- Modal Header -->
      <div class="px-4 py-3 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
        <span class="text-xs sm:text-sm font-semibold flex items-center space-x-2">
          <i class="fa-solid fa-paper-plane text-indigo-400"></i>
          <span>New Email Message</span>
        </span>
        <button onclick="closeCompose()" class="p-1 text-slate-400 hover:text-white rounded-md active:scale-95" aria-label="Close">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
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
            <input type="text" id="compose-subject" required placeholder="Subject of your message..." class="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800" />
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
            <textarea id="compose-body" rows="6" required placeholder="Write your message here... (HTML formatting supported)" class="w-full p-3 border border-slate-200 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 text-slate-800 font-sans leading-relaxed"></textarea>
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

        <!-- Modal Footer Actions -->
        <div class="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <span class="text-[10px] sm:text-[11px] text-slate-400 truncate max-w-[150px] sm:max-w-none">SPF & DKIM signed for all senders.</span>
          <div class="flex space-x-2">
            <button type="button" onclick="closeCompose()" class="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg active:scale-95 transition-all">Cancel</button>
            <button type="submit" id="btn-submit" class="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg shadow-sm active:scale-95 transition-all">
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
        updateAccountStats(data.stats);
        renderList();
      } catch (e) {
        console.error('Failed to load messages', e);
      } finally {
        if (icon) icon.classList.remove('fa-spin');
        if (mobIcon) mobIcon.classList.remove('fa-spin');
      }
    }

    function updateAccountStats(stats) {
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
        listEl.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm"><i class="fa-regular fa-envelope text-3xl mb-2 opacity-30 block"></i>No messages found in this mailbox</div>';
        return;
      }

      listEl.innerHTML = filtered.map(m => {
        const isSelected = selectedMsg && selectedMsg.id === m.id;
        const dateStr = new Date(m.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
        const sender = currentFolder === 'sent' ? 'To: ' + m.to : (m.fromName || m.from);
        
        // Account badge pill
        const accKey = (m.account || (m.folder === 'sent' ? m.from : m.to) || '').toLowerCase();
        let badgeText = 'info';
        let badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';

        if (accKey.includes('ayomidebobani')) {
          badgeText = 'ayomide';
          badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        } else if (accKey.includes('admin')) {
          badgeText = 'admin';
          badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
        }

        return \`
          <div onclick="selectMessage('\${m.id}')" class="p-3 sm:p-3.5 cursor-pointer transition-colors border-l-4 \${
            isSelected ? 'bg-indigo-50/70 border-l-indigo-600' :
            m.isRead ? 'bg-white hover:bg-slate-50 border-l-transparent' :
            'bg-indigo-50/30 hover:bg-indigo-50/50 border-l-indigo-500 font-semibold'
          }">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold text-slate-900 truncate max-w-[200px] sm:max-w-[190px]">\${escapeHtml(sender)}</span>
              <span class="text-[10px] text-slate-400">\${dateStr}</span>
            </div>
            <div class="text-xs font-medium text-slate-800 truncate mb-1">\${escapeHtml(m.subject || '(No Subject)')}</div>
            <div class="text-xs text-slate-500 line-clamp-2 mb-2">\${escapeHtml(m.text || '')}</div>
            <div class="flex items-center justify-between pt-1 text-[10px]">
              <span class="px-1.5 py-0.5 rounded border text-[9px] font-mono font-medium uppercase \${badgeClass}">\${badgeText}</span>
              <div class="flex items-center space-x-2 text-slate-400">
                \${(m.attachments && m.attachments.length > 0) ? '<span><i class="fa-solid fa-paperclip mr-1"></i>' + m.attachments.length + '</span>' : ''}
                \${!m.isRead ? '<span class="w-2 h-2 rounded-full bg-indigo-600 inline-block"></span>' : ''}
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function selectMessage(id) {
      selectedMsg = allMessages.find(m => m.id === id);
      if (!selectedMsg) return;

      if (!selectedMsg.isRead) {
        selectedMsg.isRead = true;
        fetch('/api/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, isRead: true })
        });
      }

      renderList();

      // Mobile Responsive Switch: Hide list section, reveal reading pane
      const listSec = document.getElementById('email-list-section');
      const readingPane = document.getElementById('reading-pane');
      if (window.innerWidth < 768) {
        listSec.classList.add('hidden');
        readingPane.classList.remove('hidden');
      }

      document.getElementById('empty-state').classList.add('hidden');
      document.getElementById('message-detail').classList.remove('hidden');

      document.getElementById('detail-subject').textContent = selectedMsg.subject;
      document.getElementById('detail-id').textContent = selectedMsg.id;
      document.getElementById('detail-from-name').textContent = selectedMsg.fromName || selectedMsg.from;
      document.getElementById('detail-from').textContent = selectedMsg.from;
      document.getElementById('detail-to').textContent = selectedMsg.to;

      // Mailbox Badge
      const accKey = (selectedMsg.account || (selectedMsg.folder === 'sent' ? selectedMsg.from : selectedMsg.to) || '').toLowerCase();
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
      document.getElementById('detail-avatar').textContent = (selectedMsg.fromName || selectedMsg.from).charAt(0).toUpperCase();
      document.getElementById('detail-body').innerHTML = selectedMsg.html || escapeHtml(selectedMsg.text);

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
      renderList();
    }

    function switchFolder(f) {
      currentFolder = f;
      document.getElementById('folder-title').textContent = f.toUpperCase();
      document.getElementById('btn-inbox').className = f === 'inbox' ? 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium' : 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800';
      document.getElementById('btn-sent').className = f === 'sent' ? 'w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium' : 'w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800';
      switchTab('mail');
      toggleSidebar(false);
      backToList();
      loadMessages();
    }

    function switchTab(t) {
      if (t === 'dns') {
        document.getElementById('mail-view').classList.add('hidden');
        document.getElementById('dns-view').classList.remove('hidden');
      } else {
        document.getElementById('mail-view').classList.remove('hidden');
        document.getElementById('dns-view').classList.add('hidden');
      }
      toggleSidebar(false);
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

    // COMPOSE & ATTACHMENTS
    function openCompose() {
      if (currentAccount !== 'all') {
        document.getElementById('compose-from').value = currentAccount;
      }
      document.getElementById('compose-modal').classList.remove('hidden');
    }
    function closeCompose() {
      document.getElementById('compose-modal').classList.add('hidden');
      document.getElementById('send-alert').classList.add('hidden');
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
            document.getElementById('compose-to').value = '';
            document.getElementById('compose-cc').value = '';
            document.getElementById('compose-bcc').value = '';
            document.getElementById('compose-subject').value = '';
            document.getElementById('compose-body').value = '';
            hideField('cc');
            hideField('bcc');
            clearAttachments();
            loadMessages();
          }, 1500);
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

    // Initial load & periodic refresh
    loadMessages();
    setInterval(loadMessages, 15000);
  </script>
</body>
</html>`;
}
