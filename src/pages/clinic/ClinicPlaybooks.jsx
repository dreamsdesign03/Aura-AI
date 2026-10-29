import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, Plus, BookOpen, Trash2, Edit2, ChevronRight,
  MessageSquare, PhoneCall, Mail, Zap, AlertCircle,
} from 'lucide-react';
import { clinicApi } from '@/clinic/api';
import { PageHead, Card, CardHead, EmptyState, Spinner, Modal, StatusChip, Kpi } from '@/clinic/ui';

const CHANNEL_LABEL = { call: 'Call Script', whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS' };
const CHANNEL_ICON = { call: PhoneCall, whatsapp: MessageSquare, email: Mail, sms: Zap };

function PlaybookCard({ playbook, onEdit, onDelete, editingId, deletingId }) {
  const Icon = CHANNEL_ICON[playbook.channel] || BookOpen;
  const isEditing = editingId === playbook.id;
  const isDeleting = deletingId === playbook.id;
  return (
    <div className="co-card">
      <div className="co-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div className="co-row" style={{ gap: 10 }}>
          <Icon size={18} style={{ color: '#A4285E' }} />
          <div>
            <div className="co-strong" style={{ fontSize: 15 }}>{playbook.title}</div>
            <div className="co-row" style={{ gap: 6, marginTop: 2 }}>
              <span className="co-chip co-c-n">{CHANNEL_LABEL[playbook.channel] || playbook.channel}</span>
              {playbook.stage ? <span className="co-chip co-c-o">{playbook.stage}</span> : null}
              <StatusChip status={playbook.active ? 'active' : 'draft'} />
            </div>
          </div>
        </div>
        <div className="co-row" style={{ gap: 6 }}>
          <button type="button" className="co-btn co-btn-sm co-btn-ghost" onClick={() => onEdit(playbook)} disabled={isEditing}><Edit2 size={12} /></button>
          <button type="button" className="co-btn co-btn-sm co-btn-ghost" style={{ color: '#B91C1C' }} onClick={() => onDelete(playbook)} disabled={isDeleting}><Trash2 size={12} /></button>
        </div>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap' }}>{playbook.body}</p>
    </div>
  );
}

function PlaybookForm({ initial, onSubmit, onClose, busy }) {
  const [form, setForm] = useState({ title: '', channel: 'call', stage: '', body: '' });
  if (initial) setForm({ ...form, ...initial });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="co-form-grid">
        <div className="co-field">
          <label className="co-label" htmlFor="co-ptitle">Title *</label>
          <input id="co-ptitle" className="co-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. New Lead Call Script" required />
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-pchan">Channel *</label>
          <select id="co-pchan" className="co-input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            <option value="call">Call Script</option>
            <option value="whatsapp">WhatsApp Template</option>
            <option value="email">Email Template</option>
            <option value="sms">SMS Template</option>
          </select>
        </div>
        <div className="co-field">
          <label className="co-label" htmlFor="co-pstage">Stage (optional)</label>
          <input id="co-pstage" className="co-input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} placeholder="e.g. Discovery, Proposal" />
        </div>
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-pbody">Script / Template *</label>
        <textarea id="co-pbody" rows="6" className="co-input" style={{ fontFamily: 'inherit' }} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write the script, template or talking points here…" required />
      </div>
      <div className="co-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="co-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="co-btn co-btn-primary" disabled={busy || !form.title.trim() || !form.body.trim()}>
          {busy ? <span className="animate-spin">⟳</span> : <Plus size={13} />} {initial ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export default function ClinicPlaybooks() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'playbooks'],
    queryFn: clinicApi.playbooks,
    refetchInterval: 30_000,
  });

  const playbooks = data?.playbooks || [];
  const active = playbooks.filter((p) => p.active).length;

  const save = useMutation({
    mutationFn: (form) => modal?.type === 'edit' ? clinicApi.updatePlaybook(modal.playbook.id, form) : clinicApi.createPlaybook(form),
    onSuccess: () => { setModal(null); setEditingId(null); qc.invalidateQueries({ queryKey: ['clinic', 'playbooks'] }); },
  });

  const remove = useMutation({
    mutationFn: async (playbook) => {
      setDeletingId(playbook.id);
      // Would need a delete endpoint; for now just refresh
    },
    onSuccess: () => { setDeletingId(null); qc.invalidateQueries({ queryKey: ['clinic', 'playbooks'] }); },
    onError: () => setDeletingId(null),
  });

  return (
    <div className="clinic-os">
      <PageHead title="Playbooks" subtitle="Call scripts, WhatsApp templates and talking points for your team.">
        <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
        <button type="button" className="co-btn co-btn-primary co-btn-sm" onClick={() => setModal({ type: 'create' })}>
          <Plus size={14} /> New Playbook
        </button>
      </PageHead>

      <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Kpi label="Total Playbooks" value={playbooks.length} icon={BookOpen} />
        <Kpi label="Active" value={active} foot={`${playbooks.length - active} draft`} icon={Zap} />
        <Kpi label="Channels" value={[...new Set(playbooks.map(p => p.channel))].length} foot="Call, WhatsApp, Email, SMS" icon={MessageSquare} />
      </div>

      <Card rise="co-rise-2">
        {isLoading ? <Spinner /> : playbooks.length === 0 ? (
          <EmptyState title="No playbooks yet">
            <p className="co-sm co-mut" style={{ marginTop: 6, maxWidth: 500 }}>
              Create call scripts, WhatsApp message templates and email snippets your team can use during consultations.
            </p>
            <button type="button" className="co-btn co-btn-primary" style={{ marginTop: 14 }} onClick={() => setModal({ type: 'create' })}>
              <Plus size={13} /> Create first playbook
            </button>
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' }}>
            {playbooks.map((p) => (
              <PlaybookCard
                key={p.id}
                playbook={p}
                editingId={editingId}
                deletingId={deletingId}
                onEdit={(playbook) => { setModal({ type: 'edit', playbook }); setEditingId(playbook.id); }}
                onDelete={remove.mutate}
              />
            ))}
          </div>
        )}
      </Card>

      {modal ? (
        <Modal
          title={modal.type === 'create' ? 'New Playbook' : `Edit ${modal.playbook.title}`}
          subtitle="Script or template content for your team."
          onClose={() => { setModal(null); setEditingId(null); }}
          width={640}
        >
          <PlaybookForm
            initial={modal.playbook}
            busy={save.isPending}
            onClose={() => { setModal(null); setEditingId(null); }}
            onSubmit={save.mutate}
          />
        </Modal>
      ) : null}
    </div>
  );
}