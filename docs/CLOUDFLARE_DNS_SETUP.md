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

## Part 4: Multi-Account Email Routing (Inbound)

To receive emails across all three accounts (`info@`, `ayomidebobani@`, `admin@`), configure Cloudflare Email Routing rules:

1. Open **Cloudflare Dashboard** $\rightarrow$ select domain **`devgeeksnexus.com`**.
2. Go to **Email** $\rightarrow$ **Email Routing** $\rightarrow$ **Routing Rules**.
3. You have two convenient options:

### Option A: Catch-All Rule (Recommended - 1 Click)
- Scroll to the **Catch-all address** card.
- Set **Action**: `Send to Worker`.
- Set **Destination**: `nexus-mail-web`.
- Click **Save**.
- *This will automatically route all emails addressed to `@devgeeksnexus.com` (including `ayomidebobani@`, `admin@`, and `info@`) directly into your Nexus Mail app!*

### Option B: Individual Custom Addresses
Under **Custom addresses**, click **Create address** for each:
1. **`info@devgeeksnexus.com`** $\rightarrow$ Action: `Send to Worker` $\rightarrow$ `nexus-mail-web`.
2. **`ayomidebobani@devgeeksnexus.com`** $\rightarrow$ Action: `Send to Worker` $\rightarrow$ `nexus-mail-web`.
3. **`admin@devgeeksnexus.com`** $\rightarrow$ Action: `Send to Worker` $\rightarrow$ `nexus-mail-web`.

---

## Part 5: Testing Multi-Account Web Mail

1. Open the live web app: **[https://nexus-mail-web.ayomidebobani.workers.dev](https://nexus-mail-web.ayomidebobani.workers.dev)**
2. In the sidebar under **Mailbox Accounts**, click to switch between:
   - **All Mailboxes** (unified view with color badges)
   - **Info Desk** (`info@devgeeksnexus.com`)
   - **Ayomide Bobani** (`ayomidebobani@devgeeksnexus.com`)
   - **Administrator** (`admin@devgeeksnexus.com`)
3. Click **Compose Email**:
   - The **From** dropdown lets you pick which account sends the email (`info@`, `ayomidebobani@`, or `admin@`).
   - Fill in **To**, optional **Cc**, **Bcc**, subject, and body, then click **Send Email**.
   - Resend dispatches the email using cryptographic DKIM & SPF authentication for that address.
4. Send incoming test emails to `ayomidebobani@devgeeksnexus.com` or `admin@devgeeksnexus.com` $\rightarrow$ they will appear in their respective mailboxes with real-time badges!
