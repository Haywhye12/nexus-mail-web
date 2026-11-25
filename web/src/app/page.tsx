'use client';

import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Send,
  Trash2,
  Star,
  Globe,
  Plus,
  RefreshCw,
  Mail,
  Search,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Copy,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { Message, Mailbox, Domain } from '@/lib/types';

export default function MailApp() {
  const [activeTab, setActiveTab] = useState<'mail' | 'domains'>('mail');
  const [currentFolder, setCurrentFolder] = useState<'inbox' | 'sent' | 'trash'>('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>('mbox_1');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Compose Modal State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendSuccessNote, setSendSuccessNote] = useState<string | null>(null);

  // New Domain Modal
  const [isNewDomainOpen, setIsNewDomainOpen] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages?mailboxId=${selectedMailboxId}&folder=${currentFolder}`);
      const data = await res.json();
      setMessages(data.messages || []);
      setMailboxes(data.mailboxes || []);
      setDomains(data.domains || []);
      if (data.messages?.length > 0 && !selectedMessage) {
        setSelectedMessage(data.messages[0]);
      }
    } catch (err) {
      console.error('Failed to load messages', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [currentFolder, selectedMailboxId]);

  const handleSelectMessage = async (msg: Message) => {
    setSelectedMessage(msg);
    if (!msg.isRead) {
      await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: msg.id, isRead: true }),
      });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)));
    }
  };

  const handleToggleStar = async (e: React.MouseEvent, msgId: string) => {
    e.stopPropagation();
    await fetch('/api/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msgId, action: 'toggleStar' }),
    });
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, isStarred: !m.isStarred } : m))
    );
    if (selectedMessage && selectedMessage.id === msgId) {
      setSelectedMessage((prev) => (prev ? { ...prev, isStarred: !prev.isStarred } : null));
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    await fetch('/api/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msgId, action: 'delete' }),
    });
    const updated = messages.filter((m) => m.id !== msgId);
    setMessages(updated);
    setSelectedMessage(updated.length > 0 ? updated[0] : null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo || !composeSubject) return;

    setSending(true);
    try {
      const activeMailbox = mailboxes.find((m) => m.id === selectedMailboxId) || mailboxes[0];
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: activeMailbox ? activeMailbox.email : 'info@devgeeksnexus.com',
          fromName: 'DevGeeksNexus Team',
          to: composeTo,
          subject: composeSubject,
          text: composeBody,
          html: `<p>${composeBody.replace(/\\n/g, '<br/>')}</p>`,
          mailboxId: selectedMailboxId,
        }),
      });

      const result = await res.json();
      if (result.success) {
        setSendSuccessNote(`Email successfully sent! ${result.delivery?.note || ''}`);
        setTimeout(() => {
          setIsComposeOpen(false);
          setComposeTo('');
          setComposeSubject('');
          setComposeBody('');
          setSendSuccessNote(null);
          fetchMessages();
        }, 1500);
      }
    } catch (err) {
      alert('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName) return;
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName: newDomainName }),
      });
      const data = await res.json();
      if (data.domain) {
        setDomains((prev) => [...prev, data.domain]);
        setIsNewDomainOpen(false);
        setNewDomainName('');
      }
    } catch (err) {
      alert('Failed to add domain');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredMessages = messages.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.subject.toLowerCase().includes(q) ||
      m.from.toLowerCase().includes(q) ||
      m.text.toLowerCase().includes(q)
    );
  });

  const activeMailbox = mailboxes.find((m) => m.id === selectedMailboxId) || mailboxes[0] || {
    email: 'info@devgeeksnexus.com',
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800">
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 select-none">
        {/* App Title & Identity */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
              N
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-tight text-white">Nexus Mail</h1>
              <p className="text-xs text-slate-400">Custom Domain Suite</p>
            </div>
          </div>
        </div>

        {/* Current Active Mailbox Indicator */}
        <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-800">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Active Mailbox
          </label>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-xs font-mono font-medium text-emerald-300 truncate">
              {activeMailbox.email}
            </span>
          </div>
        </div>

        {/* Compose Button */}
        <div className="p-3">
          <button
            onClick={() => setIsComposeOpen(true)}
            className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg shadow-md transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Compose Email</span>
          </button>
        </div>

        {/* Navigation Folders */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          <button
            onClick={() => {
              setActiveTab('mail');
              setCurrentFolder('inbox');
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === 'mail' && currentFolder === 'inbox'
                ? 'bg-indigo-600/20 text-indigo-400 font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Inbox className="w-4 h-4" />
              <span>Inbox</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              {messages.filter((m) => !m.isRead).length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('mail');
              setCurrentFolder('sent');
            }}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === 'mail' && currentFolder === 'sent'
                ? 'bg-indigo-600/20 text-indigo-400 font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Sent</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('mail');
              setCurrentFolder('trash');
            }}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === 'mail' && currentFolder === 'trash'
                ? 'bg-indigo-600/20 text-indigo-400 font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>Trash</span>
          </button>

          <div className="pt-4 pb-1">
            <span className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Domain Management
            </span>
          </div>

          <button
            onClick={() => setActiveTab('domains')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === 'domains'
                ? 'bg-indigo-600/20 text-indigo-400 font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Globe className="w-4 h-4" />
              <span>DNS & Domains</span>
            </div>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </button>
        </nav>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span>Desktop & Web</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
            v1.0.0
          </span>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      {activeTab === 'mail' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Middle List: Email List */}
          <section className="w-96 border-r border-slate-200 bg-white flex flex-col">
            {/* Search & Actions Bar */}
            <div className="p-3 border-b border-slate-200 flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
                />
              </div>
              <button
                onClick={fetchMessages}
                disabled={loading}
                title="Refresh mailbox"
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Folder Header */}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                {currentFolder} ({filteredMessages.length})
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredMessages.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No messages in this folder</p>
                </div>
              ) : (
                filteredMessages.map((msg) => (
                  <div
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg)}
                    className={`p-3.5 cursor-pointer transition-colors border-l-4 ${
                      selectedMessage?.id === msg.id
                        ? 'bg-indigo-50/60 border-l-indigo-600'
                        : msg.isRead
                        ? 'bg-white hover:bg-slate-50 border-l-transparent'
                        : 'bg-indigo-50/20 hover:bg-indigo-50/40 border-l-indigo-400 font-semibold'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-900 truncate">
                        {currentFolder === 'sent' ? `To: ${msg.to}` : msg.fromName || msg.from}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(msg.date).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-slate-800 truncate mb-1">
                      {msg.subject}
                    </div>
                    <div className="text-xs text-slate-500 line-clamp-2">
                      {msg.text || 'No preview available'}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-1">
                      <button
                        onClick={(e) => handleToggleStar(e, msg.id)}
                        className="text-slate-400 hover:text-amber-500"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            msg.isStarred ? 'fill-amber-400 text-amber-500' : ''
                          }`}
                        />
                      </button>
                      {!msg.isRead && (
                        <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Right Pane: Message Viewer */}
          <main className="flex-1 bg-white flex flex-col overflow-hidden">
            {selectedMessage ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Header Actions */}
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleDeleteMessage(selectedMessage.id)}
                      className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete Message"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-slate-400">
                    Message ID: <span className="font-mono">{selectedMessage.id}</span>
                  </div>
                </div>

                {/* Email Body */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Email Headers */}
                  <div className="border-b border-slate-100 pb-4 mb-6">
                    <h2 className="text-xl font-bold text-slate-900 mb-3">
                      {selectedMessage.subject}
                    </h2>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                          {(selectedMessage.fromName || selectedMessage.from)
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {selectedMessage.fromName || selectedMessage.from}
                          </div>
                          <div className="text-xs text-slate-500">
                            From: <span className="font-mono">{selectedMessage.from}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            To: <span className="font-mono">{selectedMessage.to}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(selectedMessage.date).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* HTML Content */}
                  <div
                    className="prose max-w-none text-slate-700 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: selectedMessage.html }}
                  />

                  {/* Attachments Section if present */}
                  {selectedMessage.attachments?.length > 0 && (
                    <div className="mt-8 pt-4 border-t border-slate-100">
                      <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-2">
                        Attachments ({selectedMessage.attachments.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedMessage.attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center space-x-2 text-xs"
                          >
                            <Mail className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-800">{att.filename}</span>
                            <span className="text-[10px] text-slate-400">
                              ({(att.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                <Mail className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">Select a message to view details</p>
              </div>
            )}
          </main>
        </div>
      ) : (
        /* 3. DOMAIN & DNS MANAGEMENT VIEW */
        <main className="flex-1 bg-slate-50 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Custom Domains & DNS</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Manage domain verification records for Cloudflare Email Routing and multi-tenancy.
                </p>
              </div>
              <button
                onClick={() => setIsNewDomainOpen(true)}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 px-3.5 rounded-lg shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Tenant Domain</span>
              </button>
            </div>

            {/* Domains List */}
            {domains.map((domain) => (
              <div
                key={domain.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Domain Card Header */}
                <div className="p-4 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Globe className="w-5 h-5 text-indigo-600" />
                    <span className="font-mono font-bold text-base text-slate-900">
                      {domain.domainName}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        domain.status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {domain.status === 'verified' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Verified
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" /> Pending DNS
                        </>
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Host: <span className="font-semibold text-slate-700">Cloudflare</span>
                  </div>
                </div>

                {/* DNS Records Table */}
                <div className="p-5 space-y-4">
                  <p className="text-xs text-slate-600">
                    Add the following DNS records in your Cloudflare dashboard for{' '}
                    <strong className="text-slate-900">{domain.domainName}</strong>:
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Purpose</th>
                          <th className="py-2.5 px-3">Name / Host</th>
                          <th className="py-2.5 px-3">Value / Target</th>
                          <th className="py-2.5 px-3">Priority</th>
                          <th className="py-2.5 px-3 text-right">Copy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {domain.dnsRecords.map((rec, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3">
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">
                                {rec.type}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-sans text-slate-600">
                              {rec.purpose}
                            </td>
                            <td className="py-2.5 px-3 text-slate-800">{rec.name}</td>
                            <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                              {rec.value}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">
                              {rec.priority !== undefined ? rec.priority : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() =>
                                  copyToClipboard(rec.value, `${domain.id}_${idx}`)
                                }
                                className="p-1 text-slate-400 hover:text-indigo-600"
                                title="Copy Value"
                              >
                                {copiedKey === `${domain.id}_${idx}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* 4. COMPOSE EMAIL MODAL */}
      {isComposeOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center space-x-2">
                <Send className="w-4 h-4 text-indigo-400" />
                <span>New Message</span>
              </span>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Compose Form */}
            <form onSubmit={handleSendMessage} className="p-5 space-y-4">
              {sendSuccessNote && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{sendSuccessNote}</span>
                </div>
              )}

              {/* From (Fixed to custom domain) */}
              <div className="flex items-center space-x-3 text-xs">
                <span className="w-16 font-semibold text-slate-500 text-right">From:</span>
                <span className="font-mono bg-slate-100 text-slate-800 px-2 py-1 rounded border border-slate-200">
                  {activeMailbox.email}
                </span>
                <span className="text-[11px] text-emerald-600 font-medium">● Verified Sender</span>
              </div>

              {/* To */}
              <div className="flex items-center space-x-3 text-xs">
                <label className="w-16 font-semibold text-slate-500 text-right">To:</label>
                <input
                  type="email"
                  required
                  placeholder="client@example.com"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800"
                />
              </div>

              {/* Subject */}
              <div className="flex items-center space-x-3 text-xs">
                <label className="w-16 font-semibold text-slate-500 text-right">Subject:</label>
                <input
                  type="text"
                  required
                  placeholder="Project update / inquiry..."
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800"
                />
              </div>

              {/* Body */}
              <div className="pt-2">
                <textarea
                  rows={8}
                  required
                  placeholder="Write your email message here..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 font-sans leading-relaxed"
                ></textarea>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">
                  Sent securely via your verified domain infrastructure.
                </span>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsComposeOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg shadow-sm transition-colors active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sending ? 'Sending...' : 'Send Email'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. ADD TENANT DOMAIN MODAL */}
      {isNewDomainOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-sm font-semibold">Connect New Tenant Domain</span>
              <button
                onClick={() => setIsNewDomainOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddDomain} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Domain Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. acmebrand.com"
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Your tenant will receive custom SPF, DKIM, and MX records to configure in their DNS.
                </p>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewDomainOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg"
                >
                  Generate DNS Records
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
