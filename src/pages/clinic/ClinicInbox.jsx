import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { toast } from 'sonner';
import {
  MessageSquare, PhoneCall, StickyNote, RefreshCw, Search, ChevronRight,
  Mail, Phone, Clock, Send, ExternalLink, Check, CheckCheck,
  User, ArrowUpRight, Sparkles, Filter, X, MessageSquareQuote, Heart,
  Eye, EyeOff, ThumbsUp, Tag, Star, AlertTriangle, Trash2, Paperclip
} from 'lucide-react';
import { clinicApi, datetimeLabel, dateLabel, timeLabel, formatMetaTime, cleanEnglishName } from '@/clinic/api';
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

function formatThreadPreview(preview) {
  if (!preview) return '';
  const p = String(preview).trim();
  if (p === '[ig_reel]' || p === '[reel]') return 'Shared a reel';
  if (p === '[ig_post]' || p === '[share]') return 'Shared a post';
  if (p === '[story_mention]') return 'Mentioned in a story';
  if (p === '[image]') return 'Sent an image';
  if (p === '[video]') return 'Sent a video';
  if (p === '[audio]') return 'Sent a voice message';
  if (p.startsWith('[') && p.endsWith(']')) return 'Sent an attachment';
  return p;
}

function MediaBubbleAttachment({ mediaUrl, attachments = [], sharedPost = null }) {
  const [loadError, setLoadError] = useState(false);

  // If there is a shared post/reel/story_mention
  if (sharedPost && (sharedPost.url || sharedPost.thumbnail || sharedPost.title)) {
    const rawType = (sharedPost.type || '').toLowerCase();
    const isReel = rawType.includes('reel');
    const isStory = rawType.includes('story');
    const badgeText = isReel ? 'Reel' : isStory ? 'Story Mention' : 'Instagram Post';

    return (
      <div
        style={{
          marginTop: 8,
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#FFFFFF',
          maxWidth: 280,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        {sharedPost.thumbnail && !loadError ? (
          <img
            src={sharedPost.thumbnail}
            alt={sharedPost.title || 'Shared media'}
            onError={() => setLoadError(true)}
            style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }}
          />
        ) : loadError ? (
          <div style={{ padding: '16px 12px', background: '#F8FAFC', fontSize: 11.5, color: '#64748B', textAlign: 'center' }}>
            Media expired — open in Instagram
          </div>
        ) : null}
        <div style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: 4,
                background: isReel ? '#FCE7F3' : '#F1F5F9',
                color: isReel ? '#BE185D' : '#475569',
              }}
            >
              {badgeText}
            </span>
          </div>
          {sharedPost.title && (
            <div style={{ fontSize: 12, color: '#1E293B', fontWeight: 500, marginBottom: 6, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {sharedPost.title}
            </div>
          )}
          {sharedPost.url && (
            <a
              href={sharedPost.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: '#BE185D',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Open on Instagram <ArrowUpRight size={11} />
            </a>
          )}
        </div>
      </div>
    );
  }

  // Check attachments array or mediaUrl
  const atts = Array.isArray(attachments) && attachments.length > 0 ? attachments : (mediaUrl ? [{ type: 'image', url: mediaUrl }] : []);
  if (atts.length === 0) return null;

  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {atts.map((att, idx) => {
        const type = (att.type || 'image').toLowerCase();
        const url = att.url || mediaUrl;
        if (!url) return null;

        if (type === 'image') {
          return loadError ? (
            <div
              key={idx}
              style={{
                padding: '12px 14px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 6,
                fontSize: 11.5,
                color: '#64748B',
                textAlign: 'center',
              }}
            >
              Media expired — open in Instagram
            </div>
          ) : (
            <img
              key={idx}
              src={url}
              alt={att.title || 'Attachment'}
              onError={() => setLoadError(true)}
              style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 6, display: 'block' }}
            />
          );
        }

        if (type === 'video' || type === 'ig_reel') {
          return (
            <div key={idx} style={{ maxWidth: 280 }}>
              <video
                controls
                src={url}
                style={{ width: '100%', maxHeight: 240, borderRadius: 6, background: '#000' }}
                onError={() => setLoadError(true)}
              >
                Your browser does not support the video tag.
              </video>
              {loadError && (
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                  Media expired — open in Instagram
                </div>
              )}
            </div>
          );
        }

        if (type === 'audio') {
          return (
            <div key={idx} style={{ marginTop: 4 }}>
              <audio controls src={url} style={{ maxWidth: '100%', height: 36 }} />
            </div>
          );
        }

        return (
          <a
            key={idx}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 6,
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              color: '#334155',
              fontSize: 11.5,
              textDecoration: 'none',
              maxWidth: '100%',
            }}
          >
            <Paperclip size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {att.title || 'Download file'}
            </span>
            <ExternalLink size={10} style={{ flexShrink: 0 }} />
          </a>
        );
      })}
    </div>
  );
}

function ThreadRow({ thread, isSelected, onClick }) {
  const isComment = thread.type === 'comment';
  const configKey = isComment
    ? (thread.channel === 'facebook' ? 'comment_fb' : 'comment_ig')
    : thread.type;
  const config = CHANNEL_CONFIG[configKey] || CHANNEL_CONFIG[thread.type] || CHANNEL_CONFIG.whatsapp;
  const isUnread = (thread.unread || 0) > 0;

  return (
    <button
      type="button"
      className={`co-list-item ${isSelected ? 'selected' : ''}`}
      style={{
        alignItems: 'flex-start',
        textAlign: 'left',
        cursor: 'pointer',
        padding: '14px 18px',
        border: 'none',
        borderBottom: '1px solid #F3D9E5',
        borderLeft: isSelected ? '4px solid #CB3273' : isUnread ? '4px solid #F472B6' : '4px solid transparent',
        background: isSelected ? '#FFF5F9' : isUnread ? '#FFFDFE' : '#FFFFFF',
        transition: 'all 0.15s ease',
        width: '100%',
        minHeight: 76,
        boxSizing: 'border-box',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = '#FDF7FA';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = isUnread ? '#FFFDFE' : '#FFFFFF';
        }
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 2 }}>
        <MetaAvatar
          name={thread.name}
          username={thread.senderUsername}
          avatarUrl={thread.senderAvatar || thread.participantAvatar}
          channel={isComment ? (thread.channel === 'facebook' ? 'comment_fb' : 'comment_ig') : thread.type}
          size={42}
        />
        {isUnread ? (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              color: '#FFFFFF',
              background: 'linear-gradient(135deg, #A4285E 0%, #CB3273 100%)',
              padding: '1px 6px',
              borderRadius: 999,
              boxShadow: '0 2px 6px rgba(203, 50, 115, 0.35)',
            }}
          >
            {thread.unread}
          </span>
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0, marginLeft: 14 }}>
        <div className="co-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 5, alignItems: 'center' }}>
          <span
            className="co-strong"
            style={{
              fontSize: 14,
              fontWeight: isUnread ? 800 : 600,
              color: isUnread ? '#0F172A' : '#1E293B',
              letterSpacing: '-0.01em',
            }}
          >
            {thread.name && thread.name !== 'Instagram User' && thread.name !== 'Facebook User'
              ? thread.name
              : (thread.senderUsername ? `@${thread.senderUsername}` : (isComment ? 'Name hidden by Meta' : 'Patient'))}
          </span>

          {isUnread && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: '#CB3273',
                display: 'inline-block',
                boxShadow: '0 0 0 2px rgba(203, 50, 115, 0.25)',
              }}
            />
          )}

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
            style={{ fontSize: 10, padding: '1px 7px' }}
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
                border: '1px solid #A7F3D0',
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
                border: '1px solid #DDD6FE',
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
                border: '1px solid #FDE68A',
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
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.45, minHeight: 18, paddingBottom: 2 }}>
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
            lineHeight: 1.5,
            minHeight: 20,
            paddingTop: 1,
            paddingBottom: 2,
          }}
        >
          {formatThreadPreview(thread.preview)}
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

  const isMetaChannel = thread.type === 'facebook' || thread.type === 'instagram';
  const windowExp = detail?.window_expires_at || detail?.conversation?.window_expires_at || thread.windowExpiresAt;
  const isWindowExpired = Boolean(
    isMetaChannel && windowExp && new Date(windowExp).getTime() < Date.now()
  );

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
      if (err.message && (err.message.includes('24h window expired') || err.message.includes('WINDOW_EXPIRED'))) {
        setSendingStatus('24h window expired — customer must reply first.');
      } else {
        setSendingStatus(`Failed: ${err.message}`);
      }
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
                          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
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
                          {m.content && !m.content.startsWith('[') && (
                            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                              {m.content}
                            </div>
                          )}
                          <MediaBubbleAttachment
                            mediaUrl={m.mediaUrl}
                            attachments={m.attachments}
                            sharedPost={m.sharedPost}
                          />
                          {m.status === 'failed' && (
                            <div style={{ marginTop: 6, fontSize: 11, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 5, background: '#FEF2F2', padding: '4px 8px', borderRadius: 4, border: '1px solid #FECACA' }}>
                              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                              <span>Failed to deliver: {m.errorMessage || 'Meta API delivery error'}</span>
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
                            <span>{m.timestamp ? formatMetaTime(m.timestamp) : ''}</span>
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
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere',
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
                      maxHeight: 280,
                      overflowY: 'auto',
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: '#334155',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
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

          {isWindowExpired && (
            <div
              style={{
                padding: '10px 14px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: '#B91C1C',
                fontSize: 12,
                lineHeight: 1.4,
                marginBottom: 8,
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, color: '#DC2626' }} />
              <span>
                <strong>24h window expired.</strong> Meta requires the user to send a new message before you can reply.
              </span>
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
              disabled={isWindowExpired}
              placeholder={
                isWindowExpired
                  ? '24h messaging window closed — waiting for user to message...'
                  : thread.type === 'whatsapp'
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
              style={{
                fontSize: 12.5,
                lineHeight: 1.4,
                resize: 'vertical',
                background: isWindowExpired ? '#F9FAFB' : '#FFFFFF',
                cursor: isWindowExpired ? 'not-allowed' : 'text'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
              <button
                type="submit"
                className="co-btn co-btn-p co-btn-sm"
                disabled={isWindowExpired || replyMutation.isPending || (!replyText.trim() && !useMetaTemplate)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: isWindowExpired ? 0.6 : 1 }}
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

  const [syncStatusBanner, setSyncStatusBanner] = useState(null);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await clinicApi.inboxSync();
      try {
        await clinicApi.aiCallsSync();
      } catch (e) {
        console.warn('AI calls sync warning:', e.message);
      }
      return res;
    },
    onSuccess: (res) => {
      refetch();
      const meta = res?.meta || {};
      const msgResult = meta.messenger;
      const igResult = meta.instagramComments;
      const fbResult = meta.facebookComments;

      const parts = [];
      const errors = [];

      if (msgResult) {
        if (msgResult.error) {
          errors.push(`Messenger: ${msgResult.error}`);
        } else {
          parts.push(`Messenger: ${msgResult.syncedConversations ?? 0} conversations, ${msgResult.syncedMessages ?? 0} messages`);
        }
      }
      if (igResult) {
        if (igResult.error) {
          errors.push(`IG comments: ${igResult.error}`);
        } else if (typeof igResult.synced === 'number') {
          parts.push(`IG comments: ${igResult.synced}`);
        }
      }
      if (fbResult) {
        if (fbResult.error) {
          errors.push(`FB comments: ${fbResult.error}`);
        } else if (typeof fbResult.synced === 'number') {
          parts.push(`FB comments: ${fbResult.synced}`);
        }
      }
      if (res?.whatsapp?.error) {
        errors.push(`WhatsApp: ${res.whatsapp.error}`);
      }

      const summary = parts.join(' · ') || 'Sync completed';
      const errorMsg = errors.length > 0 ? errors.join(' | ') : null;

      setSyncStatusBanner({
        summary,
        error: errorMsg,
        timestamp: new Date()
      });

      if (errorMsg) {
        toast.error(`Sync finished with issues: ${errorMsg}`);
      } else {
        toast.success(summary);
      }
    },
    onError: (err) => {
      const msg = err?.message || 'Sync failed';
      setSyncStatusBanner({
        summary: 'Sync failed',
        error: msg,
        timestamp: new Date()
      });
      toast.error(`Sync failed: ${msg}`);
    }
  });

  const [activeChannel, setActiveChannel] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [openThread, setOpenThread] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date());
  const [paginatedThreads, setPaginatedThreads] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Reset pagination when channel changes
  useEffect(() => {
    setPaginatedThreads([]);
    setHasMore(true);
  }, [activeChannel]);

  useEffect(() => {
    if (!isFetching) setLastSyncedAt(new Date());
  }, [isFetching, data]);

  const rawThreads = data?.threads || [];
  const threads = useMemo(() => {
    if (paginatedThreads.length === 0) return rawThreads;
    const seen = new Set(rawThreads.map(t => `${t.type}-${t.id}`));
    const uniquePaginated = paginatedThreads.filter(t => !seen.has(`${t.type}-${t.id}`));
    return [...rawThreads, ...uniquePaginated];
  }, [rawThreads, paginatedThreads]);

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

  // Meta-style inbox filters: channel, reply state, search and sort.
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

    if (statusFilter === 'unread') {
      list = list.filter((t) => (t.unread || 0) > 0);
    } else if (statusFilter === 'replied') {
      list = list.filter((t) => t.status === 'replied');
    } else if (statusFilter === 'needs_reply') {
      list = list.filter((t) => t.status !== 'replied' && t.type !== 'note' && !t.isDraft);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((t) =>
        [t.name, t.senderUsername, t.email, t.phone, t.preview, t.subject, t.postTitle]
          .some((value) => value && String(value).toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      const aTime = new Date(a.lastAt || a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.lastAt || b.createdAt || 0).getTime() || 0;
      return sortOrder === 'oldest' ? aTime - bTime : bTime - aTime;
    });
  }, [threads, activeChannel, statusFilter, searchQuery, sortOrder]);

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    const currentList = filteredThreads;
    const oldest = currentList.reduce((earliest, thread) => {
      if (!thread?.lastAt) return earliest;
      if (!earliest?.lastAt) return thread;
      return new Date(thread.lastAt).getTime() < new Date(earliest.lastAt).getTime() ? thread : earliest;
    }, null);
    if (!oldest?.lastAt) {
      setHasMore(false);
      return;
    }
    setIsLoadingMore(true);
    try {
      const res = await clinicApi.inbox(50, oldest.lastAt, activeChannel);
      const more = res?.threads || [];
      if (more.length === 0) {
        setHasMore(false);
      } else {
        setPaginatedThreads((prev) => [...prev, ...more]);
      }
    } catch {
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="clinic-os">
      <PageHead
        title="Unified Inbox"
        subtitle="Every patient conversation — WhatsApp, Emails, AI calls, and Clinical Notes in one central timeline."
      >
        <button
          type="button"
          className="co-btn co-btn-sm"
          onClick={() => syncMutation.mutate()}
          disabled={isFetching || syncMutation.isPending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={13} className={(isFetching || syncMutation.isPending) ? 'animate-spin' : ''} />
          <span>Sync & Refresh</span>
        </button>
      </PageHead>

      {/* Sync result banner */}
      {syncStatusBanner && (
        <div
          className="co-rise-1"
          style={{
            margin: '0 0 16px 0',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: syncStatusBanner.error ? '#FEF2F2' : '#F0FDF4',
            border: `1px solid ${syncStatusBanner.error ? '#FECACA' : '#BBF7D0'}`,
            color: syncStatusBanner.error ? '#991B1B' : '#166534',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {syncStatusBanner.error ? <AlertTriangle size={15} color="#DC2626" /> : <Check size={15} color="#16A34A" />}
            <span style={{ fontWeight: 600 }}>{syncStatusBanner.summary}</span>
            {syncStatusBanner.error && (
              <span style={{ fontSize: 12, opacity: 0.9 }}>— {syncStatusBanner.error}</span>
            )}
            <span style={{ fontSize: 11, opacity: 0.7 }}>({timeLabel(syncStatusBanner.timestamp)})</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncStatusBanner(null)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              padding: 2,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Executive KPI Summary Cards — Instant Clinic Overview */}
      <div
        className="co-rise-1"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          {
            id: 'all',
            label: 'All Conversations',
            count: counts.all,
            sub: 'Across all patient channels',
            icon: MessageSquare,
            color: '#CB3273',
            bg: '#FDF2F8',
            border: '#FBCFE8',
            active: activeChannel === 'all',
          },
          {
            id: 'unread',
            label: 'Unread & Pending',
            count: counts.unread,
            sub: 'Awaiting clinic response',
            icon: Sparkles,
            color: '#A4285E',
            bg: '#FBE9F1',
            border: '#F7D6E4',
            badge: counts.unread > 0 ? 'Needs Attention' : null,
            badgeColor: '#A4285E',
            badgeBg: '#FDF2F8',
            active: activeChannel === 'unread',
          },
          {
            id: 'whatsapp',
            label: 'WhatsApp Business',
            count: counts.whatsapp,
            sub: '+91 84900 33711 (Official)',
            icon: MessageSquare,
            color: '#10B981',
            bg: '#ECFDF5',
            border: '#A7F3D0',
            active: activeChannel === 'whatsapp',
          },
          {
            id: 'instagram',
            label: 'Social & Meta',
            count: counts.instagram + counts.facebook + counts.comment_ig + counts.comment_fb,
            sub: 'Instagram & Messenger',
            icon: InstagramIcon,
            color: '#E1306C',
            bg: '#FDF2F8',
            border: '#FCE7F3',
            active: activeChannel === 'instagram' || activeChannel === 'facebook' || activeChannel === 'comment_ig' || activeChannel === 'comment_fb',
          },
          {
            id: 'call',
            label: 'AI Voice Calls',
            count: counts.call,
            sub: 'Sarvam AI Voice Agent',
            icon: PhoneCall,
            color: '#7C3AED',
            bg: '#F5F3FF',
            border: '#DDD6FE',
            active: activeChannel === 'call',
          },
        ].map((card) => {
          const Icon = card.icon;
          const isCardActive = card.active;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveChannel(card.id)}
              style={{
                background: isCardActive ? '#FFF8FB' : '#FFFFFF',
                border: isCardActive ? `2px solid #CB3273` : '1px solid #F3D9E5',
                borderRadius: 14,
                padding: '14px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 8,
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: isCardActive
                  ? '0 6px 20px -4px rgba(203, 50, 115, 0.18)'
                  : '0 1px 3px rgba(15, 23, 42, 0.03)',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (!isCardActive) {
                  e.currentTarget.style.borderColor = '#CB3273';
                  e.currentTarget.style.boxShadow = '0 4px 14px -2px rgba(203, 50, 115, 0.12)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isCardActive) {
                  e.currentTarget.style.borderColor = '#F3D9E5';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.03)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B' }}>
                  {card.label}
                </span>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: card.bg,
                    border: `1px solid ${card.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: card.color,
                  }}
                >
                  <Icon size={14} color={card.color} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    color: isCardActive ? '#A4285E' : '#0F172A',
                    lineHeight: 1,
                  }}
                >
                  {card.count}
                </span>
                {card.badge && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: card.badgeColor,
                      background: card.badgeBg,
                      border: '1px solid #FBCFE8',
                      padding: '2px 6px',
                      borderRadius: 999,
                    }}
                  >
                    {card.badge}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: -2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {card.sub}
              </div>
            </button>
          );
        })}
      </div>

      <Card rise="co-rise-2">
        {/* Filter Tabs & Search Controls */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '16px 18px',
            borderBottom: '1px solid #F3D9E5',
            background: 'linear-gradient(180deg, #FFFCFD 0%, #FFFFFF 100%)',
          }}
        >
          {/* Channel tabs: horizontally scrollable with a visible scrollbar on smaller screens */}
          <div
            role="group"
            aria-label="Filter conversations by channel"
            className="aura-inbox-channel-scroll"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              minWidth: 0,
              maxWidth: '100%',
              flexWrap: 'nowrap',
              overflowX: 'scroll',
              overflowY: 'hidden',
              padding: '2px 2px 10px',
              scrollbarWidth: 'thin',
              scrollbarColor: '#CBD5E1 #F1F5F9',
              msOverflowStyle: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorX: 'contain',
              scrollSnapType: 'x proximity',
              boxSizing: 'border-box',
            }}
          >
            {[
              { id: 'all', label: 'All Messages', icon: Filter, count: counts.all },
              { id: 'unread', label: 'Unread', icon: Sparkles, count: counts.unread, highlight: counts.unread > 0 },
              { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, count: counts.whatsapp, brandColor: '#10B981' },
              { id: 'instagram', label: 'Instagram', icon: InstagramIcon, count: counts.instagram, brandColor: '#E1306C' },
              { id: 'facebook', label: 'Messenger', icon: FacebookIcon, count: counts.facebook, brandColor: '#1877F2' },
              { id: 'comment_ig', label: 'IG Comments', icon: InstagramIcon, count: counts.comment_ig },
              { id: 'comment_fb', label: 'FB Comments', icon: FacebookIcon, count: counts.comment_fb },
              { id: 'call', label: 'AI Calls', icon: PhoneCall, count: counts.call, brandColor: '#7C3AED' },
              { id: 'email', label: 'Emails', icon: Mail, count: counts.email },
              { id: 'drafts', label: 'Drafts', icon: Mail, count: counts.drafts },
              { id: 'note', label: 'Clinical Notes', icon: StickyNote, count: counts.note },
            ].map((tab) => {
              const active = activeChannel === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveChannel(tab.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    background: active
                      ? 'linear-gradient(135deg, #A4285E 0%, #CB3273 100%)'
                      : tab.highlight
                      ? '#FFF1F6'
                      : '#FFFFFF',
                    color: active ? '#FFFFFF' : tab.highlight ? '#A4285E' : '#475569',
                    border: active
                      ? '1px solid #A4285E'
                      : tab.highlight
                      ? '1px solid #FBCFE8'
                      : '1px solid #F3D9E5',
                    boxShadow: active
                      ? '0 3px 10px rgba(164, 40, 94, 0.22)'
                      : '0 1px 2px rgba(15, 23, 42, 0.02)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    whiteSpace: 'nowrap',
                    flex: '0 0 auto',
                    flexShrink: 0,
                    scrollSnapAlign: 'start',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = '#FDF2F8';
                      e.currentTarget.style.borderColor = '#CB3273';
                      e.currentTarget.style.color = '#A4285E';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = tab.highlight ? '#FFF1F6' : '#FFFFFF';
                      e.currentTarget.style.borderColor = tab.highlight ? '#FBCFE8' : '#F3D9E5';
                      e.currentTarget.style.color = tab.highlight ? '#A4285E' : '#475569';
                    }
                  }}
                >
                  <TabIcon
                    size={13}
                    color={active ? '#FFFFFF' : tab.brandColor || (tab.highlight ? '#A4285E' : '#64748B')}
                  />
                  <span>{tab.label}</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: active
                        ? 'rgba(255, 255, 255, 0.25)'
                        : tab.highlight
                        ? '#FBCFE8'
                        : '#FDF2F8',
                      color: active ? '#FFFFFF' : '#A4285E',
                      border: active ? 'none' : '1px solid #F3D9E5',
                      padding: '1px 6px',
                      borderRadius: 999,
                      lineHeight: 1.3,
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search, Reply-state, Sort Controls & Live Sync */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              width: '100%',
              paddingTop: 4,
            }}
          >
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 240, maxWidth: 440 }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#CB3273',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                className="co-input"
                placeholder="Search patient name, phone, handle, or message…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  paddingLeft: 36,
                  paddingRight: searchQuery ? 32 : 12,
                  fontSize: 12.5,
                  height: 38,
                  borderRadius: 10,
                  border: '1px solid #F3D9E5',
                  background: '#FFFFFF',
                  outline: 'none',
                  transition: 'border-color .18s ease, box-shadow .18s ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#CB3273';
                  e.target.style.boxShadow = '0 0 0 3px rgba(203, 50, 115, 0.12)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#F3D9E5';
                  e.target.style.boxShadow = 'none';
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter Dropdowns and Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 10px',
                  height: 38,
                  border: '1px solid #F3D9E5',
                  borderRadius: 10,
                  background: '#FFFFFF',
                  fontSize: 12,
                }}
              >
                <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>Status:</span>
                <select
                  aria-label="Filter conversations by reply status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    height: 34,
                    border: 0,
                    outline: 0,
                    background: 'transparent',
                    color: '#1E293B',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All</option>
                  <option value="unread">Unread</option>
                  <option value="needs_reply">Needs reply</option>
                  <option value="replied">Replied</option>
                </select>
              </label>

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 10px',
                  height: 38,
                  border: '1px solid #F3D9E5',
                  borderRadius: 10,
                  background: '#FFFFFF',
                  fontSize: 12,
                }}
              >
                <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>Sort:</span>
                <select
                  aria-label="Sort conversations"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  style={{
                    height: 34,
                    border: 0,
                    outline: 0,
                    background: 'transparent',
                    color: '#1E293B',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </label>

              {(statusFilter !== 'all' || searchQuery || sortOrder !== 'newest' || activeChannel !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveChannel('all');
                    setStatusFilter('all');
                    setSearchQuery('');
                    setSortOrder('newest');
                  }}
                  className="co-btn co-btn-sm"
                  style={{
                    height: 38,
                    fontSize: 11.5,
                    color: '#A4285E',
                    borderColor: '#F3D9E5',
                    background: '#FDF2F8',
                    fontWeight: 600,
                  }}
                >
                  <X size={12} /> Clear filters
                </button>
              )}

              {/* Live Auto-sync indicator badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 12px',
                  height: 38,
                  borderRadius: 10,
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: 11.5,
                  color: '#475569',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: '#10B981',
                    display: 'inline-block',
                    boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.2)',
                  }}
                />
                <span>Live Sync · {timeLabel(lastSyncedAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Per-channel status lines (D.2: never show a silent 0) */}
        {activeChannel === 'instagram' && (
          <div
            style={{
              margin: '14px 16px 4px',
              padding: '10px 14px',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#92400E',
              fontSize: 12.5,
              lineHeight: 1.4,
            }}
          >
            <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0 }} />
            <span>
              Instagram history needs Advanced Access (live messages work).
            </span>
          </div>
        )}

        {activeChannel === 'comment_fb' && (
          <div
            style={{
              margin: '14px 16px 4px',
              padding: '10px 14px',
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#1E40AF',
              fontSize: 12.5,
              lineHeight: 1.4,
            }}
          >
            <AlertTriangle size={16} style={{ color: '#2563EB', flexShrink: 0 }} />
            <span>
              Facebook commenter names need Advanced Access.
            </span>
          </div>
        )}

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
          <div>
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

            {filteredThreads.length >= 10 && hasMore && (
              <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: '1px solid #F1F5F9' }}>
                <button
                  type="button"
                  className="co-btn co-btn-sm"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  style={{ fontSize: 11.5, padding: '4px 14px' }}
                >
                  {isLoadingMore ? <Spinner size={11} label="Loading older..." /> : 'Load older conversations'}
                </button>
              </div>
            )}
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
