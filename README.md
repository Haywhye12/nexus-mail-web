# Nexus Mail 📬

A modern **Multi-Tenant Desktop & Web Email Client** designed for sending and receiving emails from your own verified domain (e.g., **`info@devgeeksnexus.com`**) without paying for or using Google Workspace (Gmail) or Zoho Mail.

---

## 🏗 Architecture

```
[ Incoming Email from Internet ]
               │
               ▼
   [ Cloudflare Email Routing ]
               │ (100% Free MX Server)
               ▼
   [ Cloudflare Email Worker ]
               │ (Parses MIME & attachments to JSON)
               ▼ POST
   [ Web App Inbound API: /api/inbound ]
               │
       ┌───────┴───────┐
       ▼               ▼
[ Web Client ]   [ Desktop App ]
 (Next.js/React)   (Electron/Tauri)
```

---

## 📁 Project Structure

```
nexus-mail/
├── cloudflare-worker/       # Cloudflare Email Routing Worker (Inbound receiver)
│   ├── src/index.ts         # Inbound email MIME parser & Webhook poster
│   └── wrangler.jsonc       # Worker configuration
├── web/                     # Fullstack Web App (Next.js + Tailwind CSS)
│   ├── src/app/page.tsx     # Inbox, Sent, Composer, & Domain DNS UI
│   └── src/app/api/         # Inbound webhook, Send mail, Messages API
├── desktop/                 # Desktop application wrapper
│   ├── main.js              # Native window & system tray notifications
│   └── package.json
├── docs/                    # Step-by-step guides
│   └── CLOUDFLARE_DNS_SETUP.md # DNS records for devgeeksnexus.com
└── scripts/
    └── test-inbound.js      # Simulation script to test incoming mail
```

---

## 🚀 Quick Start (Running Locally)

### 1. Install & Start the Web App
```bash
cd web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Test Receiving an Inbound Email
In another terminal, run:
```bash
node scripts/test-inbound.js
```
Refresh your browser or look at your inbox — the test email to `info@devgeeksnexus.com` will appear instantly!

### 3. Launch the Desktop App
```bash
cd desktop
npm install
npm start
```

---

## 🌐 Setting Up Your Domain (`devgeeksnexus.com`) on Cloudflare

Refer to the full guide in [docs/CLOUDFLARE_DNS_SETUP.md](docs/CLOUDFLARE_DNS_SETUP.md) to add the required **MX**, **SPF**, and **DMARC** records to your Cloudflare account.
