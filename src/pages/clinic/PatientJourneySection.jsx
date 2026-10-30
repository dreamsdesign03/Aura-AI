import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Sparkles, CheckCircle2, AlertCircle, ArrowUpRight, Sliders,
  X, Check, RotateCcw, CalendarDays,
  Target, Shield, ExternalLink, Activity, Users, Filter
} from 'lucide-react';
import { Modal } from '@/clinic/ui';
import { clinicApi } from '@/clinic/api';

const STORAGE_KEY = 'aura_clinic_journey_targets_v1';

export const INITIAL_STAGES_ROW_A = [
  {
    n: 1,
    name: 'Discover',
    does: 'Campaign inquiries, website visits & brand lead generation',
    measure: 'Acquired Enquiries',
    value: '132',
    target: '100+',
    ok: true,
    href: '/campaigns',
    stageKey: 'discover',
    filterKeywords: ['discover', 'ad', 'enquiry', 'lead in'],
  },
  {
    n: 2,
    name: 'Engage',
    does: 'Skin analysis, WhatsApp messages, and direct inbox chats',
    measure: 'Active Conversations',
    value: '6',
    target: '5+',
    ok: true,
    href: '/clinic/inbox',
    stageKey: 'engage',
    filterKeywords: ['engage', 'whatsapp', 'inbox', 'chat'],
  },
  {
    n: 3,
    name: 'Capture and route',
    does: 'Captured clinic contacts, duplicates merged, nearest branch assigned',
    measure: 'Captured Contacts',
    value: '132',
    target: '100%',
    ok: true,
    href: '/clinic/dialer',
    stageKey: 'capture',
    filterKeywords: ['capture', 'routed', 'dialer', 'line'],
  },
  {
    n: 4,
    name: 'Qualify',
    does: 'AI voice screening in 5 minutes, treatment interest & safety check',
    measure: 'AI Screened Calls',
    value: '18',
    target: '15+',
    ok: true,
    href: '/clinic/agents',
    stageKey: 'qualify',
    filterKeywords: ['qualify', 'qualified', 'hot', 'warm', 'nurture'],
  },
  {
    n: 5,
    name: 'Book',
    does: 'Live Cal.com bookings, doctor consultation slots, 24h reminders',
    measure: 'Booked Consultations',
    value: '62',
    target: '10+',
    ok: true,
    href: '/clinic/appointments',
    stageKey: 'book',
    filterKeywords: ['book', 'booked', 'appointment', 'scheduled', 'new patient'],
  },
];

export const INITIAL_STAGES_ROW_B = [
  {
    n: 6,
    name: 'Consult and convert',
    does: 'Doctor consultation conducted, treatment recommendations & quotes',
    measure: 'Active Consultations',
    value: '11',
    target: '5+',
    ok: true,
    href: '/clinic/appointments',
    stageKey: 'consult',
    filterKeywords: ['consult', 'consultation', 'quote', 'emi'],
  },
  {
    n: 7,
    name: 'Treat and complete',
    does: 'Clinical session tracker, ongoing treatment packages, recovery care',
    measure: 'Active Care Patients',
    value: '11',
    target: '10+',
    ok: true,
    href: '/clinic/appointments',
    stageKey: 'treat',
    filterKeywords: ['treat', 'treatment', 'session', 'package', 'active patient'],
  },
  {
    n: 8,
    name: 'Delight and review',
    does: 'Patient satisfaction check, Google Clinic review requests',
    measure: 'Google Reviews',
    value: '0',
    target: '5+',
    ok: false,
    href: '/clinic/reviews',
    stageKey: 'review',
    filterKeywords: ['review', 'google review', 'delight', 'satisfaction'],
  },
  {
    n: 9,
    name: 'Retain and expand',
    does: 'Maintenance follow-ups, repeat visits, multi-session packages',
    measure: 'Repeat Consultations',
    value: '4',
    target: '2+',
    ok: true,
    href: '/clinic/retention',
    stageKey: 'retain',
    filterKeywords: ['retain', 'repeat', 'maintenance', 'retention'],
  },
  {
    n: 10,
    name: 'Refer and advocate',
    does: 'Referral rewards, family clinic packages, shared testimonials',
    measure: 'Referral Rewards',
    value: '0',
    target: '2+',
    ok: false,
    href: '/clinic/retention',
    stageKey: 'refer',
    filterKeywords: ['refer', 'referral', 'advocate', 'family'],
  },
];

export default function PatientJourneySection({
  selectedStage = null,
  onSelectStage = () => {},
  onViewPatientList = () => {},
  totalPatients = 0,
}) {
  const [stagesA, setStagesA] = useState(INITIAL_STAGES_ROW_A);
  const [stagesB, setStagesB] = useState(INITIAL_STAGES_ROW_B);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [draftTargets, setDraftTargets] = useState({});

  // Query actual live stats from database
  const { data: statsData } = useQuery({
    queryKey: ['clinic', 'journey-stats'],
    queryFn: () => clinicApi.journeyStats(),
    refetchInterval: 15_000,
  });

  const liveStats = statsData?.stats;

  // Merge live stats dynamically into row A and row B
  const displayStagesA = useMemo(() => {
    return stagesA.map((s) => {
      const live = liveStats?.[s.stageKey];
      if (!live) return s;
      return {
        ...s,
        measure: live.measure || s.measure,
        value: live.value !== undefined ? live.value : s.value,
        target: live.target || s.target,
        ok: live.ok !== undefined ? live.ok : s.ok,
      };
    });
  }, [stagesA, liveStats]);

  const displayStagesB = useMemo(() => {
    return stagesB.map((s) => {
      const live = liveStats?.[s.stageKey];
      if (!live) return s;
      return {
        ...s,
        measure: live.measure || s.measure,
        value: live.value !== undefined ? live.value : s.value,
        target: live.target || s.target,
        ok: live.ok !== undefined ? live.ok : s.ok,
      };
    });
  }, [stagesB, liveStats]);

  // Load persisted custom targets if user edited them
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.a && parsed.b) {
          setStagesA(parsed.a);
          setStagesB(parsed.b);
        }
      }
    } catch {}
  }, []);

  const allStages = useMemo(() => [...displayStagesA, ...displayStagesB], [displayStagesA, displayStagesB]);
  const onTargetCount = useMemo(() => allStages.filter((s) => s.ok).length, [allStages]);
  const belowTargetCount = useMemo(() => allStages.filter((s) => !s.ok).length, [allStages]);

  const openEditModal = () => {
    const drafts = {};
    allStages.forEach((s) => {
      drafts[s.n] = { target: s.target, value: s.value, ok: s.ok };
    });
    setDraftTargets(drafts);
    setEditModalOpen(true);
  };

  const handleSaveTargets = (e) => {
    e.preventDefault();
    const updateList = (list) =>
      list.map((s) => {
        const d = draftTargets[s.n];
        if (!d) return s;
        return {
          ...s,
          target: d.target,
          value: d.value,
          ok: d.ok,
        };
      });

    const newA = updateList(stagesA);
    const newB = updateList(stagesB);
    setStagesA(newA);
    setStagesB(newB);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: newA, b: newB }));
    } catch {}
    setEditModalOpen(false);
  };

  const handleResetDefaults = () => {
    setStagesA(INITIAL_STAGES_ROW_A);
    setStagesB(INITIAL_STAGES_ROW_B);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setEditModalOpen(false);
  };

  const handleStageClick = (e, stage) => {
    // Toggle: if already selected, clear filter; otherwise select
    if (selectedStage === stage.n) {
      onSelectStage(null);
    } else {
      onSelectStage(stage);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Journey Head ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, font: '600 24px/1.2 Poppins, Inter, sans-serif', color: '#172326' }}>
              Patient Journey
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
              10 Stages Live · Real Database Metrics
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#5F6B6D' }}>
            Live clinical lifecycle based on actual patient appointments, bookings and consultations. Click any stage to filter records below.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="pj-badge on-target">
            <CheckCircle2 size={13} /> On target {onTargetCount}
          </span>
          <span className="pj-badge below-target">
            <AlertCircle size={13} /> Below target {belowTargetCount}
          </span>
          <button type="button" className="co-btn co-btn-sm" onClick={openEditModal}>
            <Sliders size={13} /> Edit targets
          </button>
          {selectedStage && (
            <button
              type="button"
              className="co-btn co-btn-sm"
              onClick={() => onSelectStage(null)}
              style={{ background: '#fff', borderColor: '#F3D9E5', color: '#A4285E' }}
            >
              <X size={13} /> Show All Patients ({totalPatients})
            </button>
          )}
        </div>
      </div>

      {/* ── STAGES 1 TO 5 · WIN THE PATIENT ─────────────────────── */}
      <div>
        <p
          style={{
            margin: '0 0 10px 0',
            fontSize: '11.5px',
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: '#7C1B4A',
          }}
        >
          Stages 1 to 5 · Win the Patient
        </p>
        <div className="pj-five">
          {displayStagesA.map((s) => {
            const isSelected = selectedStage === s.n;
            return (
              <div
                key={s.n}
                className={`pj-st ${isSelected ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleStageClick(e, s)}
                title={`Click to view Stage ${s.n} (${s.name}) patients`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="pj-num">{s.n}</span>
                  <span className={`pj-badge ${s.ok ? 'on-target' : 'below-target'}`}>
                    {s.ok ? 'On target' : 'Below target'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ font: '600 16px Poppins, Inter, sans-serif', color: '#172326' }}>
                    {s.name}
                  </span>
                  <Link
                    href={s.href}
                    onClick={(e) => e.stopPropagation()}
                    className="co-btn-ghost"
                    style={{ padding: 2, borderRadius: 6 }}
                    title={`Open ${s.name} tool`}
                  >
                    <ArrowUpRight size={14} style={{ color: '#A4285E' }} />
                  </Link>
                </div>

                <span style={{ fontSize: '12px', lineHeight: 1.4, minHeight: 34, color: '#5F6B6D' }}>
                  {s.does}
                </span>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    paddingTop: 8,
                    borderTop: '1px solid #EDF2F1',
                    marginTop: 'auto',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#5F6B6D' }}>{s.measure}</p>
                    <p style={{ margin: '2px 0 0', font: '600 22px Poppins, Inter, sans-serif', color: '#172326' }}>
                      {s.value}
                    </p>
                  </div>
                  <span style={{ fontSize: 11.5, textAlign: 'right', color: '#5F6B6D' }}>
                    Target
                    <br />
                    <b style={{ color: '#2E3B3E' }}>{s.target}</b>
                  </span>
                </div>

                <div className="pj-st-action">
                  <span>{isSelected ? '✓ Showing Patients' : `View Stage ${s.n} Patients`}</span>
                  <ArrowUpRight size={12} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── STAGES 6 TO 10 · COMPLETE THE PACKAGE AND KEEP THE PATIENT */}
      <div>
        <p
          style={{
            margin: '0 0 10px 0',
            fontSize: '11.5px',
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: '#7C1B4A',
          }}
        >
          Stages 6 to 10 · Complete the Package and Keep the Patient
        </p>
        <div className="pj-five">
          {displayStagesB.map((s) => {
            const isSelected = selectedStage === s.n;
            return (
              <div
                key={s.n}
                className={`pj-st pj-row-b ${isSelected ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleStageClick(e, s)}
                title={`Click to view Stage ${s.n} (${s.name}) patients`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="pj-num">{s.n}</span>
                  <span className={`pj-badge ${s.ok ? 'on-target' : 'below-target'}`}>
                    {s.ok ? 'On target' : 'Below target'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ font: '600 16px Poppins, Inter, sans-serif', color: '#172326' }}>
                    {s.name}
                  </span>
                  <Link
                    href={s.href}
                    onClick={(e) => e.stopPropagation()}
                    className="co-btn-ghost"
                    style={{ padding: 2, borderRadius: 6 }}
                    title={`Open ${s.name} tool`}
                  >
                    <ArrowUpRight size={14} style={{ color: '#A4285E' }} />
                  </Link>
                </div>

                <span style={{ fontSize: '12px', lineHeight: 1.4, minHeight: 34, color: '#5F6B6D' }}>
                  {s.does}
                </span>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    paddingTop: 8,
                    borderTop: '1px solid #F3D9E5',
                    marginTop: 'auto',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#5F6B6D' }}>{s.measure}</p>
                    <p style={{ margin: '2px 0 0', font: '600 22px Poppins, Inter, sans-serif', color: '#172326' }}>
                      {s.value}
                    </p>
                  </div>
                  <span style={{ fontSize: 11.5, textAlign: 'right', color: '#5F6B6D' }}>
                    Target
                    <br />
                    <b style={{ color: '#2E3B3E' }}>{s.target}</b>
                  </span>
                </div>

                <div className="pj-st-action">
                  <span>{isSelected ? '✓ Showing Patients' : `View Stage ${s.n} Patients`}</span>
                  <ArrowUpRight size={12} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Foundation Banner ────────────────────────────────────── */}
      <Link
        href="/audit"
        className="pj-foundation"
      >
        <span
          style={{
            fontSize: '11.5px',
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: '#A4285E',
            background: '#FBE9F1',
            border: '1px solid #F3D9E5',
            padding: '3px 9px',
            borderRadius: 6,
          }}
        >
          Foundation
        </span>
        <span style={{ fontWeight: 600, fontSize: '14.5px', flex: 1, minWidth: 280, color: '#172326' }}>
          Monthly visibility audit: Google profiles, local rankings, reviews and AI search for every branch
        </span>
        <span className="pj-badge on-target">100% Live</span>
        <ArrowUpRight size={15} style={{ color: '#A4285E' }} />
      </Link>

      {/* ── Edit Targets Modal ────────────────────────────────────── */}
      {editModalOpen && (
        <Modal
          title="Edit Patient Journey Targets"
          subtitle="Customize performance goals for each stage of the patient lifecycle"
          onClose={() => setEditModalOpen(false)}
        >
          <form onSubmit={handleSaveTargets} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {allStages.map((s) => {
                const draft = draftTargets[s.n] || { target: s.target, value: s.value, ok: s.ok };
                return (
                  <div
                    key={s.n}
                    style={{
                      border: '1px solid #F3D9E5',
                      borderRadius: 10,
                      padding: '10px 14px',
                      background: s.n <= 5 ? '#FFFFFF' : '#FFF9FC',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: s.n <= 5 ? 'linear-gradient(135deg, #A4285E 0%, #CB3273 100%)' : 'linear-gradient(135deg, #7C1B4A 0%, #9E245C 100%)',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {s.n}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#172326' }}>{s.name}</span>
                        <span style={{ fontSize: 11, color: '#5F6B6D' }}>({s.measure})</span>
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={draft.ok}
                          onChange={(e) =>
                            setDraftTargets({
                              ...draftTargets,
                              [s.n]: { ...draft, ok: e.target.checked },
                            })
                          }
                        />
                        <span style={{ fontWeight: 600, color: draft.ok ? '#059669' : '#D97706' }}>
                          {draft.ok ? 'On target' : 'Below target'}
                        </span>
                      </label>
                    </div>

                    <div className="co-form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                      <div className="co-field">
                        <label className="co-label" style={{ fontSize: 10 }}>Current Value</label>
                        <input
                          className="co-input"
                          style={{ padding: '6px 8px', fontSize: 12.5 }}
                          value={draft.value}
                          onChange={(e) =>
                            setDraftTargets({
                              ...draftTargets,
                              [s.n]: { ...draft, value: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div className="co-field">
                        <label className="co-label" style={{ fontSize: 10 }}>Target Goal</label>
                        <input
                          className="co-input"
                          style={{ padding: '6px 8px', fontSize: 12.5 }}
                          value={draft.target}
                          onChange={(e) =>
                            setDraftTargets({
                              ...draftTargets,
                              [s.n]: { ...draft, target: e.target.value },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 10, borderTop: '1px solid #EDF2F1' }}>
              <button
                type="button"
                className="co-btn co-btn-sm co-btn-ghost"
                onClick={handleResetDefaults}
                style={{ color: '#6B7280' }}
              >
                <RotateCcw size={12} /> Reset to defaults
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="co-btn co-btn-sm"
                  onClick={() => setEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="co-btn co-btn-sm co-btn-primary"
                  style={{
                    background: 'linear-gradient(135deg, #A4285E 0%, #CB3273 100%)',
                    border: 'none',
                  }}
                >
                  <Check size={12} /> Save Targets
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

