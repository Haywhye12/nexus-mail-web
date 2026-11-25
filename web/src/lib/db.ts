import fs from 'fs';
import path from 'path';
import { Tenant, Domain, Mailbox, Message } from './types';

interface DatabaseSchema {
  tenants: Tenant[];
  domains: Domain[];
  mailboxes: Mailbox[];
  messages: Message[];
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const INITIAL_DATA: DatabaseSchema = {
  tenants: [
    {
      id: 'tenant_1',
      name: 'DevGeeksNexus Team',
      createdAt: new Date().toISOString(),
    },
  ],
  domains: [
    {
      id: 'dom_1',
      tenantId: 'tenant_1',
      domainName: 'devgeeksnexus.com',
      status: 'verified',
      createdAt: new Date().toISOString(),
      dnsRecords: [
        {
          type: 'MX',
          name: '@ (or devgeeksnexus.com)',
          value: 'route1.mx.cloudflare.net',
          priority: 10,
          purpose: 'MX (Receiving)',
          verified: true,
        },
        {
          type: 'MX',
          name: '@ (or devgeeksnexus.com)',
          value: 'route2.mx.cloudflare.net',
          priority: 20,
          purpose: 'MX (Receiving)',
          verified: true,
        },
        {
          type: 'TXT',
          name: '@ (or devgeeksnexus.com)',
          value: 'v=spf1 include:_spf.mx.cloudflare.net ~all',
          purpose: 'SPF (Sender Auth)',
          verified: true,
        },
        {
          type: 'TXT',
          name: '_dmarc.devgeeksnexus.com',
          value: 'v=DMARC1; p=none; sp=none; rua=mailto:dmarc@devgeeksnexus.com',
          purpose: 'DMARC (Policy)',
          verified: true,
        },
        {
          type: 'CNAME',
          name: 'mail._domainkey.devgeeksnexus.com',
          value: 'dkim.devgeeksnexus.com.cdn.cloudflare.net',
          purpose: 'DKIM (Cryptographic Sign)',
          verified: true,
        },
      ],
    },
  ],
  mailboxes: [
    {
      id: 'mbox_1',
      tenantId: 'tenant_1',
      domainId: 'dom_1',
      email: 'info@devgeeksnexus.com',
      name: 'DevGeeksNexus Info Desk',
      createdAt: new Date().toISOString(),
    },
  ],
  messages: [
    {
      id: 'msg_welcome',
      tenantId: 'tenant_1',
      mailboxId: 'mbox_1',
      folder: 'inbox',
      from: 'welcome@cloudflare.com',
      fromName: 'Nexus Mail Engine',
      to: 'info@devgeeksnexus.com',
      subject: 'Welcome to your custom domain email system!',
      text: 'Congratulations! Your independent custom domain email system for info@devgeeksnexus.com is ready. You can now send and receive emails directly without Gmail or Zoho.',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #4f46e5;">Welcome to Nexus Mail!</h2>
          <p>This is your brand new, independent email suite running for <strong>info@devgeeksnexus.com</strong>.</p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Status:</strong> Active & Ready</p>
            <p><strong>Mailbox:</strong> info@devgeeksnexus.com</p>
            <p><strong>Infrastructure:</strong> Cloudflare Email Routing + Webhook Engine</p>
          </div>
          <p>You can compose messages, connect new tenants/domains, and run this seamlessly on both Web and Desktop.</p>
        </div>
      `,
      isRead: false,
      isStarred: true,
      date: new Date().toISOString(),
      messageId: '<welcome_nexus_001@devgeeksnexus.com>',
      attachments: [],
    },
  ],
};

function readDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
      return INITIAL_DATA;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading DB file, returning initial schema:', err);
    return INITIAL_DATA;
  }
}

function writeDb(data: DatabaseSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing DB file:', err);
  }
}

export const db = {
  getTenants: () => readDb().tenants,
  getDomains: (tenantId?: string) => {
    const list = readDb().domains;
    return tenantId ? list.filter((d) => d.tenantId === tenantId) : list;
  },
  getDomainByName: (domainName: string) => {
    return readDb().domains.find((d) => d.domainName.toLowerCase() === domainName.toLowerCase());
  },
  getMailboxes: (tenantId?: string) => {
    const list = readDb().mailboxes;
    return tenantId ? list.filter((m) => m.tenantId === tenantId) : list;
  },
  getMailboxByEmail: (email: string) => {
    return readDb().mailboxes.find((m) => m.email.toLowerCase() === email.toLowerCase());
  },
  getMessages: (mailboxId?: string, folder?: string) => {
    let list = readDb().messages;
    if (mailboxId) list = list.filter((m) => m.mailboxId === mailboxId);
    if (folder) list = list.filter((m) => m.folder === folder);
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },
  getMessageById: (id: string) => {
    return readDb().messages.find((m) => m.id === id);
  },
  createMessage: (msg: Message) => {
    const data = readDb();
    data.messages.unshift(msg);
    writeDb(data);
    return msg;
  },
  markRead: (id: string, isRead: boolean = true) => {
    const data = readDb();
    const msg = data.messages.find((m) => m.id === id);
    if (msg) {
      msg.isRead = isRead;
      writeDb(data);
    }
    return msg;
  },
  toggleStar: (id: string) => {
    const data = readDb();
    const msg = data.messages.find((m) => m.id === id);
    if (msg) {
      msg.isStarred = !msg.isStarred;
      writeDb(data);
    }
    return msg;
  },
  deleteMessage: (id: string) => {
    const data = readDb();
    const msg = data.messages.find((m) => m.id === id);
    if (msg) {
      if (msg.folder === 'trash') {
        data.messages = data.messages.filter((m) => m.id !== id);
      } else {
        msg.folder = 'trash';
      }
      writeDb(data);
    }
    return msg;
  },
  addDomain: (tenantId: string, domainName: string) => {
    const data = readDb();
    const newDomain: Domain = {
      id: `dom_${Date.now()}`,
      tenantId,
      domainName,
      status: 'pending',
      createdAt: new Date().toISOString(),
      dnsRecords: [
        {
          type: 'MX',
          name: '@',
          value: 'route1.mx.cloudflare.net',
          priority: 10,
          purpose: 'MX (Receiving)',
          verified: false,
        },
        {
          type: 'MX',
          name: '@',
          value: 'route2.mx.cloudflare.net',
          priority: 20,
          purpose: 'MX (Receiving)',
          verified: false,
        },
        {
          type: 'TXT',
          name: '@',
          value: 'v=spf1 include:_spf.mx.cloudflare.net ~all',
          purpose: 'SPF (Sender Auth)',
          verified: false,
        },
        {
          type: 'TXT',
          name: `_dmarc.${domainName}`,
          value: `v=DMARC1; p=none; rua=mailto:dmarc@${domainName}`,
          purpose: 'DMARC (Policy)',
          verified: false,
        },
      ],
    };
    data.domains.push(newDomain);
    writeDb(data);
    return newDomain;
  },
};
