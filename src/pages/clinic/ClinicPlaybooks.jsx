import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play, Plus, RefreshCw, Edit3, Trash2, CheckCircle2, ShieldCheck, Sparkles,
  PhoneCall, MessageSquare, Calendar, UserCheck, Clock, ClipboardCheck,
  Bot, Zap, ChevronRight, Search, AlertCircle, Check, Layers,
  FlaskConical, Send, X, ArrowRight
} from 'lucide-react';
import { clinicApi } from '@/clinic/api';
import { PageHead, Card, Spinner, Modal } from '@/clinic/ui';

// Channels styling and icons
const CHANNEL_CONFIG = {
  'AI voice': {
    bg: '#FDF2F8',
    color: '#A4285E',
    border: '#FBCFE8',
    icon: PhoneCall,
    label: 'AI Voice'
  },
  'WhatsApp': {
    bg: '#ECFDF5',
    color: '#059669',
    border: '#A7F3D0',
    icon: MessageSquare,
    label: 'WhatsApp'
  },
  'Doctor': {
    bg: '#F0FDFA',
    color: '#0D9488',
    border: '#99F6E4',
    icon: UserCheck,
    label: 'Doctor'
  },
  'Staff task': {
    bg: '#FFFBEB',
    color: '#D97706',
    border: '#FDE68A',
    icon: ClipboardCheck,
    label: 'Staff Task'
  },
  'System': {
    bg: '#F8FAFC',
    color: '#475569',
    border: '#E2E8F0',
    icon: Zap,
    label: 'System'
  },
  'call': {
    bg: '#FDF2F8',
    color: '#A4285E',
    border: '#FBCFE8',
    icon: PhoneCall,
    label: 'Call'
  },
  'whatsapp': {
    bg: '#ECFDF5',
    color: '#059669',
    border: '#A7F3D0',
    icon: MessageSquare,
    label: 'WhatsApp'
  }
};

const STATUS_CONFIG = {
  'Live': { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
  'Seasonal': { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },
  'Private': { bg: '#F3E8FF', color: '#7E22CE', border: '#E9D5FF' },
  'Draft': { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' },
};

function ChannelBadge({ channel }) {
  const cfg = CHANNEL_CONFIG[channel] || { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0', icon: Zap, label: channel || 'Action' };
  const Icon = cfg.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 9px',
        borderRadius: '999px',
        fontSize: '11.5px',
        fontWeight: '600',
        lineHeight: 1.4,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`
      }}
    >
      <Icon size={12} />
      {cfg.label || channel}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Draft'];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.02em',
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color }} />
      {status || 'Draft'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function TestPatientModal({ playbook, onClose, onSimulated }) {
  const [patientName, setPatientName] = useState('Mansi Patel');
  const [phone, setPhone] = useState('+91 8866351852');
  const [branch, setBranch] = useState('Alkapuri');
  const [isSimulating, setIsSimulating] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const steps = Array.isArray(playbook?.steps) ? playbook.steps : [];

  const handleRunSimulation = async (e) => {
    e.preventDefault();
    setIsSimulating(true);
    setTestResult(null);

    try {
      const res = await clinicApi.testPlaybook(playbook.id, {
        patient_name: patientName,
        phone,
        branch
      });
      setTestResult(res);
      if (onSimulated) onSimulated();
    } catch (err) {
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <Modal
      title="Test with a sample patient"
      subtitle={`Simulate the automated journey for "${playbook.title}" without affecting live patients.`}
      onClose={onClose}
      width={620}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <form onSubmit={handleRunSimulation} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="co-form-grid">
            <div className="co-field">
              <label className="co-label">Sample Patient Name</label>
              <input
                className="co-input"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. Mansi Patel"
                required
              />
            </div>
            <div className="co-field">
              <label className="co-label">Phone Number</label>
              <input
                className="co-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 916352504304"
                required
              />
            </div>
            <div className="co-field co-span-2">
              <label className="co-label">Branch Destination</label>
              <select className="co-input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="Alkapuri">Alkapuri (Main Branch)</option>
                <option value="Vasna">Vasna Road</option>
                <option value="Manjalpur">Manjalpur</option>
                <option value="Online">Online / Tele-consult</option>
              </select>
            </div>
          </div>

          <div style={{ background: '#FDF7FA', border: '1px solid #F3D9E5', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#A4285E', textTransform: 'uppercase', marginBottom: 6 }}>
              Automated Journey Preview ({steps.length} Steps)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {steps.slice(0, 3).map((st, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#A4285E', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontWeight: 600, color: '#1E293B' }}>{st.title}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#6B7280', fontSize: 11 }}>{st.when}</span>
                    <ChannelBadge channel={st.channel} />
                  </div>
                </div>
              ))}
              {steps.length > 3 && (
                <div style={{ fontSize: 11, color: '#6B7280', textAlign: 'center', paddingTop: 2 }}>
                  + {steps.length - 3} further sequence steps scheduled per protocol
                </div>
              )}
            </div>
          </div>

          <div className="co-row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
            <button type="button" className="co-btn" onClick={onClose} disabled={isSimulating}>
              Cancel
            </button>
            <button
              type="submit"
              className="co-btn co-btn-primary"
              disabled={isSimulating || !patientName.trim() || !phone.trim()}
            >
              {isSimulating ? <span className="animate-spin">⟳</span> : <FlaskConical size={14} />}
              {isSimulating ? 'Simulating Journey...' : 'Run Test Simulation'}
            </button>
          </div>
        </form>

        {testResult && (
          <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: 14, animation: 'coFade .24s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#065F46', fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>
              <CheckCircle2 size={16} /> Journey Simulation Executed Successfully
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {testResult.timeline?.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: '#064E3B' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#10B981', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                    ✓
                  </span>
                  <div>
                    <span style={{ fontWeight: 600 }}>Step {item.step_number}: {item.title}</span> —{' '}
                    <span style={{ opacity: 0.9 }}>{item.status} ({item.channel})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditStepsModal({ playbook, onClose, onSave, busy }) {
  const initialSteps = Array.isArray(playbook?.steps) ? JSON.parse(JSON.stringify(playbook.steps)) : [];
  const [steps, setSteps] = useState(initialSteps);

  const handleStepChange = (index, field, value) => {
    const updated = [...steps];
    updated[index][field] = value;
    setSteps(updated);
  };

  const handleAddStep = () => {
    setSteps([
      ...steps,
      {
        title: 'New journey touchpoint',
        when: 'Within 24 hours',
        detail: 'Automated notification and follow-up message sent to the patient.',
        channel: 'WhatsApp'
      }
    ]);
  };

  const handleRemoveStep = (index) => {
    if (steps.length <= 1) {
      alert('A playbook must have at least one step.');
      return;
    }
    setSteps(steps.filter((_, i) => i !== index));
  };

  return (
    <Modal
      title={`Edit Steps — ${playbook.title}`}
      subtitle="Configure each automated step in this clinical treatment sequence."
      onClose={onClose}
      width={720}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(steps);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
          {steps.map((step, idx) => (
            <div
              key={idx}
              style={{
                background: '#FAF5F8',
                border: '1px solid #F3D9E5',
                borderRadius: 10,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: idx === 0 ? '#A4285E' : '#701A40',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>Step {idx + 1}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveStep(idx)}
                  className="co-btn co-btn-sm co-btn-ghost"
                  style={{ color: '#B91C1C', height: 26, padding: '0 6px' }}
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>

              <div className="co-form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <div className="co-field" style={{ gridColumn: 'span 2' }}>
                  <label className="co-label">Step Title</label>
                  <input
                    className="co-input"
                    value={step.title}
                    onChange={(e) => handleStepChange(idx, 'title', e.target.value)}
                    required
                  />
                </div>
                <div className="co-field">
                  <label className="co-label">Timing / Trigger</label>
                  <input
                    className="co-input"
                    value={step.when}
                    onChange={(e) => handleStepChange(idx, 'when', e.target.value)}
                    placeholder="e.g. Instant, Within 5 min"
                    required
                  />
                </div>
              </div>

              <div className="co-form-grid" style={{ gridTemplateColumns: '180px minmax(0, 1fr)' }}>
                <div className="co-field">
                  <label className="co-label">Channel</label>
                  <select
                    className="co-input"
                    value={step.channel}
                    onChange={(e) => handleStepChange(idx, 'channel', e.target.value)}
                  >
                    <option value="System">System (Trigger)</option>
                    <option value="AI voice">AI voice (Plivo/Sarvam)</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Doctor">Doctor</option>
                    <option value="Staff task">Staff task</option>
                  </select>
                </div>
                <div className="co-field">
                  <label className="co-label">Instructions & Detail</label>
                  <textarea
                    rows={2}
                    className="co-input"
                    value={step.detail}
                    onChange={(e) => handleStepChange(idx, 'detail', e.target.value)}
                    placeholder="Describe what happens in this step..."
                    required
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="co-btn co-btn-sm"
            onClick={handleAddStep}
            style={{ borderStyle: 'dashed', borderColor: '#A4285E', color: '#A4285E', height: 36 }}
          >
            <Plus size={14} /> Add Next Step
          </button>
        </div>

        <div className="co-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" className="co-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="co-btn co-btn-primary" disabled={busy}>
            {busy ? <span className="animate-spin">⟳</span> : <Check size={14} />} Save Steps
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewPlaybookModal({ onClose, onSubmit, busy }) {
  const [title, setTitle] = useState('');
  const [who, setWho] = useState('');
  const [status, setStatus] = useState('Live');
  const [customGuardrail, setCustomGuardrail] = useState('');
  const [guardrails, setGuardrails] = useState([
    'No diagnosis or medical advice from AI',
    'Clinical words reach a doctor within 15 minutes',
    'Opt out honoured on every message'
  ]);

  const [steps, setSteps] = useState([
    { title: 'New treatment enquiry', when: 'Instant', detail: 'Tagged treatment concern from lead ad, WhatsApp or web enquiry.', channel: 'System' },
    { title: 'AI qualification call', when: 'Within 5 min', detail: 'Asks specific clinical concerns, preferred branch, and medical background.', channel: 'AI voice' },
    { title: 'Doctor consultation', when: 'Within 7 days', detail: 'In-clinic consult and diagnostic plan confirmation with the physician.', channel: 'Doctor' },
    { title: 'Session protocol follow-ups', when: 'Per plan', detail: 'WhatsApp reminders, aftercare instructions, and review check-in.', channel: 'WhatsApp' }
  ]);

  const handleAddGuardrail = () => {
    if (!customGuardrail.trim()) return;
    setGuardrails([...guardrails, customGuardrail.trim()]);
    setCustomGuardrail('');
  };

  const handleRemoveGuardrail = (i) => {
    setGuardrails(guardrails.filter((_, idx) => idx !== i));
  };

  const handleStepChange = (index, field, value) => {
    const updated = [...steps];
    updated[index][field] = value;
    setSteps(updated);
  };

  const handleAddStep = () => {
    setSteps([
      ...steps,
      {
        title: 'Follow-up sitting',
        when: 'Every 4 weeks',
        detail: 'Routine review and satisfaction score check.',
        channel: 'WhatsApp'
      }
    ]);
  };

  return (
    <Modal
      title="Create Treatment Playbook"
      subtitle="Design an end-to-end automated clinical journey from first enquiry to package completion."
      onClose={onClose}
      width={760}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            title,
            who,
            status,
            guardrails,
            steps,
            enrolled_count: 0,
            conv_count: 0,
            channels: ['AI voice', 'WhatsApp', 'Doctor', 'Staff task']
          });
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div className="co-form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div className="co-field" style={{ gridColumn: 'span 2' }}>
            <label className="co-label">Playbook Name *</label>
            <input
              className="co-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. HydraFacial Glow Sequence"
              required
            />
          </div>
          <div className="co-field">
            <label className="co-label">Status</label>
            <select className="co-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Live">Live</option>
              <option value="Seasonal">Seasonal</option>
              <option value="Private">Private</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
          <div className="co-field co-span-2" style={{ gridColumn: 'span 3' }}>
            <label className="co-label">Target Audience / Demographic *</label>
            <input
              className="co-input"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="e.g. Brides, grooms, eventgoers, age 20 to 45"
              required
            />
          </div>
        </div>

        {/* Guardrails Section */}
        <div style={{ background: '#FAF5F8', border: '1px solid #F3D9E5', borderRadius: 10, padding: 12 }}>
          <label className="co-label" style={{ color: '#A4285E', marginBottom: 8, display: 'block' }}>
            Clinical Guardrails ({guardrails.length})
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {guardrails.map((g, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: '#374151' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={14} style={{ color: '#15803D' }} />
                  <span>{g}</span>
                </div>
                {idx >= 3 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveGuardrail(idx)}
                    className="co-btn co-btn-ghost"
                    style={{ color: '#B91C1C', height: 22, padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="co-input"
              style={{ fontSize: 12, height: 32 }}
              value={customGuardrail}
              onChange={(e) => setCustomGuardrail(e.target.value)}
              placeholder="Add specific guardrail (e.g. Plan prices only after consult)..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddGuardrail();
                }
              }}
            />
            <button
              type="button"
              className="co-btn co-btn-sm"
              onClick={handleAddGuardrail}
              style={{ height: 32 }}
            >
              Add Rule
            </button>
          </div>
        </div>

        {/* Steps List */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="co-label" style={{ color: '#A4285E' }}>
              Journey Steps ({steps.length})
            </label>
            <button
              type="button"
              className="co-btn co-btn-sm"
              onClick={handleAddStep}
              style={{ height: 26, fontSize: 11.5 }}
            >
              <Plus size={12} /> Add Step
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '35vh', overflowY: 'auto' }}>
            {steps.map((st, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1.4fr 1fr 1fr 30px',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: '#fff',
                  border: '1px solid #F3D9E5',
                  borderRadius: 8
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#A4285E',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700
                  }}
                >
                  {i + 1}
                </span>
                <input
                  className="co-input"
                  style={{ height: 30, fontSize: 12 }}
                  value={st.title}
                  onChange={(e) => handleStepChange(i, 'title', e.target.value)}
                  placeholder="Step title"
                  required
                />
                <input
                  className="co-input"
                  style={{ height: 30, fontSize: 12 }}
                  value={st.when}
                  onChange={(e) => handleStepChange(i, 'when', e.target.value)}
                  placeholder="Timing"
                  required
                />
                <select
                  className="co-input"
                  style={{ height: 30, fontSize: 12 }}
                  value={st.channel}
                  onChange={(e) => handleStepChange(i, 'channel', e.target.value)}
                >
                  <option value="System">System</option>
                  <option value="AI voice">AI voice</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Doctor">Doctor</option>
                  <option value="Staff task">Staff task</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                  className="co-btn co-btn-ghost"
                  style={{ color: '#B91C1C', height: 26, padding: 0 }}
                  disabled={steps.length <= 1}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="co-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" className="co-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="co-btn co-btn-primary"
            disabled={busy || !title.trim() || !who.trim()}
          >
            {busy ? <span className="animate-spin">⟳</span> : <Plus size={14} />} Create Playbook
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Treatment Playbooks Component
// ---------------------------------------------------------------------------

export default function ClinicPlaybooks() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modal, setModal] = useState(null); // 'test' | 'edit_steps' | 'create'
  const [feedbackToast, setFeedbackToast] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'playbooks'],
    queryFn: clinicApi.playbooks,
    refetchInterval: 30_000,
  });

  const playbooks = data?.playbooks || [];

  // Filtered playbooks list
  const filteredPlaybooks = useMemo(() => {
    return playbooks.filter((p) => {
      const matchesSearch =
        p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.who?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL' ||
        p.status?.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [playbooks, searchQuery, statusFilter]);

  // Selected playbook (fallback to first playbook if current selection is invalid)
  const currentPlaybook = useMemo(() => {
    if (!playbooks.length) return null;
    const found = playbooks.find((p) => p.id === selectedId);
    return found || playbooks[0];
  }, [playbooks, selectedId]);

  // Mutation: Update steps
  const updateStepsMutation = useMutation({
    mutationFn: (newSteps) => clinicApi.updatePlaybook(currentPlaybook.id, { steps: newSteps }),
    onSuccess: (updated) => {
      setModal(null);
      qc.invalidateQueries({ queryKey: ['clinic', 'playbooks'] });
      setFeedbackToast({ type: 'success', text: 'Steps updated successfully.' });
      setTimeout(() => setFeedbackToast(null), 4000);
    },
    onError: (err) => {
      alert(`Failed to save steps: ${err.message}`);
    }
  });

  // Mutation: Create playbook
  const createPlaybookMutation = useMutation({
    mutationFn: (body) => clinicApi.createPlaybook(body),
    onSuccess: (res) => {
      setModal(null);
      qc.invalidateQueries({ queryKey: ['clinic', 'playbooks'] });
      if (res?.playbook?.id) {
        setSelectedId(res.playbook.id);
      }
      setFeedbackToast({ type: 'success', text: `Playbook "${res?.playbook?.title || 'New'}" created.` });
      setTimeout(() => setFeedbackToast(null), 4000);
    },
    onError: (err) => {
      alert(`Failed to create playbook: ${err.message}`);
    }
  });

  // Steps array safely parsed
  const curSteps = useMemo(() => {
    if (!currentPlaybook) return [];
    if (Array.isArray(currentPlaybook.steps)) return currentPlaybook.steps;
    try {
      return JSON.parse(currentPlaybook.steps || '[]');
    } catch {
      return [];
    }
  }, [currentPlaybook]);

  // Guardrails array safely parsed
  const curGuardrails = useMemo(() => {
    if (!currentPlaybook) return [];
    if (Array.isArray(currentPlaybook.guardrails)) return currentPlaybook.guardrails;
    try {
      return JSON.parse(currentPlaybook.guardrails || '[]');
    } catch {
      return [
        'No diagnosis or medical advice from AI',
        'Clinical words reach a doctor within 15 minutes',
        'Opt out honoured on every message'
      ];
    }
  }, [currentPlaybook]);

  const enrolled = currentPlaybook?.enrolled_count || 0;
  const packages = currentPlaybook?.conv_count || 0;
  const conversionRate = enrolled > 0 ? Math.round((packages / enrolled) * 100) : 0;

  return (
    <div className="clinic-os" style={{ maxWidth: 1440, margin: '0 auto' }}>
      {/* Page Header */}
      <PageHead
        title="Treatment playbooks"
        subtitle="One automated journey per treatment, from first enquiry to referral. Pick one to see its steps."
      >
        <button
          type="button"
          className="co-btn co-btn-sm"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh Playbooks"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>

        <button
          type="button"
          className="co-btn co-btn-sm"
          onClick={() => setModal('test')}
          disabled={!currentPlaybook}
          style={{ borderColor: '#A4285E', color: '#A4285E' }}
        >
          <FlaskConical size={14} /> Test with a sample patient
        </button>

        <button
          type="button"
          className="co-btn co-btn-primary co-btn-sm"
          onClick={() => setModal('create')}
        >
          <Plus size={14} /> New playbook
        </button>
      </PageHead>

      {/* Optional feedback banner */}
      {feedbackToast && (
        <div
          style={{
            background: feedbackToast.type === 'success' ? '#DCFCE7' : '#FEF3C7',
            border: `1px solid ${feedbackToast.type === 'success' ? '#86EFAC' : '#FDE68A'}`,
            color: feedbackToast.type === 'success' ? '#166534' : '#92400E',
            padding: '10px 16px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 600
          }}
        >
          <CheckCircle2 size={16} /> {feedbackToast.text}
        </div>
      )}

      {/* Main 3-Column Split Layout */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Spinner />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 1.15fr) minmax(360px, 2.2fr) minmax(280px, 1.25fr)',
            gap: 18,
            alignItems: 'start'
          }}
        >
          {/* ================================================================= */}
          {/* COLUMN 1: PLAYBOOK SELECTOR (LEFT) */}
          {/* ================================================================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Search & Filter */}
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}
                />
                <input
                  className="co-input"
                  style={{ paddingLeft: 30, height: 34, fontSize: 12.5 }}
                  placeholder="Search treatments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Status Tabs */}
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                {['ALL', 'Live', 'Seasonal', 'Private'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    style={{
                      border: 'none',
                      background: statusFilter === tab ? '#A4285E' : 'transparent',
                      color: statusFilter === tab ? '#FFFFFF' : '#6B7280',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Playbook Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredPlaybooks.length === 0 ? (
                  <div style={{ padding: '24px 8px', textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
                    No matching treatment playbooks found.
                  </div>
                ) : (
                  filteredPlaybooks.map((pb) => {
                    const isSelected = currentPlaybook?.id === pb.id;
                    const pbEnrolled = pb.enrolled_count || 0;
                    const pbPackages = pb.conv_count || 0;

                    return (
                      <button
                        key={pb.id}
                        type="button"
                        onClick={() => setSelectedId(pb.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '12px 14px',
                          borderRadius: 10,
                          textAlign: 'left',
                          cursor: 'pointer',
                          border: isSelected ? '1.5px solid #A4285E' : '1px solid #F1E5EC',
                          background: isSelected ? '#FDF2F7' : '#FFFFFF',
                          boxShadow: isSelected ? '0 4px 12px -3px rgba(164, 40, 94, 0.18)' : '0 1px 2px rgba(0,0,0,0.02)',
                          transition: 'all 0.18s ease'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 13.5,
                              color: isSelected ? '#A4285E' : '#1E293B',
                              lineHeight: 1.3
                            }}
                          >
                            {pb.title}
                          </span>
                          <span style={{ fontSize: 12, color: '#6B7280' }}>
                            {pbEnrolled} enrolled · {pbPackages} packages
                          </span>
                        </div>
                        <StatusBadge status={pb.status || 'Live'} />
                      </button>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          {/* ================================================================= */}
          {/* COLUMN 2: SELECTED PLAYBOOK STEP TIMELINE (MIDDLE) */}
          {/* ================================================================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {currentPlaybook ? (
              <Card style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 22 }}>
                {/* Header with Title and "Edit steps" button */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 14,
                    flexWrap: 'wrap',
                    borderBottom: '1px solid #F7EDF2',
                    paddingBottom: 16
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: '#1E293B' }}>
                        {currentPlaybook.title}
                      </h2>
                      <StatusBadge status={currentPlaybook.status || 'Live'} />
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#6B7280', lineHeight: 1.4 }}>
                      {currentPlaybook.who || 'Target demographic and patient criteria.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="co-btn co-btn-sm"
                      onClick={() => setModal('edit_steps')}
                      style={{ height: 34, padding: '0 12px', fontWeight: 600 }}
                    >
                      <Edit3 size={13} style={{ color: '#A4285E' }} /> Edit steps
                    </button>
                  </div>
                </div>

                {/* Vertical Step Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {curSteps.length === 0 ? (
                    <div style={{ padding: '30px 10px', textAlign: 'center', color: '#6B7280' }}>
                      No steps configured for this journey yet.
                      <div style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          className="co-btn co-btn-primary co-btn-sm"
                          onClick={() => setModal('edit_steps')}
                        >
                          <Plus size={13} /> Add first step
                        </button>
                      </div>
                    </div>
                  ) : (
                    curSteps.map((step, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === curSteps.length - 1;
                      const dotColor = isFirst ? '#A4285E' : '#701A40';

                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'stretch',
                            gap: 16,
                            position: 'relative'
                          }}
                        >
                          {/* Step Number Circle & Connecting Line */}
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              width: 36,
                              flexShrink: 0
                            }}
                          >
                            <span
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: dotColor,
                                color: '#FFFFFF',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: 'Poppins, sans-serif',
                                fontWeight: 700,
                                fontSize: 13.5,
                                zIndex: 2,
                                boxShadow: '0 2px 6px rgba(164, 40, 94, 0.25)'
                              }}
                            >
                              {idx + 1}
                            </span>
                            {!isLast && (
                              <span
                                style={{
                                  flex: 1,
                                  width: 2,
                                  background: '#F3D9E5',
                                  minHeight: 28,
                                  margin: '3px 0'
                                }}
                              />
                            )}
                          </div>

                          {/* Step Content */}
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              paddingBottom: isLast ? 0 : 22,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>
                                {step.title}
                              </span>
                              {step.when && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: '#F1F5F9',
                                    color: '#475569'
                                  }}
                                >
                                  <Clock size={10} /> {step.when}
                                </span>
                              )}
                            </div>

                            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#374151' }}>
                              {step.detail}
                            </div>

                            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                              <ChannelBadge channel={step.channel} />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            ) : null}
          </div>

          {/* ================================================================= */}
          {/* COLUMN 3: RESULTS, CHANNELS & GUARDRAILS (RIGHT) */}
          {/* ================================================================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Card 1: Results, last 30 days */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>
                  Results, last 30 days
                </h3>
                {conversionRate > 0 && (
                  <span
                    style={{
                      background: '#DCFCE7',
                      color: '#15803D',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 999
                    }}
                  >
                    {conversionRate}% conversion
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#FDF7FA',
                    border: '1px solid #F3D9E5'
                  }}
                >
                  <p style={{ margin: 0, fontSize: 11.5, color: '#6B7280', fontWeight: 600 }}>Patients enrolled</p>
                  <p style={{ margin: '4px 0 0', font: '700 24px Poppins, sans-serif', color: '#1E293B' }}>
                    {enrolled}
                  </p>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#FDF7FA',
                    border: '1px solid #F3D9E5'
                  }}
                >
                  <p style={{ margin: 0, fontSize: 11.5, color: '#6B7280', fontWeight: 600 }}>Became packages</p>
                  <p style={{ margin: '4px 0 0', font: '700 24px Poppins, sans-serif', color: '#A4285E' }}>
                    {packages}
                  </p>
                </div>
              </div>
            </Card>

            {/* Card 2: Channels and language */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>
                Channels and language
              </h3>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <ChannelBadge channel="AI voice" />
                <ChannelBadge channel="WhatsApp" />
                <ChannelBadge channel="Doctor" />
                <ChannelBadge channel="Staff task" />
              </div>

              <p style={{ margin: 0, fontSize: 12.5, color: '#6B7280', lineHeight: 1.45 }}>
                Language automatically follows the patient’s preference (Gujarati, Hindi, English), else the clinic branch default.
              </p>
            </Card>

            {/* Card 3: Clinical guardrails */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} style={{ color: '#15803D' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>
                  Clinical guardrails
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {curGuardrails.map((rule, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: 9,
                      alignItems: 'flex-start',
                      fontSize: 13,
                      lineHeight: 1.4,
                      color: '#1E293B'
                    }}
                  >
                    <CheckCircle2
                      size={15}
                      style={{ color: '#15803D', flexShrink: 0, marginTop: 2 }}
                    />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>

              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 11.5,
                  color: '#9CA3AF',
                  lineHeight: 1.4,
                  borderTop: '1px solid #F7EDF2',
                  paddingTop: 8
                }}
              >
                Guardrails are established by the medical director and cannot be bypassed by clinic branch staff.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODALS */}
      {/* =================================================================== */}

      {/* 1. Test with a sample patient */}
      {modal === 'test' && currentPlaybook && (
        <TestPatientModal
          playbook={currentPlaybook}
          onClose={() => setModal(null)}
          onSimulated={() => {
            qc.invalidateQueries({ queryKey: ['clinic', 'playbooks'] });
          }}
        />
      )}

      {/* 2. Edit steps modal */}
      {modal === 'edit_steps' && currentPlaybook && (
        <EditStepsModal
          playbook={currentPlaybook}
          onClose={() => setModal(null)}
          onSave={(newSteps) => updateStepsMutation.mutate(newSteps)}
          busy={updateStepsMutation.isPending}
        />
      )}

      {/* 3. New playbook modal */}
      {modal === 'create' && (
        <NewPlaybookModal
          onClose={() => setModal(null)}
          onSubmit={(form) => createPlaybookMutation.mutate(form)}
          busy={createPlaybookMutation.isPending}
        />
      )}
    </div>
  );
}
