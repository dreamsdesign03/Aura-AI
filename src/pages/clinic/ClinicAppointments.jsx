import { Fragment, useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw, CalendarDays, Calendar, Clock,
  Check, Trash2, MapPin, Phone, IndianRupee, List, ExternalLink,
  Search, Video, MessageCircle, Mail, Sparkles, Filter, CheckCircle2, User, Users, Handshake,
  Play, Pause, Volume2, Download, MessageSquare, PhoneOff, Link2,
} from 'lucide-react';
import CalEmbed from '@/components/CalEmbed';
import { clinicApi, fullName, money, timeLabel, dateLabel, cleanEnglishName, cleanEnglishTreatment } from '@/clinic/api';
import { getContactDisplayName } from '@/lib/contactName';
import { PageHead, Card, CardHead, StatusChip, EmptyState, Spinner, Modal, Avatar } from '@/clinic/ui';
import { cleanEmail } from '@/lib/emails';
import { useBranch } from '@/contexts/BranchContext';
import { useIsAdmin } from '@/contexts/AuthContext';

export function getAppointmentCategory(a) {
  if (!a) return 'ria';
  const md = a.booking_metadata || a.metadata || {};
  if (md.coordinator === 'Misha' || md.event_slug === 'skinnonest' || md.agent_type === 'makeup_artist') return 'misha';
  if (md.coordinator === 'Ria' || md.agent_type === 'consultation') return 'ria';
  if (/vishw/i.test(a.provider || '')) return 'misha';
  if (/aditya/i.test(a.provider || '')) return 'ria';

  const ev = (a.event_name || '').toLowerCase();
  const tr = (a.treatment || a.concern || '').toLowerCase();
  if (ev.startsWith('skinnonest') || ev.includes('makeup') || tr.includes('makeup') || tr.includes('partnership')) {
    return 'misha';
  }
  return 'ria';
}

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

function ApptAudioPlayer({ src }) {
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

  const formatSec = (sec) => {
    if (!sec && sec !== 0) return '0:00';
    const s = Math.round(Number(sec) || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#FBE9F1', borderRadius: 10, border: '1px solid #F3D9E5' }}>
      {src && <audio ref={audioRef} src={src} preload="metadata" />}
      <button
        type="button"
        className="co-btn co-btn-sm co-icon-btn"
        style={{ background: '#A4285E', color: '#fff', width: 34, height: 34, borderRadius: 999, flexShrink: 0 }}
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
      </button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          onClick={seek}
          style={{ flex: 1, height: 6, background: '#F3D9E5', borderRadius: 999, cursor: 'pointer', overflow: 'hidden' }}
        >
          <div
            style={{
              height: '100%',
              width: duration > 0 ? `${(current / duration) * 100}%` : '0%',
              background: '#A4285E',
              borderRadius: 999,
              transition: 'width 0.1s linear',
            }}
          />
        </div>
        <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: '#831843', whiteSpace: 'nowrap', minWidth: 65, textAlign: 'right' }}>
          {formatSec(current)} / {formatSec(duration)}
        </span>
      </div>
      {src && (
        <a
          href={src}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="co-btn co-btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: '#fff', color: '#A4285E', border: '1px solid #F3D9E5' }}
        >
          <Download size={11} /> Audio
        </a>
      )}
    </div>
  );
}

function parseApptTurns(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return [{ id: 0, isAgent: false, speaker: 'Patient', text: raw }]; }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((t, idx) => {
      const isAgent = t.role === 'agent' || t.role === 'assistant' || (t.speaker && /ai|agent|coordinator/i.test(t.speaker));
      const en = (t.en_text || t.text || t.message || t.content || t.original_message || '').trim();
      const indic = (t.indic_text && t.indic_text.trim() !== en) ? t.indic_text.trim() : '';
      return {
        id: idx,
        isAgent,
        speaker: isAgent ? 'Aura AI / Coordinator' : (t.speaker || 'Patient'),
        text: en || indic || (typeof t === 'string' ? t : ''),
        indicText: indic,
        time: t.time || (t.time_in_call_secs != null ? `${t.time_in_call_secs}s` : null),
      };
    }).filter(turn => turn.text && turn.text.trim());
  }
  return [];
}

export function BookingForm({ initial, patients, onSubmit, onClose, busy, error }) {
  const base = initial?.startsAt ? new Date(initial.startsAt) : new Date();
  const [form, setForm] = useState({
    leadId: initial?.leadId ? String(initial.leadId) : '',
    category: initial?.category || 'ria',
    patientName: initial?.patientName || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
    treatment: initial?.treatment || (initial?.category === 'misha' ? 'Skinnonest Makeup Artist Partnership' : 'Clinical Consultation'),
    branch: initial?.branch || (initial?.category === 'misha' ? 'Online (Google Meet)' : 'Alkapuri Main Clinic'),
    date: toDateInput(base),
    time: initial?.startsAt ? toTimeInput(base) : '10:00',
    durationMin: 30,
    amount: 0,
    notes: initial?.notes || '',
    sendConfirmation: true,
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function pickPatient(id) {
    const p = patients.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f,
      leadId: id,
      patientName: p ? fullName(p) : f.patientName,
      phone: p?.phone || f.phone,
      email: p?.email || f.email,
    }));
  }

  function submit(e) {
    e.preventDefault();
    if (!form.patientName.trim()) return;
    const startsAt = new Date(`${form.date}T${form.time}:00`);
    const noteSuffix = form.category === 'misha' ? ' [Skinnonest Makeup Artist Partnership · Vishw]' : ' [Aura Clinic Consultation · Dr. Aditya Shah]';
    onSubmit({
      leadId: form.leadId ? Number(form.leadId) : null,
      category: form.category,
      patientName: form.patientName.trim(),
      phone: form.phone || null,
      email: form.email?.trim() || null,
      treatment: form.treatment || (form.category === 'misha' ? 'Skinnonest Makeup Artist Partnership' : 'Clinical Consultation'),
      branch: form.branch || null,
      startsAt: startsAt.toISOString(),
      durationMin: Number(form.durationMin) || 30,
      amount: Number(form.amount) || 0,
      notes: (form.notes ? `${form.notes} ${noteSuffix}` : noteSuffix).trim(),
      sendConfirmation: form.sendConfirmation,
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="co-form-grid">
        <div className="co-field co-span-2">
          <label className="co-label" htmlFor="co-category">Appointment Calendar *</label>
          <select
            id="co-category"
            className="co-input font-medium"
            value={form.category}
            onChange={(e) => {
              const cat = e.target.value;
              setForm((f) => ({
                ...f,
                category: cat,
                treatment: cat === 'misha' ? 'Skinnonest Makeup Artist Partnership' : 'Clinical Consultation',
                branch: cat === 'misha' ? 'Online (Google Meet)' : 'Alkapuri Main Clinic',
              }));
            }}
          >
            <option value="ria">Clinic Consultation · Dr. Aditya Shah</option>
            <option value="misha">Makeup Artist Partnership · Skinnonest Vishw</option>
          </select>
        </div>
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
        <div className="co-field co-span-2">
          <label className="co-label" htmlFor="co-email">Email (optional)</label>
          <input id="co-email" type="email" className="co-input" value={form.email} onChange={set('email')} placeholder="patient@example.com" />
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
        <div className="co-field co-span-2">
          <label className="co-label flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.sendConfirmation} onChange={e => setForm(f => ({ ...f, sendConfirmation: e.target.checked }))} className="w-4 h-4 accent-pink-600 rounded border-gray-300" />
            <span>Send WhatsApp booking confirmation to patient</span>
          </label>
        </div>
      </div>
      {error ? <p className="co-sm" style={{ color: '#B91C1C' }}>{error}</p> : null}
      <div className="co-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="co-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="co-btn co-btn-primary" disabled={busy}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          {busy ? 'Creating in Cal.com...' : 'Book appointment'}
        </button>
      </div>
    </form>
  );
}

function AppointmentPanel({ appointment, onClose, onStatus, onReschedule, onDelete, onLinkedCall, busy, error }) {
  const isAdmin = useIsAdmin();
  const [reschedule, setReschedule] = useState(false);
  const [date, setDate] = useState(toDateInput(new Date(appointment.starts_at)));
  const [time, setTime] = useState(toTimeInput(new Date(appointment.starts_at)));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const isMisha = getAppointmentCategory(appointment) === 'misha';
  const hostName = appointment.provider || (isMisha ? 'Vishw' : 'Dr. Aditya Shah');
  const cleanPh = (appointment.phone || '').replace(/[^0-9]/g, '');
  const isMeet = (appointment.meeting_link && appointment.meeting_link.startsWith('http')) || isMisha;
  const patientCleanName = getContactDisplayName({ patient_name: appointment.patient_name, patient_name_english: appointment.patient_name_english, patient_name_original: appointment.patient_name_original });
  const cleanTreatment = cleanEnglishTreatment(appointment.treatment);
  const turns = parseApptTurns(appointment.transcript);
  const hasVoiceCall = !!(appointment.recording_url || turns.length > 0 || appointment.call_review_id);

  return (
    <Modal
      title={`Meeting: ${hostName} & ${patientCleanName}`}
      subtitle={`${dateLabel(appointment.starts_at)} · ${timeLabel(appointment.starts_at)}${cleanTreatment ? ` · ${cleanTreatment}` : ''}`}
      onClose={onClose}
      width={580}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="co-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <StatusChip status={appointment.status} />
          {isMisha ? (
            <span className="co-chip" style={{ background: '#F5F3FF', color: '#7C3AED', borderColor: '#DDD6FE', fontWeight: 700 }}>
              <Handshake size={11} /> Meeting: {hostName} &amp; {patientCleanName}
            </span>
          ) : (
            <span className="co-chip" style={{ background: '#FDF2F8', color: '#CB3273', borderColor: '#FBCFE8', fontWeight: 700 }}>
              <User size={11} /> Consultation: {hostName} &amp; {patientCleanName}
            </span>
          )}
          {appointment.source ? (
            <span className="co-chip co-c-p" style={{ fontWeight: 600 }}>
              <CalendarDays size={11} /> {appointment.source}
            </span>
          ) : null}
          {isMeet ? (
            <span className="co-chip co-c-b" style={{ background: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE', fontWeight: 600 }}>
              <Video size={11} /> Google Meet (Online Call)
            </span>
          ) : appointment.branch ? (
            <span className="co-chip co-c-n"><MapPin size={11} /> {appointment.branch}</span>
          ) : (
            <span className="co-chip co-c-n" style={{ color: '#64748B' }}><MapPin size={11} /> Unassigned branch</span>
          )}
          <span className="co-chip co-c-n" style={{ fontWeight: 600 }}>
            <User size={11} /> Host: {hostName}
          </span>
          <span className="co-chip co-c-n" style={{ fontWeight: 600 }}>
            <Users size={11} /> Attendee: {patientCleanName}
          </span>
          {appointment.phone ? (
            <a href={`tel:${appointment.phone}`} className="co-chip co-c-p"><Phone size={11} /> {appointment.phone}</a>
          ) : null}
          {cleanPh ? (
            <Link
              href={`/clinic/inbox?phone=${cleanPh}&name=${encodeURIComponent(patientCleanName)}`}
              className="co-chip co-c-g"
              style={{ textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title="Open WhatsApp conversation (+91 84900 33711)"
            >
              <MessageCircle size={11} /> WhatsApp (+91 84900 33711)
            </Link>
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

        {/* Audio Recording Playback — If available from AI Call */}
        {isAdmin && appointment.recording_url && (
          <div style={{ background: '#FFF5F8', border: '1px solid #F3D9E5', borderRadius: 10, padding: '12px 14px' }}>
            <div className="co-spread" style={{ marginBottom: 6 }}>
              <div className="co-label" style={{ color: '#A4285E', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Volume2 size={13} /> Call Audio Recording
              </div>
              {appointment.call_review_id && (
                <a
                  href={`/clinic/call-review/${appointment.call_review_id}`}
                  className="co-btn co-btn-sm"
                  style={{ fontSize: 11, color: '#A4285E', padding: '2px 8px' }}
                >
                  Call Review <ExternalLink size={11} />
                </a>
              )}
            </div>
            <ApptAudioPlayer src={appointment.recording_url} />
          </div>
        )}

        {/* AI Clinical Summary Notes */}
        {isAdmin && appointment.transcript_summary && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px' }}>
            <div className="co-spread" style={{ marginBottom: 6 }}>
              <div className="co-label" style={{ color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={13} style={{ color: '#4F46E5' }} /> AI Call Summary &amp; Clinical Context
              </div>
              {appointment.call_review_id && (
                <a
                  href={`/clinic/call-review/${appointment.call_review_id}`}
                  className="co-btn co-btn-sm"
                  style={{ fontSize: 11, color: '#4F46E5', padding: '2px 8px' }}
                >
                  Review Session <ExternalLink size={11} />
                </a>
              )}
            </div>
            <p className="co-sm" style={{ color: '#1E293B', whiteSpace: 'pre-line', lineHeight: 1.5, fontWeight: 500 }}>
              {appointment.transcript_summary}
            </p>
          </div>
        )}

        {/* Full Conversation Dialogue Transcript */}
        {isAdmin && turns.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px' }}>
            <div className="co-spread" style={{ marginBottom: 10 }}>
              <div className="co-label" style={{ color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={13} style={{ color: '#2563EB' }} /> Full Conversation Transcript ({turns.length} turns)
              </div>
              {appointment.call_review_id && (
                <a
                  href={`/clinic/call-review/${appointment.call_review_id}`}
                  className="co-btn co-btn-sm"
                  style={{ fontSize: 11, color: '#2563EB', padding: '2px 8px' }}
                >
                  Open Session <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
              {turns.map(t => (
                <div
                  key={t.id}
                  style={{
                    alignSelf: t.isAgent ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: t.isAgent ? '#FBE9F1' : '#F8FAFC',
                    color: t.isAgent ? '#831843' : '#1E293B',
                    border: t.isAgent ? '1px solid #F3D9E5' : '1px solid #E2E8F0',
                    borderRadius: t.isAgent ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    padding: '8px 12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, gap: 10 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: t.isAgent ? '#A4285E' : '#2563EB' }}>
                      {t.isAgent ? 'Aura AI / Coordinator' : patientCleanName}
                    </span>
                    {t.time && <span style={{ fontSize: 9.5, color: '#94A3B8' }}>{t.time}</span>}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.45, fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                    {t.text}
                  </div>
                  {t.indicText && (
                    <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 4, borderTop: '1px dashed rgba(0,0,0,0.08)', paddingTop: 2 }}>
                      {t.indicText}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No reliable call match — never show a wrong call, offer manual linking */}
        {!hasVoiceCall && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <PhoneOff size={18} style={{ color: '#64748B', flexShrink: 0 }} />
            <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.45, flex: 1, minWidth: 180 }}>
              <strong>No call linked</strong> — no AI call reliably matches this booking. Link the correct call manually if needed.
            </div>
            <button type="button" className="co-btn co-btn-sm" onClick={() => setLinkOpen(true)}>
              <Link2 size={12} /> Link call
            </button>
          </div>
        )}

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
                  {busy ? 'Saving & syncing with Cal.com...' : 'Save new time'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12, fontWeight: 500 }}>
            {error}
          </div>
        ) : null}

        <div className="co-spread" style={{ borderTop: '1px solid #F3D9E5', paddingTop: 14 }}>
          {confirmDelete ? (
            <div className="co-row">
              <span className="co-sm co-mut">Delete this appointment?</span>
              <button type="button" className="co-btn co-btn-sm" onClick={() => setConfirmDelete(false)}>No</button>
              <button type="button" className="co-btn co-btn-sm" style={{ color: '#B91C1C' }} onClick={onDelete} disabled={busy}>
                {busy ? 'Deleting & cancelling on Cal.com...' : 'Yes, delete'}
              </button>
            </div>
          ) : (
            <button type="button" className="co-btn co-btn-sm co-btn-ghost" style={{ color: '#B91C1C' }} onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} /> Delete
            </button>
          )}
          <button type="button" className="co-btn co-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>

      {linkOpen ? (
        <LinkCallModal
          appointment={appointment}
          onClose={() => setLinkOpen(false)}
          onLinked={() => {
            setLinkOpen(false);
            if (onLinkedCall) onLinkedCall();
          }}
        />
      ) : null}
    </Modal>
  );
}

function LinkCallModal({ appointment, onClose, onLinked }) {
  const qc = useQueryClient();
  const type = appointment.calendly_uri ? 'cal' : 'clinic';
  const { data, isLoading } = useQuery({
    queryKey: ['clinic', 'appointment-calls', appointment.id, type, appointment.phone],
    queryFn: () => clinicApi.appointmentCalls(appointment.id, type, appointment.phone),
  });
  const link = useMutation({
    mutationFn: (callId) => clinicApi.linkAppointmentCall(appointment.id, callId, type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic'] });
      onLinked();
    },
  });

  const isAdmin = useIsAdmin();
  const calls = data?.calls || [];

  return (
    <Modal
      title="Link AI call"
      subtitle={`${getContactDisplayName(appointment)} · ${dateLabel(appointment.starts_at)} ${timeLabel(appointment.starts_at)}`}
      onClose={onClose}
      width={620}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="co-sm co-mut" style={{ margin: 0 }}>
          Automatic matching found no reliable call for this booking. Pick the call that booked it — checksum, date and summary are shown so you can verify.
        </p>

        {isLoading ? (
          <Spinner label="Loading calls…" />
        ) : calls.length === 0 ? (
          <div className="co-empty" style={{ padding: '24px 12px' }}>
            <PhoneOff size={24} style={{ color: '#CBD5E1', marginBottom: 6 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>No calls found for this phone number</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
            {calls.map((c) => (
              <div
                key={c.id}
                style={{
                  border: c.suggested ? '1px solid #F3D9E5' : '1px solid #E2E8F0',
                  background: c.suggested ? '#FFF5F8' : '#FFFFFF',
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>
                      {c.started_at ? `${dateLabel(c.started_at)} · ${timeLabel(c.started_at)}` : 'Time not available'}
                    </span>
                    {c.suggested ? <span className="co-chip co-c-p" style={{ fontSize: 9.5 }}>Suggested</span> : null}
                    {c.outcome ? <span className="co-chip co-c-n" style={{ fontSize: 9.5 }}>{c.outcome}</span> : null}
                  </div>
                  <div className="co-xs co-mut" style={{ marginTop: 2 }}>
                    {c.lead_name || 'Name not available'} · {c.to_phone || 'Number not available'}
                    {c.duration_secs ? ` · ${Math.round(c.duration_secs / 60)} min` : ''}
                  </div>
                  {isAdmin && c.transcript_summary ? (
                    <div className="co-sm" style={{ marginTop: 4, color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45, paddingBottom: 2 }}>
                      {c.transcript_summary}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={`co-btn co-btn-sm ${c.suggested ? 'co-btn-primary' : ''}`}
                  style={{ flexShrink: 0 }}
                  onClick={() => link.mutate(c.id)}
                  disabled={link.isPending}
                >
                  <Link2 size={12} /> Link
                </button>
              </div>
            ))}
          </div>
        )}

        {link.isError ? <p className="co-sm" style={{ color: '#B91C1C', margin: 0 }}>{link.error?.message}</p> : null}

        <div className="co-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="co-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

export default function ClinicAppointments() {
  const qc = useQueryClient();
  const { selectedBranch } = useBranch();
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
  const [calendarFilter, setCalendarFilter] = useState('all'); // 'all' | 'ria' | 'misha'
  const [onlineCalendarTab, setOnlineCalendarTab] = useState('ria'); // 'ria' | 'misha'

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const from = useMemo(() => weekStart.toISOString(), [weekStart]);
  const to = useMemo(() => addDays(weekStart, 7).toISOString(), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = new Date();

  // Queries
  const appts = useQuery({
    queryKey: ['clinic', 'appointments', from, to, selectedBranch],
    queryFn: () => clinicApi.appointments(from, to, false, selectedBranch || undefined),
    refetchInterval: 8_000,
    staleTime: 2_000,
    refetchOnWindowFocus: true,
  });
  const patientsQ = useQuery({
    queryKey: ['clinic', 'patients', selectedBranch],
    queryFn: () => clinicApi.patients('', selectedBranch || undefined),
    refetchInterval: 15_000,
    staleTime: 2_000,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['clinic'] });

  // Auto-sync online bookings quietly in the background every 35s
  useEffect(() => {
    const quietSync = async () => {
      try {
        await clinicApi.syncAppointments();
        invalidate();
      } catch (e) {
        // quiet background failover
      }
    };
    const t = setInterval(quietSync, 35 * 1000);
    return () => clearInterval(t);
  }, []);

  const handleSyncCalCom = async () => {
    setIsSyncing(true);
    setSyncFeedback('');
    try {
      const res = await clinicApi.syncAppointments();
      invalidate();
      setSyncFeedback(`Synced ${res.total || 0} live bookings from online booking!`);
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

  const riaCount = useMemo(() => allRows.filter((a) => getAppointmentCategory(a) === 'ria').length, [allRows]);
  const mishaCount = useMemo(() => allRows.filter((a) => getAppointmentCategory(a) === 'misha').length, [allRows]);

  const categoryWeekRows = useMemo(() => {
    if (calendarFilter === 'ria') return weekRows.filter((a) => getAppointmentCategory(a) === 'ria');
    if (calendarFilter === 'misha') return weekRows.filter((a) => getAppointmentCategory(a) === 'misha');
    return weekRows;
  }, [weekRows, calendarFilter]);

  // Filtered list view bookings
  const filteredList = useMemo(() => {
    return allRows.filter((a) => {
      if (calendarFilter === 'ria' && getAppointmentCategory(a) !== 'ria') return false;
      if (calendarFilter === 'misha' && getAppointmentCategory(a) !== 'misha') return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cleanQDigits = q.replace(/\D/g, '');
        const cleanPh = (a.phone || '').replace(/\D/g, '');
        const cleanName = getContactDisplayName(a).toLowerCase();
        const rawName = (a.patient_name || '').toLowerCase();
        const text = `${cleanName} ${rawName} ${a.phone || ''} ${a.email || ''} ${a.treatment || ''} ${a.branch || ''} ${a.notes || ''} ${a.status || ''}`.toLowerCase();
        if (!text.includes(q) && !(cleanQDigits.length >= 3 && cleanPh.includes(cleanQDigits))) return false;
      }
      return true;
    });
  }, [allRows, calendarFilter, statusFilter, searchQuery]);

  const byCell = useMemo(() => {
    const map = {};
    for (const a of categoryWeekRows) {
      const d = new Date(a.starts_at);
      const di = days.findIndex((x) => sameDay(x, d));
      if (di < 0) continue;
      const key = `${di}-${d.getHours()}`;
      (map[key] = map[key] || []).push(a);
    }
    return map;
  }, [categoryWeekRows, days]);

  const away = categoryWeekRows.filter((a) => {
    const d = new Date(a.starts_at);
    return !days.some((x) => sameDay(x, d)) || d.getHours() < HOURS[0] || d.getHours() > HOURS[HOURS.length - 1];
  });

  const openBooking = (startsAt) => {
    setError('');
    const fallback = new Date(days[0].getFullYear(), days[0].getMonth(), days[0].getDate(), 10, 0, 0, 0);
    setBooking(startsAt ? { startsAt, category: calendarFilter === 'misha' ? 'misha' : 'ria' } : { startsAt: fallback.toISOString(), category: calendarFilter === 'misha' ? 'misha' : 'ria' });
  };

  // Jump anchor to most recent booking
  const jumpToLatestBooking = () => {
    if (allRows.length > 0) {
      setAnchor(new Date(allRows[0].starts_at));
    }
  };

  return (
    <div className="clinic-os" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        title="Appointments & Meetings"
        subtitle="Live online bookings, clinical consultations & schedule without demo data."
      >
        {/* View Toggle */}
        <div className="co-pill-tabs">
          <button
            type="button"
            onClick={() => handleViewChange('calendar')}
            className={`co-pill-tab ${viewMode === 'calendar' ? 'active' : ''}`}
          >
            <CalendarDays size={13} /> Calendar View
          </button>
          <button
            type="button"
            onClick={() => handleViewChange('list')}
            className={`co-pill-tab ${viewMode === 'list' ? 'active' : ''}`}
          >
            <List size={13} /> List View <span className="co-pill-badge">{allRows.length}</span>
          </button>
          <button
            type="button"
            onClick={() => handleViewChange('online_booking')}
            className={`co-pill-tab ${viewMode === 'online_booking' ? 'active' : ''}`}
          >
            <Calendar size={13} /> Online Booking Calendars
          </button>
        </div>

        {/* Sync online bookings button */}
        <button
          type="button"
          className="co-btn co-btn-sm"
          onClick={handleSyncCalCom}
          disabled={isSyncing}
          title="Sync live online bookings"
          style={{ borderColor: '#F3D9E5', color: '#A4285E' }}
        >
          <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing…' : 'Sync bookings'}
        </button>

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

      {/* Dual Calendar Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 14px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Calendars:
          </span>
          <button
            type="button"
            onClick={() => setCalendarFilter('all')}
            className={`co-pill-tab ${calendarFilter === 'all' ? 'active' : ''}`}
            style={{ fontWeight: 600, fontSize: 12 }}
          >
            All Appointments ({allRows.length})
          </button>
          <button
            type="button"
            onClick={() => setCalendarFilter('ria')}
            className={`co-pill-tab ${calendarFilter === 'ria' ? 'active' : ''}`}
            style={calendarFilter === 'ria' ? { background: '#CB3273', color: '#FFFFFF', borderColor: '#CB3273', fontWeight: 700, fontSize: 12 } : { fontWeight: 600, fontSize: 12 }}
          >
            <User size={13} /> 1. Consultation · Dr. Aditya Shah ({riaCount})
          </button>
          <button
            type="button"
            onClick={() => setCalendarFilter('misha')}
            className={`co-pill-tab ${calendarFilter === 'misha' ? 'active' : ''}`}
            style={calendarFilter === 'misha' ? { background: '#7C3AED', color: '#FFFFFF', borderColor: '#7C3AED', fontWeight: 700, fontSize: 12 } : { fontWeight: 600, fontSize: 12 }}
          >
            <Handshake size={13} /> 2. Makeup Artist Partnership · Vishw ({mishaCount})
          </button>
        </div>

        {viewMode !== 'online_booking' ? (
          <button
            type="button"
            onClick={() => handleViewChange('online_booking')}
            className="co-btn co-btn-sm"
            style={{ color: '#CB3273', borderColor: '#F3D9E5', fontWeight: 600 }}
          >
            <Calendar size={13} /> Open Live Booking Calendars →
          </button>
        ) : null}
      </div>

      {/* ── View 3: Online Booking Calendars (Dual Embed) ──────────── */}
      {viewMode === 'online_booking' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Calendar Picker Tabs */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setOnlineCalendarTab('ria')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                  onlineCalendarTab === 'ria'
                    ? 'bg-pink-600 text-white border-pink-600 shadow-xs'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'
                }`}
              >
                <User size={14} />
                <span>1. Clinic Consultation · Dr. Aditya Shah</span>
              </button>
              <button
                type="button"
                onClick={() => setOnlineCalendarTab('misha')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                  onlineCalendarTab === 'misha'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'
                }`}
              >
                <Handshake size={14} />
                <span>2. Makeup Artist Partnership · Skinnonest Vishw</span>
              </button>
            </div>

            <a
              href={onlineCalendarTab === 'ria' ? 'https://cal.com/aura-laser-cosmetic-clinic/30min' : 'https://cal.com/aura-laser-cosmetic-clinic/skinnonest'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-pink-700 hover:text-pink-800 bg-pink-50 hover:bg-pink-100 px-3 py-1.5 rounded-lg transition-colors border border-pink-200"
            >
              Open Direct Booking Page <ExternalLink size={12} />
            </a>
          </div>

          {/* Calendar Embed Container */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col md:flex-row">
            {/* Host Details Side Panel */}
            {onlineCalendarTab === 'ria' ? (
              <div className="md:w-72 flex-shrink-0 p-6 md:p-8 border-b md:border-b-0 md:border-r border-gray-100" style={{ background: 'linear-gradient(160deg, #A4285E 0%, #2A0A18 100%)' }}>
                <div className="w-12 h-12 rounded-xl mb-4 flex items-center justify-center font-bold text-white text-base shadow-xs" style={{ background: 'rgba(255,255,255,0.15)' }}>
                  AS
                </div>
                <div className="text-white font-bold text-base leading-snug mb-0.5">Dr. Aditya Shah</div>
                <div className="text-xs text-pink-200 font-medium mb-4">Founder · Aura Laser &amp; Cosmetic Clinic</div>

                <p className="text-xs text-pink-100/80 leading-relaxed mb-5">
                  Book a free 30-minute consultation with Dr. Aditya Shah to discuss clinical skin, hair &amp; laser treatment needs — personalised care, visible results.
                </p>

                <div className="space-y-2.5 text-xs text-white">
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="text-pink-300 flex-shrink-0" />
                    <span>30 minutes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Video size={13} className="text-pink-300 flex-shrink-0" />
                    <span>Google Meet / In-person (Vadodara)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={13} className="text-pink-300 flex-shrink-0" />
                    <span>Live Online Booking (Cal.com)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="md:w-72 flex-shrink-0 p-6 md:p-8 border-b md:border-b-0 md:border-r border-gray-100" style={{ background: 'linear-gradient(160deg, #6B21A8 0%, #1E1B4B 100%)' }}>
                <div className="w-12 h-12 rounded-xl mb-4 flex items-center justify-center font-bold text-white text-base shadow-xs" style={{ background: 'rgba(255,255,255,0.15)' }}>
                  SK
                </div>
                <div className="text-white font-bold text-base leading-snug mb-0.5">Vishw</div>
                <div className="text-xs text-purple-200 font-medium mb-4">Skinnonest Brand Representative</div>

                <p className="text-xs text-purple-100/80 leading-relaxed mb-5">
                  Skinnonest derma &amp; cosmeceutical skincare partnership meeting for makeup artists, salons &amp; skin clinics. Review product ranges, free trial samples &amp; partnership terms.
                </p>

                <div className="space-y-2.5 text-xs text-white">
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="text-purple-300 flex-shrink-0" />
                    <span>30 minutes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Video size={13} className="text-purple-300 flex-shrink-0" />
                    <span>Google Meet Online Call</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={13} className="text-purple-300 flex-shrink-0" />
                    <span>Live Online Booking (Cal.com)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Cal.com Embed */}
            <div className="flex-1 p-4 md:p-6 bg-white min-w-0">
              <CalEmbed
                url={onlineCalendarTab === 'ria'
                  ? 'https://cal.com/aura-laser-cosmetic-clinic/30min'
                  : 'https://cal.com/aura-laser-cosmetic-clinic/skinnonest'}
                height={720}
              />
            </div>
          </div>
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
            <Card><Spinner label="Loading online bookings…" /></Card>
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
                          {items.map((a) => {
                            const isMisha = getAppointmentCategory(a) === 'misha';
                            const slotProvider = a.provider || (isMisha ? 'Vishw' : 'Dr. Aditya Shah');
                            return (
                              <button
                                key={a.id}
                                type="button"
                                className={`co-slot ${a.status}`}
                                onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                                title={`${getContactDisplayName(a)} · ${cleanEnglishTreatment(a.treatment)} (${slotProvider}${isMisha ? ' · Skinnonest' : ' · Aura Clinic'})`}
                                style={isMisha ? { borderLeft: '3px solid #7C3AED', background: '#F5F3FF' } : { borderLeft: '3px solid #CB3273' }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                  <span style={{ fontWeight: 600 }}>{getContactDisplayName(a)}</span>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2.5, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: isMisha ? '#EDE9FE' : '#FCE7F3', color: isMisha ? '#6D28D9' : '#BE185D' }}>
                                    {isMisha ? <Handshake size={9} /> : <User size={9} />}
                                    {slotProvider}
                                  </span>
                                </div>
                                <small>
                                  {timeLabel(a.starts_at)}{a.treatment ? ` · ${cleanEnglishTreatment(a.treatment)}` : ''}
                                  {a.branch ? ` · ${a.branch}` : ''}
                                </small>
                              </button>
                            );
                          })}
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
                      <div className="co-strong" style={{ fontSize: 13 }}>{getContactDisplayName(a)}</div>
                      <div className="co-xs co-mut">{dateLabel(a.starts_at)} · {timeLabel(a.starts_at)} · {cleanEnglishTreatment(a.treatment)}</div>
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

            {/* Status pills — Consistent Aura Pill Tabs */}
            <div className="co-pill-tabs">
              {[
                ['all', 'All', allRows.length],
                ['confirmed', 'Confirmed', allRows.filter((r) => r.status === 'confirmed').length],
                ['completed', 'Completed', allRows.filter((r) => r.status === 'completed').length],
                ['cancelled', 'Cancelled', allRows.filter((r) => r.status === 'cancelled').length],
              ].map(([st, label, count]) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`co-pill-tab ${statusFilter === st ? 'active' : ''}`}
                >
                  <span>{label}</span>
                  <span className="co-pill-badge">{count}</span>
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
                    <th>Calendar / Coordinator</th>
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
                      <td colSpan="9">
                        <div className="co-empty" style={{ padding: '36px 16px' }}>
                          <CalendarDays size={28} style={{ color: '#CBD5E1', marginBottom: 8 }} />
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>No bookings found</div>
                          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                            {searchQuery ? 'Try clearing your search query' : 'Sync bookings to pull your live schedule'}
                          </div>
                          <button
                            type="button"
                            className="co-btn co-btn-primary co-btn-sm"
                            style={{ marginTop: 12 }}
                            onClick={handleSyncCalCom}
                            disabled={isSyncing}
                          >
                            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                            Sync bookings now
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
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {getAppointmentCategory(a) === 'misha' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 9999, background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                                <Handshake size={11} /> {a.provider || 'Vishw'} &amp; {getContactDisplayName(a)}
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 9999, background: '#FDF2F8', color: '#CB3273', border: '1px solid #FBCFE8' }}>
                                <User size={11} /> {a.provider || 'Dr. Aditya Shah'} &amp; {getContactDisplayName(a)}
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar name={getContactDisplayName(a)} size="sm" />
                              <div>
                                <div style={{ fontWeight: 600, color: '#0F172A' }}>{getContactDisplayName(a)}</div>
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
                                <Link
                                  href={`/clinic/inbox?phone=${cleanPh}&name=${encodeURIComponent(getContactDisplayName(a))}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="co-chip co-c-g"
                                  style={{ padding: '3px 6px', display: 'inline-flex', alignItems: 'center' }}
                                  title="Open WhatsApp Inbox (+91 84900 33711)"
                                >
                                  <MessageCircle size={10} />
                                </Link>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{cleanEnglishTreatment(a.treatment)}</div>
                            {a.notes ? (
                              <div style={{ fontSize: 11, color: '#64748B', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.notes}
                              </div>
                            ) : null}
                          </td>
                          <td className="co-mut" style={{ whiteSpace: 'nowrap' }}>
                            {isMeet || getAppointmentCategory(a) === 'misha' ? (
                              <a
                                href={a.meeting_link || 'https://meet.google.com'}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => { if (!a.meeting_link) e.preventDefault(); e.stopPropagation(); }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563EB', fontWeight: 500 }}
                              >
                                <Video size={12} /> Google Meet <ExternalLink size={10} />
                              </a>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <MapPin size={12} style={{ color: '#CB3273' }} /> {a.branch || 'Unassigned'}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="co-chip co-c-p" style={{ fontSize: 10, fontWeight: 600 }}>
                              {a.source || 'Online Booking'}
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
          error={error}
          onClose={() => { setSelected(null); setError(''); }}
          onStatus={(status) => update.mutate({ id: selected.id, body: { status } })}
          onReschedule={(startsAt) => update.mutate({ id: selected.id, body: { startsAt } })}
          onDelete={() => remove.mutate(selected.id)}
          onLinkedCall={() => { setSelected(null); invalidate(); }}
        />
      ) : null}

      {error && !booking && !selected ? (
        <p className="co-sm" style={{ color: '#B91C1C' }}>{error}</p>
      ) : null}
    </div>
  );
}
