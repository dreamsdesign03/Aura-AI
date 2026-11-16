import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  MessageSquare, PhoneCall, StickyNote, RefreshCw, Search, ChevronRight,
  Mail, Phone, Clock, Send, ExternalLink, Check, CheckCheck,
  User, ArrowUpRight, Sparkles, Filter, X, MessageSquareQuote, Heart,
  Eye, EyeOff, ThumbsUp, Tag, Star, AlertTriangle, Trash2
} from 'lucide-react';
import { clinicApi, datetimeLabel, dateLabel, timeLabel, cleanEnglishName } from '@/clinic/api';
import { getContactDisplayName } from '@/lib/contactName';
import { PageHead, Card, CardHead, Avatar, Spinner, Drawer, EmptyState } from '@/clinic/ui';
import { useBranch } from '@/contexts/BranchContext';
import { MetaAvatar, ChannelBadge } from '@/components/MetaAvatar';

function InstagramIcon({ size = 16, color = "currentColor", ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}

function FacebookIcon({ size = 16, color = "currentColor", ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  );
}

const CHANNEL_CONFIG = {
  all: { label: 'All messages', icon: Filter, chip: 'co-c-n' },
  facebook: { label: 'Messenger', icon: FacebookIcon, chip: 'co-c-m', color: '#1877F2', bg: '#EFF6FF' },
  instagram: { label: 'Instagram', icon: InstagramIcon, chip: 'co-c-p', color: '#E1306C', bg: '#FDF2F8' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, chip: 'co-c-g', color: '#10B981', bg: '#ECFDF5' },
  comment_fb: { label: 'Facebook comments', icon: FacebookIcon, chip: 'co-c-m', color: '#1877F2', bg: '#EFF6FF' },
  comment_ig: { label: 'Instagram comments', icon: InstagramIcon, chip: 'co-c-p', color: '#E1306C', bg: '#FDF2F8' },
  comment: { label: 'Comments', icon: MessageSquareQuote, chip: 'co-c-p', color: '#8B5CF6', bg: '#F5F3FF' },
  email: { label: 'Emails', icon: Mail, chip: 'co-c-m', color: '#2563EB', bg: '#EFF6FF' },
  drafts: { label: 'Drafts', icon: Mail, chip: 'co-c-n', color: '#475569', bg: '#F8FAFC' },
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

function renderTranscriptContent(rawTranscript) {
  if (!rawTranscript) return 'Transcript recorded.';
  let turns = rawTranscript;
  if (typeof turns === 'string') {
    try {
      turns = JSON.parse(turns);
    } catch {
      return turns;
    }
  }
  if (Array.isArray(turns)) {
    return turns.map((t) => {
      const speaker = t.speaker || (t.role === 'agent' || t.role === 'assistant' ? 'AI Coordinator' : 'Patient');
      const text = t.text || t.message || t.content || '';
      return `${speaker}: ${text}`;
    }).filter(Boolean).join('\n\n');
  }
  return String(rawTranscript);
}

function ThreadRow({ thread, isSelected, onClick }) {
  const isComment = thread.type === 'comment';
  const configKey = isComment
    ? (thread.channel === 'facebook' ? 'comment_fb' : 'comment_ig')
    : thread.type;
  const config = CHANNEL_CONFIG[configKey] || CHANNEL_CONFIG[thread.type] || CHANNEL_CONFIG.whatsapp;
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
        <MetaAvatar
          name={thread.name}
          username={thread.senderUsername}
          avatarUrl={thread.senderAvatar || thread.participantAvatar}
          channel={isComment ? (thread.channel === 'facebook' ? 'comment_fb' : 'comment_ig') : thread.type}
          size={40}
        />
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
            {thread.name && thread.name !== 'Instagram User'
              ? thread.name
              : (thread.senderUsername ? `@${thread.senderUsername}` : (thread.channel === 'instagram' || thread.type === 'instagram' ? '@insta_patient' : 'Patient'))}
          </span>
          {Array.isArray(thread.labels) && thread.labels.map((lbl) => (
            <span
              key={lbl}
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: '#A4285E',
                background: '#FDF2F8',
                border: '1px solid #FBCFE8',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {lbl}
            </span>
          ))}
          <span
            className={`co-chip ${isComment ? (thread.channel === 'facebook' ? 'co-c-m' : 'co-c-p') : config.chip}`}
            style={{ fontSize: 10, padding: '1px 6px' }}
          >
            {isComment
              ? (thread.channel === 'facebook' ? 'Facebook Comment' : 'Instagram Comment')
              : config.label}
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
              <CheckCheck size={10} /> {isComment ? 'Replied' : 'Client Replied'}
            </span>
          ) : isComment ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#7C3AED',
                background: '#EDE9FE',
                padding: '1px 6px',
                borderRadius: 4,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              New Comment
            </span>
          ) : null}
          {thread.isDraft ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#92400E',
                background: '#FEF3C7',
                padding: '1px 6px',
                borderRadius: 4,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Mail size={10} /> Draft
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

        {/* Comment on Reel / Post badge */}
        {isComment && thread.postTitle ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              marginBottom: 4,
              padding: '2px 8px',
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              borderRadius: 4,
              fontSize: 11,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontWeight: 700, color: thread.channel === 'facebook' ? '#1D4ED8' : '#BE185D' }}>
              {thread.mediaType === 'Reel' ? '🎬 Reel' : '🖼️ Post'}:
            </span>
            <span style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {thread.postTitle}
            </span>
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
  const [useMetaTemplate, setUseMetaTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('auraai_leads');
  const [emailSubject, setEmailSubject] = useState(thread.subject ? `Re: ${thread.subject.replace(/^Re:\s*/i, '')}` : 'Re: Consultation & Treatment');
  const [sendingStatus, setSendingStatus] = useState(null);
  const [commentLiked, setCommentLiked] = useState(false);
  const [commentHidden, setCommentHidden] = useState(false);

  const handleToggleLike = async () => {
    try {
      const cId = thread.commentId || detail?.comment?.comment_id;
      if (!cId) return;
      await fetch('/api/meta/comments/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: cId, channel: thread.channel || 'instagram' })
      });
      setCommentLiked((prev) => !prev);
    } catch {}
  };

  const handleToggleHide = async () => {
    try {
      const cId = thread.commentId || detail?.comment?.comment_id;
      if (!cId) return;
      const nextHidden = !commentHidden;
      await fetch('/api/meta/comments/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: cId, hidden: nextHidden })
      });
      setCommentHidden(nextHidden);
    } catch {}
  };

  const { data: detail, isLoading, refetch } = useQuery({
    queryKey: ['clinic', 'inbox', 'thread', thread.type, thread.id, thread.leadId, thread.phone],
    queryFn: () => clinicApi.inboxThread(thread.type, thread.id, thread.leadId, thread.phone),
    refetchInterval: 4_000,
    staleTime: 2_000,
    refetchOnWindowFocus: true,
  });

  // Automatically mark WhatsApp conversation as read when opened
  useEffect(() => {
    if (thread?.type === 'whatsapp') {
      thread.unread = 0;
      fetch('/api/whatsapp/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: thread.id, phone: thread.phone, leadId: thread.leadId })
      })
      .then(() => queryClient.invalidateQueries({ queryKey: ['clinic', 'inbox'] }))
      .catch(() => {});
    }
  }, [thread?.id, thread?.type]);

  const replyMutation = useMutation({
    mutationFn: (body) => clinicApi.inboxReply(body),
    onSuccess: () => {
      setReplyText('');
      setUseMetaTemplate(false);
      setSendingStatus('Sent successfully!');
      setTimeout(() => setSendingStatus(null), 3000);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['clinic', 'inbox'] });
    },
    onError: (err) => {
      setSendingStatus(`Failed: ${err.message}`);
    },
  });

  const sendDraft = (message) => {
    setSendingStatus('Sending draft...');
    replyMutation.mutate({
      type: 'email',
      leadId: thread.leadId,
      email: thread.email,
      subject: message.subject || emailSubject,
      body: message.content || '',
      emailId: message.id,
    });
  };

  const handleSendOfficialTemplate = (tplName = 'auraai_leads') => {
    setSendingStatus('Sending official Meta template...');
    replyMutation.mutate({
      type: 'whatsapp',
      conversationId: thread.id,
      leadId: thread.leadId,
      phone: thread.phone,
      body: `[Template: ${tplName}]`,
      templateName: tplName,
      templateParams: tplName === 'auraai_leads' ? ['Aura Laser & Cosmetic Clinic'] : [],
      templateLang: tplName === 'hello_world' ? 'en_US' : 'en',
    });
  };

  const handleSendReply = (e) => {
    e.preventDefault();
    if (!replyText.trim() && !useMetaTemplate) return;

    if (thread.type === 'whatsapp') {
      const payload = {
        type: 'whatsapp',
        conversationId: thread.id,
        leadId: thread.leadId,
        phone: thread.phone,
        body: replyText.trim() || `[Template: ${selectedTemplate}]`,
      };
      if (useMetaTemplate) {
        payload.templateName = selectedTemplate;
        payload.templateParams = selectedTemplate === 'auraai_leads' ? ['Aura Laser & Cosmetic Clinic'] : [];
        payload.templateLang = selectedTemplate === 'hello_world' ? 'en_US' : 'en';
      }
      replyMutation.mutate(payload);
    } else if (thread.type === 'facebook' || thread.type === 'instagram') {
      replyMutation.mutate({
        type: thread.type,
        conversationId: thread.id,
        recipientId: thread.senderId || detail?.conversation?.sender_id,
        senderId: thread.senderId || detail?.conversation?.sender_id,
        body: replyText.trim(),
      });
    } else if (thread.type === 'comment') {
      replyMutation.mutate({
        type: 'comment',
        commentId: thread.commentId || detail?.comment?.comment_id,
        channel: thread.channel || detail?.comment?.channel || 'instagram',
        body: replyText.trim(),
      });
    } else if (thread.type === 'email') {
      replyMutation.mutate({
        type: 'email',
        leadId: thread.leadId,
        email: thread.email,
        subject: emailSubject.trim() || 'Re: Patient Consultation',
        body: replyText.trim(),
        emailId: thread.isDraft ? thread.id : undefined,
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
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
          }}
        >
          <MetaAvatar
            name={thread.name}
            username={thread.senderUsername}
            avatarUrl={thread.senderAvatar || thread.participantAvatar}
            channel={thread.type === 'comment' ? (thread.channel === 'facebook' ? 'comment_fb' : 'comment_ig') : thread.type}
            size={48}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{thread.name}</span>
              <span className={`co-chip ${config.chip}`}>{config.label}</span>
              {thread.senderUsername && (
                <span style={{ fontSize: 11, color: '#64748B' }}>@{thread.senderUsername}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', color: '#64748B', fontSize: 11 }}>
              {thread.phone && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={11} style={{ color: '#94A3B8' }} /> {thread.phone}
                </span>
              )}
              {thread.email && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Mail size={11} style={{ color: '#94A3B8' }} /> {thread.email}
                </span>
              )}
              {thread.lastAt && (
                <span>Last active: {datetimeLabel(thread.lastAt)}</span>
              )}
            </div>
          </div>
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
                {/* Official Clinic WhatsApp Channel Banner */}
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 999, background: '#10B981', flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#065F46' }}>
                      Official WhatsApp Business: <strong style={{ color: '#047857' }}>+91 84900 33711</strong>
                    </span>
                  </div>
                  <span style={{ fontSize: 10.5, color: '#047857', fontWeight: 500 }}>
                    Aura Laser &amp; Cosmetic Clinic
                  </span>
                </div>
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
                      const rawContent = m.content || '';
                      let displayContent = rawContent;
                      if (rawContent.includes("[Template: hello_world]") || rawContent.includes("Welcome and congratulations")) {
                        displayContent = "Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.";
                      } else if (rawContent.includes("[Template: auraai_leads]")) {
                        displayContent = "Hello from Dr. Aditya Shah, founder of Skinnonest and Aura Laser & Cosmetic Clinic. We are following up regarding your appointment & inquiry.";
                      } else if (rawContent.includes("[Template: aura_booking_confirmation]")) {
                        displayContent = "Hi! Your appointment has been confirmed at Aura Laser & Cosmetic Clinic.";
                      } else if (rawContent.startsWith("[Template: ") && rawContent.endsWith("]")) {
                        const tName = rawContent.slice(11, -1).replace(/_/g, ' ');
                        displayContent = `[${tName}]`;
                      }

                      return (
                        <div
                          key={m.id}
                          style={{
                            alignSelf: isOut ? 'flex-end' : 'flex-start',
                            maxWidth: '82%',
                            background: isOut ? (m.isAi ? '#FDF2F8' : '#FBE9F1') : '#FFFFFF',
                            color: isOut ? '#831843' : '#1F2937',
                            border: isOut ? (m.isAi ? '1px solid #FBCFE8' : '1px solid #F3D9E5') : '1px solid #E5E7EB',
                            borderRadius: isOut ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            padding: '8px 12px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          }}
                        >
                          {/* Sender badge (Aura AI vs Clinic Team) */}
                          {isOut && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                color: m.isAi ? '#9D174D' : '#4B5563',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                background: m.isAi ? '#FCE7F3' : '#F3F4F6',
                                border: m.isAi ? '1px solid #FBCFE8' : '1px solid #E5E7EB',
                                padding: '1px 6px',
                                borderRadius: 8
                              }}>
                                {m.isAi ? <Sparkles size={9} /> : <User size={9} />}
                                {m.isAi ? 'Aura AI' : 'Clinic Team'}
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                            {displayContent}
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
                            {isOut && (m.status === 'failed' || m.status === 'not_whatsapp') ? (
                              <span style={{ color: '#DC2626', fontWeight: 700 }}>
                                {m.status === 'not_whatsapp' ? 'Not on WhatsApp' : 'Failed'}
                              </span>
                            ) : isOut ? (
                              <>
                                <span style={{ textTransform: 'capitalize' }}>{m.status || 'sent'}</span>
                                <CheckCheck size={11} />
                              </>
                            ) : null}
                          </div>
                          {m.errorMessage ? (
                            <div style={{ fontSize: 10, color: '#B91C1C', marginTop: 3, lineHeight: 1.35 }}>
                              {m.errorMessage}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* INSTAGRAM & FACEBOOK OMNICHANNEL VIEW */}
            {(thread.type === 'instagram' || thread.type === 'facebook') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Official Meta Channel Banner */}
                <div style={{
                  background: thread.type === 'instagram' ? '#FDF2F8' : '#EFF6FF',
                  border: thread.type === 'instagram' ? '1px solid #FBCFE8' : '1px solid #BFDBFE',
                  borderRadius: 8,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {thread.type === 'instagram' ? (
                      <InstagramIcon size={16} color="#E1306C" />
                    ) : (
                      <FacebookIcon size={16} color="#1877F2" />
                    )}
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: thread.type === 'instagram' ? '#9D174D' : '#1E40AF' }}>
                      {thread.type === 'instagram' ? 'Instagram Direct (@aura_laserclinic)' : 'Facebook Messenger (Aura Laser & Cosmetic Clinic)'}
                    </span>
                  </div>
                  <span style={{ fontSize: 10.5, color: '#64748B', fontWeight: 500 }}>
                    {thread.senderUsername ? `@${thread.senderUsername}` : thread.name}
                  </span>
                </div>
                <div className="co-label" style={{ marginBottom: 4 }}>
                  {thread.type === 'instagram' ? 'Instagram DMs' : 'Messenger Messages'}
                </div>
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
                      <div className="co-empty-title">No messages yet</div>
                      <div className="co-xs co-mut">Type a reply below to reach the patient on {thread.type === 'instagram' ? 'Instagram' : 'Facebook'}.</div>
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
                            background: isOut
                              ? (thread.type === 'instagram' ? '#FDF2F8' : '#EFF6FF')
                              : '#FFFFFF',
                            color: isOut
                              ? (thread.type === 'instagram' ? '#831843' : '#1E3A8A')
                              : '#1F2937',
                            border: isOut
                              ? (thread.type === 'instagram' ? '1px solid #FBCFE8' : '1px solid #BFDBFE')
                              : '1px solid #E5E7EB',
                            borderRadius: isOut ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            padding: '8px 12px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          }}
                        >
                          {isOut && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                color: thread.type === 'instagram' ? '#BE185D' : '#1D4ED8',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                background: '#FFFFFF',
                                border: '1px solid #E5E7EB',
                                padding: '1px 6px',
                                borderRadius: 8
                              }}>
                                <User size={9} /> Clinic Team
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                            {m.content}
                          </div>
                          {m.mediaUrl && (
                            <div style={{ marginTop: 6 }}>
                              <img src={m.mediaUrl} alt="Attachment" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6 }} />
                            </div>
                          )}
                          {(m.reactionEmoji || m.reaction) && (
                            <div
                              style={{
                                marginTop: 4,
                                display: 'inline-flex',
                                alignItems: 'center',
                                background: '#FFFFFF',
                                border: '1px solid #E5E7EB',
                                borderRadius: 12,
                                padding: '1px 6px',
                                fontSize: 12,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                              }}
                            >
                              <span>{m.reactionEmoji || m.reaction}</span>
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: 10,
                              color: isOut ? '#64748B' : '#9CA3AF',
                              marginTop: 4,
                              textAlign: 'right',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 3,
                            }}
                          >
                            <span>{m.timestamp ? timeLabel(m.timestamp) : ''}</span>
                            {isOut && (
                              m.status === 'read' ? (
                                <span style={{ color: '#2563EB', fontWeight: 600, fontSize: 9.5 }}>Seen</span>
                              ) : (
                                <CheckCheck size={11} style={{ color: thread.type === 'instagram' ? '#E1306C' : '#1877F2' }} />
                              )
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Meta Business Suite Profile & Details Card */}
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <MetaAvatar
                        name={thread.name}
                        username={thread.senderUsername}
                        avatarUrl={thread.senderAvatar || thread.participantAvatar}
                        channel={thread.type}
                        size={72}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>{thread.name}</div>
                        <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
                          {thread.senderUsername ? `@${thread.senderUsername}` : (thread.type === 'instagram' ? 'Instagram Direct' : 'Facebook Messenger')}
                        </div>
                      </div>
                    </div>
                    {thread.senderUsername && (
                      <a
                        href={thread.type === 'instagram' ? `https://instagram.com/${thread.senderUsername}` : `https://facebook.com/${thread.senderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="co-btn co-btn-sm"
                        style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <ExternalLink size={10} /> View profile
                      </a>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid #F1F5F9' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Labels:</span>
                    {Array.isArray(thread.labels) && thread.labels.length > 0 ? (
                      thread.labels.map((lbl) => (
                        <span key={lbl} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontWeight: 600 }}>
                          {lbl}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#FDF2F8', color: '#BE185D', border: '1px solid #FBCFE8', fontWeight: 600 }}>
                        Priority
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#10B981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Check size={11} /> Meta 24h Window Active
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* COMMENT VIEW */}
            {thread.type === 'comment' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Reel / Post Source Card */}
                <div
                  style={{
                    background: '#FAF5FF',
                    border: '1px solid #E9D5FF',
                    borderRadius: 8,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {thread.channel === 'facebook' ? (
                        <FacebookIcon size={16} color="#1877F2" />
                      ) : (
                        <InstagramIcon size={16} color="#E1306C" />
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: thread.channel === 'facebook' ? '#1D4ED8' : '#BE185D' }}>
                        {thread.channel === 'facebook' ? 'Facebook Post' : (thread.mediaType === 'Reel' ? '🎬 Instagram Reel' : '🖼️ Instagram Post')}
                      </span>
                    </div>
                    {(thread.postUrl || detail?.comment?.post_url) && (
                      <a
                        href={thread.postUrl || detail?.comment?.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="co-btn co-btn-sm"
                        style={{ fontSize: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FFFFFF', color: '#6D28D9', borderColor: '#DDD6FE' }}
                      >
                        <ExternalLink size={10} /> View on {thread.channel === 'facebook' ? 'Facebook' : 'Instagram'}
                      </a>
                    )}
                  </div>

                  {(thread.postTitle || detail?.comment?.post_title) && (
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', lineHeight: 1.4, background: '#FFFFFF', padding: '8px 10px', borderRadius: 6, border: '1px solid #F3E8FF' }}>
                      "{thread.postTitle || detail?.comment?.post_title}"
                    </div>
                  )}
                </div>

                {/* Comment Content Card */}
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <MetaAvatar
                        name={detail?.comment?.sender_name || thread.name}
                        username={detail?.comment?.sender_username || thread.senderUsername}
                        avatarUrl={detail?.comment?.sender_avatar || thread.senderAvatar}
                        channel={thread.channel === 'facebook' ? 'comment_fb' : 'comment_ig'}
                        size={40}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1E293B' }}>
                          {detail?.comment?.sender_name || (detail?.comment?.sender_username ? `@${detail.comment.sender_username}` : thread.name)}
                        </div>
                        {detail?.comment?.sender_username && (
                          <div style={{ fontSize: 11, color: '#64748B' }}>@{detail.comment.sender_username}</div>
                        )}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: detail?.comment?.status === 'replied' ? '#DCFCE7' : '#FEF3C7',
                        color: detail?.comment?.status === 'replied' ? '#166534' : '#92400E',
                      }}
                    >
                      {detail?.comment?.status === 'replied' ? 'Replied' : 'Awaiting Reply'}
                    </span>
                  </div>

                  <div style={{ fontSize: 13.5, color: '#1F2937', lineHeight: 1.5, background: '#FFFFFF', padding: 12, borderRadius: 6, border: '1px solid #E5E7EB' }}>
                    {detail?.comment?.text || thread.preview}
                  </div>

                  {detail?.comment?.reply_text && (
                    <div style={{ marginTop: 10, background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 6, padding: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCheck size={12} color="#7C3AED" /> Clinic Reply:
                      </div>
                      <div style={{ fontSize: 12.5, color: '#4C1D95' }}>
                        {detail.comment.reply_text}
                      </div>
                      <div style={{ fontSize: 10, color: '#8B5CF6', marginTop: 4 }}>
                        {detail.comment.replied_at ? datetimeLabel(detail.comment.replied_at) : ''}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="co-btn co-btn-sm"
                      onClick={handleToggleLike}
                      style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: commentLiked ? '#FCE7F3' : '#FFFFFF',
                        color: commentLiked ? '#BE185D' : '#475569',
                        borderColor: commentLiked ? '#FBCFE8' : '#E2E8F0',
                      }}
                    >
                      <Heart size={12} fill={commentLiked ? '#BE185D' : 'none'} color={commentLiked ? '#BE185D' : 'currentColor'} />
                      <span>{commentLiked ? 'Liked on Page' : 'Like'}</span>
                    </button>
                    <button
                      type="button"
                      className="co-btn co-btn-sm"
                      onClick={handleToggleHide}
                      style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: commentHidden ? '#FEF2F2' : '#FFFFFF',
                        color: commentHidden ? '#DC2626' : '#475569',
                        borderColor: commentHidden ? '#FECACA' : '#E2E8F0',
                      }}
                    >
                      {commentHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                      <span>{commentHidden ? 'Hidden from Page' : 'Hide'}</span>
                    </button>
                  </div>

                  <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 8 }}>
                    Commented on {datetimeLabel(detail?.comment?.created_at || thread.lastAt)}
                  </div>
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
                                  background: isInbound ? '#DCFCE7' : m.isDraft ? '#FEF3C7' : '#F1F5F9',
                                  color: isInbound ? '#166534' : m.isDraft ? '#92400E' : '#475569',
                                }}
                              >
                                {isInbound ? 'Client Reply' : m.isDraft ? 'Draft — not sent' : (m.status || 'Sent')}
                              </span>
                              {m.isDraft && (
                                <div style={{ marginTop: 6 }}>
                                  <button
                                    type="button"
                                    className="co-btn co-btn-p co-btn-sm"
                                    disabled={replyMutation.isPending}
                                    onClick={() => sendDraft(m)}
                                    style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                  >
                                    <Send size={10} /> Send Draft
                                  </button>
                                </div>
                              )}
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
                    {renderTranscriptContent(detail?.transcript)}
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
                : thread.type === 'instagram'
                ? 'Send Instagram Direct Reply'
                : thread.type === 'facebook'
                ? 'Send Facebook Messenger Reply'
                : thread.type === 'comment'
                ? `Reply to ${thread.channel === 'instagram' ? 'Instagram' : 'Facebook'} Comment`
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

          {/* WhatsApp Quick Chips & 24h Template Bypass */}
          {thread.type === 'whatsapp' && (
            <div style={{ marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {[
                  "Hi {{name}} 👋 Wanted to check in regarding your appointment at Aura Clinic.",
                  "Hi {{name}}, your consultation details are ready. Let us know if you have any questions!",
                  "Following up on your visit. Do you have 2 minutes for a quick chat today?"
                ].map(tmpl => {
                  const patientName = (thread.name || 'there').split(' ')[0];
                  const txt = tmpl.replace("{{name}}", patientName);
                  return (
                    <button
                      key={tmpl}
                      type="button"
                      onClick={() => { setReplyText(txt); setUseMetaTemplate(false); }}
                      style={{
                        fontSize: 10.5,
                        padding: '3px 8px',
                        borderRadius: 12,
                        border: '1px solid #BBF7D0',
                        background: '#F0FDF4',
                        color: '#15803D',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        fontWeight: 500,
                        flexShrink: 0
                      }}
                    >
                      {txt.slice(0, 32)}...
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: useMetaTemplate ? '#A4285E' : '#64748B', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={useMetaTemplate}
                    onChange={(e) => setUseMetaTemplate(e.target.checked)}
                    style={{ accentColor: '#A4285E' }}
                  />
                  <span>⚡ Official Meta Template (24h Window Bypass)</span>
                </label>

                {useMetaTemplate && (
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="co-input"
                    style={{ fontSize: 11, padding: '2px 8px', height: 26, width: 'auto' }}
                  >
                    <option value="auraai_leads">auraai_leads (Official Template)</option>
                    <option value="hello_world">hello_world (Test Template)</option>
                  </select>
                )}
              </div>

              {sendingStatus && (sendingStatus.includes('24') || sendingStatus.includes('expired')) && (
                <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', padding: '6px 10px', borderRadius: 6, border: '1px solid #FECACA' }}>
                  <span style={{ fontSize: 11, color: '#991B1B', flex: 1 }}>
                    24-hour window expired. Click to dispatch approved Meta Template:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSendOfficialTemplate('auraai_leads')}
                    className="co-btn co-btn-p co-btn-sm"
                    style={{ fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap' }}
                  >
                    Send Meta Template
                  </button>
                </div>
              )}
            </div>
          )}

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
                  : thread.type === 'instagram'
                  ? 'Type your Instagram Direct message...'
                  : thread.type === 'facebook'
                  ? 'Type your Facebook Messenger message...'
                  : thread.type === 'comment'
                  ? `Write a public reply to this ${thread.channel === 'instagram' ? 'Instagram' : 'Facebook'} comment...`
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
                disabled={replyMutation.isPending || (!replyText.trim() && !useMetaTemplate)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {replyMutation.isPending ? (
                  <Spinner size={12} />
                ) : thread.type === 'whatsapp' ? (
                  <Send size={12} />
                ) : thread.type === 'instagram' ? (
                  <InstagramIcon size={12} />
                ) : thread.type === 'facebook' ? (
                  <FacebookIcon size={12} />
                ) : thread.type === 'comment' ? (
                  <MessageSquareQuote size={12} />
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
                    : thread.type === 'instagram'
                    ? 'Send Instagram DM'
                    : thread.type === 'facebook'
                    ? 'Send Messenger'
                    : thread.type === 'comment'
                    ? 'Post Reply to Comment'
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
  const { selectedBranch } = useBranch();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'inbox', selectedBranch],
    queryFn: () => clinicApi.inbox(150, selectedBranch || undefined),
    refetchInterval: 8_000,
    staleTime: 2_000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: true,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      await clinicApi.inboxSync();
      await clinicApi.aiCallsSync();
    },
    onSuccess: () => refetch(),
  });

  const [activeChannel, setActiveChannel] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openThread, setOpenThread] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date());

  useEffect(() => {
    if (!isFetching) setLastSyncedAt(new Date());
  }, [isFetching, data]);

  const threads = data?.threads || [];

  // Handle URL query parameters (?phone=..., ?name=..., ?channel=..., ?leadId=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qPhone = params.get('phone');
    const qName = params.get('name');
    const qChannel = params.get('channel');
    const qLeadId = params.get('leadId');

    if (qChannel && CHANNEL_CONFIG[qChannel]) {
      setActiveChannel(qChannel);
    } else if (qPhone) {
      setActiveChannel('whatsapp');
    }

    if (qPhone || qName) {
      const cleanTargetPhone = (qPhone || '').replace(/\D/g, '');
      const last10 = cleanTargetPhone.length >= 10 ? cleanTargetPhone.slice(-10) : cleanTargetPhone;

      if (threads.length > 0) {
        const match = threads.find((t) => {
          if (qLeadId && t.leadId && String(t.leadId) === String(qLeadId)) return true;
          const tPhone = (t.phone || '').replace(/\D/g, '');
          const tLast10 = tPhone.length >= 10 ? tPhone.slice(-10) : tPhone;
          if (last10 && tLast10 && last10 === tLast10) return true;
          if (qName && t.name && t.name.toLowerCase().includes(qName.toLowerCase())) return true;
          return false;
        });

        if (match) {
          setOpenThread(match);
        } else if (qPhone) {
          setOpenThread({
            type: 'whatsapp',
            id: 'new-' + (last10 || 'chat'),
            leadId: qLeadId ? Number(qLeadId) : null,
            name: qName ? getContactDisplayName({ name: qName }) : 'WhatsApp Patient',
            phone: qPhone,
            unread: 0,
            status: 'active',
            lastAt: new Date().toISOString(),
            preview: 'Appointment confirmed & reminders via +91 84900 33711',
          });
        }
      } else if (qPhone) {
        setOpenThread({
          type: 'whatsapp',
          id: 'new-' + (last10 || 'chat'),
          leadId: qLeadId ? Number(qLeadId) : null,
          name: qName ? getContactDisplayName({ name: qName }) : 'WhatsApp Patient',
          phone: qPhone,
          unread: 0,
          status: 'active',
          lastAt: new Date().toISOString(),
          preview: 'Appointment confirmed & reminders via +91 84900 33711',
        });
      }
    }
  }, [threads]);

  // Metrics
  const counts = useMemo(() => {
    const wa = threads.filter((t) => t.type === 'whatsapp');
    const ig = threads.filter((t) => t.type === 'instagram');
    const fb = threads.filter((t) => t.type === 'facebook');
    const comIg = threads.filter((t) => t.type === 'comment' && t.channel === 'instagram');
    const comFb = threads.filter((t) => t.type === 'comment' && t.channel === 'facebook');
    const em = threads.filter((t) => t.type === 'email');
    const dr = threads.filter((t) => t.isDraft);
    const ca = threads.filter((t) => t.type === 'call');
    const no = threads.filter((t) => t.type === 'note');
    const unread = threads.filter((t) => (t.unread || 0) > 0);
    return {
      all: threads.length,
      whatsapp: wa.length,
      instagram: ig.length,
      facebook: fb.length,
      comment_ig: comIg.length,
      comment_fb: comFb.length,
      email: em.length,
      drafts: dr.length,
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
    } else if (activeChannel === 'drafts') {
      list = list.filter((t) => t.isDraft);
    } else if (activeChannel === 'comment_ig') {
      list = list.filter((t) => t.type === 'comment' && t.channel === 'instagram');
    } else if (activeChannel === 'comment_fb') {
      list = list.filter((t) => t.type === 'comment' && t.channel === 'facebook');
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
          (t.subject && t.subject.toLowerCase().includes(q)) ||
          (t.postTitle && t.postTitle.toLowerCase().includes(q))
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
          onClick={() => { syncMutation.mutate(); refetch(); }}
          disabled={isFetching || syncMutation.isPending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={13} className={(isFetching || syncMutation.isPending) ? 'animate-spin' : ''} />
          <span>Sync & Refresh</span>
        </button>
      </PageHead>

      {/* KPI Cards across Channels */}
      <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <Card>
          <div className="co-kpi-label">
            <Filter size={13} /> All Messages
          </div>
          <div className="co-kpi-value">{counts.all}</div>
          <div className="co-kpi-foot">{counts.unread} unread</div>
        </Card>
        <Card>
          <div className="co-kpi-label">
            <FacebookIcon size={16} color="#1877F2" /> Messenger
          </div>
          <div className="co-kpi-value">{counts.facebook}</div>
          <div className="co-kpi-foot">Facebook Page</div>
        </Card>
        <Card>
          <div className="co-kpi-label">
            <InstagramIcon size={13} color="#E1306C" /> Instagram
          </div>
          <div className="co-kpi-value">{counts.instagram}</div>
          <div className="co-kpi-foot">Direct Messages</div>
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
            <FacebookIcon size={13} color="#1877F2" /> FB Comments
          </div>
          <div className="co-kpi-value">{counts.comment_fb}</div>
          <div className="co-kpi-foot">Page Posts</div>
        </Card>
        <Card>
          <div className="co-kpi-label">
            <InstagramIcon size={13} color="#E1306C" /> IG Comments
          </div>
          <div className="co-kpi-value">{counts.comment_ig}</div>
          <div className="co-kpi-foot">Posts &amp; Reels</div>
        </Card>
        <Card>
          <div className="co-kpi-label">
            <Mail size={13} style={{ color: '#2563EB' }} /> Emails
          </div>
          <div className="co-kpi-value">{counts.email}</div>
          <div className="co-kpi-foot">{counts.drafts} draft{counts.drafts === 1 ? '' : 's'} pending</div>
        </Card>
        <Card>
          <div className="co-kpi-label">
            <PhoneCall size={13} style={{ color: '#A4285E' }} /> AI Calls
          </div>
          <div className="co-kpi-value">{counts.call}</div>
          <div className="co-kpi-foot">Audio &amp; Transcripts</div>
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
              { id: 'all', label: 'All messages', count: counts.all },
              { id: 'facebook', label: 'Messenger', count: counts.facebook },
              { id: 'instagram', label: 'Instagram', count: counts.instagram },
              { id: 'whatsapp', label: 'WhatsApp', count: counts.whatsapp },
              { id: 'comment_fb', label: 'Facebook comments', count: counts.comment_fb },
              { id: 'comment_ig', label: 'Instagram comments', count: counts.comment_ig },
              { id: 'email', label: 'Emails', count: counts.email },
              { id: 'drafts', label: 'Drafts', count: counts.drafts },
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

          {/* Search Box + auto-sync status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748B' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#10B981', display: 'inline-block' }} />
              Auto-sync · {timeLabel(lastSyncedAt)}
            </div>
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
                : activeChannel === 'drafts'
                ? 'No email drafts waiting. AI-drafted outreach emails will appear here for one-click sending.'
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
                onClick={() => { t.unread = 0; setOpenThread(t); }}
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
