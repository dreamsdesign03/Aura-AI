import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';
import {
  ChevronLeft, Volume2, Play, Pause, Download, Clock, ArrowUpRight,
  RefreshCw, CalendarDays, PhoneCall, Phone, PhoneIncoming, PhoneOutgoing,
  Sparkles, Filter, Search, X, CheckCircle2, User, FileText, CheckCheck, MessageSquare
} from 'lucide-react';
import { clinicApi, dateLabel, timeLabel, fullName } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner } from '@/clinic/ui';

function formatDuration(sec) {
  if (!sec && sec !== 0) return '—';
  const s = Math.round(Number(sec) || 0);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onLoaded = () => setDuration(a.duration || 0);
    const onEnded = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  const seek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pos * duration;
    audioRef.current.currentTime = newTime;
    setCurrent(newTime);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      {src && <audio ref={audioRef} src={src} preload="metadata" />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          className="co-btn co-btn-sm co-icon-btn"
          style={{
            background: playing ? '#A4285E' : '#FBE9F1',
            color: playing ? '#fff' : '#A4285E',
            width: 36,
            height: 36,
            borderRadius: 999,
          }}
          onClick={toggle}
          disabled={!src}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            className="co-bar-track"
            onClick={seek}
            style={{ flex: 1, height: 6, cursor: src ? 'pointer' : 'default', borderRadius: 999 }}
          >
            <div
              className="co-bar-fill"
              style={{
                width: duration > 0 ? `${(current / duration) * 100}%` : '0%',
                background: '#A4285E',
                borderRadius: 999,
              }}
            />
          </div>
          <span className="co-xs co-mut" style={{ minWidth: 75, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(current)} / {formatDuration(duration || 0)}
          </span>
        </div>

        {src ? (
          <a
            href={src}
            download
            className="co-btn co-btn-sm"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}
          >
            <Download size={12} /> Audio MP3/WAV
          </a>
        ) : (
          <span className="co-xs co-mut">Audio recording unavailable</span>
        )}
      </div>
    </div>
  );
}

function ProviderBadge({ provider }) {
  const p = (provider || 'plivo').toLowerCase();
  if (p === 'sarvam') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 10.5,
          fontWeight: 700,
          background: '#EEF2FF',
          color: '#4F46E5',
          border: '1px solid #C7D2FE',
        }}
      >
        <Sparkles size={11} /> Sarvam AI
      </span>
    );
  }
  if (p === 'mock') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 10.5,
          fontWeight: 700,
          background: '#F1F5F9',
          color: '#475569',
          border: '1px solid #E2E8F0',
        }}
      >
        Simulation
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        background: '#E0F2FE',
        color: '#0284C7',
        border: '1px solid #BAE6FD',
      }}
    >
      <PhoneCall size={11} /> Plivo Telephony
    </span>
  );
}

function DirectionBadge({ direction }) {
  const d = (direction || 'outbound').toLowerCase();
  const isInbound = d === 'inbound';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        background: isInbound ? '#ECFDF5' : '#F0F9FF',
        color: isInbound ? '#059669' : '#0284C7',
        border: isInbound ? '1px solid #A7F3D0' : '1px solid #BAE6FD',
      }}
    >
      {isInbound ? <PhoneIncoming size={11} /> : <PhoneOutgoing size={11} />}
      {isInbound ? 'Inbound' : 'Outbound'}
    </span>
  );
}

function SentimentBadge({ sentiment }) {
  if (!sentiment) return null;
  const s = sentiment.toLowerCase();
  const isPos = s.includes('positive') || s.includes('booked');
  const isNeg = s.includes('negative') || s.includes('not_interested');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        background: isPos ? '#ECFDF5' : isNeg ? '#FEF2F2' : '#F8FAFC',
        color: isPos ? '#059669' : isNeg ? '#DC2626' : '#64748B',
      }}
    >
      {sentiment}
    </span>
  );
}

function normalizeTranscriptTurns(rawTranscript) {
  if (!rawTranscript) return [];
  if (typeof rawTranscript === 'string') {
    try {
      const parsed = JSON.parse(rawTranscript);
      if (Array.isArray(parsed)) return normalizeTranscriptTurns(parsed);
    } catch {
      return [{ speaker: 'Agent', text: rawTranscript }];
    }
  }

  if (Array.isArray(rawTranscript)) {
    return rawTranscript.map((t, idx) => {
      // Format 1: { speaker: "AI" | "Patient", text: "..." }
      if (t.speaker || t.text) {
        return {
          id: idx,
          speaker: t.speaker || (t.role === 'agent' ? 'AI Coordinator' : 'Patient'),
          text: t.text || t.message || t.content || '',
          time: t.time || t.timestamp,
        };
      }
      // Format 2: ElevenLabs / Sarvam turn { role: "agent"|"user", message: "..." }
      if (t.role || t.message || t.content) {
        const isAgent = t.role === 'agent' || t.role === 'assistant';
        return {
          id: idx,
          speaker: isAgent ? 'AI Coordinator' : 'Patient',
          text: t.message || t.content || t.original_message || '',
          time: t.time_in_call_secs != null ? `${t.time_in_call_secs}s` : null,
        };
      }
      return { id: idx, speaker: 'Turn', text: JSON.stringify(t) };
    }).filter(turn => turn.text && turn.text.trim());
  }

  return [];
}

export default function ClinicCallReview({ id }) {
  const [, params] = useRoute('/clinic/call-review/:id');
  const activeId = id || params?.id;

  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const listQuery = useQuery({
    queryKey: ['clinic', 'call-reviews'],
    queryFn: () => clinicApi.callReviews(),
    enabled: !activeId,
    refetchInterval: 20_000,
  });

  const detailQuery = useQuery({
    queryKey: ['clinic', 'call-review', activeId],
    queryFn: () => clinicApi.callReview(activeId),
    enabled: !!activeId,
  });

  if (!activeId) {
    const rawCalls = listQuery.data?.calls || [];
    const stats = listQuery.data?.stats || {
      total: rawCalls.length,
      inbound: rawCalls.filter(c => (c.direction || 'outbound').toLowerCase() === 'inbound').length,
      outbound: rawCalls.filter(c => (c.direction || 'outbound').toLowerCase() === 'outbound').length,
      plivo: rawCalls.filter(c => (c.provider || 'plivo').toLowerCase() === 'plivo').length,
      sarvam: rawCalls.filter(c => (c.provider || '').toLowerCase() === 'sarvam').length,
      total_duration: rawCalls.reduce((s, c) => s + (c.duration_secs || 0), 0),
    };

    const filteredCalls = rawCalls.filter(c => {
      const p = (c.provider || 'plivo').toLowerCase();
      const d = (c.direction || 'outbound').toLowerCase();

      if (activeFilter === 'inbound' && d !== 'inbound') return false;
      if (activeFilter === 'outbound' && d !== 'outbound') return false;
      if (activeFilter === 'plivo' && p !== 'plivo') return false;
      if (activeFilter === 'sarvam' && p !== 'sarvam') return false;
      if (activeFilter === 'recording' && !c.recording_url) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (c.display_name || c.lead_name || fullName(c) || '').toLowerCase();
        const toPhone = (c.to_phone || c.phone || '').toLowerCase();
        const fromPhone = (c.from_phone || '').toLowerCase();
        const sid = (c.call_sid || c.conversation_id || '').toLowerCase();
        const summary = (c.transcript_summary || '').toLowerCase();
        if (!name.includes(q) && !toPhone.includes(q) && !fromPhone.includes(q) && !sid.includes(q) && !summary.includes(q)) {
          return false;
        }
      }

      return true;
    });

    return (
      <div className="clinic-os">
        <PageHead
          title="Call Review & Telephony Transactions"
          subtitle="Real-time transaction logs across Plivo and Sarvam AI — inbound & outbound calls, recordings, and conversation transcripts."
        >
          <button
            type="button"
            className="co-btn co-btn-sm"
            onClick={() => listQuery.refetch()}
            disabled={listQuery.isFetching}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} className={listQuery.isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          <Link href="/clinic/dialer" className="co-btn co-btn-primary co-btn-sm">
            <PhoneCall size={14} /> Open Dialer
          </Link>
        </PageHead>

        {/* 6 Top KPI Metrics */}
        <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
          <Card>
            <div className="co-kpi-label"><PhoneCall size={13} /> Total Calls</div>
            <div className="co-kpi-value">{stats.total}</div>
            <div className="co-kpi-foot">Telephony logged</div>
          </Card>
          <Card>
            <div className="co-kpi-label"><PhoneIncoming size={13} style={{ color: '#059669' }} /> Inbound Calls</div>
            <div className="co-kpi-value">{stats.inbound}</div>
            <div className="co-kpi-foot">Incoming to Clinic</div>
          </Card>
          <Card>
            <div className="co-kpi-label"><PhoneOutgoing size={13} style={{ color: '#0284C7' }} /> Outbound Calls</div>
            <div className="co-kpi-value">{stats.outbound}</div>
            <div className="co-kpi-foot">Dispatched</div>
          </Card>
          <Card>
            <div className="co-kpi-label"><PhoneCall size={13} style={{ color: '#0284C7' }} /> Plivo Transactions</div>
            <div className="co-kpi-value">{stats.plivo}</div>
            <div className="co-kpi-foot">Voice carrier calls</div>
          </Card>
          <Card>
            <div className="co-kpi-label"><Sparkles size={13} style={{ color: '#6366F1' }} /> Sarvam AI</div>
            <div className="co-kpi-value">{stats.sarvam}</div>
            <div className="co-kpi-foot">AI Agent Samvaad</div>
          </Card>
          <Card>
            <div className="co-kpi-label"><Clock size={13} style={{ color: '#A4285E' }} /> Total Talk Time</div>
            <div className="co-kpi-value">{formatDuration(stats.total_duration)}</div>
            <div className="co-kpi-foot">Connected duration</div>
          </Card>
        </div>

        <Card rise="co-rise-2">
          {/* Filter Bar & Search */}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { id: 'all', label: 'All Transactions', count: stats.total },
                { id: 'inbound', label: 'Inbound', count: stats.inbound },
                { id: 'outbound', label: 'Outbound', count: stats.outbound },
                { id: 'plivo', label: 'Plivo Calls', count: stats.plivo },
                { id: 'sarvam', label: 'Sarvam AI', count: stats.sarvam },
                { id: 'recording', label: 'Recordings', count: rawCalls.filter(c => !!c.recording_url).length },
              ].map(f => {
                const active = activeFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveFilter(f.id)}
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
                    <span>{f.label}</span>
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
                      {f.count}
                    </span>
                  </button>
                );
              })}
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
                placeholder="Search by name, phone, Call SID..."
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

          {listQuery.isLoading ? (
            <Spinner label="Loading telephony call transactions…" />
          ) : filteredCalls.length === 0 ? (
            <EmptyState title="No calls matched filter">
              <p className="co-sm co-mut" style={{ marginTop: 6 }}>
                {searchQuery
                  ? `No calls matched "${searchQuery}". Try a different keyword.`
                  : 'Outbound & inbound voice calls across Plivo and Sarvam AI will show up here.'}
              </p>
              <Link href="/clinic/dialer" className="co-btn co-btn-primary" style={{ marginTop: 14 }}>
                <PhoneCall size={13} /> Go to Dialer
              </Link>
            </EmptyState>
          ) : (
            <div className="co-table-wrap">
              <table className="co-table">
                <thead>
                  <tr>
                    <th>Provider & Direction</th>
                    <th>Patient / Caller</th>
                    <th>Telephony Route</th>
                    <th>Transaction Ref / SID</th>
                    <th>Started At</th>
                    <th>Duration</th>
                    <th>Status & Outcome</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.map((c) => {
                    const patientName = c.display_name || c.lead_name || fullName(c) || 'Patient';
                    const sidShort = c.call_sid ? (c.call_sid.length > 18 ? `${c.call_sid.slice(0, 16)}…` : c.call_sid) : (c.conversation_id ? `${c.conversation_id.slice(0, 16)}…` : '—');

                    return (
                      <tr key={c.id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            <ProviderBadge provider={c.provider} />
                            <DirectionBadge direction={c.direction} />
                          </div>
                        </td>
                        <td>
                          <div className="co-row">
                            <Avatar name={patientName} first={c.first_name} last={c.last_name} />
                            <div>
                              <div className="co-strong">{patientName}</div>
                              <div className="co-xs co-mut">{c.display_company || c.company || 'Aura Clinic'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {c.from_phone && (
                              <span style={{ color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Phone size={10} /> From: {c.from_phone}
                              </span>
                            )}
                            <span style={{ color: '#1E293B', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Phone size={10} /> To: {c.to_phone || c.phone || '—'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: 11, background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, color: '#334155' }}>
                            {sidShort}
                          </code>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {c.started_at ? `${dateLabel(c.started_at)} · ${timeLabel(c.started_at)}` : '—'}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {formatDuration(c.duration_secs)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                            <StatusChip status={c.status} />
                            {c.sentiment && <SentimentBadge sentiment={c.sentiment} />}
                            {c.outcome && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#059669', background: '#ECFDF5', padding: '1px 5px', borderRadius: 4 }}>
                                {c.outcome}
                              </span>
                            )}
                            {c.recording_url && (
                              <span style={{ color: '#A4285E', title: 'Recording available' }}>
                                <Volume2 size={13} />
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link href={`/clinic/call-review/${c.id}`} className="co-btn co-btn-sm co-btn-primary">
                            Review <ArrowUpRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Call Detail View (/clinic/call-review/:id)
  // ---------------------------------------------------------------------------
  if (detailQuery.isLoading) {
    return (
      <div className="clinic-os">
        <PageHead title="Call Review" />
        <Card><Spinner label="Loading conversation transcript and telephony data…" /></Card>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="clinic-os">
        <PageHead title="Call Review" />
        <Card>
          <EmptyState title="Call record not found">
            <p className="co-sm co-mut">{detailQuery.error?.message}</p>
            <Link href="/clinic/call-review" className="co-btn co-btn-primary" style={{ marginTop: 12 }}>
              <ChevronLeft size={13} /> Back to Calls
            </Link>
          </EmptyState>
        </Card>
      </div>
    );
  }

  const call = detailQuery.data?.call;
  if (!call) return null;

  const turns = normalizeTranscriptTurns(call.transcript);
  const patientDisplayName = call.display_name || call.lead_name || fullName(call) || 'Patient';

  return (
    <div className="clinic-os">
      <PageHead
        title={patientDisplayName}
        subtitle={`${call.started_at ? datetimeLabel(call.started_at) : 'Call Record'} · Duration: ${formatDuration(call.duration_secs)}`}
      >
        <Link href="/clinic/call-review" className="co-btn co-btn-sm">
          <ChevronLeft size={13} /> Back to Calls
        </Link>
      </PageHead>

      <div className="co-split">
        <div className="co-grid" style={{ flex: 1 }}>
          {/* Telephony Transaction Card */}
          <Card>
            <CardHead title="Telephony Transaction Info" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 4 }}>
              <div>
                <div className="co-label" style={{ marginBottom: 4 }}>Telephony Engine / Provider</div>
                <ProviderBadge provider={call.provider} />
              </div>
              <div>
                <div className="co-label" style={{ marginBottom: 4 }}>Call Direction</div>
                <DirectionBadge direction={call.direction} />
              </div>
              <div>
                <div className="co-label" style={{ marginBottom: 4 }}>Caller Number (From)</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{call.from_phone || '+917965852999'}</div>
              </div>
              <div>
                <div className="co-label" style={{ marginBottom: 4 }}>Destination Number (To)</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{call.to_phone || call.phone || '—'}</div>
              </div>
              <div>
                <div className="co-label" style={{ marginBottom: 4 }}>Call SID / Transaction ID</div>
                <code style={{ fontSize: 11, background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, color: '#334155' }}>
                  {call.call_sid || '—'}
                </code>
              </div>
              <div>
                <div className="co-label" style={{ marginBottom: 4 }}>Interaction / Session UUID</div>
                <code style={{ fontSize: 11, background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, color: '#334155' }}>
                  {call.conversation_id || '—'}
                </code>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
              <StatusChip status={call.status} />
              {call.sentiment && <SentimentBadge sentiment={call.sentiment} />}
              {call.outcome && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: 999 }}>
                  Outcome: {call.outcome}
                </span>
              )}
              {call.booking_type && <span className="co-chip co-c-n">{call.booking_type}</span>}
              {call.call_cost && <span className="co-chip co-c-n">Cost: ₹{call.call_cost}</span>}
            </div>
          </Card>

          {/* Audio Recording */}
          <Card>
            <CardHead title="Audio Recording Playback" />
            <AudioPlayer src={call.recording_url} />
          </Card>

          {/* AI Clinical Summary */}
          <Card>
            <CardHead title="AI Clinical Summary & Discussion Notes" />
            {call.transcript_summary ? (
              <p style={{ fontSize: 13, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap' }}>
                {call.transcript_summary}
              </p>
            ) : (
              <p className="co-sm co-mut">No AI summary generated for this call.</p>
            )}
          </Card>

          {/* Conversation Dialogue Transcript */}
          <Card>
            <CardHead title="Full Conversation Transcript" hint={`${turns.length} message turn${turns.length === 1 ? '' : 's'}`} />
            {turns.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {turns.map((t) => {
                  const isAgent = t.speaker.toLowerCase().includes('ai') || t.speaker.toLowerCase().includes('agent') || t.speaker.toLowerCase().includes('coordinator');
                  return (
                    <div
                      key={t.id}
                      style={{
                        alignSelf: isAgent ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        background: isAgent ? '#FBE9F1' : '#FFFFFF',
                        color: isAgent ? '#831843' : '#1F2937',
                        border: isAgent ? '1px solid #F3D9E5' : '1px solid #E5E7EB',
                        borderRadius: isAgent ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        padding: '10px 14px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isAgent ? '#A4285E' : '#2563EB' }}>
                          {isAgent ? 'Aura AI / Coordinator' : patientDisplayName}
                        </span>
                        {t.time && <span style={{ fontSize: 10, color: '#9CA3AF' }}>{t.time}</span>}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {t.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="co-empty" style={{ padding: 20 }}>
                <p className="co-sm co-mut">Transcript recorded without structured turns.</p>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar Actions */}
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardHead title="Patient Actions" />
            <div className="co-list">
              {call.lead_id ? (
                <Link href={`/clinic/patients/${call.lead_id}`} className="co-list-item" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                  <User size={14} style={{ color: '#A4285E' }} />
                  <div>
                    <div className="co-strong">Open Patient 360</div>
                    <div className="co-xs co-mut">Clinical history, treatments, packages</div>
                  </div>
                </Link>
              ) : null}

              <Link href="/clinic/appointments" className="co-list-item" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                <CalendarDays size={14} style={{ color: '#A4285E' }} />
                <div>
                  <div className="co-strong">Book Consultation</div>
                  <div className="co-xs co-mut">Schedule doctor visit at clinic</div>
                </div>
              </Link>

              <Link href="/clinic/inbox" className="co-list-item" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                <MessageSquare size={14} style={{ color: '#A4285E' }} />
                <div>
                  <div className="co-strong">Omni-Channel Inbox</div>
                  <div className="co-xs co-mut">WhatsApp, emails, notes</div>
                </div>
              </Link>

              {call.recording_url && (
                <a href={call.recording_url} download className="co-list-item" style={{ cursor: 'pointer' }}>
                  <Download size={14} style={{ color: '#A4285E' }} />
                  <div>
                    <div className="co-strong">Download Recording</div>
                    <div className="co-xs co-mut">Save audio file locally</div>
                  </div>
                </a>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Telephony Payload" hint="Plivo & Sarvam Metadata" />
            <details style={{ fontSize: 11, color: '#6B7280' }}>
              <summary className="co-sm co-mut" style={{ cursor: 'pointer', padding: '4px 0' }}>
                Inspect Raw JSON
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 6,
                  overflow: 'auto',
                  maxHeight: 250,
                  fontSize: 10.5,
                  lineHeight: 1.4,
                }}
              >
                {JSON.stringify(call, null, 2)}
              </pre>
            </details>
          </Card>
        </div>
      </div>
    </div>
  );
}
