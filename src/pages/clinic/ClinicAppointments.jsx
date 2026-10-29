import { Fragment, useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw, CalendarDays, Clock,
  Check, Trash2, MapPin, Phone, IndianRupee, List, ExternalLink,
  Search, Video, MessageCircle, Mail, Sparkles, Filter, CheckCircle2, User,
} from 'lucide-react';
import { clinicApi, fullName, money, timeLabel, dateLabel } from '@/clinic/api';
import { PageHead, Card, CardHead, StatusChip, EmptyState, Spinner, Modal, Avatar } from '@/clinic/ui';
import { cleanEmail } from '@/lib/emails';

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 08:00 → 20:00
const STATUS_ACTIONS = [
  ['confirmed', 'Confirmed'],
  ['arrived', 'Arrived'],
  ['in_consult', 'In consult'],
  ['completed', 'Completed'],
  ['no_show', 'No show'],
  ['cancelled', 'Cancelled'],
];

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toDateInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BookingForm({ initial, patients, onSubmit, onClose, busy, error }) {
  const base = initial?.startsAt ? new Date(initial.startsAt) : new Date();
  const [form, setForm] = useState({
    leadId: '',
    patientName: initial?.patientName || '',
    phone: initial?.phone || '',
    treatment: initial?.treatment || '',
    branch: initial?.branch || '',
    date: toDateInput(base),
    time: initial?.startsAt ? toTimeInput(base) : '10:00',
    durationMin: 45,
    amount: 0,
    notes: '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function pickPatient(id) {
    const p = patients.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f,
      leadId: id,
      patientName: p ? fullName(p) : f.patientName,
      phone: p?.phone || f.phone,
    }));
  }

  function submit(e) {
    e.preventDefault();
    if (!form.patientName.trim()) return;
    const startsAt = new Date(`${form.date}T${form.time}:00`);
    onSubmit({
      leadId: form.leadId ? Number(form.leadId) : null,
      patientName: form.patientName.trim(),
      phone: form.phone || null,
      treatment: form.treatment || null,
      branch: form.branch || null,
      startsAt: startsAt.toISOString(),
      durationMin: Number(form.durationMin) || 45,
      amount: Number(form.amount) || 0,
      notes: form.notes || null,
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="co-form-grid">
        <div className="co-field co-span-2">
          <label className="co-label" htmlFor="co-patient">Link to patient (optional)</label>
          <select id="co-patient" value={form.leadId} onChange={(e) => pickPatient(e.target.value)}>
            <option value="">New / walk-in patient</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{fullName(p)}{p.phone ? ` · ${p.phone}` : ''}</option>
            ))}
          </select>
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-name">Patient name *</label>
          <input id="co-name" className="co-input" value={form.patientName} onChange={set('patientName')} placeholder="Full name" required />
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-phone">Phone</label>
          <input id="co-phone" className="co-input" value={form.phone} onChange={set('phone')} placeholder="+91 …" />
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-treatment">Treatment / Service</label>
          <input id="co-treatment" className="co-input" value={form.treatment} onChange={set('treatment')} placeholder="e.g. Consultation / Acne treatment" />
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-branch">Branch</label>
          <input id="co-branch" className="co-input" value={form.branch} onChange={set('branch')} placeholder="e.g. Alkapuri Main Clinic" />
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-date">Date *</label>
          <input id="co-date" type="date" className="co-input" value={form.date} onChange={set('date')} required />
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-time">Time *</label>
          <input id="co-time" type="time" className="co-input" value={form.time} onChange={set('time')} required />
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-duration">Duration (min)</label>
          <input id="co-duration" type="number" min="5" step="5" className="co-input" value={form.durationMin} onChange={set('durationMin')} />
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-amount">Value (₹)</label>
          <input id="co-amount" type="number" min="0" className="co-input" value={form.amount} onChange={set('amount')} />
        </div>
        <div className="co-field co-span-2">
          <label className="co-label" htmlFor="co-notes">Notes</label>
          <textarea id="co-notes" rows="2" value={form.notes} onChange={set('notes')} placeholder="Anything the front desk should know" />
        </div>
      </div>
      {error ? <p className="co-sm" style={{ color: '#B91C1C' }}>{error}</p> : null}
      <div className="co-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="co-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="co-btn co-btn-primary" disabled={busy}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Book appointment
        </button>
      </div>
    </form>
  );
}

function AppointmentPanel({ appointment, onClose, onStatus, onReschedule, onDelete, busy }) {
  const [reschedule, setReschedule] = useState(false);
  const [date, setDate] = useState(toDateInput(new Date(appointment.starts_at)));
  const [time, setTime] = useState(toTimeInput(new Date(appointment.starts_at)));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cleanPh = (appointment.phone || '').replace(/[^0-9]/g, '');
  const isMeet = appointment.meeting_link && appointment.meeting_link.startsWith('http');

  return (
    <Modal
      title={appointment.patient_name}
      subtitle={`${dateLabel(appointment.starts_at)} · ${timeLabel(appointment.starts_at)}${appointment.treatment ? ` · ${appointment.treatment}` : ''}`}
      onClose={onClose}
      width={560}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="co-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <StatusChip status={appointment.status} />
          {appointment.source === 'cal.com' ? (
            <span className="co-chip co-c-p" style={{ fontWeight: 600 }}>
              <CalendarDays size={11} /> Cal.com Booking
            </span>
          ) : null}
          {appointment.branch ? (
            <span className="co-chip co-c-n"><MapPin size={11} /> {appointment.branch}</span>
          ) : null}
          {appointment.phone ? (
            <a href={`tel:${appointment.phone}`} className="co-chip co-c-p"><Phone size={11} /> {appointment.phone}</a>
          ) : null}
          {cleanPh ? (
            <a href={`https://wa.me/${cleanPh}`} target="_blank" rel="noopener noreferrer" className="co-chip co-c-g">
              <MessageCircle size={11} /> WhatsApp
            </a>
          ) : null}
          {cleanEmail(appointment.email) ? (
            <a href={`mailto:${cleanEmail(appointment.email)}`} className="co-chip co-c-n">
              <Mail size={11} /> {cleanEmail(appointment.email)}
            </a>
          ) : null}
          {Number(appointment.amount) > 0 ? (
            <span className="co-chip co-c-n"><IndianRupee size={11} /> {money(appointment.amount)}</span>
          ) : null}
        </div>

        {isMeet ? (
          <div style={{ padding: '10px 14px', background: '#EFF6FF', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Video size={16} style={{ color: '#2563EB' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1E40AF' }}>Online Video Consultation</span>
            </div>
            <a href={appointment.meeting_link} target="_blank" rel="noopener noreferrer" className="co-btn co-btn-sm co-btn-primary">
              <ExternalLink size={12} /> Join Google Meet
            </a>
          </div>
        ) : null}

        {appointment.notes ? (
          <div style={{ background: '#FDF7FA', border: '1px solid #F3D9E5', borderRadius: 10, padding: '12px 14px' }}>
            <div className="co-label" style={{ marginBottom: 6, color: '#A4285E' }}>Booking Notes &amp; Details</div>
            <p className="co-sm" style={{ color: '#374151', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
              {appointment.notes}
            </p>
          </div>
        ) : null}

        <div>
          <div className="co-label" style={{ marginBottom: 8 }}>Update status</div>
          <div className="co-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {STATUS_ACTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`co-btn co-btn-sm ${appointment.status === value ? 'co-btn-primary' : ''}`}
                onClick={() => onStatus(value)}
                disabled={busy || appointment.status === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button type="button" className="co-btn co-btn-sm" onClick={() => setReschedule((v) => !v)}>
            <Clock size={13} /> {reschedule ? 'Hide reschedule' : 'Reschedule'}
          </button>
          {reschedule ? (
            <div className="co-form-grid" style={{ marginTop: 10 }}>
              <div className="co-field">
                <label className="co-label" htmlFor="co-rdate">New date</label>
                <input id="co-rdate" type="date" className="co-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="co-field">
                <label className="co-label" htmlFor="co-rtime">New time</label>
                <input id="co-rtime" type="time" className="co-input" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="co-span-2">
                <button
                  type="button"
                  className="co-btn co-btn-primary co-btn-sm"
                  disabled={busy}
                  onClick={() => onReschedule(new Date(`${date}T${time}:00`).toISOString())}
                >
                  Save new time
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="co-spread" style={{ borderTop: '1px solid #F3D9E5', paddingTop: 14 }}>
          {confirmDelete ? (
            <div className="co-row">
              <span className="co-sm co-mut">Delete this appointment?</span>
              <button type="button" className="co-btn co-btn-sm" onClick={() => setConfirmDelete(false)}>No</button>
              <button type="button" className="co-btn co-btn-sm" style={{ color: '#B91C1C' }} onClick={onDelete} disabled={busy}>Yes, delete</button>
            </div>
          ) : (
            <button type="button" className="co-btn co-btn-sm co-btn-ghost" style={{ color: '#B91C1C' }} onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} /> Delete
            </button>
          )}
          <button type="button" className="co-btn co-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function TaskQueue() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('normal');
  const { data, isLoading } = useQuery({ queryKey: ['clinic', 'tasks'], queryFn: clinicApi.tasks });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['clinic'] });

  const add = useMutation({
    mutationFn: () => clinicApi.createTask({ title: title.trim(), priority }),
    onSuccess: () => { setTitle(''); setPriority('normal'); invalidate(); },
  });
  const toggle = useMutation({
    mutationFn: ({ id, status }) => clinicApi.setTaskStatus(id, status),
    onSuccess: invalidate,
  });

  const tasks = data?.tasks || [];
  const open = tasks.filter((t) => t.status === 'open');
  const done = tasks.filter((t) => t.status !== 'open');

  return (
    <Card>
      <CardHead title="Task queue" hint={`${open.length} open · ${done.length} done`} />
      <form
        className="co-row"
        style={{ marginBottom: 12 }}
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate(); }}
      >
        <input className="co-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a follow-up task…" aria-label="New task" />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Task priority" style={{ width: 120 }}>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
        <button type="submit" className="co-btn co-btn-primary co-btn-sm" disabled={!title.trim() || add.isPending}>
          <Plus size={13} /> Add
        </button>
      </form>

      {isLoading ? <Spinner /> : tasks.length === 0 ? (
        <p className="co-sm co-mut">No tasks yet. Add one above.</p>
      ) : (
        <div className="co-list">
          {[...open, ...done].map((t) => (
            <div className="co-list-item" key={t.id} style={{ alignItems: 'center', opacity: t.status === 'open' ? 1 : 0.55 }}>
              <button
                type="button"
                className="co-btn co-btn-sm co-icon-btn"
                style={{ borderRadius: 999 }}
                aria-label={t.status === 'open' ? `Mark ${t.title} done` : `Reopen ${t.title}`}
                onClick={() => toggle.mutate({ id: t.id, status: t.status === 'open' ? 'done' : 'open' })}
              >
                {t.status === 'open' ? <Check size={13} /> : <RefreshCw size={12} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, textDecoration: t.status === 'open' ? 'none' : 'line-through' }}>{t.title}</div>
                <div className="co-xs co-mut">
                  {t.priority === 'high' ? <span style={{ color: '#B45309', fontWeight: 600 }}>High priority</span> : 'Normal'}
                  {t.due_at ? ` · due ${dateLabel(t.due_at)}` : ''}
                </div>
              </div>
              {t.status !== 'open' ? <StatusChip status="done" /> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ClinicAppointments() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  
  // View toggle: 'calendar' or 'list'
  const [viewMode, setViewMode] = useState(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    return v === 'list' ? 'list' : 'calendar';
  });

  const handleViewChange = (mode) => {
    setViewMode(mode);
    const url = new URL(window.location.href);
    if (mode === 'list') {
      url.searchParams.set('view', 'list');
    } else {
      url.searchParams.delete('view');
    }
    window.history.replaceState({}, '', url.toString());
  };

  useEffect(() => {
    const onPop = () => {
      const v = new URLSearchParams(window.location.search).get('view');
      setViewMode(v === 'list' ? 'list' : 'calendar');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [booking, setBooking] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState('');

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const from = useMemo(() => weekStart.toISOString(), [weekStart]);
  const to = useMemo(() => addDays(weekStart, 7).toISOString(), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = new Date();

  // Queries
  const appts = useQuery({
    queryKey: ['clinic', 'appointments', from, to],
    queryFn: () => clinicApi.appointments(from, to),
    refetchInterval: 30_000,
  });
  const patientsQ = useQuery({ queryKey: ['clinic', 'patients'], queryFn: () => clinicApi.patients('') });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['clinic'] });

  const handleSyncCalCom = async () => {
    setIsSyncing(true);
    setSyncFeedback('');
    try {
      const res = await clinicApi.syncAppointments();
      invalidate();
      setSyncFeedback(`Synced ${res.total || 0} live bookings from Cal.com!`);
      setTimeout(() => setSyncFeedback(''), 4000);
    } catch (err) {
      setSyncFeedback('Sync error: ' + err.message);
      setTimeout(() => setSyncFeedback(''), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const create = useMutation({
    mutationFn: clinicApi.createAppointment,
    onSuccess: () => { setBooking(null); setError(''); invalidate(); },
    onError: (err) => setError(err.message),
  });
  const update = useMutation({
    mutationFn: ({ id, body }) => clinicApi.updateAppointment(id, body),
    onSuccess: () => { setSelected(null); setError(''); invalidate(); },
    onError: (err) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (id) => clinicApi.deleteAppointment(id),
    onSuccess: () => { setSelected(null); invalidate(); },
    onError: (err) => setError(err.message),
  });

  const weekRows = appts.data?.appointments || [];
  const allRows = appts.data?.all_appointments || appts.data?.appointments || [];

  // Filtered list view bookings
  const filteredList = useMemo(() => {
    return allRows.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${a.patient_name || ''} ${a.phone || ''} ${a.email || ''} ${a.treatment || ''} ${a.branch || ''} ${a.notes || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, statusFilter, searchQuery]);

  const byCell = useMemo(() => {
    const map = {};
    for (const a of weekRows) {
      const d = new Date(a.starts_at);
      const di = days.findIndex((x) => sameDay(x, d));
      if (di < 0) continue;
      const key = `${di}-${d.getHours()}`;
      (map[key] = map[key] || []).push(a);
    }
    return map;
  }, [weekRows, days]);

  const away = weekRows.filter((a) => {
    const d = new Date(a.starts_at);
    return !days.some((x) => sameDay(x, d)) || d.getHours() < HOURS[0] || d.getHours() > HOURS[HOURS.length - 1];
  });

  const openBooking = (startsAt) => {
    setError('');
    const fallback = new Date(days[0].getFullYear(), days[0].getMonth(), days[0].getDate(), 10, 0, 0, 0);
    setBooking(startsAt ? { startsAt } : { startsAt: fallback.toISOString() });
  };

  // Jump anchor to most recent booking
  const jumpToLatestBooking = () => {
    if (allRows.length > 0) {
      setAnchor(new Date(allRows[0].starts_at));
    }
  };

  return (
    <div className="clinic-os">
      <PageHead
        title="Appointments & Meetings"
        subtitle="Live Cal.com bookings, clinical consultations & schedule without demo data."
      >
        {/* View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', padding: 3, borderRadius: 10, border: '1px solid #E2E8F0' }}>
          <button
            type="button"
            onClick={() => handleViewChange('calendar')}
            className={`co-btn co-btn-sm ${viewMode === 'calendar' ? 'co-btn-primary' : ''}`}
            style={viewMode === 'calendar' ? { boxShadow: '0 2px 6px rgba(164,40,94,0.3)' } : { background: 'transparent', border: 'none', color: '#64748B' }}
          >
            <CalendarDays size={13} /> Calendar View
          </button>
          <button
            type="button"
            onClick={() => handleViewChange('list')}
            className={`co-btn co-btn-sm ${viewMode === 'list' ? 'co-btn-primary' : ''}`}
            style={viewMode === 'list' ? { boxShadow: '0 2px 6px rgba(164,40,94,0.3)' } : { background: 'transparent', border: 'none', color: '#64748B' }}
          >
            <List size={13} /> List View ({allRows.length})
          </button>
        </div>

        {/* Sync Cal.com Button */}
        <button
          type="button"
          className="co-btn co-btn-sm"
          onClick={handleSyncCalCom}
          disabled={isSyncing}
          title="Sync live Cal.com bookings"
          style={{ borderColor: '#F3D9E5', color: '#A4285E' }}
        >
          <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing Cal.com…' : 'Sync Cal.com'}
        </button>

        {/* Public Booking Page link */}
        <a
          href="https://cal.com/aura-laser-cosmetic-clinic/30min"
          target="_blank"
          rel="noopener noreferrer"
          className="co-btn co-btn-sm"
          style={{ borderColor: '#F3D9E5', color: '#CB3273' }}
          title="Open public booking link"
        >
          <ExternalLink size={13} /> Booking Page
        </a>

        {/* New Booking */}
        <button type="button" className="co-btn co-btn-primary co-btn-sm" onClick={() => openBooking(null)}>
          <Plus size={14} /> New booking
        </button>
      </PageHead>

      {syncFeedback ? (
        <div style={{ padding: '8px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, fontSize: 13, color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={15} /> {syncFeedback}
        </div>
      ) : null}

      {/* ── View 1: Calendar View ──────────────────────────────────── */}
      {viewMode === 'calendar' ? (
        <>
          <div className="co-row" style={{ flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
            <div className="co-row">
              <button type="button" className="co-btn co-btn-sm co-icon-btn" aria-label="Previous week" onClick={() => setAnchor(addDays(weekStart, -7))}>
                <ChevronLeft size={15} />
              </button>
              <span className="co-strong" style={{ minWidth: 200, textAlign: 'center', fontSize: 13.5 }}>
                {dateLabel(days[0])} – {dateLabel(days[6])}
              </span>
              <button type="button" className="co-btn co-btn-sm co-icon-btn" aria-label="Next week" onClick={() => setAnchor(addDays(weekStart, 7))}>
                <ChevronRight size={15} />
              </button>
              <button type="button" className="co-btn co-btn-sm" onClick={() => setAnchor(new Date())}>
                <CalendarDays size={13} /> Today
              </button>
              {allRows.length > 0 && weekRows.length === 0 ? (
                <button type="button" className="co-btn co-btn-sm" onClick={jumpToLatestBooking} style={{ color: '#A4285E', borderColor: '#F3D9E5' }}>
                  Jump to Latest ({allRows.length})
                </button>
              ) : null}
            </div>

            <div style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Showing {weekRows.length} in this week</span>
              <span>·</span>
              <button type="button" onClick={() => handleViewChange('list')} style={{ color: '#CB3273', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                View all {allRows.length} bookings in List View →
              </button>
            </div>
          </div>

          {appts.isError ? (
            <Card><EmptyState title="Could not load appointments"><p className="co-sm co-mut">{appts.error?.message}</p></EmptyState></Card>
          ) : appts.isLoading ? (
            <Card><Spinner label="Loading Cal.com bookings…" /></Card>
          ) : (
            <Card flush rise="co-rise-1">
              <div className="co-week">
                <div className="co-week-hd" />
                {days.map((d) => {
                  const isToday = sameDay(d, today);
                  return (
                    <div key={d.toISOString()} className={`co-week-hd ${isToday ? 'today' : ''}`}>
                      <div style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                      <div style={{ fontSize: 13, marginTop: 1 }}>{d.getDate()}</div>
                    </div>
                  );
                })}
                {HOURS.map((hour) => (
                  <Fragment key={hour}>
                    <div className="co-week-time">{String(hour).padStart(2, '0')}:00</div>
                    {days.map((d, di) => {
                      const isToday = sameDay(d, today);
                      const items = byCell[`${di}-${hour}`] || [];
                      return (
                        <div
                          key={`${di}-${hour}`}
                          className={`co-week-cell ${isToday ? 'today' : ''}`}
                          onClick={() => openBooking(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0).toISOString())}
                          role="presentation"
                        >
                          {items.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              className={`co-slot ${a.status}`}
                              onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                              title={`${a.patient_name} · ${a.treatment || 'Appointment'}`}
                            >
                              {a.patient_name}
                              <small>{timeLabel(a.starts_at)}{a.treatment ? ` · ${a.treatment}` : ''}</small>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </Card>
          )}

          {away.length > 0 ? (
            <Card>
              <CardHead title="Outside the grid" hint="Appointments scheduled outside 08:00 – 20:00" />
              <div className="co-list">
                {away.map((a) => (
                  <div className="co-list-item" key={a.id}>
                    <span className="co-dot" />
                    <div style={{ flex: 1 }}>
                      <div className="co-strong" style={{ fontSize: 13 }}>{a.patient_name}</div>
                      <div className="co-xs co-mut">{dateLabel(a.starts_at)} · {timeLabel(a.starts_at)} · {a.treatment || 'Appointment'}</div>
                    </div>
                    <button type="button" className="co-btn co-btn-sm" onClick={() => setSelected(a)}>Open</button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        /* ── View 2: List View ──────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* List Search & Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 320 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                className="co-input"
                style={{ paddingLeft: 32, fontSize: 13 }}
                placeholder="Search attendee, phone, treatment, notes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                ['all', `All (${allRows.length})`],
                ['confirmed', `Confirmed (${allRows.filter((r) => r.status === 'confirmed').length})`],
                ['completed', `Completed (${allRows.filter((r) => r.status === 'completed').length})`],
                ['cancelled', `Cancelled (${allRows.filter((r) => r.status === 'cancelled').length})`],
              ].map(([st, label]) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`co-btn co-btn-sm ${statusFilter === st ? 'co-btn-primary' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* List Data Table */}
          <Card flush rise="co-rise-1">
            <div className="co-table-wrap">
              <table className="co-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Attendee / Patient</th>
                    <th>Contact Info</th>
                    <th>Treatment / Purpose</th>
                    <th>Branch / Location</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.length === 0 ? (
                    <tr>
                      <td colSpan="8">
                        <div className="co-empty" style={{ padding: '36px 16px' }}>
                          <CalendarDays size={28} style={{ color: '#CBD5E1', marginBottom: 8 }} />
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>No bookings found</div>
                          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                            {searchQuery ? 'Try clearing your search query' : 'Sync Cal.com to pull your live bookings'}
                          </div>
                          <button
                            type="button"
                            className="co-btn co-btn-primary co-btn-sm"
                            style={{ marginTop: 12 }}
                            onClick={handleSyncCalCom}
                            disabled={isSyncing}
                          >
                            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                            Sync Cal.com Now
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredList.map((a) => {
                      const cleanPh = (a.phone || '').replace(/[^0-9]/g, '');
                      const isMeet = a.meeting_link && a.meeting_link.startsWith('http');
                      return (
                        <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(a)}>
                          <td className="co-strong" style={{ whiteSpace: 'nowrap' }}>
                            <div>{dateLabel(a.starts_at)}</div>
                            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>
                              {timeLabel(a.starts_at)} IST
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar name={a.patient_name} size="sm" />
                              <div>
                                <div style={{ fontWeight: 600, color: '#0F172A' }}>{a.patient_name}</div>
                                {cleanEmail(a.email) ? (
                                  <div style={{ fontSize: 11, color: '#64748B' }}>{cleanEmail(a.email)}</div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {a.phone ? (
                                <a
                                  href={`tel:${a.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="co-chip co-c-p"
                                  style={{ padding: '3px 8px', fontSize: 11 }}
                                  title="Call number"
                                >
                                  <Phone size={10} /> {a.phone}
                                </a>
                              ) : <span className="co-mut">—</span>}
                              {cleanPh ? (
                                <a
                                  href={`https://wa.me/${cleanPh}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="co-chip co-c-g"
                                  style={{ padding: '3px 6px' }}
                                  title="Open WhatsApp chat"
                                >
                                  <MessageCircle size={10} />
                                </a>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{a.treatment || 'Consultation'}</div>
                            {a.notes ? (
                              <div style={{ fontSize: 11, color: '#64748B', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.notes}
                              </div>
                            ) : null}
                          </td>
                          <td className="co-mut" style={{ whiteSpace: 'nowrap' }}>
                            {isMeet ? (
                              <a
                                href={a.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563EB', fontWeight: 500 }}
                              >
                                <Video size={12} /> Google Meet <ExternalLink size={10} />
                              </a>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <MapPin size={12} style={{ color: '#CB3273' }} /> {a.branch || 'Clinic'}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="co-chip co-c-p" style={{ fontSize: 10, fontWeight: 600 }}>
                              Cal.com
                            </span>
                          </td>
                          <td><StatusChip status={a.status} /></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="co-btn co-btn-sm"
                              onClick={() => setSelected(a)}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Task Queue Section */}
      <div className="co-split">
        <TaskQueue />
        <Card>
          <CardHead title="Live Cal.com Integration" hint="cal.com/aura-laser-cosmetic-clinic" />
          <div className="co-list">
            <div className="co-list-item">
              <span className="co-dot ok" />
              <div className="co-sm">
                Bookings booked on your <a href="https://cal.com/aura-laser-cosmetic-clinic/30min" target="_blank" rel="noopener noreferrer" style={{ color: '#A4285E', fontWeight: 600, textDecoration: 'underline' }}>Cal.com page</a> sync automatically.
              </div>
            </div>
            <div className="co-list-item">
              <span className="co-dot ok" />
              <div className="co-sm">Switch between <span className="co-strong">Calendar View</span> and <span className="co-strong">List View</span> at any time.</div>
            </div>
            <div className="co-list-item">
              <span className="co-dot ok" />
              <div className="co-sm">All attendees receive automated Google Calendar invites and email confirmations.</div>
            </div>
            <div className="co-list-item">
              <span className="co-dot ok" />
              <div className="co-sm">Zero mock data — showing verified live database records.</div>
            </div>
          </div>
        </Card>
      </div>

      {/* New Booking Modal */}
      {booking ? (
        <Modal title="New appointment" subtitle="Schedule an appointment or consultation slot." onClose={() => setBooking(null)} width={620}>
          <BookingForm
            initial={booking}
            patients={patientsQ.data?.patients || []}
            busy={create.isPending}
            error={error}
            onClose={() => setBooking(null)}
            onSubmit={(body) => create.mutate(body)}
          />
        </Modal>
      ) : null}

      {/* Selected Appointment Detail Modal */}
      {selected ? (
        <AppointmentPanel
          appointment={selected}
          busy={update.isPending || remove.isPending}
          onClose={() => setSelected(null)}
          onStatus={(status) => update.mutate({ id: selected.id, body: { status } })}
          onReschedule={(startsAt) => update.mutate({ id: selected.id, body: { startsAt } })}
          onDelete={() => remove.mutate(selected.id)}
        />
      ) : null}

      {error && !booking && !selected ? (
        <p className="co-sm" style={{ color: '#B91C1C' }}>{error}</p>
      ) : null}
    </div>
  );
}
