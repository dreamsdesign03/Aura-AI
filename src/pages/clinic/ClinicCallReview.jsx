import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';
import {
  ChevronLeft, Volume2, Play, Pause, SkipBack, SkipForward,
  Download, FileText, Share2, Clock, ArrowUpRight, RefreshCw,
  CalendarDays, PhoneCall, Phone,
} from 'lucide-react';
import { clinicApi, dateLabel, timeLabel, fullName } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Kpi } from '@/clinic/ui';

function formatDuration(sec) {
  if (!sec && sec !== 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function AudioPlayer({ src, transcript }) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <button
        type="button"
        className="co-btn co-btn-sm co-icon-btn"
        style={{ background: playing ? '#A4285E' : '#FBE9F1', color: playing ? '#fff' : '#A4285E' }}
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="co-bar-track" style={{ flex: 1, height: 4 }}>
          <div className="co-bar-fill" style={{ width: duration > 0 ? `${(current / duration) * 100}%` : 0 }} />
        </div>
        <span className="co-xs co-mut" style={{ minWidth: 70, textAlign: 'right' }}>{formatDuration(current)} / {formatDuration(duration)}</span>
      </div>
      {src ? (
        <>
          <a href={src} download className="co-btn co-btn-sm co-btn-ghost" target="_blank" rel="noopener noreferrer"><Download size={12} /> Download</a>
        </>
      ) : (
        <span className="co-xs co-mut">No recording available</span>
      )}
    </div>
  );
}

export default function ClinicCallReview({ id }) {
  const [, params] = useRoute('/clinic/call-review/:id');
  const activeId = id || params?.id;

  const listQuery = useQuery({
    queryKey: ['clinic', 'call-reviews'],
    queryFn: clinicApi.callReviews,
    enabled: !activeId,
  });

  const detailQuery = useQuery({
    queryKey: ['clinic', 'call-review', activeId],
    queryFn: () => clinicApi.callReview(activeId),
    enabled: !!activeId,
  });

  if (!activeId) {
    const calls = listQuery.data?.calls || [];
    return (
      <div className="clinic-os">
        <PageHead
          title="Call Review"
          subtitle="Listen to recordings, review AI transcripts and analyze conversation outcomes."
        >
          <button type="button" className="co-btn co-btn-sm" onClick={() => listQuery.refetch()} disabled={listQuery.isFetching}>
            <RefreshCw size={13} className={listQuery.isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          <Link href="/clinic/dialer" className="co-btn co-btn-primary co-btn-sm">
            <PhoneCall size={14} /> Open Dialer
          </Link>
        </PageHead>

        <Card rise="co-rise-1">
          <CardHead title="Recent AI Calls" hint={`${calls.length} call${calls.length === 1 ? '' : 's'}`} />
          {listQuery.isLoading ? (
            <Spinner label="Loading call records…" />
          ) : calls.length === 0 ? (
            <EmptyState title="No calls recorded yet">
              <p className="co-sm co-mut" style={{ marginTop: 6 }}>
                Initiate voice calls from the Dialer or run a bulk calling campaign to see reviewable recordings here.
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
                    <th>Patient / Lead</th>
                    <th>Phone</th>
                    <th>Started At</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="co-row">
                          <Avatar first={c.first_name} last={c.last_name} />
                          <div>
                            <div className="co-strong">{fullName(c)}</div>
                            {c.company ? <div className="co-xs co-mut">{c.company}</div> : null}
                          </div>
                        </div>
                      </td>
                      <td className="co-mut">{c.to_phone || c.phone || '—'}</td>
                      <td>{c.started_at ? `${dateLabel(c.started_at)} · ${timeLabel(c.started_at)}` : '—'}</td>
                      <td>{formatDuration(c.duration_secs)}</td>
                      <td><StatusChip status={c.status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/clinic/call-review/${c.id}`} className="co-btn co-btn-sm co-btn-primary">
                          Review <ArrowUpRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  if (detailQuery.isLoading) return <div className="clinic-os"><PageHead title="Call Review" /><Card><Spinner label="Loading call transcript…" /></Card></div>;
  if (detailQuery.isError) return (
    <div className="clinic-os">
      <PageHead title="Call Review" />
      <Card>
        <EmptyState title="Call not found">
          <p className="co-sm co-mut">{detailQuery.error?.message}</p>
          <Link href="/clinic/call-review" className="co-btn co-btn-primary" style={{ marginTop: 12 }}>
            <ChevronLeft size={13} /> Back to Calls
          </Link>
        </EmptyState>
      </Card>
    </div>
  );

  const call = detailQuery.data?.call;
  if (!call) return null;

  return (
    <div className="clinic-os">
      <PageHead
        title="Call Review"
        subtitle={`${dateLabel(call.started_at)} · ${timeLabel(call.started_at)} · ${formatDuration(call.duration_secs)}`}
      >
        <Link href="/clinic/call-review" className="co-btn co-btn-sm"><ChevronLeft size={13} /> Back to Calls</Link>
      </PageHead>

      <div className="co-split">
        <div className="co-grid">
          <Card>
            <CardHead title="Call Details" />
            <div className="co-row" style={{ marginBottom: 12 }}>
              <Avatar first={call.first_name} last={call.last_name} size="lg" />
              <div>
                <div className="co-strong" style={{ fontSize: 16 }}>{fullName(call)}</div>
                <div className="co-sm co-mut">{call.phone || 'No phone'}{call.company ? ` · ${call.company}` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <StatusChip status={call.status} />
              {call.booking_type ? <span className="co-chip co-c-n">{call.booking_type}</span> : null}
              {call.recording_url ? <span className="co-chip co-c-p"><Volume2 size={11} /> Recording</span> : null}
            </div>
          </Card>

          <Card>
            <CardHead title="Recording" />
            <AudioPlayer src={call.recording_url} transcript={call.transcript} />
          </Card>

          <Card>
            <CardHead title="AI Summary" />
            {call.transcript_summary ? (
              <p style={{ fontSize: 13, lineHeight: 1.6, color: '#374151' }}>{call.transcript_summary}</p>
            ) : (
              <p className="co-sm co-mut">No summary generated.</p>
            )}
          </Card>

          {call.transcript ? (
            <Card>
              <CardHead title="Full Transcript" />
              <div style={{ fontSize: 12, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {typeof call.transcript === 'string' ? call.transcript : JSON.stringify(call.transcript, null, 2)}
              </div>
            </Card>
          ) : null}
        </div>

        <div>
          <Card>
            <CardHead title="Patient Actions" />
            <div className="co-list">
              {call.lead_id && (
                <Link href={`/clinic/patients/${call.lead_id}`} className="co-list-item" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                  <ArrowUpRight size={14} style={{ color: '#A4285E' }} />
                  <div><div className="co-strong">Open Patient 360</div><div className="co-xs co-mut">Timeline, packages, notes</div></div>
                </Link>
              )}
              <Link href={`/clinic/appointments`} className="co-list-item" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                <CalendarDays size={14} style={{ color: '#A4285E' }} />
                <div><div className="co-strong">Book Follow-up</div><div className="co-xs co-mut">Schedule next appointment</div></div>
              </Link>
              {call.recording_url && (
                <a href={call.recording_url} download className="co-list-item" style={{ cursor: 'pointer' }}>
                  <Download size={14} style={{ color: '#A4285E' }} />
                  <div><div className="co-strong">Download Recording</div><div className="co-xs co-mut">Save MP3 locally</div></div>
                </a>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Raw Data" hint="For debugging" />
            <details style={{ fontSize: 10, color: '#6B7280' }}>
              <summary className="co-sm co-mut" style={{ cursor: 'pointer' }}>Show JSON</summary>
              <pre style={{ marginTop: 8, padding: 10, background: '#F7FAFC', borderRadius: 8, overflow: 'auto', maxHeight: 200 }}>{JSON.stringify(call, null, 2)}</pre>
            </details>
          </Card>
        </div>
      </div>
    </div>
  );
}