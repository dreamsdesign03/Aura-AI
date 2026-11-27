import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, RefreshCw, Plus, Phone, Mail, CalendarDays, IndianRupee,
  StickyNote, Package, PhoneCall, ArrowUpRight, Check, Clock, Users, MessageCircle,
  Filter, X, Compass, ArrowLeft, Trash2, Pencil
} from 'lucide-react';
import { Link, useLocation, useRoute } from 'wouter';
import { clinicApi, fullName, money, dateLabel, timeLabel, datetimeLabel } from '@/clinic/api';
import { getContactDisplayName } from '@/lib/contactName';
import { isPlaceholderEmail } from '@/lib/emails';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Drawer, Tabs, Kpi, Modal } from '@/clinic/ui';
import PatientJourneySection from './PatientJourneySection';
import { useBranch } from '@/contexts/BranchContext';

export const PATIENT_CARE_STAGES = [
  { id: 1, key: 'discover', name: 'Stage 1: Discover', short: 'Enquiry', chipLabel: 'Stage 1 · Enquiry', color: '#6366F1', bg: '#EEF2FF', desc: 'New inquiry from ad, web, or social' },
  { id: 2, key: 'engage', name: 'Stage 2: Engage', short: 'Engaged', chipLabel: 'Stage 2 · Engaged', color: '#0EA5E9', bg: '#F0F9FF', desc: 'Engaged on WhatsApp, web chat or skin scan' },
  { id: 3, key: 'capture', name: 'Stage 3: Capture and route', short: 'Captured', chipLabel: 'Stage 3 · Captured', color: '#F59E0B', bg: '#FFFBEB', desc: 'Contact details verified & branch assigned' },
  { id: 4, key: 'qualify', name: 'Stage 4: Qualify', short: 'Qualified', chipLabel: 'Stage 4 · Qualified', color: '#D97706', bg: '#FEF3C7', desc: 'Screened by AI / clinic coordinator' },
  { id: 5, key: 'book', name: 'Stage 5: Book', short: 'Booked', chipLabel: 'Stage 5 · Booked Consult', color: '#10B981', bg: '#ECFDF5', desc: 'Consultation booked online or at the clinic' },
  { id: 6, key: 'consult', name: 'Stage 6: Consult and convert', short: 'Consulted', chipLabel: 'Stage 6 · Consulted', color: '#8B5CF6', bg: '#F5F3FF', desc: 'Doctor consultation completed & quote sent' },
  { id: 7, key: 'treat', name: 'Stage 7: Treat and complete', short: 'In Treatment', chipLabel: 'Stage 7 · In Treatment', color: '#EC4899', bg: '#FDF2F8', desc: 'Active treatment sessions under Dr. Aditya' },
  { id: 8, key: 'delight', name: 'Stage 8: Delight and review', short: 'Delight', chipLabel: 'Stage 8 · Delight & Review', color: '#14B8A6', bg: '#F0FDFA', desc: 'Treatment completed & review collected' },
  { id: 9, key: 'retain', name: 'Stage 9: Retain and expand', short: 'Retained', chipLabel: 'Stage 9 · Retain & Expand', color: '#3B82F6', bg: '#EFF6FF', desc: 'Maintenance follow-ups & festive packages' },
  { id: 10, key: 'refer', name: 'Stage 10: Refer and advocate', short: 'Advocate', chipLabel: 'Stage 10 · VIP & Referrals', color: '#A855F7', bg: '#FAF5FF', desc: 'Advocate sharing referrals and stories' },
];

export function getPatientCareStage(patient) {
  if (!patient) return PATIENT_CARE_STAGES[0];
  const stageStr = (patient.pipeline_stage || '').trim().toLowerCase();
  
  // 1. Direct match with stage number or key name
  for (const s of PATIENT_CARE_STAGES) {
    if (stageStr === s.name.toLowerCase() || stageStr.includes(s.key) || stageStr.startsWith(`stage ${s.id}`)) {
      return s;
    }
  }

  // 2. Intelligent clinical fallback:
  if (Number(patient.packages || 0) > 0) {
    return PATIENT_CARE_STAGES[6]; // Stage 7: Treat and complete
  }
  if (Number(patient.appointments || 0) > 0) {
    return PATIENT_CARE_STAGES[4]; // Stage 5: Book
  }
  if (stageStr.includes('consult')) {
    return PATIENT_CARE_STAGES[5]; // Stage 6: Consult and convert
  }
  if (stageStr.includes('engage')) {
    return PATIENT_CARE_STAGES[1]; // Stage 2: Engage
  }
  if (stageStr.includes('qualif')) {
    return PATIENT_CARE_STAGES[3]; // Stage 4: Qualify
  }

  return PATIENT_CARE_STAGES[4]; // Default to Stage 5: Book for active registered patients
}

function NoteForm({ leadId, onDone }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  const add = useMutation({
    mutationFn: () => clinicApi.addNote({ leadId, kind, title: title.trim() || null, body: body.trim() || null }),
    onSuccess: () => {
      setTitle(''); setBody(''); setError('');
      qc.invalidateQueries({ queryKey: ['clinic'] });
      onDone?.();
    },
    onError: (err) => setError(err.message),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (title.trim() || body.trim()) add.mutate(); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div className="co-form-grid" style={{ gridTemplateColumns: '120px minmax(0, 1fr)' }}>
        <div className="co-field">
          <label className="co-label" htmlFor="co-nkind">Type</label>
          <select id="co-nkind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="consult">Consult</option>
          </select>
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-ntitle">Title</label>
          <input id="co-ntitle" className="co-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
        </div>
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-nbody">Details</label>
        <textarea id="co-nbody" rows="2" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened, what to do next…" />
      </div>
      {error ? <p className="co-sm" style={{ color: '#B91C1C' }}>{error}</p> : null}
      <button type="submit" className="co-btn co-btn-primary co-btn-sm" style={{ alignSelf: 'flex-start' }} disabled={add.isPending || (!title.trim() && !body.trim())}>
        {add.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />} Add to timeline
      </button>
    </form>
  );
}

function PackageForm({ leadId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', totalSessions: 6, amount: 0, paidAmount: 0 });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = useMutation({
    mutationFn: () => clinicApi.createPackage({ leadId, ...form, totalSessions: Number(form.totalSessions) || 1, amount: Number(form.amount) || 0, paidAmount: Number(form.paidAmount) || 0 }),
    onSuccess: () => { setForm({ name: '', totalSessions: 6, amount: 0, paidAmount: 0 }); setError(''); qc.invalidateQueries({ queryKey: ['clinic'] }); },
    onError: (err) => setError(err.message),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) add.mutate(); }} className="co-form-grid" style={{ marginTop: 12 }}>
      <div className="co-field co-span-2">
        <label className="co-label" htmlFor="co-pname">Package name</label>
        <input id="co-pname" className="co-input" value={form.name} onChange={set('name')} placeholder="e.g. Laser – 6 sittings" />
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-psessions">Sessions</label>
        <input id="co-psessions" type="number" min="1" className="co-input" value={form.totalSessions} onChange={set('totalSessions')} />
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-pamount">Package value (₹)</label>
        <input id="co-pamount" type="number" min="0" className="co-input" value={form.amount} onChange={set('amount')} />
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-ppaid">Paid (₹)</label>
        <input id="co-ppaid" type="number" min="0" className="co-input" value={form.paidAmount} onChange={set('paidAmount')} />
      </div>
      <div className="co-field" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="co-btn co-btn-primary co-btn-sm" disabled={add.isPending || !form.name.trim()}>
          {add.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />} Add package
        </button>
      </div>
      {error ? <p className="co-sm co-span-2" style={{ color: '#B91C1C' }}>{error}</p> : null}
    </form>
  );
}

export function PatientDrawer({ id, onClose, onDeleteClick, onEditClick }) {
  const qc = useQueryClient();
  const { selectedBranch, branches } = useBranch();
  const branchOptions = useMemo(() => {
    return (branches || []).map((b) => b?.name).filter(Boolean);
  }, [branches]);
  const [tab, setTab] = useState('overview');
  const [showAddVisit, setShowAddVisit] = useState(false);
  const [visitForm, setVisitForm] = useState(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const localDt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return {
      visitDate: localDt,
      visitType: 'Consultation',
      provider: 'Dr. Aditya Shah',
      branch: selectedBranch || branchOptions[0] || 'Alkapuri Main Clinic',
      outcome: 'completed',
      notes: '',
      nextSteps: '',
    };
  });
  const [editingVisitId, setEditingVisitId] = useState(null);
  const [editVisitNotes, setEditVisitNotes] = useState('');
  const [editVisitNextSteps, setEditVisitNextSteps] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['clinic', 'patient', id],
    queryFn: () => clinicApi.patient(id),
    refetchInterval: 6_000,
    staleTime: 2_000,
    refetchOnWindowFocus: true,
  });

  const createVisit = useMutation({
    mutationFn: (body) => clinicApi.createVisit(body),
    onSuccess: () => {
      setShowAddVisit(false);
      setVisitForm((f) => ({ ...f, notes: '', nextSteps: '' }));
      qc.invalidateQueries({ queryKey: ['clinic'] });
    },
  });

  const updateVisit = useMutation({
    mutationFn: ({ visitId, body }) => clinicApi.updateVisit(visitId, body),
    onSuccess: () => {
      setEditingVisitId(null);
      qc.invalidateQueries({ queryKey: ['clinic'] });
    },
  });

  const deleteVisit = useMutation({
    mutationFn: (visitId) => clinicApi.deleteVisit(visitId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic'] }),
  });

  const useSession = useMutation({
    mutationFn: (pkgId) => clinicApi.useSession(pkgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic'] }),
  });

  const updateStage = useMutation({
    mutationFn: (stage) => clinicApi.updatePatientStage(id, stage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic'] });
    },
  });

  const p = data?.patient;
  const notes = data?.notes || [];
  const appts = data?.appointments || [];
  const packages = data?.packages || [];
  const calls = data?.calls || [];
  const visits = data?.visits || [];
  const currentStage = p ? getPatientCareStage(p) : PATIENT_CARE_STAGES[0];

  // Filter out placeholder emails for display
  const displayEmail = p?.email && !isPlaceholderEmail(p.email) ? p.email : null;
  // Format phone for display
  const formatPhone = (phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return `+91 ${digits.slice(0,5)} ${digits.slice(5)}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2,7)} ${digits.slice(7)}`;
    return phone;
  };
  const displayPhone = formatPhone(p?.phone);

  return (
    <Drawer
      title={p ? getContactDisplayName(p) : 'Patient'}
      subtitle={p ? [displayEmail, displayPhone].filter(Boolean).join(' · ') : ''}
      onClose={onClose}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {p?.phone ? (
            <a href={`tel:${p.phone}`} className="co-btn co-btn-sm co-icon-btn" aria-label="Call patient"><Phone size={14} /></a>
          ) : null}
          <button
            type="button"
            className="co-btn co-btn-sm co-btn-ghost"
            onClick={() => p && onEditClick?.(p)}
            title="Edit Patient Details"
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            type="button"
            className="co-btn co-btn-sm co-btn-ghost"
            style={{ color: '#DC2626', borderColor: '#FCA5A5', background: '#FEF2F2' }}
            onClick={() => p && onDeleteClick?.(p)}
            title="Delete Patient"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      }
    >
      {isLoading ? <Spinner label="Loading patient…" /> : isError ? (
        <EmptyState title="Could not load patient"><p className="co-sm co-mut">{error?.message}</p></EmptyState>
      ) : (
        <>
          <div className="co-row" style={{ gap: 12 }}>
            <Avatar first={p.first_name} last={p.last_name} size="lg" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="co-strong" style={{ fontSize: 15 }}>{getContactDisplayName(p)}</div>
              <div className="co-xs co-mut">Aura Laser &amp; Cosmetic Clinic · Patient #{p.id}</div>
              <div className="co-row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span
                  className="co-chip"
                  style={{
                    background: currentStage.bg,
                    color: currentStage.color,
                    borderColor: currentStage.color + '40',
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  {currentStage.chipLabel}
                </span>
                <span className="co-chip co-c-n"><CalendarDays size={11} /> {appts.length} appointments</span>
<span className="co-chip co-c-g"><CalendarDays size={11} /> {visits?.length || 0} visits</span>
                {packages.length > 0 ? <span className="co-chip co-c-n"><Package size={11} /> {packages.length} packages</span> : null}
              </div>
            </div>
          </div>

          {/* Care Stage selector */}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
            <span className="co-xs co-mut" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Care Stage:</span>
            <select
              value={currentStage.name}
              onChange={(e) => updateStage.mutate(e.target.value)}
              disabled={updateStage.isPending}
              className="co-input"
              style={{ padding: '4px 8px', fontSize: 12, fontWeight: 600, flex: 1, borderColor: '#D1D5DB' }}
            >
              {PATIENT_CARE_STAGES.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name} ({s.short})
                </option>
              ))}
            </select>
            {updateStage.isPending ? <RefreshCw size={12} className="animate-spin text-gray-400" /> : null}
          </div>

          <div className="co-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {displayPhone ? <a className="co-chip co-c-p" href={`tel:${p.phone}`}><Phone size={11} /> Call {displayPhone}</a> : null}
            {p.phone ? (
              <a className="co-chip co-c-p" href={`https://wa.me/${p.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
                <MessageCircle size={11} /> WhatsApp
              </a>
            ) : null}
            {displayEmail ? <a className="co-chip co-c-n" href={`mailto:${displayEmail}`}><Mail size={11} /> {displayEmail}</a> : null}
            <Link href="/clinic/appointments" className="co-chip co-c-n"><CalendarDays size={11} /> Book consultation</Link>
            <Link href="/clinic/dialer" className="co-chip co-c-n"><PhoneCall size={11} /> AI Dialer</Link>
          </div>

          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'overview', label: 'Overview' },
              { value: 'visits', label: `Visits (${visits?.length || 0})` },
              { value: 'appointments', label: `Appointments (${appts.length})` },
              { value: 'packages', label: `Packages (${packages.length})` },
            ]}
          />

          {tab === 'overview' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="co-label">Upcoming Appointment</div>
                {(appts || []).length > 0 ? (
                  <div className="co-card" style={{ padding: 12 }}>
                    <div className="co-strong">{appts[0].treatment || 'Appointment'}</div>
                    <div className="co-xs co-mut">{dateLabel(appts[0].starts_at)} · {timeLabel(appts[0].starts_at)}{appts[0].branch ? ` · ${appts[0].branch}` : ''}</div>
                    <div className="co-xs co-mut" style={{ marginTop: 4 }}>Next appointment: {dateLabel(appts[0].starts_at)} at {timeLabel(appts[0].starts_at)}{appts[0].branch ? ` · ${appts[0].branch}` : ''}</div>
                  </div>
                ) : (
                  <p className="co-sm co-mut">No upcoming appointments.</p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="co-label">Last Visit</div>
                {p.last_visit ? (
                  <div className="co-card" style={{ padding: 12 }}>
                    <div className="co-strong">{datetimeLabel(p.last_visit)}</div>
                    <div className="co-xs co-mut">Last recorded visit</div>
                  </div>
                ) : (
                  <p className="co-sm co-mut">—</p>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'visits' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="co-spread">
                <span className="co-xs co-mut">
                  Record clinic visits &amp; what the patient discussed at each visit.
                </span>
                <button
                  type="button"
                  className="co-btn co-btn-primary co-btn-sm"
                  onClick={() => setShowAddVisit((v) => !v)}
                >
                  <Plus size={13} /> {showAddVisit ? 'Close' : 'Add Visit'}
                </button>
              </div>

              {showAddVisit && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!visitForm.visitDate) return;
                    createVisit.mutate({
                      leadId: Number(id),
                      patientName: p ? getContactDisplayName(p) : 'Patient',
                      phone: p?.phone || null,
                      branch: visitForm.branch || null,
                      provider: visitForm.provider || null,
                      visitType: visitForm.visitType || 'Consultation',
                      visitDate: new Date(visitForm.visitDate).toISOString(),
                      notes: visitForm.notes.trim() || null,
                      outcome: visitForm.outcome || 'completed',
                      nextSteps: visitForm.nextSteps.trim() || null,
                    });
                  }}
                  style={{
                    background: '#FFF9FC',
                    border: '1px solid #F3D9E5',
                    borderRadius: 12,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div className="co-form-grid">
                    <div className="co-field">
                      <label className="co-label">Visit Date &amp; Time *</label>
                      <input
                        type="datetime-local"
                        className="co-input"
                        style={{ colorScheme: 'light' }}
                        value={visitForm.visitDate}
                        onChange={(e) => setVisitForm((f) => ({ ...f, visitDate: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="co-field">
                      <label className="co-label">Visit Type</label>
                      <select
                        className="co-input"
                        style={{ colorScheme: 'light' }}
                        value={visitForm.visitType}
                        onChange={(e) => setVisitForm((f) => ({ ...f, visitType: e.target.value }))}
                      >
                        <option value="Consultation">Consultation</option>
                        <option value="Follow-up">Follow-up</option>
                        <option value="Treatment Session">Treatment Session</option>
                        <option value="Procedure">Procedure</option>
                        <option value="Review">Review</option>
                      </select>
                    </div>
                    <div className="co-field">
                      <label className="co-label">Doctor / Provider</label>
                      <input
                        className="co-input"
                        value={visitForm.provider}
                        onChange={(e) => setVisitForm((f) => ({ ...f, provider: e.target.value }))}
                        placeholder="e.g. Dr. Aditya Shah"
                      />
                    </div>
                    <div className="co-field">
                      <label className="co-label">Branch</label>
                      <select
                        className="co-input"
                        style={{ colorScheme: 'light' }}
                        value={visitForm.branch}
                        onChange={(e) => setVisitForm((f) => ({ ...f, branch: e.target.value }))}
                      >
                        {branchOptions.map((bName) => (
                          <option key={bName} value={bName}>{bName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="co-field co-span-2">
                      <label className="co-label">Visit Note (What was discussed / patient feedback)</label>
                      <textarea
                        className="co-input"
                        style={{ height: 'auto', padding: '8px 12px' }}
                        rows={3}
                        value={visitForm.notes}
                        onChange={(e) => setVisitForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="e.g. Patient wants laser hair reduction package, asked for pricing next week..."
                      />
                    </div>
                    <div className="co-field">
                      <label className="co-label">Outcome</label>
                      <select
                        className="co-input"
                        style={{ colorScheme: 'light' }}
                        value={visitForm.outcome}
                        onChange={(e) => setVisitForm((f) => ({ ...f, outcome: e.target.value }))}
                      >
                        <option value="completed">Completed</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="no_show">No Show</option>
                      </select>
                    </div>
                    <div className="co-field">
                      <label className="co-label">Next Steps (Optional)</label>
                      <input
                        className="co-input"
                        value={visitForm.nextSteps}
                        onChange={(e) => setVisitForm((f) => ({ ...f, nextSteps: e.target.value }))}
                        placeholder="e.g. Follow up in 7 days"
                      />
                    </div>
                  </div>
                  {createVisit.isError && (
                    <div className="co-xs" style={{ color: '#B91C1C' }}>
                      {createVisit.error?.message || 'Failed to save visit'}
                    </div>
                  )}
                  <div className="co-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="co-btn co-btn-sm" onClick={() => setShowAddVisit(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="co-btn co-btn-primary co-btn-sm" disabled={createVisit.isPending}>
                      {createVisit.isPending ? 'Saving...' : 'Save Visit'}
                    </button>
                  </div>
                </form>
              )}

              {visits?.length === 0 ? (
                <p className="co-sm co-mut">No visits recorded yet.</p>
              ) : (
                <div className="co-list">
                  {visits.map((v) => {
                    const isEditingThis = editingVisitId === v.id;
                    return (
                      <div className="co-list-item" key={v.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                        <div className="co-spread">
                          <span className="co-strong" style={{ fontSize: 13 }}>{v.visit_type || 'Visit'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <StatusChip status={v.outcome || 'completed'} />
                            <button
                              type="button"
                              className="co-btn co-btn-sm co-btn-ghost"
                              style={{ padding: '2px 6px', fontSize: 11 }}
                              onClick={() => {
                                if (isEditingThis) {
                                  setEditingVisitId(null);
                                } else {
                                  setEditingVisitId(v.id);
                                  setEditVisitNotes(v.notes || '');
                                  setEditVisitNextSteps(v.next_steps || '');
                                }
                              }}
                              title="Add or edit visit note"
                            >
                              <Pencil size={11} /> {v.notes ? 'Edit Note' : 'Add Note'}
                            </button>
                            <button
                              type="button"
                              className="co-btn co-btn-sm co-btn-ghost"
                              style={{ padding: '2px 6px', color: '#DC2626' }}
                              onClick={() => deleteVisit.mutate(v.id)}
                              title="Delete visit"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                        <div className="co-xs co-mut">
                          {v.visit_date ? `${dateLabel(v.visit_date)} · ${timeLabel(v.visit_date)}` : 'Date not set'}
                          {v.branch ? ` · ${v.branch}` : ''}
                          {v.provider ? ` · ${v.provider}` : ''}
                        </div>

                        {isEditingThis ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                            <textarea
                              className="co-input"
                              style={{ height: 'auto', padding: '6px 10px', fontSize: 12 }}
                              rows={2}
                              value={editVisitNotes}
                              onChange={(e) => setEditVisitNotes(e.target.value)}
                              placeholder="What was discussed during this visit..."
                            />
                            <input
                              className="co-input"
                              style={{ height: 30, fontSize: 12 }}
                              value={editVisitNextSteps}
                              onChange={(e) => setEditVisitNextSteps(e.target.value)}
                              placeholder="Next steps (optional)"
                            />
                            <div className="co-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                              <button type="button" className="co-btn co-btn-sm" onClick={() => setEditingVisitId(null)}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="co-btn co-btn-primary co-btn-sm"
                                disabled={updateVisit.isPending}
                                onClick={() => updateVisit.mutate({
                                  visitId: v.id,
                                  body: { notes: editVisitNotes.trim() || null, nextSteps: editVisitNextSteps.trim() || null },
                                })}
                              >
                                {updateVisit.isPending ? 'Saving...' : 'Save Note'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {v.notes ? (
                              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#1E293B', whiteSpace: 'pre-wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: 10.5, color: '#64748B', display: 'block', marginBottom: 2 }}>VISIT NOTE</span>
                                {v.notes}
                              </div>
                            ) : null}
                            {v.next_steps ? (
                              <div className="co-xs co-mut">Next: {v.next_steps}</div>
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'appointments' ? (
            <div className="co-list">
              {appts.length === 0 ? <p className="co-sm co-mut">No appointments booked.</p> : appts.map((a) => (
                <div className="co-list-item" key={a.id} style={{ alignItems: 'center' }}>
                  <Clock size={13} style={{ marginTop: 2, color: '#A4285E' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="co-strong" style={{ fontSize: 13 }}>{a.treatment || 'Appointment'}</div>
                    <div className="co-xs co-mut">{dateLabel(a.starts_at)} · {timeLabel(a.starts_at)}{a.branch ? ` · ${a.branch}` : ''}</div>
                  </div>
                  <StatusChip status={a.status} />
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'packages' ? (
            <div>
              {packages.length === 0 ? <p className="co-sm co-mut">No packages sold yet.</p> : (
                <div className="co-list">
                  {packages.map((pkg) => {
                    const pct = pkg.total_sessions > 0 ? Math.round((pkg.used_sessions / pkg.total_sessions) * 100) : 0;
                    return (
                      <div className="co-list-item" key={pkg.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                        <div className="co-spread">
                          <span className="co-strong" style={{ fontSize: 13 }}><Package size={12} /> {pkg.name}</span>
                          <StatusChip status={pkg.status} />
                        </div>
                        <div className="co-xs co-mut" style={{ marginTop: 3 }}>
                          {pkg.used_sessions}/{pkg.total_sessions} sessions · {money(pkg.paid_amount)} paid of {money(pkg.amount)}
                        </div>
                        <div className="co-bar-track" style={{ marginTop: 6, height: 7 }}>
                          <div className="co-bar-fill" style={{ width: `${Math.max(3, pct)}%` }} />
                        </div>
                        <button
                          type="button"
                          className="co-btn co-btn-sm"
                          style={{ marginTop: 8, alignSelf: 'flex-start' }}
                          disabled={useSession.isPending || pkg.used_sessions >= pkg.total_sessions}
                          onClick={() => useSession.mutate(pkg.id)}
                        >
                          <Check size={12} /> Use a session
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <PackageForm leadId={Number(id)} />
            </div>
          ) : null}
        </>
      )}
    </Drawer>
  );
}

export default function ClinicPatients() {
  const [, params] = useRoute('/clinic/patients/:id');
  const qc = useQueryClient();
  const { selectedBranch, branches } = useBranch();
  const branchOptions = useMemo(() => {
    return (branches || []).map((b) => b?.name).filter(Boolean);
  }, [branches]);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (params?.id) {
      setOpenId(params.id);
    }
  }, [params?.id]);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [editPatient, setEditPatient] = useState(null);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    branch: 'Alkapuri Main Clinic',
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);

  // View toggle: 'journey' or 'list'
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('view');
      if (v === 'list') return 'list';
      if (v === 'journey') return 'journey';
    }
    return 'journey';
  });

  const handleViewChange = (mode, stage = undefined) => {
    setViewMode(mode);
    if (stage !== undefined) setSelectedStage(stage);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', mode);
      if (stage?.n) {
        url.searchParams.set('stage', stage.n);
      } else if (stage === null) {
        url.searchParams.delete('stage');
      }
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch {}
  };

  const handleSelectStage = (stage) => {
    // When clicking a stage from the journey, switch to list view filtered to that stage
    handleViewChange('list', stage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      const v = p.get('view');
      if (v === 'list' || v === 'journey') setViewMode(v);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [patientForm, setPatientForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    treatment: 'Laser Skin Rejuvenation',
    branch: 'Alkapuri Main Clinic',
  });

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['clinic', 'patients', term, selectedBranch],
    queryFn: () => clinicApi.patients(term, selectedBranch || undefined),
    refetchInterval: 10_000,
    staleTime: 2_000,
    refetchOnWindowFocus: true,
  });

  const addPatientMutation = useMutation({
    mutationFn: (body) => clinicApi.createPatient(body),
    onSuccess: () => {
      setAddPatientOpen(false);
      setPatientForm({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        treatment: 'Laser Skin Rejuvenation',
        branch: 'Alkapuri Main Clinic',
      });
      qc.invalidateQueries({ queryKey: ['clinic'] });
      refetch();
    },
  });

  const deletePatientMutation = useMutation({
    mutationFn: (id) => clinicApi.deletePatient(id),
    onSuccess: () => {
      const deletedId = deleteConfirm?.id;
      setDeleteConfirm(null);
      if (openId === deletedId) setOpenId(null);
      qc.invalidateQueries({ queryKey: ['clinic'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      refetch();
    },
  });

  const handleStartEdit = (p) => {
    const rawFirst = (p.first_name || '').trim();
    const rawLast = (p.last_name || '').trim();
    const isPlaceholder = !rawFirst || rawFirst === p.phone || /^\+?\d[\d\s-]{6,}$/.test(rawFirst) || rawFirst.toLowerCase() === 'patient';
    const candidateBranch = p.company || p.branch || '';
    const matchedBranch = branchOptions.find((b) => b.toLowerCase() === candidateBranch.toLowerCase());
    setEditForm({
      firstName: isPlaceholder ? '' : rawFirst,
      lastName: rawLast,
      phone: p.phone || '',
      email: p.email && !isPlaceholderEmail(p.email) ? p.email : '',
      branch: matchedBranch || selectedBranch || branchOptions[0] || '',
    });
    setEditPatient(p);
  };

  const updatePatientMutation = useMutation({
    mutationFn: ({ id, body }) => clinicApi.updatePatient(id, body),
    onSuccess: () => {
      setEditPatient(null);
      qc.invalidateQueries({ queryKey: ['clinic'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      refetch();
    },
  });

  const patients = data?.patients || [];

  const displayPatients = useMemo(() => {
    if (!selectedStage) return patients;
    const sN = selectedStage.n;
    return patients.filter((p) => {
      const stage = getPatientCareStage(p);
      return stage.id === sN;
    });
  }, [patients, selectedStage]);

  const totals = useMemo(() => ({
    count: patients.length,
    visits: patients.reduce((n, p) => n + Number(p.visits || 0), 0),
    value: patients.reduce((n, p) => n + Number(p.package_value || 0), 0),
  }), [patients]);

  const handleCreatePatient = (e) => {
    e.preventDefault();
    if (!patientForm.firstName.trim()) return;
    addPatientMutation.mutate(patientForm);
  };

  return (
    <div className="clinic-os" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── TOP HEADER WITH VIEW SWITCHER TABS ──────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, font: '600 24px/1.2 Poppins, Inter, sans-serif', color: '#172326' }}>
              {viewMode === 'journey' ? 'Patient Journey' : selectedStage ? `Stage ${selectedStage.n} Patients` : 'Patients Directory'}
            </h1>
            <span
              style={{
                background: 'linear-gradient(135deg, #FBE9F1 0%, #FDF3F8 100%)',
                color: '#A4285E',
                border: '1px solid #F3D9E5',
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 999,
              }}
            >
              {viewMode === 'journey' ? '10 Stages Live' : `${totals.count} Registered Patients`}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5F6B6D' }}>
            {viewMode === 'journey'
              ? 'Live clinical lifecycle based on actual patient appointments, bookings and consultations.'
              : 'Individual medical & cosmetic consultation records, package sessions, and clinical history.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Toggle Switcher: Patient Journey / Patients List */}
          <div className="co-pill-tabs">
            <button
              type="button"
              onClick={() => handleViewChange('journey')}
              className={`co-pill-tab ${viewMode === 'journey' ? 'active' : ''}`}
            >
              <Compass size={13} /> Patient Journey
            </button>
            <button
              type="button"
              onClick={() => handleViewChange('list')}
              className={`co-pill-tab ${viewMode === 'list' ? 'active' : ''}`}
            >
              <Users size={13} /> Patients List <span className="co-pill-badge">{totals.count}</span>
            </button>
          </div>

          {viewMode === 'list' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
              </button>
              <button
                type="button"
                className="co-btn co-btn-primary co-btn-sm"
                onClick={() => setAddPatientOpen(true)}
              >
                <Plus size={14} /> Add patient
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── VIEW 1: PATIENT JOURNEY (10 STAGES) ──────────────────── */}
      {viewMode === 'journey' ? (
        <PatientJourneySection
          selectedStage={selectedStage?.n}
          onSelectStage={handleSelectStage}
          onViewPatientList={() => handleViewChange('list', null)}
          totalPatients={totals.count}
        />
      ) : (
        /* ── VIEW 2: PATIENTS DIRECTORY TABLE ─────────────────────── */
        <div id="patients-directory-table" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stage Filter Banner (shows when a stage is clicked) */}
          {selectedStage && (
            <div className="aura-stage-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className="pj-num">{selectedStage.n}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, font: '600 18px Poppins, Inter, sans-serif', color: '#172326' }}>
                      Stage {selectedStage.n}: {selectedStage.name}
                    </h3>
                    <span className={`pj-badge ${selectedStage.ok ? 'on-target' : 'below-target'}`}>
                      {selectedStage.measure}: {selectedStage.value} {selectedStage.subValue ? `${selectedStage.subValue} ` : ''}(Target {selectedStage.target})
                    </span>
                    <span
                      style={{
                        background: '#FDF3F8',
                        color: '#A4285E',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: '1px solid #F3D9E5',
                      }}
                    >
                      {displayPatients.length} patient{displayPatients.length === 1 ? '' : 's'} matching
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5F6B6D' }}>
                    {selectedStage.does}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="co-btn co-btn-sm"
                  onClick={() => handleViewChange('journey')}
                >
                  <Compass size={13} /> Back to Patient Journey
                </button>
                <button
                  type="button"
                  className="co-btn co-btn-sm"
                  onClick={() => setSelectedStage(null)}
                  style={{ background: '#fff', borderColor: '#F3D9E5', color: '#A4285E' }}
                >
                  <X size={13} /> View All Patients ({totals.count})
                </button>
              </div>
            </div>
          )}

          {/* KPIs Summary */}
          <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <Kpi label="Patients" value={selectedStage ? displayPatients.length : totals.count} foot={selectedStage ? `Filtered to Stage ${selectedStage.n}` : 'Registered clinic patients'} icon={Users} />
            <Kpi label="Clinic visits" value={totals.visits} foot="Admin-recorded patient visits" icon={CalendarDays} />
            <Kpi label="Treatment packages" value={money(totals.value)} foot="Active patient care plans" icon={IndianRupee} />
          </div>

        <Card rise="co-rise-2">
          <form
            className="co-row"
            style={{ marginBottom: 12 }}
            onSubmit={(e) => { e.preventDefault(); setTerm(search.trim()); }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#9CA3AF' }} />
              <input
                className="co-input"
                style={{ paddingLeft: 34 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone or email…"
                aria-label="Search patients"
              />
            </div>
            <button type="submit" className="co-btn co-btn-primary co-btn-sm">Search</button>
            {term ? <button type="button" className="co-btn co-btn-sm" onClick={() => { setSearch(''); setTerm(''); }}>Clear</button> : null}
          </form>

          {isError ? (
            <EmptyState title="Could not load patients"><p className="co-sm co-mut">{error?.message}</p></EmptyState>
          ) : isLoading ? (
            <Spinner label="Loading patients…" />
          ) : displayPatients.length === 0 ? (
            <EmptyState title={term ? 'No matching patients' : selectedStage ? `No patients currently in Stage ${selectedStage.n} (${selectedStage.name})` : 'No patients yet'}>
              <p className="co-sm co-mut" style={{ marginTop: 6 }}>
                {term
                  ? 'Try a different name, phone or email.'
                  : selectedStage
                  ? `Clear the filter to view all ${totals.count} registered clinic patients.`
                  : 'No clinic patients registered yet. Add a patient or sync online bookings.'}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                {selectedStage ? (
                  <button
                    type="button"
                    className="co-btn co-btn-primary co-btn-sm"
                    onClick={() => setSelectedStage(null)}
                  >
                    <X size={13} /> View all patients ({totals.count})
                  </button>
                ) : (
                  <button
                    type="button"
                    className="co-btn co-btn-primary co-btn-sm"
                    onClick={() => setAddPatientOpen(true)}
                  >
                    <Plus size={13} /> Add your first patient
                  </button>
                )}
              </div>
            </EmptyState>
          ) : (
            <div className="co-table-wrap">
              <table className="co-table">
                <thead>
                  <tr><th>Patient</th><th>Phone</th><th>Care Stage</th><th>Visits</th><th>Last visit</th><th>Packages</th><th></th></tr>
                </thead>
                <tbody>
                  {displayPatients.map((p) => (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(p.id)}>
                      <td>
                        <div className="co-row">
                          <Avatar first={p.first_name} last={p.last_name} />
                          <div style={{ minWidth: 0 }}>
                            <div className="co-strong">{getContactDisplayName(p)}</div>
                            <div className="co-xs co-mut">{p.email && !isPlaceholderEmail(p.email) ? p.email : (p.phone || 'No email')}</div>
                          </div>
                        </div>
                      </td>
                      <td>{p.phone || '—'}</td>
                      <td>
                        {(() => {
                          const s = getPatientCareStage(p);
                          return (
                            <span
                              className="co-chip"
                              style={{
                                background: s.bg,
                                color: s.color,
                                borderColor: s.color + '40',
                                fontWeight: 600,
                                fontSize: 11,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
                              {s.chipLabel}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="co-strong">{p.visits || 0}</td>
                      <td className="co-mut" style={{ whiteSpace: 'nowrap' }}>{p.last_visit ? dateLabel(p.last_visit) : '—'}</td>
                      <td>{p.packages ? `${p.packages} · ${money(p.package_value)}` : '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <button
                            type="button"
                            className="co-btn co-btn-sm co-btn-ghost"
                            onClick={() => handleStartEdit(p)}
                            style={{ padding: '4px 8px' }}
                            title="Edit patient name & details"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                          <button
                            type="button"
                            className="co-btn co-btn-sm co-btn-ghost"
                            onClick={() => setOpenId(p.id)}
                            style={{ padding: '4px 8px' }}
                          >
                            Open <ArrowUpRight size={12} />
                          </button>
                          <button
                            type="button"
                            className="co-btn co-btn-sm co-btn-ghost"
                            style={{ color: '#DC2626', padding: '4px 8px' }}
                            onClick={() => setDeleteConfirm(p)}
                            title="Delete patient from database"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    )}

      {openId ? (
        <PatientDrawer
          id={openId}
          onClose={() => setOpenId(null)}
          onDeleteClick={(pat) => setDeleteConfirm(pat)}
          onEditClick={(pat) => handleStartEdit(pat)}
        />
      ) : null}

      {/* Delete Patient Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          title="Delete Patient"
          subtitle={`Are you sure you want to delete ${getContactDisplayName(deleteConfirm)}?`}
          onClose={() => setDeleteConfirm(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="co-sm" style={{ color: '#4B5563', lineHeight: 1.5 }}>
              This action will permanently delete <strong>{getContactDisplayName(deleteConfirm)}</strong> and all their associated appointment bookings, clinical notes, and treatment packages from Aura AI database.
            </p>
            {deletePatientMutation.isError && (
              <p className="co-sm" style={{ color: '#B91C1C' }}>
                {deletePatientMutation.error?.message || 'Could not delete patient.'}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                type="button"
                className="co-btn"
                onClick={() => setDeleteConfirm(null)}
                disabled={deletePatientMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="co-btn"
                style={{ background: '#DC2626', color: '#fff', borderColor: '#DC2626' }}
                disabled={deletePatientMutation.isPending}
                onClick={() => deletePatientMutation.mutate(deleteConfirm.id)}
              >
                {deletePatientMutation.isPending ? 'Deleting…' : 'Delete Patient'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Patient Modal */}
      {editPatient && (
        <Modal
          title="Edit Patient Details"
          subtitle={`Update name and contact details for ${getContactDisplayName(editPatient)}`}
          onClose={() => setEditPatient(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editForm.firstName.trim() && !editForm.lastName.trim() && !editForm.phone.trim()) return;
              updatePatientMutation.mutate({
                id: editPatient.id,
                body: {
                  firstName: editForm.firstName.trim(),
                  lastName: editForm.lastName.trim(),
                  phone: editForm.phone.trim(),
                  email: editForm.email.trim(),
                  company: editForm.branch,
                  branch: editForm.branch,
                },
              });
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div className="co-form-grid">
              <div className="co-field">
                <label className="co-label">First Name *</label>
                <input
                  className="co-input"
                  required
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  placeholder="e.g. Ramesh"
                  autoFocus
                />
              </div>
              <div className="co-field">
                <label className="co-label">Last Name</label>
                <input
                  className="co-input"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  placeholder="e.g. Patel"
                />
              </div>
            </div>

            <div className="co-form-grid">
              <div className="co-field">
                <label className="co-label">Phone Number *</label>
                <input
                  className="co-input"
                  required
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div className="co-field">
                <label className="co-label">Email</label>
                <input
                  className="co-input"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="patient@example.com"
                />
              </div>
            </div>

            <div className="co-form-grid">
              <div className="co-field">
                <label className="co-label">Clinic Branch</label>
                <select
                  value={editForm.branch}
                  onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}
                >
                  {branchOptions.map((bName) => (
                    <option key={bName} value={bName}>{bName}</option>
                  ))}
                </select>
              </div>
            </div>

            {updatePatientMutation.isError && (
              <p className="co-sm" style={{ color: '#B91C1C' }}>
                {updatePatientMutation.error?.message || 'Could not update patient'}
              </p>
            )}

            <div className="co-row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="co-btn"
                onClick={() => setEditPatient(null)}
                disabled={updatePatientMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="co-btn co-btn-primary"
                disabled={updatePatientMutation.isPending || !editForm.firstName.trim()}
              >
                {updatePatientMutation.isPending ? 'Saving to Database…' : 'Save Patient'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Patient Modal */}
      {addPatientOpen && (
        <Modal
          title="Add New Patient"
          subtitle="Add patient details to store in Aura AI database"
          onClose={() => setAddPatientOpen(false)}
        >
          <form onSubmit={handleCreatePatient} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="co-form-grid">
              <div className="co-field">
                <label className="co-label">First Name *</label>
                <input
                  className="co-input"
                  required
                  value={patientForm.firstName}
                  onChange={(e) => setPatientForm({ ...patientForm, firstName: e.target.value })}
                  placeholder="e.g. Ramesh"
                  autoFocus
                />
              </div>
              <div className="co-field">
                <label className="co-label">Last Name</label>
                <input
                  className="co-input"
                  value={patientForm.lastName}
                  onChange={(e) => setPatientForm({ ...patientForm, lastName: e.target.value })}
                  placeholder="e.g. Patel"
                />
              </div>
            </div>

            <div className="co-form-grid">
              <div className="co-field">
                <label className="co-label">Phone Number *</label>
                <input
                  className="co-input"
                  required
                  value={patientForm.phone}
                  onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div className="co-field">
                <label className="co-label">Email</label>
                <input
                  className="co-input"
                  type="email"
                  value={patientForm.email}
                  onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                  placeholder="patient@example.com"
                />
              </div>
            </div>

            <div className="co-form-grid">
              <div className="co-field">
                <label className="co-label">Treatment Interest</label>
                <select
                  value={patientForm.treatment}
                  onChange={(e) => setPatientForm({ ...patientForm, treatment: e.target.value })}
                >
                  <option value="Laser Hair Reduction">Laser Hair Reduction</option>
                  <option value="Laser Skin Rejuvenation">Laser Skin Rejuvenation</option>
                  <option value="Chemical Peel & Acne Treatment">Chemical Peel & Acne Treatment</option>
                  <option value="Anti-Aging & Botox">Anti-Aging & Botox</option>
                  <option value="Hair PRP / Growth Therapy">Hair PRP / Growth Therapy</option>
                  <option value="General Consultation">General Consultation</option>
                </select>
              </div>
              <div className="co-field">
                <label className="co-label">Clinic Branch</label>
                <select
                  value={patientForm.branch}
                  onChange={(e) => setPatientForm({ ...patientForm, branch: e.target.value })}
                >
                  {branchOptions.map((bName) => (
                    <option key={bName} value={bName}>{bName}</option>
                  ))}
                </select>
              </div>
            </div>

            {addPatientMutation.isError && (
              <p className="co-sm" style={{ color: '#B91C1C' }}>
                {addPatientMutation.error?.message || 'Could not save patient'}
              </p>
            )}

            <div className="co-row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="co-btn"
                onClick={() => setAddPatientOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="co-btn co-btn-primary"
                disabled={addPatientMutation.isPending || !patientForm.firstName.trim()}
              >
                {addPatientMutation.isPending ? 'Saving to Database…' : 'Save Patient'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
