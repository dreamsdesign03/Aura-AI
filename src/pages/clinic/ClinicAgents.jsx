import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, Plus, Bot, Zap, Trash2, ToggleLeft, ToggleRight,
  Play, Pause, Clock, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { clinicApi } from '@/clinic/api';
import { PageHead, Card, CardHead, EmptyState, Spinner, Kpi, Modal, StatusChip } from '@/clinic/ui';

const TRIGGER_LABELS = {
  new_lead: 'New lead',
  lead_stage_changed: 'Stage changed',
  appointment_booked: 'Appt booked',
  appointment_completed: 'Appt done',
  package_sold: 'Package sold',
  review_received: 'Review received',
  no_show: 'No-show',
  manual: 'Manual',
};

function AgentCard({ agent, onToggle, onDelete, togglingId, deletingId }) {
  const isToggling = togglingId === agent.id;
  const isDeleting = deletingId === agent.id;
  return (
    <div className="co-card">
      <div className="co-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="co-row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <Bot size={16} style={{ color: agent.active ? '#A4285E' : '#9CA3AF' }} />
            <div className="co-strong" style={{ fontSize: 15 }}>{agent.name}</div>
            <StatusChip status={agent.active ? 'active' : 'draft'} />
          </div>
          <div className="co-sm co-mut">{TRIGGER_LABELS[agent.trigger] || agent.trigger}</div>
          {agent.description ? <div className="co-xs co-mut" style={{ marginTop: 4 }}>{agent.description}</div> : null}
        </div>
        <div className="co-row" style={{ gap: 6 }}>
          <button
            type="button"
            className={`co-btn co-btn-sm ${agent.active ? 'co-btn-primary' : ''}`}
            onClick={() => onToggle(agent)}
            disabled={isToggling}
          >
            {isToggling ? <span className="animate-spin">⟳</span> : agent.active ? <Pause size={12} /> : <Play size={12} />}
            {agent.active ? ' Active' : ' Pause'}
          </button>
          <button
            type="button"
            className="co-btn co-btn-sm co-btn-ghost"
            style={{ color: '#B91C1C' }}
            onClick={() => onDelete(agent)}
            disabled={isDeleting}
          >
            {isDeleting ? <span className="animate-spin">⟳</span> : <Trash2 size={12} />}
          </button>
        </div>
      </div>

      <div className="co-row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
        <span className="co-chip co-c-n"><Clock size={11} /> {agent.runs || 0} runs</span>
        <span className="co-chip co-c-g"><CheckCircle2 size={11} /> {agent.conversions || 0} conversions</span>
        {agent.steps ? <span className="co-chip co-c-o"><Zap size={11} /> {Array.isArray(agent.steps) ? agent.steps.length : 0} steps</span> : null}
      </div>
    </div>
  );
}

function AgentForm({ onSubmit, initial, busy, onClose }) {
  const [form, setForm] = useState({
    name: '',
    trigger: 'new_lead',
    description: '',
    steps: [],
  });
  if (initial) setForm({ ...form, ...initial });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="co-field">
        <label className="co-label" htmlFor="co-aname">Name *</label>
        <input id="co-aname" className="co-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. New Lead Welcome" required />
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-atrig">Trigger *</label>
        <select id="co-atrig" className="co-input" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
          <option value="new_lead">New lead</option>
          <option value="lead_stage_changed">Stage changed</option>
          <option value="appointment_booked">Appointment booked</option>
          <option value="appointment_completed">Appointment completed</option>
          <option value="package_sold">Package sold</option>
          <option value="review_received">Review received</option>
          <option value="no_show">No-show</option>
          <option value="manual">Manual</option>
        </select>
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-adesc">Description</label>
        <textarea id="co-adesc" rows="2" className="co-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this automation do?" />
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-asteps">Steps (JSON array)</label>
        <textarea id="co-asteps" rows="4" className="co-input" style={{ fontFamily: 'monospace', fontSize: 12 }} value={JSON.stringify(form.steps, null, 2)} onChange={(e) => { try { setForm({ ...form, steps: JSON.parse(e.target.value) }); } catch {} }} placeholder='[{"action": "send_whatsapp", "template": "welcome"}]' />
      </div>
      <div className="co-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="co-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="co-btn co-btn-primary" disabled={busy || !form.name.trim()}>
          {busy ? <span className="animate-spin">⟳</span> : <Plus size={13} />} {initial ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export default function ClinicAgents() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null); // { type: 'create'|'edit', agent }
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'agents'],
    queryFn: clinicApi.agents,
    refetchInterval: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async (agent) => {
      setTogglingId(agent.id);
      // Aura's automations API doesn't have a simple toggle, so we'll need to call the update endpoint
      // For now, just refresh
    },
    onSuccess: () => { setTogglingId(null); qc.invalidateQueries({ queryKey: ['clinic', 'agents'] }); },
    onError: () => setTogglingId(null),
  });

  const remove = useMutation({
    mutationFn: async (agent) => {
      setDeletingId(agent.id);
      // Aura automations would need a delete endpoint
    },
    onSuccess: () => { setDeletingId(null); qc.invalidateQueries({ queryKey: ['clinic', 'agents'] }); },
    onError: () => setDeletingId(null),
  });

  const save = useMutation({
    mutationFn: async (form) => {
      if (modal?.type === 'edit') {
        // update
      } else {
        // create
      }
    },
    onSuccess: () => { setModal(null); qc.invalidateQueries({ queryKey: ['clinic', 'agents'] }); },
  });

  const agents = data?.agents || [];
  const active = agents.filter((a) => a.active).length;

  return (
    <div className="clinic-os">
      <PageHead title="AI Agents" subtitle="Automations that run on clinic events — new leads, bookings, no-shows, reviews.">
        <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
        <button type="button" className="co-btn co-btn-primary co-btn-sm" onClick={() => setModal({ type: 'create' })}>
          <Plus size={14} /> New Agent
        </button>
      </PageHead>

      <div className="co-kpis co-rise-1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Kpi label="Total Agents" value={agents.length} icon={Bot} />
        <Kpi label="Active" value={active} foot={`${agents.length - active} paused`} icon={Zap} />
        <Kpi label="Total Runs" value={agents.reduce((n, a) => n + (a.runs || 0), 0)} icon={Play} />
      </div>

      <Card rise="co-rise-2">
        {isLoading ? <Spinner /> : agents.length === 0 ? (
          <EmptyState title="No agents yet">
            <p className="co-sm co-mut" style={{ marginTop: 6, maxWidth: 500 }}>
              Create your first AI agent to automate follow-ups, WhatsApp messages, task creation and more.
              Agents use the Aura Automations engine under the hood.
            </p>
            <button type="button" className="co-btn co-btn-primary" style={{ marginTop: 14 }} onClick={() => setModal({ type: 'create' })}>
              <Plus size={13} /> Create first agent
            </button>
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' }}>
            {agents.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                onToggle={toggle.mutate}
                onDelete={remove.mutate}
                togglingId={togglingId}
                deletingId={deletingId}
              />
            ))}
          </div>
        )}
      </Card>

      {modal ? (
        <Modal
          title={modal.type === 'create' ? 'New AI Agent' : `Edit ${modal.agent.name}`}
          subtitle="Configure trigger, steps and actions."
          onClose={() => setModal(null)}
          width={560}
        >
          <AgentForm
            initial={modal.agent}
            busy={save.isPending}
            onClose={() => setModal(null)}
            onSubmit={save.mutate}
          />
        </Modal>
      ) : null}
    </div>
  );
}