import PostalMime from 'postal-mime';

export interface Env {
  WEBHOOK_URL: string;
  WEBHOOK_SECRET: string;
  EMAILS: any; // KVNamespace
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-secret',
};

export default {
  // 1. INBOUND EMAIL HANDLER (Cloudflare Email Routing)
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
        mailboxId: 'mbox_1',
        tenantId: 'tenant_1',
      };

      // 1. Permanently store in Cloudflare KV storage
      if (env.EMAILS) {
        await env.EMAILS.put(`msg:${payload.date}:${msgId}`, JSON.stringify(payload));
        console.log(`Stored email ${msgId} in Cloudflare KV.`);
      }

      // 2. Also forward to webhook if configured
      if (env.WEBHOOK_URL) {
        fetch(env.WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': env.WEBHOOK_SECRET || '',
          },
          body: JSON.stringify(payload),
        }).catch((err) => console.error('Webhook forward failed (expected if local):', err.message));
      }
    } catch (err: any) {
      console.error('Fatal error in email handler:', err.message || err);
    }
  },

  // 2. HTTP FETCH API (Allows Web & Desktop App to Read Cloudflare Emails)
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Endpoint: GET /api/messages - returns all emails stored in Cloudflare KV
    if (url.pathname === '/api/messages' || url.pathname === '/') {
      if (!env.EMAILS) {
        return new Response(JSON.stringify({ messages: [] }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const list = await env.EMAILS.list({ prefix: 'msg:' });
      const messages: any[] = [];

      for (const key of list.keys) {
        const item = await env.EMAILS.get(key.name, 'json');
        if (item) messages.push(item);
      }

      // Sort newest first
      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return new Response(JSON.stringify({ messages }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Endpoint: DELETE /api/messages/:id
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/messages/')) {
      const id = url.pathname.split('/').pop();
      if (id && env.EMAILS) {
        const list = await env.EMAILS.list({ prefix: 'msg:' });
        const target = list.keys.find((k: any) => k.name.endsWith(id));
        if (target) {
          await env.EMAILS.delete(target.name);
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Nexus Mail Cloudflare Inbound API', {
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
    });
  },
};
