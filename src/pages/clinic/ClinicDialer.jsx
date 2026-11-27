import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  PhoneCall, Phone, PhoneOff, PhoneIncoming, PhoneOutgoing,
  Search, RefreshCw, Plus, Volume2, VolumeX, Mic, MicOff,
  Clock, User, UserPlus, MapPin, Calendar, CalendarDays,
  CheckCircle2, AlertCircle, XCircle, Copy, Check, Delete,
  ShieldCheck, ArrowUpRight, Sliders, Sparkles, Play, ClipboardPaste,
} from 'lucide-react';
import { clinicApi, dateLabel, timeLabel, fullName, money } from '@/clinic/api';
import { getContactDisplayName } from '@/lib/contactName';
import { PageHead, Card, CardHead, Avatar, StatusChip, EmptyState, Spinner, Kpi, Modal } from '@/clinic/ui';
import { useBranch } from '@/contexts/BranchContext';
import { useUserRole } from '@/contexts/AuthContext';

// 12 standard telephony dial keys with alpha sub-labels
const KEYS = [
  ['1', ''],
  ['2', 'ABC'],
  ['3', 'DEF'],
  ['4', 'GHI'],
  ['5', 'JKL'],
  ['6', 'MNO'],
  ['7', 'PQRS'],
  ['8', 'TUV'],
  ['9', 'WXYZ'],
  ['*', ''],
  ['0', '+'],
  ['#', ''],
];

const CONVERSATION_TYPES = [
  { value: 'patient_consultation', label: 'Patient Consultation (Initial Assessment)' },
  { value: 'follow_up', label: 'Post-Treatment Follow-up' },
  { value: 'treatment_query', label: 'Treatment & Pricing Inquiry' },
  { value: 'appointment_booking', label: 'Appointment Scheduling' },
  { value: 'payment_reminder', label: 'Package / Payment Reminder' },
  { value: 'general', label: 'General Front-Desk Inquiry' },
];

const DOCTORS = [
  { id: 'dr_aditya', name: 'Dr. Aditya Shah (Chief Dermatologist)' },
  { id: 'dr_sneha', name: 'Dr. Sneha Parikh (Aesthetic Physician)' },
  { id: 'dr_rohan', name: 'Dr. Rohan Mehta (Cosmetic Surgeon)' },
  { id: 'clinic_ai', name: 'Ria (AI Clinical Voice Coordinator)' },
];

// DTMF audio feedback generator using Web Audio API
function playDtmf(key) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const dtmfFreqs = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
    };
    const freqs = dtmfFreqs[key];
    if (!freqs) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.value = freqs[0];
    osc2.frequency.value = freqs[1];
    gain.gain.value = 0.06;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start();
    osc2.start();
    setTimeout(() => {
      try {
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
        setTimeout(() => {
          osc1.stop();
          osc2.stop();
          ctx.close();
        }, 50);
      } catch { /* noop */ }
    }, 110);
  } catch {
    // Ignore audio context autoplay policy restrictions
  }
}

function formatDuration(sec) {
  if (!sec && sec !== 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ClinicDialer() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const userRole = useUserRole();
  const { branches, selectedBranch } = useBranch();

  // Tab: 'keypad' | 'leads' | 'history' | 'settings'
  const [activeTab, setActiveTab] = useState('keypad');

  // Dialer input state (supports ?phone= pre-fill from Phone book)
  const [number, setNumber] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('phone');
    return p ? String(p).replace(/[^\d+*#\s-]/g, '') : '';
  });
  const [selectedLead, setSelectedLead] = useState(null);
  const [bookingAssist, setBookingAssist] = useState(true);

  const defaultAlkapuriBranch = useMemo(() => {
    const match = branches.find((b) => /alkapuri/i.test(b.name));
    return match?.name || branches[0]?.name || 'Alkapuri branch';
  }, [branches]);

  // Call configuration
  const [conversationType, setConversationType] = useState('patient_consultation');
  const [doctor, setDoctor] = useState('dr_aditya');
  const [branch, setBranch] = useState(() => selectedBranch || defaultAlkapuriBranch);
  const [telephonyEngine, setTelephonyEngine] = useState('plivo');
  const [mockOutcome, setMockOutcome] = useState('connected');

  // Sync branch with selectedBranch or default to Alkapuri branch
  useEffect(() => {
    if (selectedBranch) {
      setBranch(selectedBranch);
    } else if (!branch || !branches.some((b) => b.name === branch)) {
      setBranch(defaultAlkapuriBranch);
    }
  }, [selectedBranch, branches, defaultAlkapuriBranch, branch]);

  // Plivo Settings state
  const [plivoForm, setPlivoForm] = useState({ authId: '', authToken: '', callerId: '' });
  const [settingsSaved, setSettingsSaved] = useState(false);

  // In-call state machine: 'idle' | 'preparing' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'error'
  const [callPhase, setCallPhase] = useState('idle');
  const [callSeconds, setCallSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [activeCallId, setActiveCallId] = useState(null);
  const [lastCallResult, setLastCallResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const timerRef = useRef(null);

  // Modals
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '' });
  const [bookModalLead, setBookModalLead] = useState(null);
  const [copied, setCopied] = useState(false);

  // Leads directory search
  const [search, setSearch] = useState('');

  // Long-press backspace
  const pressTimer = useRef(null);
  const longPressed = useRef(false);

  // Fetch leads for contact matching and directory
  const { data: leadsData, isLoading: leadsLoading, isFetching: leadsFetching, refetch: refetchLeads } = useQuery({
    queryKey: ['clinic', 'dialer', 'leads', selectedBranch],
    queryFn: () => clinicApi.dialerLeads(selectedBranch || undefined),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 3_000,
  });
  const leads = leadsData?.leads || [];

  // Fetch call history
  const [syncPlivoMsg, setSyncPlivoMsg] = useState('');

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['clinic', 'call-reviews', selectedBranch, 'plivo'],
    queryFn: () => clinicApi.callReviews({ branch: selectedBranch, provider: 'plivo' }),
    refetchInterval: callPhase === 'connected' || callPhase === 'ringing' ? 3000 : 15000,
    staleTime: 2000,
    refetchOnWindowFocus: true,
  });
  const recentCalls = historyData?.calls || [];

  const syncPlivoMutation = useMutation({
    mutationFn: clinicApi.syncPlivoCalls,
    onSuccess: (data) => {
      setSyncPlivoMsg(`Plivo calls synced: ${data.checked || 0} checked · ${data.imported || 0} new · ${data.updated || 0} updated`);
      setTimeout(() => setSyncPlivoMsg(''), 6000);
      refetchHistory();
    },
    onError: (err) => {
      setSyncPlivoMsg(`Plivo sync error: ${err.message}`);
      setTimeout(() => setSyncPlivoMsg(''), 6000);
    },
  });

  // Fetch Plivo Dialer Settings
  const { data: settingsData, refetch: refetchSettings } = useQuery({
    queryKey: ['clinic', 'dialer', 'settings'],
    queryFn: clinicApi.dialerSettings,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (body) => clinicApi.saveDialerSettings(body),
    onSuccess: () => {
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
      refetchSettings();
    },
  });

  // Debounced Contact Lookup based on dialed digits
  const cleanedDigits = useMemo(() => number.replace(/[^\d]/g, ''), [number]);
  const matchedContact = useMemo(() => {
    if (selectedLead) return selectedLead;
    if (cleanedDigits.length < 5) return null;
    return (
      leads.find((l) => {
        const leadDigits = String(l.phone || '').replace(/[^\d]/g, '');
        return (
          leadDigits &&
          (leadDigits.endsWith(cleanedDigits.slice(-10)) || cleanedDigits.endsWith(leadDigits.slice(-10)))
        );
      }) || null
    );
  }, [cleanedDigits, selectedLead, leads]);

  // Backspace with long-press clear
  const handleDownBack = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setNumber('');
      setSelectedLead(null);
    }, 600);
  };

  const handleUpBack = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleClickBack = () => {
    if (!longPressed.current) {
      setNumber((prev) => prev.slice(0, -1));
      if (selectedLead) setSelectedLead(null);
    }
  };

  // Dialpad key press
  const handleKeyPress = (key) => {
    playDtmf(key);
    if (callPhase === 'connected') {
      // In-call DTMF simulation
      return;
    }
    setNumber((prev) => prev + key);
  };

  // Clipboard paste
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = text.replace(/[^\d+*#]/g, '');
      if (cleaned) {
        setNumber((prev) => prev + cleaned);
      }
    } catch {
      // ignore clipboard error
    }
  };

  // Active call duration timer
  useEffect(() => {
    if (callPhase === 'connected') {
      setCallSeconds(0);
      timerRef.current = setInterval(() => {
        setCallSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callPhase]);

  // Call Initiation Mutation
  const callMutation = useMutation({
    mutationFn: async (payload) => {
      return await clinicApi.startDialerCall(payload);
    },
    onSuccess: (data) => {
      setLastCallResult(data?.call || null);
      qc.invalidateQueries({ queryKey: ['clinic'] });
      qc.invalidateQueries({ queryKey: ['/api/leads'] });
      refetchLeads();
      refetchHistory();
    },
    onError: (err) => {
      setCallPhase('error');
      setErrorMessage(err.message || 'Call dispatch failed.');
    },
  });

  // Start Call Handler
  const handleStartCall = async (targetNumber, targetLead) => {
    const destination = targetNumber || number;
    const finalLead = targetLead || matchedContact;

    if (!destination && !finalLead) {
      setErrorMessage('Please enter a phone number or select a contact.');
      return;
    }

    setErrorMessage('');
    setCallPhase('preparing');
    setLastCallResult(null);

    const docObj = DOCTORS.find((d) => d.id === doctor);
    const branchObj = branches.find((b) => b.name === branch);

    try {
      // 1. Immediately insert/dispatch call into PostgreSQL DB and Plivo telephony!
      const isMockMode = telephonyEngine === 'mock';
      const res = await callMutation.mutateAsync({
        destination: destination || finalLead?.phone,
        conversationType,
        doctor: docObj?.name,
        branch: branchObj?.name,
        leadId: finalLead?.id || null,
        engine: telephonyEngine,
        isMock: isMockMode,
        mockOutcome,
        durationSecs: 0,
      });

      const callRecord = res?.call;
      const callId = callRecord?.id;
      setActiveCallId(callId);
      setLastCallResult(callRecord);

      if (isMockMode) {
        setTimeout(() => setCallPhase('connecting'), 700);
        setTimeout(() => setCallPhase('ringing'), 1600);

        if (mockOutcome === 'connected') {
          setTimeout(() => {
            setCallPhase('connected');
          }, 3200);
        } else {
          setTimeout(async () => {
            setCallPhase('ended');
            if (callId) {
              await clinicApi.updateDialerCall(callId, {
                status: mockOutcome,
                durationSecs: 0,
              });
              refetchHistory();
            }
          }, 3800);
        }
      } else {
        // Live real call via Plivo (or Sarvam)
        setTimeout(() => setCallPhase('connecting'), 600);
        setTimeout(() => setCallPhase('ringing'), 1500);
        setTimeout(() => setCallPhase('connected'), 3500);
      }
    } catch (err) {
      setCallPhase('error');
      setErrorMessage(err.message || 'Call could not be placed.');
    }
  };

  // Hang Up Handler - Saves duration & full transcript in DB
  const handleHangup = async () => {
    const finalSeconds = callSeconds;
    setCallPhase('ended');

    const docObj = DOCTORS.find((d) => d.id === doctor);
    const branchObj = branches.find((b) => b.name === branch);

    const typeLabels = {
      patient_consultation: 'Patient Consultation',
      follow_up: 'Post-Treatment Follow-up',
      treatment_query: 'Treatment Inquiry',
      appointment_booking: 'Appointment Booking',
      payment_reminder: 'Package / Payment Reminder',
      general: 'General Front-Desk Inquiry',
    };
    const label = typeLabels[conversationType] || 'Clinical Consultation';

    const isMockMode = telephonyEngine === 'mock';
    const fullTranscript = isMockMode ? [
      { speaker: 'AI', text: `[Simulation] Hello! Thank you for speaking with Dr. Aditya Shah's Aura Laser & Cosmetic Clinic. I am Ria, your AI clinical coordinator.` },
      { speaker: 'Patient', text: `[Simulation] Hello! Yes, I was inquiring regarding ${label.toLowerCase()}.` },
      { speaker: 'AI', text: `[Simulation] Certainly! Our team will ensure you receive personalized care. I have updated your consultation notes for ${docObj?.name || 'the clinical team'} at ${branchObj?.name || 'Alkapuri Main'}.` },
      { speaker: 'Patient', text: '[Simulation] Thank you so much, that sounds wonderful.' },
      { speaker: 'AI', text: '[Simulation] You are most welcome! Have a wonderful day ahead.' }
    ] : [];

    const summary = isMockMode
      ? `[Simulation] Test call (${finalSeconds}s) regarding ${label.toLowerCase()}. Care assigned to ${docObj?.name || 'Clinic Team'} (${branchObj?.name || 'Alkapuri Main'}).`
      : `Plivo direct telephony call (${finalSeconds}s) regarding ${label.toLowerCase()}. Care assigned to ${docObj?.name || 'Clinic Team'} (${branchObj?.name || 'Alkapuri Main'}). Direct manual voice call.`;

    if (activeCallId) {
      try {
        const updateRes = await clinicApi.updateDialerCall(activeCallId, {
          status: 'completed',
          durationSecs: Math.max(finalSeconds, 5),
          // Never overwrite a real call's later recording transcript with an empty array.
          transcript: fullTranscript.length ? fullTranscript : undefined,
          summary: summary,
        });
        if (updateRes?.call) {
          setLastCallResult(updateRes.call);
        }
      } catch (e) {
        console.error('Failed to update call record:', e);
      }
      qc.invalidateQueries({ queryKey: ['clinic'] });
      refetchHistory();
      refetchLeads();
    }
  };

  // Quick Call from Leads Directory
  const handleQuickCallFromLead = (lead) => {
    setSelectedLead(lead);
    setNumber(lead.phone || '');
    setActiveTab('keypad');
    handleStartCall(lead.phone, lead);
  };

  // Add Contact Mutation
  const addContactMutation = useMutation({
    mutationFn: async (payload) => {
      return await clinicApi.addDialerContact(payload);
    },
    onSuccess: (data) => {
      setAddContactOpen(false);
      setContactForm({ name: '', phone: '', email: '' });
      setSelectedLead(data.lead);
      qc.invalidateQueries({ queryKey: ['clinic', 'dialer', 'leads'] });
      refetchLeads();
    },
  });

  const handleSaveContact = (e) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.phone.trim()) return;
    addContactMutation.mutate({
      name: contactForm.name.trim(),
      phone: contactForm.phone.trim(),
      email: contactForm.email.trim(),
      company: 'Aura Laser & Cosmetic Clinic',
      callId: lastCallResult?.id || null,
    });
  };

  // Filtered leads for directory
  const filteredLeads = useMemo(() => {
    return leads.filter((l) =>
      [l.first_name, l.last_name, l.phone, l.company, l.pipeline_stage].some((v) =>
        String(v || '').toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [leads, search]);

  const isBusy = ['preparing', 'connecting', 'ringing', 'connected'].includes(callPhase);

  if (userRole !== 'admin') {
    const displayContactName = matchedContact ? getContactDisplayName(matchedContact) : null;
    return (
      <div className="w-full h-full max-w-[440px] max-h-[670px] bg-white rounded-2xl border border-[#F3D9E5] shadow-sm p-3 sm:p-4 flex flex-col justify-between gap-2 overflow-hidden">
        {/* Number Display */}
        <div className="bg-[#FBF6F8] rounded-xl px-3 py-2.5 flex items-center gap-2 shrink-0 border border-[#F3D9E5]/60">
          <button
            type="button"
            onClick={handlePaste}
            title="Paste number"
            aria-label="Paste number"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-[#A4285E] hover:bg-white transition shrink-0"
          >
            <ClipboardPaste className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <input
              type="tel"
              value={number}
              onChange={(e) => {
                setNumber(e.target.value.replace(/[^\d+*#\s-]/g, ''));
                if (selectedLead) setSelectedLead(null);
              }}
              placeholder="Enter number"
              className="w-full bg-transparent text-center text-[20px] sm:text-[22px] font-semibold tracking-wide text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            <div className="text-[11px] text-slate-500 truncate mt-0.5">
              {displayContactName ? (
                <span className="font-semibold text-[#A4285E]">{displayContactName}</span>
              ) : (
                'Type or paste a number'
              )}
            </div>
          </div>
          <button
            type="button"
            onMouseDown={handleDownBack}
            onMouseUp={handleUpBack}
            onMouseLeave={handleUpBack}
            onTouchStart={handleDownBack}
            onTouchEnd={handleUpBack}
            onClick={handleClickBack}
            disabled={!number}
            title="Backspace (hold to clear)"
            aria-label="Backspace"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-[#A4285E] hover:bg-white disabled:opacity-35 transition shrink-0"
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Pills */}
        <div className="flex items-center justify-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/clinic/appointments')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#FBE9F1] text-[#A4285E] hover:bg-[#F7D6E6] transition"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Book</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !bookingAssist;
              setBookingAssist(next);
              setConversationType(next ? 'appointment_booking' : 'patient_consultation');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
            style={
              bookingAssist
                ? { background: '#EBF7F1', color: '#146C43' }
                : { background: '#F1F5F9', color: '#475569' }
            }
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Booking assist</span>
            <span className="font-bold">{bookingAssist ? 'On' : 'Off'}</span>
          </button>
        </div>

        {/* Type & Branch Selectors */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <label className="block bg-[#FBF6F8] rounded-xl px-2.5 py-1.5 border border-[#F3D9E5]/60">
            <span className="block text-[9.5px] font-bold uppercase tracking-wider text-[#A4285E]">
              Type *
            </span>
            <select
              value={conversationType}
              onChange={(e) => setConversationType(e.target.value)}
              className="w-full bg-transparent text-[12.5px] font-semibold text-slate-800 focus:outline-none truncate"
            >
              {CONVERSATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block bg-[#FBF6F8] rounded-xl px-2.5 py-1.5 border border-[#F3D9E5]/60">
            <span className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Branch
            </span>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full bg-transparent text-[12.5px] font-semibold text-slate-800 focus:outline-none truncate"
            >
              {branches.length === 0 ? (
                <option value="">Clinic default</option>
              ) : (
                branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        {/* 3x4 Keypad */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 flex-1 min-h-0">
          {KEYS.map(([digit, sub]) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeyPress(digit)}
              className="w-full h-full min-h-[42px] rounded-xl bg-[#FBF6F8] hover:bg-[#FBE9F1] active:scale-[0.98] border border-[#F3D9E5]/50 flex flex-col items-center justify-center transition select-none"
            >
              <span className="text-[20px] sm:text-[22px] font-semibold text-slate-900 leading-none">
                {digit}
              </span>
              {sub ? (
                <span className="text-[9px] font-semibold tracking-widest text-slate-400 mt-1 leading-none">
                  {sub}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Bottom Notice + Call Button */}
        <div className="flex items-center justify-between gap-2 pt-0.5 shrink-0">
          <div
            className="flex-1 min-w-0 rounded-xl px-2.5 py-2 flex items-center gap-2 text-[11px]"
            style={
              errorMessage
                ? { background: '#FEF2F2', color: '#B91C1C' }
                : isBusy
                  ? { background: '#FBE9F1', color: '#A4285E' }
                  : { background: '#EBF7F1', color: '#146C43' }
            }
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <div className="min-w-0 leading-tight">
              {errorMessage ? (
                <div className="font-semibold truncate">{errorMessage}</div>
              ) : isBusy ? (
                <>
                  <div className="font-semibold capitalize">
                    {callPhase === 'connected' ? `Connected · ${formatDuration(callSeconds)}` : `${callPhase}...`}
                  </div>
                  <div className="opacity-80 truncate">Live clinic call in progress</div>
                </>
              ) : (
                <>
                  <div className="font-semibold truncate">Recorded call · notice v1</div>
                  <div className="opacity-80 truncate">Press Call, then confirm.</div>
                </>
              )}
            </div>
          </div>

          {isBusy ? (
            <button
              type="button"
              onClick={handleHangup}
              className="shrink-0 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[13.5px] font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleStartCall()}
              disabled={callMutation.isPending}
              className="shrink-0 px-5 py-2.5 rounded-xl bg-[#A4285E] hover:bg-[#8E2050] disabled:opacity-50 text-white text-[13.5px] font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <Phone className="w-4 h-4" />
              <span>{callMutation.isPending ? 'Calling...' : 'Call'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="clinic-os">
      {/* Top Header */}
      <PageHead
        title="Dialer"
        subtitle="Direct click-to-call dialer for patient conversations. Calls are recorded and transcribed in call history."
      >
        <div className="co-row" style={{ gap: 8 }}>
          {/* Consistent Aura Pill Tabs for Dialer Navigation */}
          <div className="co-pill-tabs">
            <button
              type="button"
              className={`co-pill-tab ${activeTab === 'keypad' ? 'active' : ''}`}
              onClick={() => setActiveTab('keypad')}
            >
              <Phone size={13} /> Dial Keypad
            </button>
            <button
              type="button"
              className={`co-pill-tab ${activeTab === 'leads' ? 'active' : ''}`}
              onClick={() => setActiveTab('leads')}
            >
              <User size={13} /> Leads Directory <span className="co-pill-badge">{leads.length}</span>
            </button>
            <button
              type="button"
              className={`co-pill-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <Clock size={13} /> Call History
            </button>
            <button
              type="button"
              className={`co-pill-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Sliders size={13} /> Dialer Settings
            </button>
          </div>

          <button
            type="button"
            className="co-btn co-btn-sm"
            onClick={() => {
              refetchLeads();
              refetchHistory();
            }}
            disabled={leadsFetching}
            title="Refresh leads and call records"
          >
            <RefreshCw size={13} className={leadsFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </PageHead>

      {/* Main Tab Content */}
      {activeTab === 'keypad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Active Call HUD / State Machine Banner */}
          {isBusy && (
            <div
              className="co-card co-rise"
              style={{
                background: 'linear-gradient(135deg, #FFF6FA 0%, #FDF3F8 100%)',
                border: '2px solid #A4285E',
                boxShadow: '0 12px 30px -10px rgba(164, 40, 94, 0.25)',
              }}
            >
              <div className="co-spread" style={{ flexWrap: 'wrap', gap: 14 }}>
                <div className="co-row" style={{ gap: 14 }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #A4285E, #CB3273)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      boxShadow: '0 0 0 6px #FBE9F1',
                      animation: callPhase === 'ringing' ? 'pulse 1.5s infinite' : 'none',
                    }}
                  >
                    <PhoneCall size={24} />
                  </div>
                  <div>
                    <div className="co-row" style={{ gap: 8 }}>
                      <span className="co-strong" style={{ fontSize: 16 }}>
                        {matchedContact ? getContactDisplayName(matchedContact) : number || 'Active Call'}
                      </span>
                      <span
                        className="co-chip"
                        style={{
                          background: callPhase === 'connected' ? '#DCFCE7' : '#FEF3C7',
                          color: callPhase === 'connected' ? '#15803D' : '#B45309',
                        }}
                      >
                        {callPhase === 'connected' ? (
                          <>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }} />
                            Live · {formatDuration(callSeconds)}
                          </>
                        ) : (
                          <>
                            <span className="animate-spin" style={{ display: 'inline-block' }}>⏺</span>
                            {callPhase.toUpperCase()}…
                          </>
                        )}
                      </span>
                    </div>
                    <div className="co-xs co-mut" style={{ marginTop: 4 }}>
                      <span>Destination: <b>{number || matchedContact?.phone}</b></span> ·{' '}
                      <span>Doctor: <b>{DOCTORS.find((d) => d.id === doctor)?.name.split('(')[0]}</b></span> ·{' '}
                      <span>📞 Plivo Voice</span>
                    </div>
                  </div>
                </div>

                <div className="co-row" style={{ gap: 10 }}>
                  <button
                    type="button"
                    className="co-btn co-btn-sm"
                    onClick={() => setIsMuted(!isMuted)}
                    disabled={callPhase !== 'connected'}
                    style={{ background: isMuted ? '#FEE2E2' : '#fff', color: isMuted ? '#B91C1C' : 'inherit' }}
                  >
                    {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                    {isMuted ? 'Muted' : 'Mute'}
                  </button>

                  <button
                    type="button"
                    className="co-btn"
                    onClick={handleHangup}
                    style={{
                      background: '#DC2626',
                      borderColor: '#DC2626',
                      color: '#fff',
                      fontWeight: 700,
                      padding: '0 18px',
                    }}
                  >
                    <PhoneOff size={15} /> End Call
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Ended Call Banner */}
          {callPhase === 'ended' && (
            <div
              className="co-card co-rise"
              style={{
                background: '#FDF7FA',
                border: '1px solid #F3D9E5',
              }}
            >
              <div className="co-spread">
                <div className="co-row" style={{ gap: 12 }}>
                  <CheckCircle2 size={24} style={{ color: '#15803D' }} />
                  <div>
                    <div className="co-strong">Call Completed</div>
                    <div className="co-xs co-mut">
                      Duration: {formatDuration(callSeconds)} · Dialed: {number || matchedContact?.phone} ·{' '}
                      Outcome: {mockOutcome}
                    </div>
                  </div>
                </div>
                <div className="co-row" style={{ gap: 8 }}>
                  {lastCallResult?.id && (
                    <Link
                      href={`/clinic/call-review/${lastCallResult.id}`}
                      className="co-btn co-btn-sm co-btn-primary"
                    >
                      <ArrowUpRight size={13} /> View Call Review & Transcript
                    </Link>
                  )}
                  <button
                    type="button"
                    className="co-btn co-btn-sm"
                    onClick={() => {
                      setCallPhase('idle');
                      setCallSeconds(0);
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {callPhase === 'error' && errorMessage && (
            <div
              className="co-card co-rise"
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
              }}
            >
              <div className="co-spread">
                <div className="co-row" style={{ gap: 10 }}>
                  <AlertCircle size={20} />
                  <div className="co-sm font-medium">{errorMessage}</div>
                </div>
                <button
                  type="button"
                  className="co-btn co-btn-sm"
                  onClick={() => setCallPhase('idle')}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Two-Column Split Layout: Keypad on Left, Configuration & Details on Right */}
          <div className="co-split">
            {/* Left: Virtual Phone Dialpad */}
            <Card style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div className="co-label" style={{ marginBottom: 6 }}>Direct Phone Number</div>
                <div
                  style={{
                    position: 'relative',
                    background: '#FDF7FA',
                    border: '1px solid #F3D9E5',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <input
                    type="tel"
                    value={number}
                    onChange={(e) => {
                      setNumber(e.target.value);
                      setSelectedLead(null);
                    }}
                    placeholder="Enter phone number…"
                    disabled={isBusy}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      textAlign: 'center',
                      fontFamily: 'monospace, monospace',
                      fontSize: 24,
                      fontWeight: 700,
                      color: '#1E293B',
                      letterSpacing: '0.08em',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handlePaste}
                    title="Paste from clipboard"
                    className="co-btn co-btn-sm co-btn-ghost co-icon-btn"
                    style={{ position: 'absolute', right: 8 }}
                  >
                    <Copy size={13} />
                  </button>
                </div>

                {/* Real-time Debounced Contact Match Indicator */}
                <div style={{ minHeight: 28, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {matchedContact ? (
                    <div
                      className="co-chip co-c-p co-rise"
                      style={{ padding: '4px 10px', gap: 6, cursor: 'pointer' }}
                      onClick={() => setBookModalLead(matchedContact)}
                      title="Click to book appointment for this contact"
                    >
                      <User size={12} />
                      <span>Contact: <b>{getContactDisplayName(matchedContact)}</b></span>
                      {matchedContact.company && <span className="co-mut">({matchedContact.company})</span>}
                      <span style={{ textDecoration: 'underline', marginLeft: 4, fontSize: 11 }}>Book slot →</span>
                    </div>
                  ) : cleanedDigits.length >= 6 ? (
                    <div className="co-row" style={{ gap: 8 }}>
                      <span className="co-xs co-mut">Not in your contacts</span>
                      <button
                        type="button"
                        className="co-btn co-btn-sm"
                        style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                        onClick={() => {
                          setContactForm({ name: '', phone: number, email: '' });
                          setAddContactOpen(true);
                        }}
                      >
                        <UserPlus size={11} /> + Save to Leads
                      </button>
                    </div>
                  ) : (
                    <span className="co-xs co-mut">Type a number or select from leads</span>
                  )}
                </div>
              </div>

              {/* 12-Key Dialpad Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                  maxWidth: 320,
                  margin: '0 auto',
                }}
              >
                {KEYS.map(([digit, sub]) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleKeyPress(digit)}
                    disabled={isBusy && callPhase !== 'connected'}
                    className="co-btn"
                    style={{
                      height: 62,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 14,
                      background: '#fff',
                      border: '1px solid #F3D9E5',
                      boxShadow: '0 2px 4px rgba(164, 40, 94, 0.04)',
                      transition: 'all 0.18s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#FDF3F8';
                      e.currentTarget.style.borderColor = '#E4BED0';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.borderColor = '#F3D9E5';
                    }}
                  >
                    <span style={{ fontSize: 21, fontWeight: 700, lineHeight: 1, color: '#1E293B' }}>{digit}</span>
                    {sub ? (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#9CA3AF',
                          letterSpacing: '0.12em',
                          marginTop: 3,
                        }}
                      >
                        {sub}
                      </span>
                    ) : (
                      <span style={{ height: 12 }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Bottom Action Row: Clear / Call or Hangup / Backspace */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.6fr 1fr',
                  gap: 10,
                  maxWidth: 320,
                  margin: '14px auto 0',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  className="co-btn"
                  onClick={() => {
                    setNumber('');
                    setSelectedLead(null);
                  }}
                  disabled={isBusy || !number}
                  style={{ height: 48, borderRadius: 12, fontSize: 12, fontWeight: 600 }}
                  title="Clear number"
                >
                  Clear
                </button>

                {isBusy ? (
                  <button
                    type="button"
                    className="co-btn"
                    onClick={handleHangup}
                    style={{
                      height: 48,
                      borderRadius: 12,
                      background: '#DC2626',
                      borderColor: '#DC2626',
                      color: '#fff',
                      fontWeight: 700,
                      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                    }}
                  >
                    <PhoneOff size={16} /> Hang Up
                  </button>
                ) : (
                  <button
                    type="button"
                    className="co-btn co-btn-primary"
                    onClick={() => handleStartCall(number, matchedContact)}
                    disabled={!number.trim() && !matchedContact}
                    style={{
                      height: 48,
                      borderRadius: 12,
                      fontSize: 14,
                      fontWeight: 700,
                      gap: 8,
                    }}
                  >
                    <PhoneCall size={16} /> Call
                  </button>
                )}

                <button
                  type="button"
                  onPointerDown={handleDownBack}
                  onPointerUp={handleUpBack}
                  onPointerLeave={handleUpBack}
                  onClick={handleClickBack}
                  disabled={isBusy || !number}
                  className="co-btn"
                  style={{ height: 48, borderRadius: 12 }}
                  title="Backspace (Hold to clear all)"
                >
                  <Delete size={17} />
                </button>
              </div>
            </Card>

            {/* Right: Phone Line Status & Recent Calls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {settingsData?.plivoConfigured ? (
                <div
                  className="co-card"
                  style={{
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    padding: '12px 16px',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div className="co-row" style={{ gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
                    <span className="co-sm" style={{ color: '#15803D', fontWeight: 600 }}>
                      Plivo Line Active ({settingsData.plivoCallerId || '+918065587555'})
                    </span>
                  </div>
                  <span className="co-xs co-mut">Outbound Calling Ready</span>
                </div>
              ) : (
                <div
                  className="co-card"
                  style={{
                    background: '#FEF3C7',
                    border: '1px solid #FDE68A',
                    padding: '12px 16px',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div className="co-row" style={{ gap: 8, color: '#92400E' }}>
                    <AlertCircle size={16} />
                    <span className="co-sm" style={{ fontWeight: 600 }}>Plivo not configured yet</span>
                  </div>
                  <button
                    type="button"
                    className="co-btn co-btn-sm"
                    style={{ height: 26, fontSize: 11 }}
                    onClick={() => setActiveTab('settings')}
                  >
                    Configure Now →
                  </button>
                </div>
              )}

              {/* Recent Outbound Calls Snapshot */}
              <Card>
                <div className="co-spread" style={{ marginBottom: 12 }}>
                  <CardHead title="Recent Calls" hint={`${recentCalls.length} logged`} />
                  <div className="co-row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="co-btn co-btn-sm co-btn-ghost"
                      onClick={() => syncPlivoMutation.mutate()}
                      disabled={syncPlivoMutation.isPending}
                      title="Sync calls from Plivo"
                    >
                      <RefreshCw size={12} className={syncPlivoMutation.isPending ? 'animate-spin' : ''} />
                      {syncPlivoMutation.isPending ? 'Syncing…' : 'Sync Plivo'}
                    </button>
                    <button
                      type="button"
                      className="co-btn co-btn-sm co-btn-ghost"
                      onClick={() => setActiveTab('history')}
                    >
                      View All →
                    </button>
                  </div>
                </div>

                {syncPlivoMsg ? (
                  <div className="co-xs" style={{ marginBottom: 10, color: '#15803D', fontWeight: 600 }}>
                    {syncPlivoMsg}
                  </div>
                ) : null}

                {recentCalls.length === 0 ? (
                  <div className="co-empty" style={{ padding: '24px 0' }}>
                    <div className="co-empty-title">No recent calls</div>
                    <div className="co-sm co-mut">Enter a number and press Call to place your first conversation.</div>
                  </div>
                ) : (
                  <div className="co-list">
                    {recentCalls.slice(0, 8).map((c) => (
                      <div key={c.id} className="co-list-item" style={{ padding: '10px 0' }}>
                        <div className="co-spread" style={{ width: '100%' }}>
                          <div>
                            <div className="co-strong" style={{ fontSize: 13 }}>
                              {c.lead_name || c.to_phone || 'Patient'}
                            </div>
                            <div className="co-row" style={{ gap: 8, marginTop: 2 }}>
                              <span className="co-xs co-mut">{c.to_phone}</span>
                              <span
                                className="co-chip"
                                style={{
                                  fontSize: 10,
                                  padding: '1px 6px',
                                  background: c.status === 'completed' ? '#DCFCE7' : '#FEE2E2',
                                  color: c.status === 'completed' ? '#15803D' : '#B91C1C',
                                }}
                              >
                                {c.status}
                              </span>
                              <span className="co-xs co-mut">{formatDuration(c.duration_secs)}</span>
                              {c.started_at && (
                                <span className="co-xs co-mut">· {new Date(c.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              )}
                            </div>
                          </div>
                          <div className="co-row" style={{ gap: 6 }}>
                            <button
                              type="button"
                              className="co-btn co-btn-sm co-icon-btn"
                              title="Redial this number"
                              onClick={() => {
                                setNumber(c.to_phone || '');
                                setSelectedLead(null);
                              }}
                            >
                              <Phone size={12} />
                            </button>
                            <Link
                              href={`/clinic/call-review/${c.id}`}
                              className="co-btn co-btn-sm co-btn-ghost"
                              title="Review Call Transcript"
                            >
                              Transcript
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Leads Directory Tab */}
      {activeTab === 'leads' && (
        <Card>
          <div className="co-spread" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ position: 'relative', width: 340, maxWidth: '100%' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#9CA3AF' }} />
              <input
                className="co-input"
                style={{ paddingLeft: 34 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads by name, phone, stage…"
              />
            </div>
            <div className="co-row" style={{ gap: 8 }}>
              <button
                type="button"
                className="co-btn co-btn-sm"
                onClick={() => {
                  setContactForm({ name: '', phone: '', email: '' });
                  setAddContactOpen(true);
                }}
              >
                <Plus size={13} /> Add Patient / Lead
              </button>
              <Link href="/leads" className="co-btn co-btn-sm co-btn-ghost">
                Open CRM Leads →
              </Link>
            </div>
          </div>

          {leadsLoading ? (
            <Spinner label="Loading clinic leads directory…" />
          ) : filteredLeads.length === 0 ? (
            <EmptyState title="No matching leads found">
              <p className="co-sm co-mut" style={{ marginTop: 6 }}>
                Add phone numbers to your leads or create a new lead to start dialing.
              </p>
              <button
                type="button"
                className="co-btn co-btn-primary"
                style={{ marginTop: 14 }}
                onClick={() => setAddContactOpen(true)}
              >
                <Plus size={13} /> Add Patient
              </button>
            </EmptyState>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              }}
            >
              {filteredLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="co-card"
                  style={{
                    border: '1px solid #F3D9E5',
                    transition: 'transform 0.18s, border-color 0.18s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#CB3273';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#F3D9E5';
                  }}
                >
                  <div className="co-spread">
                    <div className="co-row" style={{ gap: 12 }}>
                      <Avatar first={lead.first_name} last={lead.last_name} size="md" />
                      <div>
                        <div className="co-strong" style={{ fontSize: 14 }}>{getContactDisplayName(lead)}</div>
                        <div className="co-row" style={{ gap: 8, marginTop: 2 }}>
                          <span className="co-xs co-mut"><Phone size={10} /> {lead.phone}</span>
                          {lead.pipeline_stage && (
                            <span className="co-chip co-c-p" style={{ fontSize: 10, padding: '1px 6px' }}>
                              {lead.pipeline_stage}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="co-row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="co-btn co-btn-sm co-btn-primary"
                        onClick={() => handleQuickCallFromLead(lead)}
                        title="Dial this lead immediately"
                      >
                        <PhoneCall size={12} /> Call
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Call History Tab */}
      {activeTab === 'history' && (
        <Card>
          <div className="co-spread" style={{ marginBottom: 14 }}>
            <CardHead title="Dialer Call History" hint={`${recentCalls.length} recorded calls`} />
            <div className="co-row" style={{ gap: 8 }}>
              <button
                type="button"
                className="co-btn co-btn-primary co-btn-sm"
                onClick={() => syncPlivoMutation.mutate()}
                disabled={syncPlivoMutation.isPending}
              >
                <RefreshCw size={12} className={syncPlivoMutation.isPending ? 'animate-spin' : ''} />
                {syncPlivoMutation.isPending ? 'Syncing Plivo Calls…' : 'Sync Plivo Calls'}
              </button>
              <button
                type="button"
                className="co-btn co-btn-sm"
                onClick={() => refetchHistory()}
                disabled={historyLoading}
              >
                <RefreshCw size={12} className={historyLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {syncPlivoMsg ? (
            <div className="co-xs" style={{ marginBottom: 12, padding: '8px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, color: '#15803D', fontWeight: 600 }}>
              {syncPlivoMsg}
            </div>
          ) : null}

          {historyLoading ? (
            <Spinner label="Loading call records…" />
          ) : recentCalls.length === 0 ? (
            <EmptyState title="No calls recorded yet">
              <p className="co-sm co-mut" style={{ marginTop: 6 }}>
                Calls placed from this dialer will appear here with recording playbacks and transcripts.
              </p>
              <button
                type="button"
                className="co-btn co-btn-primary"
                style={{ marginTop: 14 }}
                onClick={() => setActiveTab('keypad')}
              >
                <PhoneCall size={13} /> Open Keypad
              </button>
            </EmptyState>
          ) : (
            <div className="co-table-wrap">
              <table className="co-table">
                <thead>
                  <tr>
                    <th>Patient / Contact</th>
                    <th>Destination Phone</th>
                    <th>Provider</th>
                    <th>Type</th>
                    <th>Outcome</th>
                    <th>Duration</th>
                    <th>Started At</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalls.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="co-row" style={{ gap: 8 }}>
                          <Avatar first={c.lead_name || 'P'} size="sm" />
                          <div>
                            <div className="co-strong">{c.lead_name || 'Patient'}</div>
                            {c.company_name && <div className="co-xs co-mut">{c.company_name}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-xs">{c.to_phone || '—'}</span>
                      </td>
                      <td>
                        <span
                          className="co-chip"
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            background: c.provider === 'plivo' ? '#F0FDF4' : '#EFF6FF',
                            color: c.provider === 'plivo' ? '#15803D' : '#1D4ED8',
                            border: c.provider === 'plivo' ? '1px solid #BBF7D0' : '1px solid #BFDBFE',
                            fontWeight: 600,
                          }}
                        >
                          {c.provider === 'plivo' ? 'Plivo' : (c.provider || 'Plivo')}
                        </span>
                      </td>
                      <td>
                        <span className="co-chip co-c-n" style={{ textTransform: 'capitalize' }}>
                          {(c.booking_type || c.direction || 'call').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span
                          className="co-chip"
                          style={{
                            background: c.status === 'completed' ? '#DCFCE7' : '#FEE2E2',
                            color: c.status === 'completed' ? '#15803D' : '#B91C1C',
                            textTransform: 'capitalize',
                          }}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td>{formatDuration(c.duration_secs)}</td>
                      <td className="co-xs co-mut">
                        {c.started_at ? dateLabel(c.started_at) + ' · ' + timeLabel(c.started_at) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="co-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          <button
                            type="button"
                            className="co-btn co-btn-sm"
                            title="Redial number"
                            onClick={() => {
                              setNumber(c.to_phone || '');
                              setSelectedLead(null);
                              setActiveTab('keypad');
                            }}
                          >
                            <Phone size={12} /> Redial
                          </button>
                          <Link
                            href={`/clinic/call-review/${c.id}`}
                            className="co-btn co-btn-sm co-btn-ghost"
                          >
                            Review →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <Card>
          <CardHead
            title="Dialer & Telephony Configuration"
            hint="Manage Plivo credentials, caller ID, and real calling settings"
          />

          <div style={{ maxWidth: 640, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                background: settingsData?.plivoConfigured ? '#DCFCE7' : '#FEF3C7',
                border: `1px solid ${settingsData?.plivoConfigured ? '#86EFAC' : '#FDE68A'}`,
                borderRadius: 10,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: settingsData?.plivoConfigured ? '#BBF7D0' : '#FDE68A',
                  color: settingsData?.plivoConfigured ? '#15803D' : '#B45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <PhoneCall size={20} />
              </div>
              <div>
                <div className="co-strong" style={{ fontSize: 14 }}>
                  {settingsData?.plivoConfigured ? 'Plivo Real Outbound Telephony is Active' : 'Plivo Telephony Not Configured Yet'}
                </div>
                <div className="co-xs co-mut" style={{ marginTop: 2 }}>
                  {settingsData?.plivoConfigured
                    ? `Active Caller ID: ${settingsData.plivoCallerId}. Real calls dialed through keypad will ring on patient devices.`
                    : 'To make real phone calls that ring on your patient\'s device, enter your Plivo Auth ID, Auth Token, and Plivo Caller ID below.'}
                </div>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveSettingsMutation.mutate({
                  plivoAuthId: plivoForm.authId.trim() || undefined,
                  plivoAuthToken: plivoForm.authToken.trim() || undefined,
                  plivoCallerId: plivoForm.callerId.trim() || undefined,
                });
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div className="co-field">
                <label className="co-label">Plivo Auth ID *</label>
                <input
                  className="co-input"
                  placeholder="e.g. MAMZ..."
                  value={plivoForm.authId}
                  onChange={(e) => setPlivoForm({ ...plivoForm, authId: e.target.value })}
                />
                <span className="co-xs co-mut">Find this in your Plivo Console Overview.</span>
              </div>

              <div className="co-field">
                <label className="co-label">Plivo Auth Token *</label>
                <input
                  type="password"
                  className="co-input"
                  placeholder="Enter Plivo Auth Token"
                  value={plivoForm.authToken}
                  onChange={(e) => setPlivoForm({ ...plivoForm, authToken: e.target.value })}
                />
                <span className="co-xs co-mut">Your secret Plivo authentication token.</span>
              </div>

              <div className="co-field">
                <label className="co-label">Plivo Phone Number (Caller ID) *</label>
                <input
                  className="co-input"
                  placeholder="e.g. +918347844617 or +1931..."
                  value={plivoForm.callerId}
                  onChange={(e) => setPlivoForm({ ...plivoForm, callerId: e.target.value })}
                />
                <span className="co-xs co-mut">
                  Must be an active, voice-enabled phone number rented in your Plivo Console.
                </span>
              </div>

              {settingsSaved && (
                <div className="co-chip co-c-g" style={{ alignSelf: 'flex-start', padding: '6px 12px' }}>
                  <Check size={13} /> Plivo settings saved successfully! Real calls enabled.
                </div>
              )}

              {saveSettingsMutation.isError && (
                <p className="co-sm" style={{ color: '#B91C1C' }}>
                  {saveSettingsMutation.error?.message || 'Failed to save settings'}
                </p>
              )}

              <div className="co-row" style={{ gap: 10, marginTop: 8 }}>
                <button
                  type="submit"
                  className="co-btn co-btn-primary"
                  disabled={saveSettingsMutation.isPending}
                >
                  {saveSettingsMutation.isPending ? 'Saving…' : 'Save Plivo Settings'}
                </button>
                <button
                  type="button"
                  className="co-btn"
                  onClick={() => setActiveTab('keypad')}
                >
                  Back to Keypad
                </button>
              </div>
            </form>
          </div>
        </Card>
      )}

      {/* Add Contact Modal */}
      {addContactOpen && (
        <Modal
          title="Save to Contacts"
          subtitle="Add this number as a new clinic patient lead"
          onClose={() => setAddContactOpen(false)}
        >
          <form onSubmit={handleSaveContact} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="co-field">
              <label className="co-label">Full Name *</label>
              <input
                className="co-input"
                required
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="e.g. Ramesh Patel"
                autoFocus
              />
            </div>

            <div className="co-field">
              <label className="co-label">Phone Number *</label>
              <input
                className="co-input"
                required
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                placeholder="+91 …"
              />
            </div>

            <div className="co-field">
              <label className="co-label">Email (Optional)</label>
              <input
                className="co-input"
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                placeholder="ramesh@example.com"
              />
            </div>

            <div className="co-row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="co-btn"
                onClick={() => setAddContactOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="co-btn co-btn-primary"
                disabled={addContactMutation.isPending}
              >
                {addContactMutation.isPending ? 'Saving…' : 'Save Patient'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Quick Book Appointment Modal */}
      {bookModalLead && (
        <Modal
          title={`Book Appointment for ${getContactDisplayName(bookModalLead)}`}
          subtitle={bookModalLead.phone}
          onClose={() => setBookModalLead(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="co-field">
              <label className="co-label">Patient Name</label>
              <input className="co-input" value={getContactDisplayName(bookModalLead)} readOnly />
            </div>

            <div className="co-field">
              <label className="co-label">Treatment</label>
              <input
                className="co-input"
                id="dialer-book-treatment"
                defaultValue="Laser Hair Reduction Consultation"
              />
            </div>

            <div className="co-form-grid">
              <div className="co-field">
                <label className="co-label">Date</label>
                <input
                  type="date"
                  className="co-input"
                  id="dialer-book-date"
                  defaultValue={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="co-field">
                <label className="co-label">Time</label>
                <input
                  type="time"
                  className="co-input"
                  id="dialer-book-time"
                  defaultValue="11:00"
                />
              </div>
            </div>

            <div className="co-row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="co-btn"
                onClick={() => setBookModalLead(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="co-btn co-btn-primary"
                onClick={async () => {
                  const treatmentEl = document.getElementById('dialer-book-treatment');
                  const dateEl = document.getElementById('dialer-book-date');
                  const timeEl = document.getElementById('dialer-book-time');
                  const treatment = treatmentEl?.value || 'Consultation';
                  const dateStr = dateEl?.value || new Date().toISOString().split('T')[0];
                  const timeStr = timeEl?.value || '11:00';
                  const startsAt = new Date(`${dateStr}T${timeStr}:00`).toISOString();

                  await clinicApi.createAppointment({
                    lead_id: bookModalLead.id,
                    patient_name: getContactDisplayName(bookModalLead),
                    phone: bookModalLead.phone,
                    treatment,
                    branch: 'Alkapuri Main Clinic',
                    starts_at: startsAt,
                    duration_min: 45,
                    status: 'booked',
                  });
                  qc.invalidateQueries({ queryKey: ['clinic'] });
                  setBookModalLead(null);
                }}
              >
                Confirm Appointment
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
