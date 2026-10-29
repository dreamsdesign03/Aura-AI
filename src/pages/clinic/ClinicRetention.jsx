import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  RefreshCw, Search, CalendarDays, Phone, Mail, MapPin, Clock,
  ChevronRight, AlertCircle, UserPlus, Plus,
} from 'lucide-react';
import { clinicApi, dateLabel, datetimeLabel, fullName, money } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Kpi, Modal } from '@/clinic/ui';

function PatientRow({ patient, onAction }) {
  const daysSince = patient.last_visit ? Math.floor((Date.now() - new Date(patient.last_visit).getTime()) / (1000 * 60 * 60 * 24)) : null;
  return (
    <div className="co-list-item" style={{ alignItems: 'center' }}>
      <Avatar first={patient.first_name} last={patient.last_name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="co-strong" style={{ fontSize: 13 }}>{fullName(patient)}</div>
        <div className="co-row" style={{ gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
          {patient.phone ? <span className="co-xs co-mut"><Phone size={10} /> {patient.phone}</span> : null}
          {patient.email ? <span className="co-xs co-mut"><Mail size={10} /> {patient.email}</span> : null}
          {patient.last_visit ? <span className="co-xs co-mut"><CalendarDays size={10} /> Last visit: {dateLabel(patient.last_visit)} ({daysSince}d ago)</span> : <span className="co-xs co-mut"><AlertCircle size={10} /> Never visited</span>}
          {patient.last_package ? <span className="co-chip co-c-o">Last pkg: {patient.last_package}</span> : null}
        </div>
      </div>
      <div className="co-row" style={{ gap: 6 }}>
        <Link href={`/clinic/patients/${patient.id}`} className="co-btn co-btn-sm co-btn-ghost"><ChevronRight size={12} /> 360</Link>
        <button type="button" className="co-btn co-btn-sm" onClick={() => onAction('call', patient)}><Clock size={12} /> Call</button>
        <button type="button" className="co-btn co-btn-sm" onClick={() => onAction('whatsapp', patient)}><Mail size={12} /> WA</button>
      </div>
    </div>
  );
}

export default function ClinicRetention() {
  const qc = useQueryClient();
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState('');

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

  return (
    <div className="clinic-os">
      <PageHead title="Retention" subtitle={`Patients who haven't visited in ${days}+ days`}>
        <div className="co-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {dayOptions.map((d) => (
            <button key={d.days} type="button" className={`co-btn co-btn-sm ${days === d.days ? 'co-btn-primary' : ''}`} onClick={() => setDays(d.days)}>{d.label}</button>
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
              <PatientRow key={p.id} patient={p} onAction={() => {}} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}