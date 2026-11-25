# Cloudflare DNS & Email Routing Configuration for `devgeeksnexus.com`

This guide explains step-by-step how to verify your domain (`devgeeksnexus.com`) on Cloudflare so you can send and receive emails from **`info@devgeeksnexus.com`** completely free.

---

## Part 1: DNS Records to Add in Cloudflare

Log in to your **[Cloudflare Dashboard](https://dash.cloudflare.com/)**, select **`devgeeksnexus.com`**, and go to **DNS $\rightarrow$ Records**.

Add the following records:

### 1. Inbound MX Records (Receiving Emails)
These tell the internet to route incoming mail for `@devgeeksnexus.com` through Cloudflare:

| Type | Name | Target / Mail Server | Priority | Proxy Status |
| :--- | :--- | :--- | :--- | :--- |
| **MX** | `@` (or `devgeeksnexus.com`) | `route1.mx.cloudflare.net` | `10` | DNS only |
| **MX** | `@` (or `devgeeksnexus.com`) | `route2.mx.cloudflare.net` | `20` | DNS only |
| **MX** | `@` (or `devgeeksnexus.com`) | `route3.mx.cloudflare.net` | `30` | DNS only |

---

### 2. SPF Record (Sender Policy Framework)
Verifies that emails sent from your domain are authorized (prevents spammers from faking your address):

| Type | Name | Content | Proxy Status |
| :--- | :--- | :--- | :--- |
| **TXT** | `@` (or `devgeeksnexus.com`) | `v=spf1 include:_spf.mx.cloudflare.net ~all` | DNS only |

*(If you are sending outbound through Brevo or Resend, add their include tag as well, e.g. `v=spf1 include:_spf.mx.cloudflare.net include:sendinblue.com ~all`)*

---

### 3. DMARC Record (Domain-based Message Authentication)
Protects your domain reputation and instructs mailboxes like Gmail to accept your emails:

| Type | Name | Content | Proxy Status |
| :--- | :--- | :--- | :--- |
| **TXT** | `_dmarc` | `v=DMARC1; p=none; sp=none; rua=mailto:info@devgeeksnexus.com;` | DNS only |

---

## Part 2: Connect Cloudflare Email Routing to your Inbound Worker

1. In your Cloudflare Dashboard, navigate to **Email $\rightarrow$ Email Routing**.
2. Click **Enable Email Routing**.
3. Go to the **Routing Rules** tab:
   - Click **Create Rule**.
   - **Custom address:** Enter `info` (creating `info@devgeeksnexus.com`) or select `Catch-all` (routes all addresses like `info@`, `support@`, `sales@`).
   - **Action:** Select **Send to Worker**.
   - **Destination Worker:** Choose `nexus-mail-inbound-worker`.
   - Click **Save**.

---

## Part 3: Deploy the Inbound Worker

In `nexus-mail/cloudflare-worker`:

1. Update `wrangler.jsonc` with your production webhook URL:
   ```jsonc
   {
     "vars": {
       "WEBHOOK_URL": "https://your-nexus-mail-web.vercel.app/api/inbound",
       "WEBHOOK_SECRET": "nexus_mail_secret_change_in_production"
     }
   }
   ```
2. Deploy to Cloudflare:
   ```bash
   npx wrangler deploy
   ```

---

## Part 4: Testing

1. Send an email from your personal Gmail or phone to `info@devgeeksnexus.com`.
2. Cloudflare receives the email $\rightarrow$ passes it to `nexus-mail-inbound-worker`.
3. The Worker parses the email and triggers `POST /api/inbound`.
4. Open your **Nexus Mail** desktop or web app — the message will appear right inside your Inbox!
