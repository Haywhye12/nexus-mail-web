export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export interface Domain {
  id: string;
  tenantId: string;
  domainName: string; // e.g. "devgeeksnexus.com"
  status: 'pending' | 'verified' | 'failed';
  dnsRecords: {
    type: 'MX' | 'TXT' | 'CNAME';
    name: string;
    value: string;
    priority?: number;
    purpose: 'MX (Receiving)' | 'SPF (Sender Auth)' | 'DKIM (Cryptographic Sign)' | 'DMARC (Policy)';
    verified: boolean;
  }[];
  createdAt: string;
}

export interface Mailbox {
  id: string;
  tenantId: string;
  domainId: string;
  email: string; // e.g. "info@devgeeksnexus.com"
  name: string;
  createdAt: string;
}

export interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  contentBase64?: string | null;
}

export interface Message {
  id: string;
  tenantId: string;
  mailboxId: string;
  folder: 'inbox' | 'sent' | 'drafts' | 'trash';
  from: string;
  fromName?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html: string;
  isRead: boolean;
  isStarred: boolean;
  date: string;
  messageId: string;
  attachments: Attachment[];
}
