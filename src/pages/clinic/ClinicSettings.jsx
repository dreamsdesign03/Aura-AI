import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, Building2, MapPin, Stethoscope, Clock, Brain,
  Shield, Bell, Save, Check, AlertCircle, Plus,
} from 'lucide-react';
import { clinicApi } from '@/clinic/api';
import { PageHead, Card, CardHead, EmptyState, Spinner, Kpi, Tabs } from '@/clinic/ui';

const DEFAULT_HOURS = {
  monday: { open: '09:00', close: '19:00', closed: false },
  tuesday: { open: '09:00', close: '19:00', closed: false },
  wednesday: { open: '09:00', close: '19:00', closed: false },
  thursday: { open: '09:00', close: '19:00', closed: false },
  friday: { open: '09:00', close: '19:00', closed: false },
  saturday: { open: '10:00', close: '16:00', closed: false },
  sunday: { open: '10:00', close: '14:00', closed: true },
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function BranchForm({ branches, onChange }) {
  const [editing, setEditing] = useState(null);
  const [newBranch, setNewBranch] = useState({ name: '', address: '', phone: '', isDefault: false });

  return (
    <div>
      <div className="co-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <CardHead title="Branches" hint={`${branches.length} location${branches.length === 1 ? '' : 's'}`} />
        <button type="button" className="co-btn co-btn-primary co-btn-sm" onClick={() => setEditing('new')}>
          <Plus size={13} /> Add branch
        </button>
      </div>

      {branches.length === 0 ? (
        <p className="co-sm co-mut">No branches configured. Add your first location.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {branches.map((b, i) => (
            <div key={i} className="co-card" style={{ padding: 12 }}>
              <div className="co-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="co-row" style={{ gap: 10 }}>
                  <Building2 size={20} style={{ color: b.isDefault ? '#A4285E' : '#9CA3AF' }} />
                  <div>
                    <div className="co-strong">{b.name}{b.isDefault ? ' <span className="co-xs co-mut">(default)</span>' : ''}</div>
                    <div className="co-xs co-mut">{b.address}{b.phone ? ` · ${b.phone}` : ''}</div>
                  </div>
                </div>
                <div className="co-row" style={{ gap: 6 }}>
                  <button type="button" className="co-btn co-btn-sm co-btn-ghost" onClick={() => setEditing(i)}><MapPin size={12} /> Edit</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null ? (
        <Modal
          title={editing === 'new' ? 'Add Branch' : 'Edit Branch'}
          subtitle="Branch details for appointments and patient routing."
          onClose={() => setEditing(null)}
          width={560}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const data = Object.fromEntries(form);
              if (editing === 'new') onChange([...branches, { ...data, isDefault: branches.length === 0 }]);
              else {
                const updated = [...branches];
                updated[editing] = { ...updated[editing], ...data };
                onChange(updated);
              }
              setEditing(null);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div className="co-field"><label className="co-label" htmlFor="co-bname">Name *</label><input id="co-bname" name="name" className="co-input" defaultValue={editing !== 'new' ? branches[editing]?.name : ''} required /></div>
            <div className="co-field"><label className="co-label" htmlFor="co-baddr">Address</label><input id="co-baddr" name="address" className="co-input" defaultValue={editing !== 'new' ? branches[editing]?.address : ''} /></div>
            <div className="co-field"><label className="co-label" htmlFor="co-bphone">Phone</label><input id="co-bphone" name="phone" className="co-input" defaultValue={editing !== 'new' ? branches[editing]?.phone : ''} /></div>
            <div className="co-field" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <input id="co-bdefault" name="isDefault" type="checkbox" defaultChecked={editing !== 'new' ? branches[editing]?.isDefault : branches.length === 0} />
              <label htmlFor="co-bdefault" className="co-label" style={{ margin: 0 }}>Set as default branch</label>
            </div>
            <div className="co-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="co-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="co-btn co-btn-primary"><Save size={13} /> Save</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function TreatmentForm({ treatments, onChange }) {
  const [editing, setEditing] = useState(null);
  const [newTreatment, setNewTreatment] = useState({ name: '', duration: 45, price: 0, category: '' });

  return (
    <div>
      <div className="co-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <CardHead title="Treatments" hint={`${treatments.length} service${treatments.length === 1 ? '' : 's'}`} />
        <button type="button" className="co-btn co-btn-primary co-btn-sm" onClick={() => setEditing('new')}>
          <Plus size={13} /> Add treatment
        </button>
      </div>

      {treatments.length === 0 ? (
        <p className="co-sm co-mut">No treatments configured.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {treatments.map((t, i) => (
            <div key={i} className="co-card" style={{ padding: 12 }}>
              <div className="co-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="co-row" style={{ gap: 10 }}>
                  <Stethoscope size={20} style={{ color: '#A4285E' }} />
                  <div>
                    <div className="co-strong">{t.name}</div>
                    <div className="co-xs co-mut">{t.category ? `${t.category} · ` : ''}{t.duration} min · ₹{Number(t.price).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                <button type="button" className="co-btn co-btn-sm co-btn-ghost" onClick={() => setEditing(i)}><MapPin size={12} /> Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null ? (
        <Modal
          title={editing === 'new' ? 'Add Treatment' : 'Edit Treatment'}
          subtitle="Service details for booking and packages."
          onClose={() => setEditing(null)}
          width={560}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const data = Object.fromEntries(form);
              if (editing === 'new') onChange([...treatments, data]);
              else { const u = [...treatments]; u[editing] = data; onChange(u); }
              setEditing(null);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div className="co-field"><label className="co-label" htmlFor="co-tname">Name *</label><input id="co-tname" name="name" className="co-input" defaultValue={editing !== 'new' ? treatments[editing]?.name : ''} required /></div>
            <div className="co-form-grid">
              <div className="co-field"><label className="co-label" htmlFor="co-tdur">Duration (min)</label><input id="co-tdur" name="duration" type="number" className="co-input" defaultValue={editing !== 'new' ? treatments[editing]?.duration : 45} /></div>
              <div className="co-field"><label className="co-label" htmlFor="co-tprice">Price (₹)</label><input id="co-tprice" name="price" type="number" className="co-input" defaultValue={editing !== 'new' ? treatments[editing]?.price : 0} /></div>
              <div className="co-field"><label className="co-label" htmlFor="co-tcat">Category</label><input id="co-tcat" name="category" className="co-input" defaultValue={editing !== 'new' ? treatments[editing]?.category : ''} placeholder="e.g. Laser, Facial, Injectables" /></div>
            </div>
            <div className="co-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="co-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="co-btn co-btn-primary"><Save size={13} /> Save</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function HoursForm({ hours, onChange }) {
  const [form, setForm] = useState({ ...DEFAULT_HOURS, ...hours });

  return (
    <div>
      <CardHead title="Operating Hours" />
      <div style={{ display: 'grid', gap: 10 }}>
        {DAYS.map((day) => (
          <div key={day} className="co-row" style={{ alignItems: 'center', gap: 10 }}>
            <span className="co-strong" style={{ textTransform: 'capitalize', minWidth: 100 }}>{day}</span>
            <div className="co-row" style={{ gap: 8, flex: 1 }}>
              <input type="checkbox" id={`co-${day}-closed`} checked={form[day].closed} onChange={(e) => setForm({ ...form, [day]: { ...form[day], closed: e.target.checked } })} />
              <label htmlFor={`co-${day}-closed`} className="co-sm co-mut" style={{ cursor: 'pointer' }}>Closed</label>
              {!form[day].closed ? (
                <>
                  <input type="time" className="co-input" style={{ width: 100 }} value={form[day].open} onChange={(e) => setForm({ ...form, [day]: { ...form[day], open: e.target.value } })} />
                  <span>–</span>
                  <input type="time" className="co-input" style={{ width: 100 }} value={form[day].close} onChange={(e) => setForm({ ...form, [day]: { ...form[day], close: e.target.value } })} />
                </>
              ) : (
                <span className="co-xs co-mut">Closed all day</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="co-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="co-btn co-btn-primary" onClick={() => onChange(form)}><Save size={13} /> Save hours</button>
      </div>
    </div>
  );
}

function AiNotesForm({ notes, onChange }) {
  const [text, setText] = useState(notes || '');
  const [saving, setSaving] = useState(false);

  return (
    <div>
      <CardHead title="AI Agent Notes" hint="Instructions for the Sarvam AI voice agent during calls." />
      <textarea
        rows="8"
        className="co-input"
        style={{ fontFamily: 'inherit', marginBottom: 12 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Always confirm the branch location. Mention the 10% first-visit discount. Ask about allergies before recommending injectables…"
      />
      <button type="button" className="co-btn co-btn-primary" onClick={async () => { setSaving(true); await onChange(text); setSaving(false); }} disabled={saving}>
        {saving ? <span className="animate-spin">⟳</span> : <Save size={13} />} Save AI notes
      </button>
    </div>
  );
}

function ConsentForm({ consent, onChange }) {
  const [form, setForm] = useState({
    marketing: consent?.marketing ?? false,
    treatment: consent?.treatment ?? true,
    recording: consent?.recording ?? true,
    privacyPolicyUrl: consent?.privacyPolicyUrl || '',
  });

  return (
    <div>
      <CardHead title="Consent & Privacy" hint="Configure what patients agree to during booking and check-in." />
      <div className="co-field" style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <input id="co-cmkt" type="checkbox" checked={form.marketing} onChange={(e) => setForm({ ...form, marketing: e.target.checked })} />
        <label htmlFor="co-cmkt" className="co-label" style={{ margin: 0 }}>Marketing communications (WhatsApp/SMS/Email)</label>
      </div>
      <div className="co-field" style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <input id="co-ctx" type="checkbox" checked={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.checked })} />
        <label htmlFor="co-ctx" className="co-label" style={{ margin: 0 }}>Treatment consent</label>
      </div>
      <div className="co-field" style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <input id="co-crec" type="checkbox" checked={form.recording} onChange={(e) => setForm({ ...form, recording: e.target.checked })} />
        <label htmlFor="co-crec" className="co-label" style={{ margin: 0 }}>Call recording consent</label>
      </div>
      <div className="co-field">
        <label className="co-label" htmlFor="co-cpriv">Privacy Policy URL</label>
        <input id="co-cpriv" className="co-input" value={form.privacyPolicyUrl} onChange={(e) => setForm({ ...form, privacyPolicyUrl: e.target.value })} placeholder="https://yourclinic.com/privacy" />
      </div>
      <button type="button" className="co-btn co-btn-primary" onClick={() => onChange(form)}><Save size={13} /> Save consent settings</button>
    </div>
  );
}

export default function ClinicSettings() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clinic', 'settings'],
    queryFn: clinicApi.getSettings,
  });

  const settings = data?.settings || { branches: [], treatments: [], hours: {}, ai_notes: '', consent: {} };

  const saveSettings = useMutation({
    mutationFn: (body) => clinicApi.saveSettings(body),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); qc.invalidateQueries({ queryKey: ['clinic', 'settings'] }); },
  });

  return (
    <div className="clinic-os">
      <PageHead title="Clinic Settings" subtitle="Branches, treatments, hours, AI behavior and consent.">
        <button type="button" className="co-btn co-btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
        {saved && <span className="co-row" style={{ alignItems: 'center', gap: 6, color: '#15803D' }}><Check size={14} /> Saved!</span>}
      </PageHead>

      <div className="co-split">
        <div>
          <Card>
            <Tabs
              value={activeTab}
              onChange={setActiveTab}
              items={[
                { value: 'general', label: 'General' },
                { value: 'branches', label: 'Branches' },
                { value: 'treatments', label: 'Treatments' },
                { value: 'hours', label: 'Hours' },
                { value: 'ai', label: 'AI Agent' },
                { value: 'consent', label: 'Consent' },
              ]}
            />

            {activeTab === 'general' && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="co-form-grid">
                  <div className="co-field">
                    <label className="co-label" htmlFor="co-cname">Clinic Name</label>
                    <input id="co-cname" className="co-input" defaultValue={settings.clinic_name || ''} placeholder="Aura Laser & Cosmetic Clinic" />
                  </div>
                </div>
                <button type="button" className="co-btn co-btn-primary" onClick={() => saveSettings.mutate({ ...settings, clinic_name: document.getElementById('co-cname')?.value })}><Save size={13} /> Save name</button>
              </div>
            )}

            {activeTab === 'branches' && (
              <div style={{ marginTop: 16 }}>
                <BranchForm branches={settings.branches || []} onChange={(branches) => saveSettings.mutate({ ...settings, branches })} />
              </div>
            )}

            {activeTab === 'treatments' && (
              <div style={{ marginTop: 16 }}>
                <TreatmentForm treatments={settings.treatments || []} onChange={(treatments) => saveSettings.mutate({ ...settings, treatments })} />
              </div>
            )}

            {activeTab === 'hours' && (
              <div style={{ marginTop: 16 }}>
                <HoursForm hours={settings.hours || {}} onChange={(hours) => saveSettings.mutate({ ...settings, hours })} />
              </div>
            )}

            {activeTab === 'ai' && (
              <div style={{ marginTop: 16 }}>
                <AiNotesForm notes={settings.ai_notes} onChange={(ai_notes) => saveSettings.mutate({ ...settings, ai_notes })} />
              </div>
            )}

            {activeTab === 'consent' && (
              <div style={{ marginTop: 16 }}>
                <ConsentForm consent={settings.consent} onChange={(consent) => saveSettings.mutate({ ...settings, consent })} />
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card>
            <CardHead title="Quick Stats" />
            <div className="co-kpis" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <Kpi label="Branches" value={settings.branches?.length || 0} icon={Building2} />
              <Kpi label="Treatments" value={settings.treatments?.length || 0} icon={Stethoscope} />
            </div>
          </Card>

          <Card>
            <CardHead title="Connected Apps" />
            <div className="co-list">
              <div className="co-list-item"><span className="co-dot ok" /><div>Sarvam AI Voice</div></div>
              <div className="co-list-item"><span className="co-dot ok" /><div>WhatsApp Cloud API</div></div>
              <div className="co-list-item"><span className="co-dot ok" /><div>Google Calendar Sync</div></div>
              <div className="co-list-item"><span className="co-dot" /><div>Meta Business (Instagram)</div></div>
            </div>
          </Card>

          <Card>
            <CardHead title="Data & Privacy" />
            <div className="co-list">
              <div className="co-list-item"><span className="co-dot" /><div>All data stored in your Neon PostgreSQL</div></div>
              <div className="co-list-item"><span className="co-dot" /><div>No data leaves your project</div></div>
              <div className="co-list-item"><span className="co-dot" /><div>GDPR/PDPB ready</div></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}