import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  RefreshCw, Search, CalendarDays, Phone, Mail, MapPin, Clock,
  ChevronRight, AlertCircle, UserPlus, Plus, User,
} from 'lucide-react';
import { clinicApi, dateLabel, datetimeLabel, fullName, money } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Kpi, Modal } from '@/clinic/ui';
import { PatientDrawer } from './ClinicPatients';

function PatientRow({ patient, onAction }) {
  const daysSince = patient.last_visit ? Math.floor((Date.now() - new Date(patient.last_visit).getTime()) / (1000 * 60 * 60 * 24)) : null;
  const name = fullName(patient);
  const cleanPhone = patient.phone ? String(patient.phone).replace(/\D/g, '') : '';

  return (
    <div className="co-list-item" style={{ alignItems: 'center' }}>
      <Avatar first={patient.first_name} last={patient.last_name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="co-strong" style={{ fontSize: 13 }}>{name}</div>
        <div className="co-row" style={{ gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
          {patient.phone ? <span className="co-xs co-mut"><Phone size={10} /> {patient.phone}</span> : null}
          {patient.email ? <span className="co-xs co-mut"><Mail size={10} /> {patient.email}</span> : null}
          {patient.last_visit ? <span className="co-xs co-mut"><CalendarDays size={10} /> Last visit: {dateLabel(patient.last_visit)} ({daysSince}d ago)</span> : <span className="co-xs co-mut"><AlertCircle size={10} /> Never visited</span>}
          {patient.last_package ? <span className="co-chip co-c-o">Last pkg: {patient.last_package}</span> : null}
        </div>
      </div>
      <div className="co-row" style={{ gap: 6 }}>
        <button
          type="button"
          className="co-btn co-btn-sm co-btn-ghost"
          style={{ fontWeight: 600, color: '#A4285E' }}
          onClick={() => onAction('360', patient)}
          title="Open Patient 360 Full Profile"
        >
          <ChevronRight size={12} /> 360
        </button>
        {patient.phone ? (
          <a
            href={`tel:${patient.phone}`}
            className="co-btn co-btn-sm"
            style={{ textDecoration: 'none' }}
            title={`Call ${name}`}
          >
            <Clock size={12} /> Call
          </a>
        ) : (
          <button type="button" className="co-btn co-btn-sm" disabled style={{ opacity: 0.45 }} title="No phone number">
            <Clock size={12} /> Call
          </button>
        )}
        {cleanPhone ? (
          <a
            href={`https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(name)}%2C%20Dr.%20Aditya%20Shah%27s%20Clinic%20here.%20We%20miss%20seeing%20you%20at%20Aura!`}
            target="_blank"
            rel="noreferrer"
            className="co-btn co-btn-sm"
            style={{ textDecoration: 'none' }}
            title={`Send WhatsApp message to ${name}`}
          >
            <Mail size={12} /> WA
          </a>
        ) : (
          <button type="button" className="co-btn co-btn-sm" disabled style={{ opacity: 0.45 }} title="No phone number">
            <Mail size={12} /> WA
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClinicRetention() {
  const qc = useQueryClient();
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState('');
  const [openPatientId, setOpenPatientId] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'retention', days],
    queryFn: () => clinicApi.retention(days),
    refetchInterval: 60_000,
  });

  const patients = data?.patients || [];
  const filtered = patients.filter((p) =>
    [p.first_name, p.last_name, p.phone, p.email].some((v) => String(v || '').toLowerCase().includes(search.toLowerCase()))
  );

  const neverVisited = patients.filter((p) => !p.last_visit).length;
  const over90 = patients.filter((p) => p.last_visit && Math.floor((Date.now() - new Date(p.last_visit).getTime()) / (1000 * 60 * 60 * 24)) > 90).length;

  const dayOptions = [
    { label: '30 days', days: 30 },
    { label: '60 days', days: 60 },
    { label: '90 days', days: 90 },
    { label: '180 days', days: 180 },
  ];

  const handleAction = (action, patient) => {
    if (action === '360') {
      setOpenPatientId(patient.id);
    }
  };

  return (
    <div className="clinic-os">
      <PageHead title="Retention" subtitle={`Patients who haven't visited in ${days}+ days`}>
        <div className="co-pill-tabs">
          {dayOptions.map((d) => (
            <button
              key={d.days}
              type="button"
              className={`co-pill-tab ${days === d.days ? 'active' : ''}`}
              onClick={() => setDays(d.days)}
            >
              <Clock size={12} /> {d.label}
            </button>
          ))}
          <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </PageHead>

      <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Kpi label="At Risk" value={patients.length} foot={`Haven't visited in ${days}+ days`} icon={AlertCircle} />
        <Kpi label="Never Visited" value={neverVisited} foot="No appointment ever" icon={UserPlus} />
        <Kpi label="90+ Days" value={over90} foot="Long-term inactive" icon={Clock} />
        <Kpi label="Actionable" value={patients.filter(p => p.phone).length} foot="Has phone number" icon={Phone} />
      </div>

      <Card rise="co-rise-2">
        <div className="co-row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#9CA3AF' }} />
            <input className="co-input" style={{ paddingLeft: 34 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, phone, email…" />
          </div>
        </div>

        {isLoading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title={patients.length === 0 ? 'All patients are active!' : 'No matching patients'}>
            <p className="co-sm co-mut">Great — everyone has visited recently.</p>
          </EmptyState>
        ) : (
          <div className="co-list">
            {filtered.map((p) => (
              <PatientRow key={p.id} patient={p} onAction={handleAction} />
            ))}
          </div>
        )}
      </Card>

      {/* Patient 360 Slide-over Profile Drawer */}
      {openPatientId && (
        <PatientDrawer
          id={openPatientId}
          onClose={() => setOpenPatientId(null)}
        />
      )}
    </div>
  );
}