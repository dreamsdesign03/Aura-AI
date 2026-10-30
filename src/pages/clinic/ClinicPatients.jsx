import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, RefreshCw, Plus, Phone, Mail, CalendarDays, IndianRupee,
  StickyNote, Package, PhoneCall, ArrowUpRight, Check, Clock, Users, MessageCircle,
  Filter, X, Compass, ArrowLeft
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { clinicApi, fullName, money, dateLabel, timeLabel, datetimeLabel } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Drawer, Tabs, Kpi, Modal } from '@/clinic/ui';
import PatientJourneySection from './PatientJourneySection';

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

function PatientDrawer({ id, onClose }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('timeline');
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['clinic', 'patient', id],
    queryFn: () => clinicApi.patient(id),
  });

  const useSession = useMutation({
    mutationFn: (pkgId) => clinicApi.useSession(pkgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic'] }),
  });

  const p = data?.patient;
  const notes = data?.notes || [];
  const appts = data?.appointments || [];
  const packages = data?.packages || [];
  const calls = data?.calls || [];

  return (
    <Drawer
      title={p ? fullName(p) : 'Patient'}
      subtitle={p ? [p.email, p.phone].filter(Boolean).join(' · ') : ''}
      onClose={onClose}
      actions={p?.phone ? (
        <a href={`tel:${p.phone}`} className="co-btn co-btn-sm co-icon-btn" aria-label="Call patient"><Phone size={14} /></a>
      ) : null}
    >
      {isLoading ? <Spinner label="Loading patient…" /> : isError ? (
        <EmptyState title="Could not load patient"><p className="co-sm co-mut">{error?.message}</p></EmptyState>
      ) : (
        <>
          <div className="co-row" style={{ gap: 12 }}>
            <Avatar first={p.first_name} last={p.last_name} size="lg" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="co-strong" style={{ fontSize: 15 }}>{fullName(p)}</div>
              <div className="co-xs co-mut">Aura Laser &amp; Cosmetic Clinic · Patient #{p.id}</div>
              <div className="co-row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span className="co-chip co-c-p">{p.pipeline_stage || 'Active Patient'}</span>
                <span className="co-chip co-c-n"><CalendarDays size={11} /> {appts.length} consultations / visits</span>
                {packages.length > 0 ? <span className="co-chip co-c-n"><Package size={11} /> {packages.length} packages</span> : null}
              </div>
            </div>
          </div>

          <div className="co-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {p.phone ? <a className="co-chip co-c-p" href={`tel:${p.phone}`}><Phone size={11} /> Call {p.phone}</a> : null}
            {p.phone ? (
              <a className="co-chip co-c-p" href={`https://wa.me/${p.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
                <MessageCircle size={11} /> WhatsApp
              </a>
            ) : null}
            {p.email ? <a className="co-chip co-c-n" href={`mailto:${p.email}`}><Mail size={11} /> {p.email}</a> : null}
            <Link href="/clinic/appointments" className="co-chip co-c-n"><CalendarDays size={11} /> Book consultation</Link>
            <Link href="/clinic/dialer" className="co-chip co-c-n"><PhoneCall size={11} /> AI Dialer</Link>
          </div>

          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'timeline', label: `Timeline (${notes.length})` },
              { value: 'appointments', label: `Visits (${appts.length})` },
              { value: 'packages', label: `Packages (${packages.length})` },
            ]}
          />

          {tab === 'timeline' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <NoteForm leadId={Number(id)} />
              <div className="co-list">
                {notes.length === 0 ? <p className="co-sm co-mut">No notes yet.</p> : notes.map((n) => (
                  <div className="co-list-item" key={n.id}>
                    <span className="co-dot" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="co-spread">
                        <span className="co-strong" style={{ fontSize: 13 }}>{n.title || n.kind}</span>
                        <span className="co-xs co-mut">{datetimeLabel(n.created_at)}</span>
                      </div>
                      {n.body ? <p className="co-sm co-mut" style={{ marginTop: 3 }}>{n.body}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
              {calls.length > 0 ? (
                <div>
                  <div className="co-label" style={{ marginBottom: 6 }}>Recent calls</div>
                  <div className="co-list">
                    {calls.map((c) => (
                      <div className="co-list-item" key={c.id}>
                        <PhoneCall size={13} style={{ marginTop: 3, color: '#A4285E' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="co-sm co-strong">{c.transcript_summary || 'Call'}</div>
                          <div className="co-xs co-mut">{c.started_at ? datetimeLabel(c.started_at) : '—'} · {c.status || 'completed'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [openId, setOpenId] = useState(null);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);

  const handleSelectStage = (stage) => {
    // If clicking same stage, deselect; otherwise select and filter below
    if (selectedStage?.n === stage?.n) {
      setSelectedStage(null);
    } else {
      setSelectedStage(stage);
      // Smoothly scroll down to the patient list
      const el = document.getElementById('patients-directory-table');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const [patientForm, setPatientForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    treatment: 'Laser Skin Rejuvenation',
    branch: 'Alkapuri Main Clinic',
  });

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['clinic', 'patients', term],
    queryFn: () => clinicApi.patients(term),
    refetchInterval: 30_000,
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

  const patients = data?.patients || [];

  const displayPatients = useMemo(() => {
    if (!selectedStage) return patients;
    const sN = selectedStage.n;
    if (sN === 5) {
      // Stage 5: Book — All patients with booked appointments & Cal.com visits
      return patients.filter((p) => Number(p.appointments || 0) > 0 || (p.pipeline_stage || '').toLowerCase().includes('patient'));
    }
    if (sN === 6) {
      // Stage 6: Consult and convert — Patients with consultation records or booked visits
      return patients.filter((p) => Number(p.appointments || 0) > 0 || (p.pipeline_stage || '').toLowerCase().includes('consult') || (p.pipeline_stage || '').toLowerCase().includes('patient'));
    }
    if (sN === 7) {
      // Stage 7: Treat and complete — Active patients under care
      return patients.filter((p) => (p.pipeline_stage || '').toLowerCase().includes('active') || Number(p.packages || 0) > 0);
    }
    if (sN === 8) {
      // Stage 8: Delight and review — Patients completed treatment
      return patients.filter((p) => Number(p.appointments || 0) >= 1);
    }
    if (sN === 9 || sN === 10) {
      // Stage 9 & 10: Retain & Refer — Repeat visits / multi-session patients
      return patients.filter((p) => Number(p.appointments || 0) > 1 || Number(p.packages || 0) > 1);
    }
    // Stages 1 to 4: Discover, Engage, Capture, Qualify
    return patients;
  }, [patients, selectedStage]);

  const totals = useMemo(() => ({
    count: patients.length,
    visits: patients.reduce((n, p) => n + Number(p.appointments || 0), 0),
    value: patients.reduce((n, p) => n + Number(p.package_value || 0), 0),
  }), [patients]);

  const handleCreatePatient = (e) => {
    e.preventDefault();
    if (!patientForm.firstName.trim()) return;
    addPatientMutation.mutate(patientForm);
  };

  return (
    <div className="clinic-os" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── TOP SECTION: PATIENT JOURNEY 10 STAGES (REAL LIVE DATA) ── */}
      <PatientJourneySection
        selectedStage={selectedStage?.n}
        onSelectStage={handleSelectStage}
        onViewPatientList={() => {
          setSelectedStage(null);
          const el = document.getElementById('patients-directory-table');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        totalPatients={totals.count}
      />

      {/* ── DIRECTLY BELOW: PATIENTS DIRECTORY TABLE ──────────────── */}
      <div id="patients-directory-table" style={{ paddingTop: 8, borderTop: '1px solid #EDF2F1' }}>
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
                    {selectedStage.measure}: {selectedStage.value} (Target {selectedStage.target})
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
                onClick={() => setSelectedStage(null)}
                style={{ background: '#fff', borderColor: '#F3D9E5', color: '#A4285E' }}
              >
                <X size={13} /> View All Patients ({totals.count})
              </button>
            </div>
          </div>
        )}

        {/* Directory Head */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, font: '600 22px/1.2 Poppins, Inter, sans-serif', color: '#172326' }}>
                {selectedStage ? `Stage ${selectedStage.n} Patient Records` : 'Clinical Patients Directory'}
              </h2>
              {selectedStage && (
                <span
                  style={{
                    background: '#FDF3F8',
                    color: '#A4285E',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: '1px solid #F3D9E5',
                  }}
                >
                  Filtered: {selectedStage.name}
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5F6B6D' }}>
              Individual medical &amp; cosmetic consultation records, package sessions, and clinical history
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selectedStage && (
              <button
                type="button"
                className="co-btn co-btn-sm"
                onClick={() => setSelectedStage(null)}
              >
                <X size={13} /> View all ({totals.count})
              </button>
            )}
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
        </div>

        {/* KPIs Summary */}
        <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 16 }}>
          <Kpi label="Patients" value={selectedStage ? displayPatients.length : totals.count} foot={selectedStage ? `Filtered to Stage ${selectedStage.n}` : 'Registered clinic patients'} icon={Users} />
          <Kpi label="Consultations & visits" value={totals.visits} foot="Cal.com & clinic bookings" icon={CalendarDays} />
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
                  : 'No clinic patients registered yet. Add a patient or sync from Cal.com bookings.'}
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
                            <div className="co-strong">{fullName(p)}</div>
                            <div className="co-xs co-mut">{p.email || 'No email'}</div>
                          </div>
                        </div>
                      </td>
                      <td>{p.phone || '—'}</td>
                      <td><span className="co-chip co-c-p">{p.pipeline_stage || 'Active Patient'}</span></td>
                      <td className="co-strong">{p.appointments || 0}</td>
                      <td className="co-mut" style={{ whiteSpace: 'nowrap' }}>{p.last_visit ? dateLabel(p.last_visit) : '—'}</td>
                      <td>{p.packages ? `${p.packages} · ${money(p.package_value)}` : '—'}</td>
                      <td><span className="co-btn co-btn-sm co-btn-ghost">Open <ArrowUpRight size={12} /></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {openId ? <PatientDrawer id={openId} onClose={() => setOpenId(null)} /> : null}

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
                  <option value="Alkapuri Main Clinic">Alkapuri Main Clinic</option>
                  <option value="Vasna Branch">Vasna Branch</option>
                  <option value="Virtual Consultation Hub">Virtual Consultation Hub</option>
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
