import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  PhoneCall, Phone, Search, ChevronRight, Volume2, Mic, MicOff,
  Clock, User, MapPin, AlertCircle, RefreshCw, Plus,
} from 'lucide-react';
import { clinicApi, dateLabel, timeLabel, fullName, money } from '@/clinic/api';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Kpi, Modal } from '@/clinic/ui';

function LeadCard({ lead, onCall, callingId }) {
  const isCalling = callingId === lead.id;
  return (
    <div className="co-card" style={{ border: isCalling ? '2px solid #A4285E' : '1px solid #F3D9E5' }}>
      <div className="co-row" style={{ justifyContent: 'space-between' }}>
        <div className="co-row" style={{ gap: 12 }}>
          <Avatar first={lead.first_name} last={lead.last_name} size="lg" />
          <div>
            <div className="co-strong" style={{ fontSize: 15 }}>{fullName(lead)}</div>
            <div className="co-row" style={{ gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
              <span className="co-xs co-mut"><Phone size={10} /> {lead.phone}</span>
              {lead.company ? <span className="co-xs co-mut"><MapPin size={10} /> {lead.company}</span> : null}
              {lead.pipeline_stage ? <span className="co-chip co-c-p">{lead.pipeline_stage}</span> : null}
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`co-btn co-btn-primary ${isCalling ? '' : ''}`}
          onClick={() => onCall(lead)}
          disabled={isCalling}
        >
          {isCalling ? (
            <>
              <span className="animate-spin">⏺</span> Calling…
            </>
          ) : (
            <>
              <PhoneCall size={13} /> Call
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function ClinicDialer() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [callingId, setCallingId] = useState(null);
  const [callModal, setCallModal] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'dialer', 'leads'],
    queryFn: clinicApi.dialerLeads,
  });

  const leads = data?.leads || [];
  const filtered = leads.filter((l) =>
    [l.first_name, l.last_name, l.phone, l.company].some((v) => String(v || '').toLowerCase().includes(search.toLowerCase()))
  );

  const startCall = useMutation({
    mutationFn: async (lead) => {
      setCallingId(lead.id);
      const res = await fetch('/api/ai-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId: lead.id }),
      });
      return res.json();
    },
    onSuccess: (result, lead) => {
      setCallingId(null);
      if (result.success) {
        setCallModal({ lead, callSid: result.callSid, status: 'initiated' });
      }
      qc.invalidateQueries({ queryKey: ['clinic'] });
    },
    onError: (err) => {
      setCallingId(null);
      console.error('Call failed:', err);
    },
  });

  return (
    <div className="clinic-os">
      <PageHead title="Dialer" subtitle="Click-to-call your leads with AI voice agents.">
        <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
        <Link href="/leads" className="co-btn co-btn-primary co-btn-sm"><Plus size={14} /> Add Lead</Link>
      </PageHead>

      <div className="co-row" style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#9CA3AF' }} />
          <input
            className="co-input"
            style={{ paddingLeft: 34 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, company…"
          />
        </div>
      </div>

      <Card>
        {isLoading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title={leads.length === 0 ? 'No leads with phone numbers' : 'No matching leads'}>
            <p className="co-sm co-mut">Add phone numbers to your leads in the Leads page to enable click-to-call.</p>
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {filtered.map((l) => (
              <LeadCard key={l.id} lead={l} onCall={startCall.mutate} callingId={callingId} />
            ))}
          </div>
        )}
      </Card>

      {callModal ? (
        <Modal
          title={`Calling ${fullName(callModal.lead)}`}
          subtitle={callModal.lead.phone}
          onClose={() => setCallModal(null)}
        >
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📞</div>
            <div className="co-strong" style={{ fontSize: 18 }}>Connecting via Sarvam AI…</div>
            <div className="co-sm co-mut" style={{ marginTop: 4 }}>Call SID: {callModal.callSid}</div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}