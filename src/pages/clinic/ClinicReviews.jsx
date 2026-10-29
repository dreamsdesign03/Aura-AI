import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Star, RefreshCw, Plus, MessageSquare, ChevronRight,
  AlertCircle, CheckCircle2, Clock, User, Mail,
} from 'lucide-react';
import { clinicApi, dateLabel, datetimeLabel, fullName } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Kpi, Modal } from '@/clinic/ui';

const RATING_STARS = [1, 2, 3, 4, 5];

function ReviewCard({ review, onReply, replyingId, busy }) {
  const isReplying = replyingId === review.id;
  return (
    <div className="co-card">
      <div className="co-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div className="co-row" style={{ gap: 10 }}>
          <Avatar first={review.author?.split(' ')[0]} last={review.author?.split(' ').slice(1).join(' ')} />
          <div>
            <div className="co-strong" style={{ fontSize: 14 }}>{review.author}</div>
            <div className="co-row" style={{ gap: 8, marginTop: 2 }}>
              <div className="co-row" style={{ gap: 2 }}>
                {RATING_STARS.map((s) => (
                  <Star key={s} size={12} style={{ color: s <= (review.rating || 5) ? '#FBBF24' : '#E5E7EB', fill: s <= (review.rating || 5) ? 'currentColor' : 'none' }} />
                ))}
              </div>
              <span className="co-chip co-c-n">{review.channel || 'Google'}</span>
              <span className="co-xs co-mut">{review.created_at ? datetimeLabel(review.created_at) : '—'}</span>
            </div>
          </div>
        </div>
        <StatusChip status={review.status || 'new'} />
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: '#374151', marginBottom: 12 }}>{review.body}</p>

      {review.reply ? (
        <div style={{ background: '#F5F0FA', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div className="co-row" style={{ gap: 6, marginBottom: 6 }}>
            <div className="co-xs" style={{ fontWeight: 600, color: '#A4285E' }}>Your reply</div>
            <div className="co-xs co-mut">{review.updated_at ? datetimeLabel(review.updated_at) : '—'}</div>
          </div>
          <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{review.reply}</p>
        </div>
      ) : null}

      {!review.reply ? (
        <div className="co-row" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className={`co-btn co-btn-sm ${isReplying ? 'co-btn-primary' : ''}`}
            onClick={() => onReply(review)}
            disabled={busy || isReplying}
          >
            {isReplying ? <span className="animate-spin">⟳</span> : <MessageSquare size={12} />} Reply
          </button>
        </div>
      ) : null}

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
  const [form, setForm] = useState({ author: '', rating: 5, channel: 'Google', body: '' });

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

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'reviews'],
    queryFn: clinicApi.reviews,
    refetchInterval: 30_000,
  });

  const reviews = data?.reviews || [];
  const newCount = reviews.filter((r) => r.status === 'new').length;
  const repliedCount = reviews.filter((r) => r.status === 'replied').length;
  const avgRating = reviews.length > 0 ? (reviews.reduce((n, r) => n + (r.rating || 5), 0) / reviews.length).toFixed(1) : '—';

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

      <Card rise="co-rise-2">
        {isLoading ? <Spinner /> : reviews.length === 0 ? (
          <EmptyState title="No reviews yet">
            <p className="co-sm co-mut" style={{ marginTop: 6 }}>Add reviews manually or connect your Google/Facebook business pages.</p>
            <button type="button" className="co-btn co-btn-primary" style={{ marginTop: 14 }} onClick={() => setAddModal(true)}>
              <Plus size={13} /> Add first review
            </button>
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' }}>
            {reviews.map((r) => (
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