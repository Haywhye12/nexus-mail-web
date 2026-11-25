import PostalMime from 'postal-mime';

export interface Env {
  WEBHOOK_URL: string;
  WEBHOOK_SECRET: string;
}

export default {
  async email(message: any, env: Env, ctx: any): Promise<void> {
    try {
      // Read the raw email stream from Cloudflare
      const rawEmail = new Response(message.raw);
      const arrayBuffer = await rawEmail.arrayBuffer();

      // Parse full MIME email (subject, body, html, attachments)
      const parser = new PostalMime();
      const parsed = await parser.parse(arrayBuffer);

      // Extract recipients (can be array or string)
      const toAddress = message.to || (parsed.to && parsed.to[0]?.address) || 'unknown';
      const fromAddress = message.from || (parsed.from?.address) || 'unknown';

      // Process attachments safely
      const attachments = (parsed.attachments || []).map((att: any) => ({
        filename: att.filename || 'attachment',
        mimeType: att.mimeType || 'application/octet-stream',
        size: att.content ? att.content.byteLength : 0,
        contentBase64: att.content ? Buffer.from(att.content).toString('base64') : null,
      }));

      const payload = {
        from: fromAddress,
        fromName: parsed.from?.name || fromAddress,
        to: toAddress,
        subject: parsed.subject || '(No Subject)',
        text: parsed.text || '',
        html: parsed.html || (parsed.text ? `<pre>${parsed.text}</pre>` : ''),
        date: parsed.date || new Date().toISOString(),
        messageId: parsed.messageId || `msg_${Date.now()}`,
        attachments,
      };

      // POST to your Web/Desktop App Backend Inbound Webhook
      const response = await fetch(env.WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': env.WEBHOOK_SECRET || '',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Inbound webhook error: ${response.status} - ${errorText}`);
      } else {
        console.log(`Successfully routed email for ${toAddress} to Webhook.`);
      }
    } catch (err: any) {
      console.error('Fatal error parsing or forwarding email:', err.message || err);
    }
  },
};
