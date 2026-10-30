import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  MessageSquare, PhoneCall, StickyNote, RefreshCw, Search, ChevronRight,
  Mail, Phone, Clock, Send, ExternalLink, Check, CheckCheck,
  User, ArrowUpRight, Sparkles, Filter, X
} from 'lucide-react';
import { clinicApi, datetimeLabel, dateLabel, timeLabel } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, Spinner, Drawer, EmptyState } from '@/clinic/ui';

const CHANNEL_CONFIG = {
  all: { label: 'All Messages', icon: Filter, chip: 'co-c-n' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, chip: 'co-c-g', color: '#10B981', bg: '#ECFDF5' },
  email: { label: 'Emails', icon: Mail, chip: 'co-c-m', color: '#2563EB', bg: '#EFF6FF' },
  call: { label: 'AI Calls', icon: PhoneCall, chip: 'co-c-p', color: '#A4285E', bg: '#FBE9F1' },
  note: { label: 'Notes', icon: StickyNote, chip: 'co-c-o', color: '#D97706', bg: '#FFFBEB' },
};

function formatDuration(secs) {
  const s = Number(secs) || 0;
  if (!s) return '0s';
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return mins > 0 ? `${mins}m ${rem}s` : `${rem}s`;
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function ThreadRow({ thread, isSelected, onClick }) {
  const config = CHANNEL_CONFIG[thread.type] || CHANNEL_CONFIG.whatsapp;
  const Icon = config.icon;

  return (
    <button
      type="button"
      className={`co-list-item ${isSelected ? 'selected' : ''}`}
      style={{
        alignItems: 'flex-start',
        textAlign: 'left',
        cursor: 'pointer',
        padding: '12px 16px',
        borderLeft: isSelected ? `3px solid ${config.color}` : '3px solid transparent',
        background: isSelected ? '#FAF5F8' : undefined,
        transition: 'background 0.15s ease',
        width: '100%',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 2 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: config.bg,
            color: config.color,
          }}
        >
          <Icon size={16} />
        </div>
        {thread.unread > 0 ? (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#A4285E',
              background: '#FBE9F1',
              padding: '1px 5px',
              borderRadius: 999,
            }}
          >
            {thread.unread}
          </span>
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
        <div className="co-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 4, alignItems: 'center' }}>
          <span className="co-strong" style={{ fontSize: 13.5, color: '#111827' }}>
            {thread.name}
          </span>
          <span className={`co-chip ${config.chip}`} style={{ fontSize: 10, padding: '1px 6px' }}>
            {config.label}
          </span>
          {thread.status === 'replied' ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#059669',
                background: '#ECFDF5',
                padding: '1px 6px',
                borderRadius: 4,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <CheckCheck size={10} /> Client Replied
            </span>
          ) : null}
          {thread.phone ? (
            <span className="co-xs co-mut" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Phone size={10} /> {thread.phone}
            </span>
          ) : thread.email ? (
            <span className="co-xs co-mut" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Mail size={10} /> {thread.email}
            </span>
          ) : null}
        </div>

        {thread.type === 'email' && thread.subject ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {thread.subject}
          </div>
        ) : null}

        <div
          className="co-xs co-mut"
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: '#6B7280',
            lineHeight: 1.4,
          }}
        >
          {thread.preview}
        </div>
      </div>

      <div style={{ textAlign: 'right', minWidth: 100, marginLeft: 12 }}>
        <div className="co-xs co-mut" style={{ fontSize: 11 }}>
          {thread.lastAt ? datetimeLabel(thread.lastAt) : '—'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <ChevronRight size={14} style={{ color: '#9CA3AF' }} />
        </div>
      </div>
    </button>
  );
}

function ThreadDrawer({ thread, onClose }) {
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [emailSubject, setEmailSubject] = useState(thread.subject ? `Re: ${thread.subject.replace(/^Re:\s*/i, '')}` : 'Re: Consultation & Treatment');
  const [sendingStatus, setSendingStatus] = useState(null);

  const { data: detail, isLoading, refetch } = useQuery({
    queryKey: ['clinic', 'inbox', 'thread', thread.type, thread.id, thread.leadId],
    queryFn: () => clinicApi.inboxThread(thread.type, thread.id, thread.leadId),
    staleTime: 5_000,
  });

  const replyMutation = useMutation({
    mutationFn: (body) => clinicApi.inboxReply(body),
    onSuccess: () => {
      setReplyText('');
      setSendingStatus('Sent successfully!');
      setTimeout(() => setSendingStatus(null), 3000);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['clinic', 'inbox'] });
    },
    onError: (err) => {
      setSendingStatus(`Failed: ${err.message}`);
    },
  });

  const handleSendReply = (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    if (thread.type === 'whatsapp') {
      replyMutation.mutate({
        type: 'whatsapp',
        conversationId: thread.id,
        leadId: thread.leadId,
        phone: thread.phone,
        body: replyText.trim(),
      });
    } else if (thread.type === 'email') {
      replyMutation.mutate({
        type: 'email',
        leadId: thread.leadId,
        email: thread.email,
        subject: emailSubject.trim() || 'Re: Patient Consultation',
        body: replyText.trim(),
      });
    } else {
      replyMutation.mutate({
        type: 'note',
        leadId: thread.leadId,
        subject: 'Clinical Follow-up Note',
        body: replyText.trim(),
      });
    }
  };

  const config = CHANNEL_CONFIG[thread.type] || CHANNEL_CONFIG.whatsapp;

  return (
    <Drawer
      title={thread.name}
      subtitle={`${config.label} · ${thread.email || thread.phone || 'Communication timeline'}`}
      onClose={onClose}
      actions={
        <div style={{ display: 'flex', gap: 6 }}>
          {thread.leadId ? (
            <Link
              href={`/clinic/patients/${thread.leadId}`}
              className="co-btn co-btn-sm"
              style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <User size={11} /> Patient 360
            </Link>
          ) : null}
          {thread.phone ? (
            <a
              href={`https://wa.me/${thread.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="co-btn co-btn-sm"
              style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ECFDF5', color: '#059669', borderColor: '#A7F3D0' }}
            >
              <ExternalLink size={11} /> WhatsApp Web
            </a>
          ) : null}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Contact Info Header Bar */}
        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: 12,
            alignItems: 'center',
          }}
        >
          <span className={`co-chip ${config.chip}`}>{config.label}</span>
          {thread.phone && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#475569' }}>
              <Phone size={12} style={{ color: '#94A3B8' }} /> {thread.phone}
            </span>
          )}
          {thread.email && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#475569' }}>
              <Mail size={12} style={{ color: '#94A3B8' }} /> {thread.email}
            </span>
          )}
          {thread.lastAt && (
            <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: 11 }}>
              Last active: {datetimeLabel(thread.lastAt)}
            </span>
          )}
        </div>

        {/* Content View */}
        {isLoading ? (
          <div style={{ padding: '40px 0' }}>
            <Spinner label="Loading conversation thread..." />
          </div>
        ) : (
          <div>
            {/* WHATSAPP VIEW */}
            {thread.type === 'whatsapp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="co-label" style={{ marginBottom: 4 }}>WhatsApp Messages</div>
                <div
                  style={{
                    background: '#FAFAF9',
                    border: '1px solid #E7E5E4',
                    borderRadius: 8,
                    padding: 12,
                    maxHeight: 380,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {(detail?.messages || []).length === 0 ? (
                    <div className="co-empty" style={{ padding: 20 }}>
                      <div className="co-empty-title">No logged messages</div>
                      <div className="co-xs co-mut">Send a message below to start the conversation.</div>
                    </div>
                  ) : (
                    detail.messages.map((m) => {
                      const isOut = m.direction === 'outbound';
                      return (
                        <div
                          key={m.id}
                          style={{
                            alignSelf: isOut ? 'flex-end' : 'flex-start',
                            maxWidth: '82%',
                            background: isOut ? '#FBE9F1' : '#FFFFFF',
                            color: isOut ? '#831843' : '#1F2937',
                            border: isOut ? '1px solid #F3D9E5' : '1px solid #E5E7EB',
                            borderRadius: isOut ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            padding: '8px 12px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          }}
                        >
                          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                            {m.content}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: isOut ? '#9D174D' : '#9CA3AF',
                              marginTop: 4,
                              textAlign: 'right',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 3,
                            }}
                          >
                            <span>{m.sentAt ? timeLabel(m.sentAt) : ''}</span>
                            {isOut && <CheckCheck size={11} />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* EMAIL VIEW */}
            {thread.type === 'email' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="co-label" style={{ marginBottom: 2 }}>Email Conversation Thread</div>
                <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(detail?.messages || []).length === 0 ? (
                    <div className="co-empty" style={{ padding: 20 }}>
                      <div className="co-empty-title">Email details unavailable</div>
                    </div>
                  ) : (
                    detail.messages.map((m) => {
                      const isInbound = m.direction === 'inbound';
                      return (
                        <div
                          key={m.id}
                          style={{
                            background: isInbound ? '#F0FDF4' : '#FFFFFF',
                            border: isInbound ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                            borderRadius: 8,
                            padding: 14,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              marginBottom: 8,
                              borderBottom: '1px solid rgba(0,0,0,0.05)',
                              paddingBottom: 6,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
                                {m.subject || 'Patient Communication'}
                              </div>
                              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                                {isInbound ? 'From Patient (Inbound Reply)' : `To: ${thread.email || 'Patient'}`}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: isInbound ? '#DCFCE7' : '#F1F5F9',
                                  color: isInbound ? '#166534' : '#475569',
                                }}
                              >
                                {isInbound ? 'Client Reply' : (m.status || 'Sent')}
                              </span>
                              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
                                {m.sentAt ? datetimeLabel(m.sentAt) : ''}
                              </div>
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 12.5,
                              lineHeight: 1.5,
                              color: '#334155',
                              whiteSpace: 'pre-wrap',
                              maxHeight: 240,
                              overflowY: 'auto',
                            }}
                          >
                            {stripHtml(m.content)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* CALL VIEW */}
            {thread.type === 'call' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    background: '#FDF2F8',
                    border: '1px solid #FCE7F3',
                    borderRadius: 8,
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PhoneCall size={18} style={{ color: '#A4285E' }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#831843' }}>
                        AI Telephony Call
                      </div>
                      <div style={{ fontSize: 11, color: '#9D174D' }}>
                        Duration: {formatDuration(detail?.call?.duration_secs || thread.durationSecs)} · Status: {detail?.call?.status || thread.status}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/clinic/call-review/${thread.id}`}
                    className="co-btn co-btn-sm"
                    style={{ fontSize: 11, background: '#FFFFFF', color: '#A4285E', borderColor: '#F3D9E5' }}
                  >
                    <Clock size={11} /> Call Review
                  </Link>
                </div>

                {detail?.summary && (
                  <div>
                    <div className="co-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles size={12} style={{ color: '#A4285E' }} /> Call Summary
                    </div>
                    <div
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: 8,
                        padding: 12,
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        color: '#374151',
                      }}
                    >
                      {detail.summary}
                    </div>
                  </div>
                )}

                <div>
                  <div className="co-label" style={{ marginBottom: 6 }}>Full AI Dialogue Transcript</div>
                  <div
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      padding: 12,
                      maxHeight: 250,
                      overflowY: 'auto',
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: '#334155',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                    }}
                  >
                    {detail?.transcript || 'Transcript recorded.'}
                  </div>
                </div>
              </div>
            )}

            {/* NOTE VIEW */}
            {thread.type === 'note' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    background: '#FFFBEB',
                    border: '1px solid #FEF3C7',
                    borderRadius: 8,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#92400E' }}>
                      {detail?.note?.title || 'Clinical Timeline Note'}
                    </div>
                    <span className="co-chip co-c-o" style={{ fontSize: 10 }}>
                      {detail?.note?.kind || 'note'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#78350F', whiteSpace: 'pre-wrap' }}>
                    {detail?.note?.body || thread.preview}
                  </div>
                  <div style={{ fontSize: 10, color: '#B45309', marginTop: 8 }}>
                    Logged on {datetimeLabel(detail?.note?.created_at || thread.lastAt)}
                  </div>
                </div>

                {detail?.relatedNotes && detail.relatedNotes.length > 1 && (
                  <div>
                    <div className="co-label" style={{ marginBottom: 6 }}>Patient Timeline History</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {detail.relatedNotes
                        .filter((n) => n.id !== thread.id)
                        .map((rn) => (
                          <div
                            key={rn.id}
                            style={{
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              borderRadius: 6,
                              padding: 10,
                              fontSize: 12,
                            }}
                          >
                            <div style={{ fontWeight: 600, color: '#334155' }}>{rn.title}</div>
                            <div style={{ color: '#64748B', marginTop: 2 }}>{rn.body}</div>
                            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
                              {datetimeLabel(rn.created_at)}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* QUICK REPLY / ACTION SECTION */}
        <div style={{ borderTop: '1px solid #F3D9E5', paddingTop: 16, marginTop: 8 }}>
          <div className="co-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              {thread.type === 'whatsapp'
                ? 'Send WhatsApp Reply'
                : thread.type === 'email'
                ? 'Send Email Reply'
                : 'Add Follow-up Note'}
            </span>
            {sendingStatus && (
              <span style={{ fontSize: 11, color: sendingStatus.includes('Failed') ? '#DC2626' : '#16A34A', fontWeight: 600 }}>
                {sendingStatus}
              </span>
            )}
          </div>

          <form onSubmit={handleSendReply} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {thread.type === 'email' && (
              <input
                type="text"
                className="co-input"
                placeholder="Subject line..."
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                style={{ fontSize: 12 }}
              />
            )}

            <textarea
              className="co-input"
              rows={3}
              placeholder={
                thread.type === 'whatsapp'
                  ? 'Type your WhatsApp message to patient...'
                  : thread.type === 'email'
                  ? 'Write your email response...'
                  : 'Add a clinical note or task for this patient...'
              }
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              style={{ fontSize: 12.5, lineHeight: 1.4, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
              <button
                type="submit"
                className="co-btn co-btn-p co-btn-sm"
                disabled={replyMutation.isPending || !replyText.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {replyMutation.isPending ? (
                  <Spinner size={12} />
                ) : thread.type === 'whatsapp' ? (
                  <Send size={12} />
                ) : thread.type === 'email' ? (
                  <Mail size={12} />
                ) : (
                  <StickyNote size={12} />
                )}
                <span>
                  {replyMutation.isPending
                    ? 'Sending...'
                    : thread.type === 'whatsapp'
                    ? 'Send WhatsApp'
                    : thread.type === 'email'
                    ? 'Send Email'
                    : 'Save Note'}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Drawer>
  );
}

export default function ClinicInbox() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'inbox'],
    queryFn: () => clinicApi.inbox(150),
    refetchInterval: 30_000,
  });

  const [activeChannel, setActiveChannel] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openThread, setOpenThread] = useState(null);

  const threads = data?.threads || [];

  // Metrics
  const counts = useMemo(() => {
    const wa = threads.filter((t) => t.type === 'whatsapp');
    const em = threads.filter((t) => t.type === 'email');
    const ca = threads.filter((t) => t.type === 'call');
    const no = threads.filter((t) => t.type === 'note');
    const unread = threads.filter((t) => (t.unread || 0) > 0);
    return {
      all: threads.length,
      whatsapp: wa.length,
      email: em.length,
      call: ca.length,
      note: no.length,
      unread: unread.length,
    };
  }, [threads]);

  // Filtered Threads
  const filteredThreads = useMemo(() => {
    let list = threads;

    if (activeChannel === 'unread') {
      list = list.filter((t) => (t.unread || 0) > 0);
    } else if (activeChannel !== 'all') {
      list = list.filter((t) => t.type === activeChannel);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.name && t.name.toLowerCase().includes(q)) ||
          (t.email && t.email.toLowerCase().includes(q)) ||
          (t.phone && t.phone.toLowerCase().includes(q)) ||
          (t.preview && t.preview.toLowerCase().includes(q)) ||
          (t.subject && t.subject.toLowerCase().includes(q))
      );
    }

    return list;
  }, [threads, activeChannel, searchQuery]);

  return (
    <div className="clinic-os">
      <PageHead
        title="Unified Inbox"
        subtitle="Every patient conversation — WhatsApp, Emails, AI calls, and Clinical Notes in one central timeline."
      >
        <button
          type="button"
          className="co-btn co-btn-sm"
          onClick={() => refetch()}
          disabled={isFetching}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </PageHead>

      {/* KPI Cards across Channels */}
      <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        <Card>
          <div className="co-kpi-label">
            <Filter size={13} /> All Messages
          </div>
          <div className="co-kpi-value">{counts.all}</div>
          <div className="co-kpi-foot">{counts.unread} unread</div>
        </Card>
        <Card>
          <div className="co-kpi-label">
            <MessageSquare size={13} style={{ color: '#10B981' }} /> WhatsApp
          </div>
          <div className="co-kpi-value">{counts.whatsapp}</div>
          <div className="co-kpi-foot">Live Chats</div>
        </Card>
        <Card>
          <div className="co-kpi-label">
            <Mail size={13} style={{ color: '#2563EB' }} /> Emails
          </div>
          <div className="co-kpi-value">{counts.email}</div>
          <div className="co-kpi-foot">Outreach & Replies</div>
        </Card>
        <Card>
          <div className="co-kpi-label">
            <PhoneCall size={13} style={{ color: '#A4285E' }} /> AI Calls
          </div>
          <div className="co-kpi-value">{counts.call}</div>
          <div className="co-kpi-foot">Audio & Transcripts</div>
        </Card>
        <Card>
          <div className="co-kpi-label">
            <StickyNote size={13} style={{ color: '#D97706' }} /> Clinic Notes
          </div>
          <div className="co-kpi-value">{counts.note}</div>
          <div className="co-kpi-foot">Consultation logs</div>
        </Card>
      </div>

      <Card rise="co-rise-2">
        {/* Filter Tabs & Search Controls */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            borderBottom: '1px solid #F3D9E5',
          }}
        >
          {/* Channel Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              { id: 'all', label: 'All Channels', count: counts.all },
              { id: 'whatsapp', label: 'WhatsApp', count: counts.whatsapp },
              { id: 'email', label: 'Emails', count: counts.email },
              { id: 'call', label: 'AI Calls', count: counts.call },
              { id: 'note', label: 'Notes', count: counts.note },
              { id: 'unread', label: 'Unread', count: counts.unread },
            ].map((tab) => {
              const active = activeChannel === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveChannel(tab.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    background: active ? '#A4285E' : '#F8FAFC',
                    color: active ? '#FFFFFF' : '#475569',
                    border: active ? '1px solid #A4285E' : '1px solid #E2E8F0',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{tab.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      background: active ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                      color: active ? '#FFFFFF' : '#64748B',
                      padding: '1px 5px',
                      borderRadius: 999,
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              className="co-input"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                paddingLeft: 32,
                paddingRight: searchQuery ? 28 : 12,
                fontSize: 12,
                height: 34,
                borderRadius: 999,
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Thread List */}
        {isLoading ? (
          <div style={{ padding: '60px 0' }}>
            <Spinner label="Loading all messages..." />
          </div>
        ) : filteredThreads.length === 0 ? (
          <EmptyState title="No messages found">
            <p className="co-sm co-mut" style={{ maxWidth: 360, margin: '6px auto 0' }}>
              {searchQuery
                ? `No conversations matched "${searchQuery}". Try a different keyword.`
                : activeChannel !== 'all'
                ? `No ${CHANNEL_CONFIG[activeChannel]?.label || activeChannel} messages found yet.`
                : 'WhatsApp chats, emails, AI call recordings, and clinic notes will show up here.'}
            </p>
          </EmptyState>
        ) : (
          <div className="co-list">
            {filteredThreads.map((t) => (
              <ThreadRow
                key={`${t.type}-${t.id}`}
                thread={t}
                isSelected={openThread?.id === t.id && openThread?.type === t.type}
                onClick={() => setOpenThread(t)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Detailed Thread Drawer */}
      {openThread ? (
        <ThreadDrawer
          thread={openThread}
          onClose={() => setOpenThread(null)}
        />
      ) : null}
    </div>
  );
}
