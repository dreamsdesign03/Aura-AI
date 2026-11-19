import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Star, RefreshCw, Plus, MessageSquare, ChevronRight,
  AlertCircle, CheckCircle2, Clock, User, Mail, MapPin, ExternalLink,
} from 'lucide-react';
import { clinicApi, dateLabel, datetimeLabel, fullName } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Kpi, Modal } from '@/clinic/ui';

const RATING_STARS = [1, 2, 3, 4, 5];

function ReviewCard({ review, onReply, replyingId, busy }) {
  const isReplying = replyingId === review.id;
  const rating = Number(review.rating) || 5;

  return (
    <div className="co-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px', background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {/* 1. Header: Avatar + Author + Stars (Left) | Status & Date (Right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar first={review.author?.split(' ')[0]} last={review.author?.split(' ').slice(1).join(' ')} />
          <div style={{ minWidth: 0 }}>
            <div className="co-strong" style={{ fontSize: 14, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {review.author}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <div style={{ display: 'flex', gap: 1.5 }}>
                {RATING_STARS.map((s) => (
                  <Star
                    key={s}
                    size={12}
                    style={{
                      color: s <= rating ? '#F59E0B' : '#E5E7EB',
                      fill: s <= rating ? 'currentColor' : 'none',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#D97706', marginLeft: 2 }}>
                {rating.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <StatusChip status={review.status || 'new'} />
          <span style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {review.created_at ? datetimeLabel(review.created_at) : '—'}
          </span>
        </div>
      </div>

      {/* 2. Metadata Tags: Channel & Branch */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 6,
            background: review.channel?.toLowerCase() === 'google' ? '#EFF6FF' : '#F3F4F6',
            color: review.channel?.toLowerCase() === 'google' ? '#1D4ED8' : '#374151',
            border: review.channel?.toLowerCase() === 'google' ? '1px solid #BFDBFE' : '1px solid #E5E7EB',
          }}
        >
          {review.channel || 'Website'}
        </span>

        {review.branch ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: 6,
              background: '#F9FAFB',
              color: '#4B5563',
              border: '1px solid #E5E7EB',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <MapPin size={11} style={{ color: '#9CA3AF' }} />
            {review.branch}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>Branch not specified</span>
        )}
      </div>

      {/* 3. Review Body */}
      <p style={{ fontSize: 13, lineHeight: 1.6, color: '#374151', margin: 0, flexGrow: 1 }}>
        {review.body}
      </p>

      {/* 4. Reply (if any) */}
      {review.reply ? (
        <div style={{ background: '#FAF5FF', border: '1px solid #F3E8FF', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9333EA' }}>Clinic Reply</span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{review.updated_at ? datetimeLabel(review.updated_at) : '—'}</span>
          </div>
          <p style={{ fontSize: 12, color: '#4B5563', margin: 0, lineHeight: 1.5 }}>{review.reply}</p>
        </div>
      ) : null}

      {/* 5. Footer: View original review on left + Reply button on right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 6, borderTop: '1px solid #F3F4F6' }}>
        {review.source_url ? (
          <a
            href={review.source_url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}
          >
            View original review <ExternalLink size={11} />
          </a>
        ) : (
          <span />
        )}

        {!review.reply ? (
          <button
            type="button"
            className={`co-btn co-btn-sm ${isReplying ? 'co-btn-primary' : ''}`}
            onClick={() => onReply(review)}
            disabled={busy || isReplying}
          >
            {isReplying ? <span className="animate-spin">⟳</span> : <MessageSquare size={12} />} Reply
          </button>
        ) : null}
      </div>

      {/* 6. Inline reply form when active */}
      {isReplying ? (
        <ReplyForm reviewId={review.id} onSubmit={(r) => onReply(review, r)} onCancel={() => onReply(null)} busy={busy} />
      ) : null}
    </div>
  );
}

function ReplyForm({ reviewId, onSubmit, onCancel, busy }) {
  const [text, setText] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSubmit(text.trim()); }} className="co-form-grid" style={{ marginTop: 12 }}>
      <div className="co-field co-span-2">
        <label className="co-label">Your reply</label>
        <textarea rows="3" className="co-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Thank you for your feedback…" required />
      </div>
      <div className="co-row" style={{ justifyContent: 'flex-end', gridColumn: 'span 2' }}>
        <button type="button" className="co-btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="co-btn co-btn-primary" disabled={busy || !text.trim()}>
          {busy ? <span className="animate-spin">⟳</span> : <CheckCircle2 size={13} />} Send reply
        </button>
      </div>
    </form>
  );
}

function AddReviewForm({ onSubmit, busy, onClose }) {
  const [form, setForm] = useState({ author: '', rating: 5, channel: 'Website', branch: '', sourceUrl: '', body: '' });

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (form.author.trim() && form.body.trim()) onSubmit(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="co-form-grid">
        <div className="co-field">
          <label className="co-label" htmlFor="co-rauthor">Author *</label>
          <input id="co-rauthor" className="co-input" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Patient name" required />
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-rrating">Rating *</label>
          <select id="co-rrating" className="co-input" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>
            <option value={5}>★★★★★ 5</option>
            <option value={4}>★★★★ 4</option>
            <option value={3}>★★★ 3</option>
            <option value={2}>★★ 2</option>
            <option value={1}>★ 1</option>
          </select>
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-rchannel">Channel</label>
          <select id="co-rchannel" className="co-input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            <option value="Google">Google</option>
            <option value="Facebook">Facebook</option>
            <option value="Practo">Practo</option>
            <option value="JustDial">JustDial</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div className="co-form-grid">
        <div className="co-field">
          <label className="co-label" htmlFor="co-rbranch">Clinic branch</label>
          <select id="co-rbranch" className="co-input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">Branch not specified</option>
            {['Alkapuri, Vadodara', 'Manjalpur, Vadodara', 'Vasna-Bhayli, Vadodara', 'Waghodia Road, Vadodara', 'Majura Gate, Surat', 'Ranchi'].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-rurl">Original review URL</label>
          <input id="co-rurl" type="url" className="co-input" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://..." />
        </div>
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-rbody">Review text *</label>
        <textarea id="co-rbody" rows="3" className="co-input" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="What did the patient say?" required />
      </div>
      <div className="co-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="co-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="co-btn co-btn-primary" disabled={busy || !form.author.trim() || !form.body.trim()}>
          {busy ? <span className="animate-spin">⟳</span> : <Plus size={13} />} Add review
        </button>
      </div>
    </form>
  );
}

export default function ClinicReviews() {
  const qc = useQueryClient();
  const [addModal, setAddModal] = useState(false);
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [syncMessage, setSyncMessage] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'reviews'],
    queryFn: clinicApi.reviews,
    refetchInterval: 30_000,
  });

  const reviews = data?.reviews || [];
  const visibleReviews = reviews.filter((r) => (branchFilter === 'all' || (r.branch || 'Unassigned') === branchFilter) && (sourceFilter === 'all' || String(r.channel || 'Website').toLowerCase() === sourceFilter.toLowerCase()));
  const branches = [...new Set(reviews.map((r) => r.branch || 'Unassigned'))].sort();
  const newCount = reviews.filter((r) => r.status === 'new').length;
  const repliedCount = reviews.filter((r) => r.status === 'replied').length;
  const avgRating = reviews.length > 0 ? (reviews.reduce((n, r) => n + (r.rating || 5), 0) / reviews.length).toFixed(1) : '—';

  const syncGoogle = useMutation({
    mutationFn: async ({ restart = false } = {}) => {
      let totalImported = 0;
      let latest = null;
      const maxRoundsPerClick = 25;
      for (let round = 0; round < maxRoundsPerClick; round++) {
        latest = await clinicApi.syncGoogleReviews(restart && round === 0);
        totalImported += Number(latest.imported || 0);
        const progress = latest.progress || {};
        setSyncMessage(`Google backfill running: ${progress.completedBranches || 0}/${progress.totalBranches || 5} branches complete · ${progress.reviewsFetched || 0} reviews fetched · ${progress.pagesFetched || 0} pages processed`);
        if (!progress.hasMore) break;
        const errors = (latest.branches || []).filter((b) => b.error);
        if (errors.length === (latest.branches || []).length) break;
      }
      return { ...latest, imported: totalImported };
    },
    onSuccess: (result) => {
      const progress = result.progress || {};
      const errors = (result.branches || []).filter((b) => b.error);
      const status = progress.hasMore
        ? `Paused safely after this batch. ${progress.completedBranches || 0}/${progress.totalBranches || 5} branches complete; click Continue Sync to resume.`
        : errors.length
          ? `Sync finished with errors: ${errors.map((b) => `${b.branch}: ${b.error}`).join(' · ')}`
          : 'Google review backfill completed for all configured branches.';
      setSyncMessage(`Imported/updated ${result.imported || 0} reviews in this batch. ${status}`);
      qc.invalidateQueries({ queryKey: ['clinic', 'reviews'] });
    },
    onError: (error) => setSyncMessage(error.message || 'Google review sync failed.'),
  });

  const reply = useMutation({
    mutationFn: ({ id, reply }) => clinicApi.replyReview(id, reply),
    onSuccess: () => { setReplyingId(null); setReplyText(''); qc.invalidateQueries({ queryKey: ['clinic', 'reviews'] }); },
  });

  const create = useMutation({
    mutationFn: clinicApi.createReview,
    onSuccess: () => { setAddModal(false); qc.invalidateQueries({ queryKey: ['clinic', 'reviews'] }); },
  });

  return (
    <div className="clinic-os">
      <PageHead title="Reviews" subtitle="Monitor and reply to patient reviews across channels.">
        <button type="button" className="co-btn co-btn-primary co-btn-sm" onClick={() => { setSyncMessage('Starting resumable Google review backfill…'); syncGoogle.mutate({ restart: false }); }} disabled={syncGoogle.isPending}>
          <RefreshCw size={13} className={syncGoogle.isPending ? 'animate-spin' : ''} /> {syncGoogle.isPending ? 'Syncing all pages…' : 'Complete Google Reviews Sync'}
        </button>
        <button type="button" className="co-btn co-btn-sm" onClick={() => { setSyncMessage('Restarting the full Google review backfill…'); syncGoogle.mutate({ restart: true }); }} disabled={syncGoogle.isPending}>
          Restart full sync
        </button>
        <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
        <button type="button" className="co-btn co-btn-primary co-btn-sm" onClick={() => setAddModal(true)}>
          <Plus size={14} /> Add review
        </button>
      </PageHead>

      <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Kpi label="Total Reviews" value={reviews.length} icon={Star} />
        <Kpi label="Average Rating" value={avgRating} foot="Out of 5.0" icon={Star} />
        <Kpi label="New" value={newCount} foot="Awaiting reply" icon={AlertCircle} />
        <Kpi label="Replied" value={repliedCount} foot="Handled" icon={CheckCircle2} />
      </div>

      {syncMessage ? <div className="co-xs co-mut" style={{ marginBottom: 10 }} role="status">{syncMessage}</div> : null}
      <Card rise="co-rise-2">
        <div className="co-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="co-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select className="co-input" style={{ width: 220 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="all">All clinic branches</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select className="co-input" style={{ width: 160 }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="all">All sources</option><option value="Google">Google</option><option value="Website">Website</option><option value="Facebook">Facebook</option><option value="Practo">Practo</option><option value="JustDial">JustDial</option>
            </select>
          </div>
          <span className="co-xs co-mut">Showing {visibleReviews.length} of {reviews.length} reviews</span>
        </div>
        {isLoading ? <Spinner /> : reviews.length === 0 ? (
          <EmptyState title="No reviews yet">
            <p className="co-sm co-mut" style={{ marginTop: 6 }}>Import website testimonials or connect each verified Google Business Profile to sync branch reviews. No external reviews are fabricated.</p>
            <button type="button" className="co-btn co-btn-primary" style={{ marginTop: 14 }} onClick={() => setAddModal(true)}>
              <Plus size={13} /> Add first review
            </button>
          </EmptyState>
        ) : (
          visibleReviews.length === 0 ? <EmptyState title="No reviews for these filters"><p className="co-sm co-mut">Try another branch or source.</p></EmptyState> : <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))' }}>
            {visibleReviews.map((r) => (
              <ReviewCard
                key={r.id}
                review={r}
                replyingId={replyingId}
                busy={reply.isPending || create.isPending}
                onReply={(review, text) => {
                  if (review && text) reply.mutate({ id: review.id, reply: text });
                  else if (review) setReplyingId(review.id);
                  else setReplyingId(null);
                }}
              />
            ))}
          </div>
        )}
      </Card>

      {addModal ? (
        <Modal title="Add Review" subtitle="Manually record a patient review." onClose={() => setAddModal(false)} width={560}>
          <AddReviewForm onSubmit={create.mutate} busy={create.isPending} onClose={() => setAddModal(false)} />
        </Modal>
      ) : null}
    </div>
  );
}