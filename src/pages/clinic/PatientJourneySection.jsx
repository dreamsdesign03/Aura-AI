import { useState, useMemo, useEffect } from 'react';
import { Link } from 'wouter';
import {
  Sparkles, CheckCircle2, AlertCircle, ArrowUpRight, Sliders,
  X, Check, ChevronDown, ChevronUp, RotateCcw, CalendarDays,
  Target, Shield, ExternalLink, Activity
} from 'lucide-react';
import { Modal } from '@/clinic/ui';

const STORAGE_KEY = 'aura_clinic_journey_targets_v1';

export const INITIAL_STAGES_ROW_A = [
  {
    n: 1,
    name: 'Discover',
    does: 'Ads by branch area, consent checked content, season calendar',
    measure: 'Cost per enquiry',
    value: '₹214',
    target: 'Under ₹250',
    ok: true,
    href: '/campaigns',
    stageKey: 'discover',
    filterKeywords: ['discover', 'ad', 'enquiry', 'lead in'],
  },
  {
    n: 2,
    name: 'Engage',
    does: 'Skin analysis, WhatsApp, Instagram and web chat in one inbox',
    measure: 'First reply time',
    value: '48 sec',
    target: 'Under 60 sec',
    ok: true,
    href: '/clinic/inbox',
    stageKey: 'engage',
    filterKeywords: ['engage', 'whatsapp', 'inbox', 'chat'],
  },
  {
    n: 3,
    name: 'Capture and route',
    does: 'All channels and 6 lines, duplicates merged, nearest branch',
    measure: 'Captured vs enquiries',
    value: '97%',
    target: '99%',
    ok: false,
    href: '/clinic/dialer',
    stageKey: 'capture',
    filterKeywords: ['capture', 'routed', 'dialer', 'line'],
  },
  {
    n: 4,
    name: 'Qualify',
    does: 'AI call in 5 minutes, safety screen, hot, warm or nurture',
    measure: 'Contact rate',
    value: '68%',
    target: '75%',
    ok: false,
    href: '/clinic/agents',
    stageKey: 'qualify',
    filterKeywords: ['qualify', 'qualified', 'hot', 'warm', 'nurture'],
  },
  {
    n: 5,
    name: 'Book',
    does: 'Live calendars, WhatsApp map link, 24 h and 2 h reminders',
    measure: 'Show up rate',
    value: '82%',
    target: '80%',
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
    does: 'Quote on WhatsApp, payment or EMI, follow ups',
    measure: 'Consult to package',
    value: '41%',
    target: '45%',
    ok: false,
    href: '/clinic/appointments',
    stageKey: 'consult',
    filterKeywords: ['consult', 'consultation', 'quote', 'emi'],
  },
  {
    n: 7,
    name: 'Treat and complete',
    does: 'Session tracker, next sitting booked, recovery calls',
    measure: 'Package completion',
    value: '71%',
    target: '80%',
    ok: false,
    href: '/clinic/appointments',
    stageKey: 'treat',
    filterKeywords: ['treat', 'treatment', 'session', 'package', 'active patient'],
  },
  {
    n: 8,
    name: 'Delight and review',
    does: 'Satisfaction check, branch review link, escalation',
    measure: 'Reviews this month',
    value: '128',
    target: '120',
    ok: true,
    href: '/clinic/reviews',
    stageKey: 'review',
    filterKeywords: ['review', 'google review', 'delight', 'satisfaction'],
  },
  {
    n: 9,
    name: 'Retain and expand',
    does: 'Maintenance, next best treatment, festive offers',
    measure: 'Repeat visit rate',
    value: '54%',
    target: '60%',
    ok: false,
    href: '/clinic/retention',
    stageKey: 'retain',
    filterKeywords: ['retain', 'repeat', 'maintenance', 'retention'],
  },
  {
    n: 10,
    name: 'Refer and advocate',
    does: 'Referral rewards, family packages, shared stories',
    measure: 'Leads from referrals',
    value: '14%',
    target: '15%',
    ok: false,
    href: '/clinic/retention',
    stageKey: 'refer',
    filterKeywords: ['refer', 'referral', 'advocate', 'family'],
  },
];

export default function PatientJourneySection({
  selectedStage = null,
  onSelectStage = () => {},
  totalPatients = 0,
}) {
  const [stagesA, setStagesA] = useState(INITIAL_STAGES_ROW_A);
  const [stagesB, setStagesB] = useState(INITIAL_STAGES_ROW_B);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [draftTargets, setDraftTargets] = useState({});
  const [showDeepDive, setShowDeepDive] = useState(true);

  // Load persisted targets from localStorage
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
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Compute live counts
  const allStages = useMemo(() => [...stagesA, ...stagesB], [stagesA, stagesB]);
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
    } catch {
      // Ignore
    }
    setEditModalOpen(false);
  };

  const handleResetDefaults = () => {
    setStagesA(INITIAL_STAGES_ROW_A);
    setStagesB(INITIAL_STAGES_ROW_B);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    setEditModalOpen(false);
  };

  const handleStageClick = (e, stage) => {
    // If clicking to filter
    if (selectedStage === stage.n) {
      onSelectStage(null);
    } else {
      onSelectStage(stage);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Journey Head ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, font: '600 26px/1.2 Poppins, Inter, sans-serif', color: '#172326' }}>
              Patient journey
            </h1>
            <span
              style={{
                background: '#FBE9F1',
                color: '#A4285E',
                fontSize: 12,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              10 Stages Live
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#5F6B6D' }}>
            All 10 stages, live, each with its measure against target · October 2026 · click a stage to view metrics or filter patients
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
          <button
            type="button"
            className="co-btn co-btn-sm co-btn-ghost"
            onClick={() => setShowDeepDive(!showDeepDive)}
            title={showDeepDive ? 'Hide journey deep-dive cards' : 'Show journey deep-dive cards'}
          >
            {showDeepDive ? (
              <>
                <ChevronUp size={13} /> Collapse Deep-dive
              </>
            ) : (
              <>
                <ChevronDown size={13} /> Expand Deep-dive
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Stage Filter Notice if active ────────────────────────── */}
      {selectedStage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FDF3F8',
            border: '1px solid #F3D9E5',
            borderRadius: 10,
            padding: '8px 14px',
            fontSize: 13,
            color: '#A4285E',
          }}
        >
          <span>
            <b>Filtering Patients:</b> Stage {selectedStage} ({allStages.find((s) => s.n === selectedStage)?.name})
          </span>
          <button
            type="button"
            className="co-btn co-btn-sm"
            onClick={() => onSelectStage(null)}
            style={{ height: 26, padding: '0 8px', fontSize: 11 }}
          >
            <X size={12} /> Clear Filter
          </button>
        </div>
      )}

      {/* ── STAGES 1 TO 5 · WIN THE PATIENT ─────────────────────── */}
      <div>
        <p
          style={{
            margin: '0 0 10px 0',
            fontSize: '11.5px',
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: '#5F6B6D',
          }}
        >
          Stages 1 to 5 · win the patient
        </p>
        <div className="pj-five">
          {stagesA.map((s) => {
            const isSelected = selectedStage === s.n;
            return (
              <div
                key={s.n}
                className={`pj-st ${isSelected ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleStageClick(e, s)}
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
                    <ArrowUpRight size={14} style={{ color: '#0B7A6A' }} />
                  </Link>
                </div>

                <span style={{ fontSize: '12.5px', lineHeight: 1.4, minHeight: 35, color: '#5F6B6D' }}>
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
                    <p style={{ margin: 0, fontSize: 12, color: '#5F6B6D' }}>{s.measure}</p>
                    <p style={{ margin: '2px 0 0', font: '600 22px Poppins, Inter, sans-serif', color: '#172326' }}>
                      {s.value}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, textAlign: 'right', color: '#5F6B6D' }}>
                    Target
                    <br />
                    <b style={{ color: '#2E3B3E' }}>{s.target}</b>
                  </span>
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
            color: '#5F6B6D',
          }}
        >
          Stages 6 to 10 · complete the package and keep the patient
        </p>
        <div className="pj-five">
          {stagesB.map((s) => {
            const isSelected = selectedStage === s.n;
            return (
              <div
                key={s.n}
                className={`pj-st pj-row-b ${isSelected ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleStageClick(e, s)}
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
                    <ArrowUpRight size={14} style={{ color: '#0B5D7A' }} />
                  </Link>
                </div>

                <span style={{ fontSize: '12.5px', lineHeight: 1.4, minHeight: 35, color: '#5F6B6D' }}>
                  {s.does}
                </span>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    paddingTop: 8,
                    borderTop: '1px solid #DCEFF5',
                    marginTop: 'auto',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: '#5F6B6D' }}>{s.measure}</p>
                    <p style={{ margin: '2px 0 0', font: '600 22px Poppins, Inter, sans-serif', color: '#172326' }}>
                      {s.value}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, textAlign: 'right', color: '#5F6B6D' }}>
                    Target
                    <br />
                    <b style={{ color: '#2E3B3E' }}>{s.target}</b>
                  </span>
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
            color: '#45504F',
            background: '#DCE8E5',
            padding: '3px 8px',
            borderRadius: 6,
          }}
        >
          Foundation
        </span>
        <span style={{ fontWeight: 600, fontSize: '14.5px', flex: 1, minWidth: 280, color: '#172326' }}>
          Monthly visibility audit: Google profiles, local rankings, reviews and AI search for every branch
        </span>
        <span style={{ font: '600 20px Poppins, Inter, sans-serif', color: '#172326' }}>
          76<span style={{ color: '#5F6B6D', fontSize: '13px' }}>/100</span>
        </span>
        <span className="pj-badge below-target">7 fixes open</span>
        <ArrowUpRight size={15} style={{ color: '#0B7A6A' }} />
      </Link>

      {/* ── 3 Deep-Dive Cards ────────────────────────────────────── */}
      {showDeepDive && (
        <div className="pj-breakdown-grid">
          {/* Card 1: Stage 2 · Engage */}
          <div className="co-card" style={{ display: 'flex', flexDirection: 'column', gap: 11, background: '#fff' }}>
            <div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5F6B6D' }}>
                Stage 2 · Engage
              </p>
              <h2 style={{ margin: '4px 0 0', font: '600 16px/1.3 Poppins, Inter, sans-serif', color: '#172326' }}>
                Skin analysis to booking
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 160, fontSize: 13, color: '#2E3B3E' }}>Free scans done</span>
              <div style={{ flex: 1, height: 10, background: '#E8F1EF', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: '100%', height: 10, background: '#0B7A6A', borderRadius: 5 }} />
              </div>
              <span style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#172326' }}>640</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 160, fontSize: 13, color: '#2E3B3E' }}>Shown a matching plan</span>
              <div style={{ flex: 1, height: 10, background: '#E8F1EF', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: '96%', height: 10, background: '#0B7A6A', borderRadius: 5 }} />
              </div>
              <span style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#172326' }}>612</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 160, fontSize: 13, color: '#2E3B3E' }}>Opened the booking offer</span>
              <div style={{ flex: 1, height: 10, background: '#E8F1EF', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: '47%', height: 10, background: '#0B7A6A', borderRadius: 5 }} />
              </div>
              <span style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#172326' }}>301</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 160, fontSize: 13, fontWeight: 600, color: '#172326' }}>Consult booked</span>
              <div style={{ flex: 1, height: 10, background: '#E8F1EF', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: '23%', height: 10, background: '#C2453F', borderRadius: 5 }} />
              </div>
              <span style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#C2453F' }}>148</span>
            </div>

            <p style={{ margin: 'auto 0 0', fontSize: '12.5px', lineHeight: 1.5, color: '#5F6B6D', paddingTop: 6 }}>
              Each scan result triggers a WhatsApp offer for the treatment that matches the highest score.
            </p>
          </div>

          {/* Card 2: Stage 6 · Consult and convert */}
          <div className="co-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' }}>
            <div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5F6B6D' }}>
                Stage 6 · Consult and convert
              </p>
              <h2 style={{ margin: '4px 0 0', font: '600 16px/1.3 Poppins, Inter, sans-serif', color: '#172326' }}>
                Follow up after the consult
              </h2>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 76, fontSize: '12.5px', fontWeight: 700, color: '#0A6F61' }}>At consult</span>
              <span style={{ flex: 1, fontSize: 13, color: '#2E3B3E' }}>Plan and quote on WhatsApp, payment or EMI link</span>
              <span className="pj-badge on-target">22%</span>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 76, fontSize: '12.5px', fontWeight: 700, color: '#0A6F61' }}>24 hours</span>
              <span style={{ flex: 1, fontSize: 13, color: '#2E3B3E' }}>“Any questions about your plan?”</span>
              <span className="pj-badge on-target">+9%</span>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 76, fontSize: '12.5px', fontWeight: 700, color: '#0A6F61' }}>3 days</span>
              <span style={{ flex: 1, fontSize: 13, color: '#2E3B3E' }}>Doctor’s note and a similar patient’s result</span>
              <span className="pj-badge on-target">+6%</span>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 76, fontSize: '12.5px', fontWeight: 700, color: '#0A6F61' }}>7 days</span>
              <span style={{ flex: 1, fontSize: 13, color: '#2E3B3E' }}>Last reminder, then a counsellor call</span>
              <span className="pj-badge on-target">+4%</span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: 8,
                borderTop: '1px solid #EDF2F1',
                fontSize: '13.5px',
                marginTop: 'auto',
              }}
            >
              <span style={{ fontWeight: 600, color: '#172326' }}>Consult to package</span>
              <b style={{ color: '#0B7A6A', fontSize: 15 }}>41%</b>
            </div>
          </div>

          {/* Card 3: Stage 1 · Discover */}
          <div className="co-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' }}>
            <div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5F6B6D' }}>
                Stage 1 · Discover
              </p>
              <h2 style={{ margin: '4px 0 0', font: '600 16px/1.3 Poppins, Inter, sans-serif', color: '#172326' }}>
                Season calendar
              </h2>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '13.5px', alignItems: 'center' }}>
              <span style={{ color: '#2E3B3E' }}><b>Navratri</b> · festive glow</span>
              <span className="pj-badge neutral">Done</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '13.5px', alignItems: 'center' }}>
              <span style={{ color: '#2E3B3E' }}><b>Diwali</b> · HydraFacial and IV glow</span>
              <span className="pj-badge on-target">Live now</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '13.5px', alignItems: 'center' }}>
              <span style={{ color: '#2E3B3E' }}><b>Wedding season</b> · bridal countdown</span>
              <span className="pj-badge brand">November to February</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '13.5px', alignItems: 'center' }}>
              <span style={{ color: '#2E3B3E' }}><b>Summer</b> · laser hair reduction</span>
              <span className="pj-badge neutral">March to May</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '13.5px', alignItems: 'center' }}>
              <span style={{ color: '#2E3B3E' }}><b>Monsoon</b> · acne and fungal care</span>
              <span className="pj-badge neutral">June to September</span>
            </div>

            <p style={{ margin: 'auto 0 0', fontSize: '12.5px', color: '#5F6B6D', paddingTop: 6 }}>
              Each season starts its campaigns 3 weeks early, by branch.
            </p>
          </div>
        </div>
      )}

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
                      border: '1px solid #E3EAE9',
                      borderRadius: 10,
                      padding: '10px 14px',
                      background: s.n <= 5 ? '#FFFFFF' : '#FAFDFE',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: s.n <= 5 ? '#0B7A6A' : '#0B5D7A',
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
                        <span style={{ fontWeight: 600, color: draft.ok ? '#2E7D32' : '#8A4A06' }}>
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
