import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  MessageSquare, PhoneCall, StickyNote, RefreshCw, Search, ChevronRight,
  Mail, Phone, MapPin, CalendarDays, AlertCircle, Clock,
} from 'lucide-react';
import { clinicApi, dateLabel, timeLabel, datetimeLabel, fullName } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Drawer } from '@/clinic/ui';

const ICONS = {
  whatsapp: MessageSquare,
  call: PhoneCall,
  note: StickyNote,
};

const TYPE_LABEL = {
  whatsapp: 'WhatsApp',
  call: 'AI Call',
  note: 'Note',
};

const TYPE_CHIP = {
  whatsapp: 'co-c-p',
  call: 'co-c-m',
  note: 'co-c-o',
};

function ThreadRow({ thread, onClick }) {
  const Icon = ICONS[thread.type] || MessageSquare;
  return (
    <button
      type="button"
      className="co-list-item"
      style={{ alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer' }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Icon size={16} style={{ color: thread.unread > 0 ? '#A4285E' : '#9CA3AF' }} />
        {thread.unread > 0 ? <span style={{ fontSize: 9, fontWeight: 700, color: '#A4285E', background: '#FBE9F1', padding: '1px 4px', borderRadius: 999 }}>{thread.unread}</span> : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="co-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 3 }}>
          <div className="co-strong" style={{ fontSize: 13 }}>{thread.name}</div>
          <span className={`co-chip ${TYPE_CHIP[thread.type]}`}>{TYPE_LABEL[thread.type]}</span>
          {thread.phone ? <span className="co-xs co-mut"><Phone size={10} /> {thread.phone}</span> : null}
        </div>
        <div className="co-xs co-mut" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {thread.preview}
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 90 }}>
        <div className="co-xs co-mut">{thread.lastAt ? datetimeLabel(thread.lastAt) : '—'}</div>
        <ChevronRight size={14} style={{ color: '#C4C9D4' }} />
      </div>
    </button>
  );
}

function ThreadDrawer({ thread, onClose }) {
  const [detail, setDetail] = useState(null);

  return (
    <Drawer
      title={thread.name}
      subtitle={TYPE_LABEL[thread.type]}
      onClose={onClose}
      actions={<span />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {thread.type === 'whatsapp' && (
          <div className="co-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="co-chip co-c-n"><MessageSquare size={11} /> WhatsApp</span>
            {thread.phone ? <a href={`https://wa.me/${thread.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="co-chip co-c-p"><Phone size={11} /> Open in WhatsApp</a> : null}
            <Link href={`/clinic/patients/${thread.leadId}`} className="co-chip co-c-n"><ChevronRight size={11} /> Patient 360</Link>
          </div>
        )}
        {thread.type === 'call' && (
          <div className="co-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="co-chip co-c-m"><PhoneCall size={11} /> Call Recording</span>
            <Link href={`/clinic/call-review/${thread.id}`} className="co-btn co-btn-sm"><Clock size={12} /> Review call</Link>
            <Link href={`/clinic/patients/${thread.leadId}`} className="co-chip co-c-n"><ChevronRight size={11} /> Patient 360</Link>
          </div>
        )}
        {thread.type === 'note' && (
          <div className="co-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="co-chip co-c-o"><StickyNote size={11} /> Clinic Note</span>
            <Link href={`/clinic/patients/${thread.leadId}`} className="co-chip co-c-n"><ChevronRight size={11} /> Patient 360</Link>
          </div>
        )}

        {detail ? (
          <div style={{ borderTop: '1px solid #F3D9E5', paddingTop: 16 }}>
            <div className="co-label" style={{ marginBottom: 8 }}>Conversation</div>
            <div className="co-list" style={{ maxHeight: 400, overflow: 'auto' }}>
              {detail.messages?.map((m, i) => (
                <div className="co-list-item" key={i} style={{ background: m.direction === 'outbound' ? '#FBE9F1' : '#fff' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="co-xs co-mut">{datetimeLabel(m.sentAt || m.timestamp)}</div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.content || m.body || ''}</div>
                  </div>
                </div>
              ))}
              {detail.transcript && (
                <div className="co-list-item" style={{ background: '#F5F0FA' }}>
                  <div className="co-label" style={{ marginBottom: 6 }}>AI Transcript</div>
                  <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#374151' }}>{detail.transcript}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="co-empty" style={{ flex: 1 }}>
            <div className="co-empty-title">Loading conversation…</div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

export default function ClinicInbox() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'inbox'],
    queryFn: () => clinicApi.inbox(100),
    refetchInterval: 30_000,
  });
  const [openThread, setOpenThread] = useState(null);

  const threads = data?.threads || [];
  const unreadTotal = threads.reduce((n, t) => n + (t.unread || 0), 0);

  return (
    <div className="clinic-os">
      <PageHead
        title="Unified Inbox"
        subtitle="WhatsApp, AI calls and clinic notes — one timeline per patient."
      >
        <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHead>

      <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Card><div className="co-kpi-label"><MessageSquare size={13} /> Conversations</div><div className="co-kpi-value">{threads.length}</div><div className="co-kpi-foot">{unreadTotal} unread</div></Card>
        <Card><div className="co-kpi-label"><PhoneCall size={13} /> AI Calls</div><div className="co-kpi-value">{threads.filter(t => t.type === 'call').length}</div><div className="co-kpi-foot">This period</div></Card>
        <Card><div className="co-kpi-label"><StickyNote size={13} /> Clinic Notes</div><div className="co-kpi-value">{threads.filter(t => t.type === 'note').length}</div><div className="co-kpi-foot">Timeline entries</div></Card>
      </div>

      <Card rise="co-rise-2">
        <CardHead title="All threads" hint={`${threads.length} items`} />
        {isLoading ? <Spinner /> : threads.length === 0 ? (
          <EmptyState title="No messages yet">
            <p className="co-sm co-mut">WhatsApp conversations, AI call transcripts and clinic notes will appear here.</p>
          </EmptyState>
        ) : (
          <div className="co-list">
            {threads.map((t) => (
              <ThreadRow key={t.id} thread={t} onClick={() => setOpenThread(t)} />
            ))}
          </div>
        )}
      </Card>

      {openThread ? <ThreadDrawer thread={openThread} onClose={() => setOpenThread(null)} /> : null}
    </div>
  );
}