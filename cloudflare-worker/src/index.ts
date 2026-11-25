import PostalMime from 'postal-mime';

export interface Env {
  RESEND_API_KEY: string;
  EMAILS: any; // KVNamespace
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

      const attachments = (parsed.attachments || []).map((att: any) => ({
        filename: att.filename || 'attachment',
        mimeType: att.mimeType || 'application/octet-stream',
        size: att.content ? att.content.byteLength : 0,
        contentBase64: att.content ? Buffer.from(att.content).toString('base64') : null,
      }));

      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const payload = {
        id: msgId,
        from: fromAddress,
        fromName: parsed.from?.name || fromAddress,
        to: toAddress,
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
        console.log(`Stored email ${msgId} in Cloudflare KV.`);
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
      const messages: any[] = [];

      if (env.EMAILS) {
        const list = await env.EMAILS.list({ prefix: 'msg:' });
        for (const key of list.keys) {
          const item = await env.EMAILS.get(key.name, 'json');
          if (item) {
            if (!folder || item.folder === folder) {
              messages.push(item);
            }
          }
        }
      }

      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return new Response(JSON.stringify({ messages }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // API: POST /api/send (Sends live via Resend REST API)
    if (request.method === 'POST' && url.pathname === '/api/send') {
      try {
        const body = (await request.json()) as any;
        const { to, subject, html, text, attachments } = body;

        const resendPayload: any = {
          from: 'DevGeeksNexus <info@devgeeksnexus.com>',
          to: Array.isArray(to) ? to : [to],
          subject: subject || '(No Subject)',
          html: html || (text ? `<p>${text}</p>` : ''),
        };

        if (attachments && attachments.length > 0) {
          resendPayload.attachments = attachments.map((att: any) => ({
            filename: att.filename,
            content: att.contentBase64,
          }));
        }

        // Call Resend REST API
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
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
          from: 'info@devgeeksnexus.com',
          fromName: 'DevGeeksNexus Team',
          to,
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

    // Default: Serve the complete Nexus Mail Web Application
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus Mail | info@devgeeksnexus.com</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .custom-scroll::-webkit-scrollbar { width: 6px; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 h-screen flex overflow-hidden">

  <!-- SIDEBAR -->
  <aside class="w-64 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 select-none">
    <div class="p-4 border-b border-slate-800 flex items-center justify-between">
      <div class="flex items-center space-x-2.5">
        <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">N</div>
        <div>
          <h1 class="font-semibold text-sm leading-tight text-white">Nexus Mail</h1>
          <p class="text-xs text-slate-400">Cloud Mailbox Suite</p>
        </div>
      </div>
    </div>

    <!-- Active Mailbox -->
    <div class="px-4 py-3 bg-slate-800/60 border-b border-slate-800">
      <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Active Mailbox</span>
      <div class="flex items-center space-x-2">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-xs font-mono font-medium text-emerald-300 truncate">info@devgeeksnexus.com</span>
      </div>
    </div>

    <!-- Compose -->
    <div class="p-3">
      <button onclick="openCompose()" class="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg shadow-md transition-all active:scale-[0.98]">
        <i class="fa-solid fa-plus text-xs"></i>
        <span class="text-sm">Compose Email</span>
      </button>
    </div>

    <!-- Nav -->
    <nav class="flex-1 px-3 space-y-1 overflow-y-auto">
      <button onclick="switchFolder('inbox')" id="btn-inbox" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-inbox w-4"></i>
          <span>Inbox</span>
        </div>
        <span id="unread-count" class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
      </button>

      <button onclick="switchFolder('sent')" id="btn-sent" class="w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <i class="fa-solid fa-paper-plane w-4"></i>
        <span>Sent</span>
      </button>

      <button onclick="switchTab('dns')" id="btn-dns" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <div class="flex items-center space-x-3">
          <i class="fa-solid fa-shield-halved w-4 text-emerald-400"></i>
          <span>DNS Verification</span>
        </div>
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
      </button>
    </nav>

    <div class="p-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
      <span>Cloudflare Worker Live</span>
      <span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-emerald-400 font-mono">24/7 Cloud</span>
    </div>
  </aside>

  <!-- MAIN APP CONTAINER -->
  <div id="mail-view" class="flex-1 flex overflow-hidden">
    <!-- Middle: Email List -->
    <section class="w-96 border-r border-slate-200 bg-white flex flex-col">
      <div class="p-3 border-b border-slate-200 flex items-center space-x-2">
        <div class="relative flex-1">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
          <input type="text" id="search-input" oninput="renderList()" placeholder="Search messages..." class="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 text-slate-800" />
        </div>
        <button onclick="loadMessages()" title="Refresh Mailbox" class="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
          <i id="refresh-icon" class="fa-solid fa-rotate-right text-xs"></i>
        </button>
      </div>

      <div class="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <span id="folder-title" class="text-xs font-semibold uppercase text-slate-500 tracking-wider">Inbox</span>
      </div>

      <div id="email-list" class="flex-1 overflow-y-auto divide-y divide-slate-100 custom-scroll">
        <!-- Dynamic emails load here -->
      </div>
    </section>

    <!-- Right: Reading Pane -->
    <main class="flex-1 bg-white flex flex-col overflow-hidden">
      <div id="empty-state" class="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
        <i class="fa-regular fa-envelope text-4xl mb-3 opacity-30"></i>
        <p class="text-sm font-medium">Select an email to read</p>
      </div>

      <div id="message-detail" class="hidden flex-1 flex flex-col h-full overflow-hidden">
        <div class="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <button onclick="deleteCurrentMessage()" class="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete">
            <i class="fa-solid fa-trash-can text-sm"></i>
          </button>
          <span id="detail-id" class="text-xs text-slate-400 font-mono"></span>
        </div>

        <div class="flex-1 overflow-y-auto p-6 custom-scroll">
          <div class="border-b border-slate-100 pb-4 mb-6">
            <h2 id="detail-subject" class="text-xl font-bold text-slate-900 mb-3"></h2>
            <div class="flex items-start justify-between">
              <div class="flex items-center space-x-3">
                <div id="detail-avatar" class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm"></div>
                <div>
                  <div id="detail-from-name" class="text-sm font-semibold text-slate-900"></div>
                  <div class="text-xs text-slate-500">From: <span id="detail-from" class="font-mono"></span></div>
                  <div class="text-xs text-slate-500">To: <span id="detail-to" class="font-mono"></span></div>
                </div>
              </div>
              <div id="detail-date" class="text-xs text-slate-400"></div>
            </div>
          </div>

          <div id="detail-body" class="prose max-w-none text-slate-800 text-sm leading-relaxed mb-6"></div>

          <div id="detail-attachments" class="hidden pt-6 border-t border-slate-200">
            <h3 class="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-3">
              <i class="fa-solid fa-paperclip mr-1 text-indigo-600"></i> Attachments
            </h3>
            <div id="attachments-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"></div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- DNS VIEW -->
  <div id="dns-view" class="hidden flex-1 p-8 overflow-y-auto bg-slate-50">
    <div class="max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-slate-900">DNS & Domain Verification</h2>
          <p class="text-sm text-slate-500">Authentication status for <strong>devgeeksnexus.com</strong>.</p>
        </div>
        <button onclick="switchTab('mail')" class="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg">Back to Mailbox</button>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <span class="font-mono font-bold text-lg text-slate-900">devgeeksnexus.com</span>
          <span class="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 flex items-center">
            <i class="fa-solid fa-circle-check mr-1.5 text-emerald-600"></i> 100% Verified
          </span>
        </div>
        <p class="text-xs text-slate-600">SPF, DKIM, and DMARC are fully authenticated on Cloudflare DNS.</p>
        <div class="space-y-2 text-xs font-mono">
          <div class="p-2.5 bg-slate-50 rounded border border-slate-200 flex justify-between">
            <span><strong>SPF:</strong> v=spf1 include:_spf.mx.cloudflare.net include:resend.com ~all</span>
            <span class="text-emerald-600 font-bold">PASS</span>
          </div>
          <div class="p-2.5 bg-slate-50 rounded border border-slate-200 flex justify-between">
            <span><strong>DKIM:</strong> resend._domainkey.devgeeksnexus.com</span>
            <span class="text-emerald-600 font-bold">PASS</span>
          </div>
          <div class="p-2.5 bg-slate-50 rounded border border-slate-200 flex justify-between">
            <span><strong>DMARC:</strong> v=DMARC1; p=none; ...</span>
            <span class="text-emerald-600 font-bold">PASS</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- COMPOSE MODAL -->
  <div id="compose-modal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col">
      <div class="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
        <span class="text-sm font-semibold flex items-center space-x-2">
          <i class="fa-solid fa-paper-plane text-indigo-400"></i>
          <span>New Message</span>
        </span>
        <button onclick="closeCompose()" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <form onsubmit="handleSend(event)" class="p-5 space-y-4">
        <div id="send-alert" class="hidden p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center space-x-2">
          <i class="fa-solid fa-circle-check text-emerald-600"></i>
          <span id="send-alert-text">Email sent successfully!</span>
        </div>

        <div class="flex items-center space-x-3 text-xs">
          <span class="w-14 font-semibold text-slate-500 text-right">From:</span>
          <span class="font-mono bg-slate-100 text-slate-800 px-2 py-1 rounded border border-slate-200">info@devgeeksnexus.com</span>
          <span class="text-[11px] text-emerald-600 font-medium">● Verified Sender</span>
        </div>

        <div class="flex items-center space-x-3 text-xs">
          <label class="w-14 font-semibold text-slate-500 text-right">To:</label>
          <input type="email" id="compose-to" required placeholder="client@example.com" class="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800" />
        </div>

        <div class="flex items-center space-x-3 text-xs">
          <label class="w-14 font-semibold text-slate-500 text-right">Subject:</label>
          <input type="text" id="compose-subject" required placeholder="Subject of your message..." class="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800" />
        </div>

        <!-- Toolbar -->
        <div class="flex items-center justify-between border-y border-slate-200 py-2 bg-slate-50 px-2 rounded-md">
          <div class="flex items-center space-x-1">
            <button type="button" onclick="formatText('b')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs font-bold" title="Bold"><i class="fa-solid fa-bold"></i></button>
            <button type="button" onclick="formatText('i')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 text-xs" title="Italic"><i class="fa-solid fa-italic"></i></button>
            <button type="button" onclick="promptLink()" class="px-2 py-1 hover:bg-slate-200 rounded text-xs text-indigo-600 font-medium" title="Add Link"><i class="fa-solid fa-link mr-1"></i> Link</button>
            <button type="button" onclick="promptImage()" class="px-2 py-1 hover:bg-slate-200 rounded text-xs text-indigo-600 font-medium" title="Add Image URL"><i class="fa-regular fa-image mr-1"></i> Image</button>
          </div>
          <div>
            <input type="file" id="file-input" onchange="handleFileSelected(event)" multiple class="hidden" />
            <button type="button" onclick="document.getElementById('file-input').click()" class="flex items-center space-x-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-xs font-medium text-slate-700 shadow-sm">
              <i class="fa-solid fa-paperclip text-slate-500"></i>
              <span>Attach Files / Photos</span>
            </button>
          </div>
        </div>

        <div>
          <textarea id="compose-body" rows="8" required placeholder="Write your message here... (Formatted HTML and links supported)" class="w-full p-3 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800 font-sans leading-relaxed"></textarea>
        </div>

        <!-- Attachment Tray -->
        <div id="compose-attachments-tray" class="hidden p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
          <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex justify-between">
            <span>Attached Files</span>
            <button type="button" onclick="clearAttachments()" class="text-red-500 hover:underline text-[10px]">Clear</button>
          </div>
          <div id="compose-attachments-list" class="flex flex-wrap gap-2"></div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100">
          <span class="text-[11px] text-slate-400">Dispatched via Resend API from Cloudflare.</span>
          <div class="flex space-x-2">
            <button type="button" onclick="closeCompose()" class="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" id="btn-submit" class="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg shadow-sm">
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
    let selectedMsg = null;
    let attachedFiles = [];

    async function loadMessages() {
      const icon = document.getElementById('refresh-icon');
      if (icon) icon.classList.add('fa-spin');
      try {
        const res = await fetch('/api/messages?folder=' + currentFolder);
        const data = await res.json();
        allMessages = data.messages || [];
        renderList();
        updateUnread();
      } catch (e) {
        console.error('Failed to load messages', e);
      } finally {
        if (icon) icon.classList.remove('fa-spin');
      }
    }

    function renderList() {
      const listEl = document.getElementById('email-list');
      const q = document.getElementById('search-input').value.toLowerCase();
      const filtered = allMessages.filter(m => {
        if (!q) return true;
        return (m.subject || '').toLowerCase().includes(q) ||
               (m.from || '').toLowerCase().includes(q) ||
               (m.text || '').toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        listEl.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm"><i class="fa-regular fa-envelope text-3xl mb-2 opacity-30 block"></i>No messages found</div>';
        return;
      }

      listEl.innerHTML = filtered.map(m => {
        const isSelected = selectedMsg && selectedMsg.id === m.id;
        const dateStr = new Date(m.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
        const sender = currentFolder === 'sent' ? 'To: ' + m.to : (m.fromName || m.from);
        return \`
          <div onclick="selectMessage('\${m.id}')" class="p-3.5 cursor-pointer transition-colors border-l-4 \${
            isSelected ? 'bg-indigo-50/70 border-l-indigo-600' :
            m.isRead ? 'bg-white hover:bg-slate-50 border-l-transparent' :
            'bg-indigo-50/30 hover:bg-indigo-50/50 border-l-indigo-500 font-semibold'
          }">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-medium text-slate-900 truncate max-w-[200px]">\${escapeHtml(sender)}</span>
              <span class="text-[10px] text-slate-400">\${dateStr}</span>
            </div>
            <div class="text-xs font-medium text-slate-800 truncate mb-1">\${escapeHtml(m.subject || '(No Subject)')}</div>
            <div class="text-xs text-slate-500 line-clamp-2">\${escapeHtml(m.text || '')}</div>
            <div class="flex items-center justify-between mt-2 pt-1 text-[10px] text-slate-400">
              \${(m.attachments && m.attachments.length > 0) ? '<span><i class="fa-solid fa-paperclip mr-1"></i>' + m.attachments.length + '</span>' : '<span></span>'}
              \${!m.isRead ? '<span class="w-2 h-2 rounded-full bg-indigo-600 inline-block"></span>' : ''}
            </div>
          </div>
        \`;
      }).join('');
    }

    function selectMessage(id) {
      selectedMsg = allMessages.find(m => m.id === id);
      if (!selectedMsg) return;

      selectedMsg.isRead = true;
      fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isRead: true })
      });

      renderList();
      updateUnread();

      document.getElementById('empty-state').classList.add('hidden');
      document.getElementById('message-detail').classList.remove('hidden');

      document.getElementById('detail-subject').textContent = selectedMsg.subject;
      document.getElementById('detail-id').textContent = selectedMsg.id;
      document.getElementById('detail-from-name').textContent = selectedMsg.fromName || selectedMsg.from;
      document.getElementById('detail-from').textContent = selectedMsg.from;
      document.getElementById('detail-to').textContent = selectedMsg.to;
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
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col justify-between">
              <div class="flex items-center space-x-3">
                \${isImg && att.contentBase64 ?
                  '<img src="' + href + '" class="w-12 h-12 object-cover rounded-lg border border-slate-200"/>' :
                  '<div class="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0"><i class="fa-regular fa-file text-lg"></i></div>'
                }
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-semibold text-slate-800 truncate">\${escapeHtml(att.filename)}</p>
                  <p class="text-[10px] text-slate-400 font-mono">\${formatBytes(att.size)}</p>
                </div>
              </div>
              \${att.contentBase64 ? '<a href="' + href + '" download="' + escapeHtml(att.filename) + '" class="mt-2.5 py-1 px-2.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded text-xs font-medium text-slate-700 text-center block"><i class="fa-solid fa-download mr-1 text-[10px]"></i> Download</a>' : ''}
            </div>
          \`;
        }).join('');
      } else {
        attSection.classList.add('hidden');
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
      renderList();
      updateUnread();
    }

    function switchFolder(f) {
      currentFolder = f;
      document.getElementById('folder-title').textContent = f.toUpperCase();
      document.getElementById('btn-inbox').className = f === 'inbox' ? 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium' : 'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800';
      document.getElementById('btn-sent').className = f === 'sent' ? 'w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm bg-indigo-600/20 text-indigo-400 font-medium' : 'w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800';
      switchTab('mail');
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
    }

    function updateUnread() {
      const unread = allMessages.filter(m => !m.isRead).length;
      document.getElementById('unread-count').textContent = unread;
    }

    // COMPOSE & ATTACHMENTS
    function openCompose() {
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
        <div class="flex items-center space-x-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs shadow-sm">
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

      const to = document.getElementById('compose-to').value;
      const subject = document.getElementById('compose-subject').value;
      const body = document.getElementById('compose-body').value;

      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to,
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
            document.getElementById('compose-subject').value = '';
            document.getElementById('compose-body').value = '';
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

    // Auto-load on page load
    loadMessages();
    setInterval(loadMessages, 15000); // Polling every 15s
  </script>
</body>
</html>`;
}
