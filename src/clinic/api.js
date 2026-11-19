/** Thin fetch wrapper for the additive Clinic OS endpoints. */
const BASE = '/api/clinic';

/** Wrapper for /api/ai-calls endpoints (not under /api/clinic) */
const AI_CALLS_BASE = '/api/ai-calls';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  let payload = null;
  try { payload = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const message = payload?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload;
}

export const clinicApi = {
  overview: (date, branch) => request(`/overview${date || branch ? `?${[date ? `date=${encodeURIComponent(date)}` : '', branch ? `branch=${encodeURIComponent(branch)}` : ''].filter(Boolean).join('&')}` : ''}`),
  journeyStats: (branch) => request(`/journey-stats${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`),
  appointments: (from, to, all = false, branch) => request(`/appointments?${all ? 'all=true' : `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}${branch ? `&branch=${encodeURIComponent(branch)}` : ''}`),
  syncAppointments: () => request('/appointments/sync', { method: 'POST' }),
  createAppointment: (body) => request('/appointments', { method: 'POST', body: JSON.stringify(body) }),
  updateAppointment: (id, body) => request(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAppointment: (id) => request(`/appointments/${id}`, { method: 'DELETE' }),
  appointmentCalls: (id, type = 'clinic', phone) => request(`/appointments/${id}/calls?type=${type}${phone ? `&phone=${encodeURIComponent(phone)}` : ''}`),
  linkAppointmentCall: (id, callId, type = 'clinic') => request(`/appointments/${id}/link-call`, { method: 'POST', body: JSON.stringify({ callId, type }) }),

  patients: (search, branch) => request(`/patients${search || branch ? `?${[search ? `search=${encodeURIComponent(search)}` : '', branch ? `branch=${encodeURIComponent(branch)}` : ''].filter(Boolean).join('&')}` : ''}`),
  patient: (id) => request(`/patients/${id}`),
  createPatient: (body) => request('/patients', { method: 'POST', body: JSON.stringify(body) }),
  deletePatient: (id) => request(`/patients/${id}`, { method: 'DELETE' }),
  updatePatientStage: (id, stage) => request(`/patients/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) }),
  convertLead: (id, stage) => request(`/patients/convert-lead/${id}`, { method: 'POST', body: JSON.stringify({ stage }) }),

  addNote: (body) => request('/notes', { method: 'POST', body: JSON.stringify(body) }),

  tasks: () => request('/tasks'),
  createTask: (body) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  setTaskStatus: (id, status) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  createPackage: (body) => request('/packages', { method: 'POST', body: JSON.stringify(body) }),
  useSession: (id) => request(`/packages/${id}/use`, { method: 'POST', body: '{}' }),

  seedDemo: () => request('/seed-demo', { method: 'POST', body: '{}' }),

  // Settings
  getSettings: () => request('/settings'),
  saveSettings: (body) => request('/settings', { method: 'PUT', body: JSON.stringify(body) }),

  // Playbooks
  playbooks: () => request('/playbooks'),
  createPlaybook: (body) => request('/playbooks', { method: 'POST', body: JSON.stringify(body) }),
  updatePlaybook: (id, body) => request(`/playbooks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePlaybook: (id) => request(`/playbooks/${id}`, { method: 'DELETE' }),
  testPlaybook: (id, body) => request(`/playbooks/${id}/test`, { method: 'POST', body: JSON.stringify(body) }),

  // Reviews
  reviews: () => request('/reviews'),
  syncGoogleReviews: (restart = false) => request('/reviews/sync-google', { method: 'POST', body: JSON.stringify({ restart }) }),
  createReview: (body) => request('/reviews', { method: 'POST', body: JSON.stringify(body) }),
  replyReview: (id, reply) => request(`/reviews/${id}/reply`, { method: 'PATCH', body: JSON.stringify({ reply }) }),

  // Retention
  retention: (days) => request(`/retention${days ? `?days=${days}` : ''}`),

  // Campaigns (Aura)
  campaigns: () => request('/campaigns'),

  // Reports
  reports: (from, to) => request(`/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // Audit
  audit: () => request('/audit'),

  // Inbox with pagination support (before, channel, limit)
  inbox: (limit = 100, before = null, channel = null) => {
    const p = new URLSearchParams();
    if (limit) p.set('limit', String(limit));
    if (before) p.set('before', typeof before === 'string' ? before : new Date(before).toISOString());
    if (channel && channel !== 'all') p.set('channel', String(channel));
    const qs = p.toString();
    return request(`/inbox${qs ? `?${qs}` : ''}`);
  },
  inboxThread: (type, id, leadId, phone) =>
    request(`/inbox/thread?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}${leadId ? `&leadId=${encodeURIComponent(leadId)}` : ''}${phone ? `&phone=${encodeURIComponent(phone)}` : ''}`),
  inboxReply: (body) => request('/inbox/reply', { method: 'POST', body: JSON.stringify(body) }),
  inboxSync: () => request('/inbox/sync', { method: 'POST' }),

  // AI Calls Sync (reliability fallback for Sarvam calls)
  aiCallsSync: () => fetch(`${AI_CALLS_BASE}/sync`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }).then(async res => {
    let payload = null;
    try { payload = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
    return payload;
  }),

  // Dialer
  dialerLeads: (branch) => request(`/dialer/leads${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`),
  startDialerCall: (body) => request('/dialer/call', { method: 'POST', body: JSON.stringify(body) }),
  updateDialerCall: (id, body) => request(`/dialer/call/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addDialerContact: (body) => request('/dialer/contact', { method: 'POST', body: JSON.stringify(body) }),
  dialerSettings: () => request('/dialer/settings'),
  saveDialerSettings: (body) => request('/dialer/settings', { method: 'POST', body: JSON.stringify(body) }),

  // Call review
  callReviews: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.provider && params.provider !== 'all') qs.set('provider', params.provider);
    if (params.direction && params.direction !== 'all') qs.set('direction', params.direction);
    if (params.search) qs.set('search', params.search);
    if (params.branch) qs.set('branch', params.branch);
    const qStr = qs.toString();
    return request(`/call-review${qStr ? `?${qStr}` : ''}`);
  },
  callReview: (id) => request(`/call-review/${id}`),
  transcribeCall: (id) => request(`/call-review/${id}/transcribe`, { method: 'POST' }),

  // Visits
  visits: (leadId) => request(`/visits${leadId ? `?leadId=${encodeURIComponent(leadId)}` : ''}`),
  createVisit: (body) => request('/visits', { method: 'POST', body: JSON.stringify(body) }),
  updateVisit: (id, body) => request(`/visits/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteVisit: (id) => request(`/visits/${id}`, { method: 'DELETE' }),

  // Agents
  agents: () => request('/agents'),
};

export const money = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

export const initials = (first, last) => {
  const f = (first || '').trim().replace(/^[^a-zA-Z0-9]+/, '');
  const l = (last || '').trim().replace(/^[^a-zA-Z0-9]+/, '');
  const a = f[0] || '';
  const b = l[0] || '';
  return (a + b).toUpperCase() || (f ? f.slice(0, 2).toUpperCase() : '?');
};

import { cleanEnglishName, cleanEnglishTreatment, transliterateIndic } from '@/lib/utils';
export { cleanEnglishName, cleanEnglishTreatment, transliterateIndic };

export const fullName = (p) =>
  cleanEnglishName([p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || p?.patient_name || p?.name || 'Patient');

export const timeLabel = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
};

export const dateLabel = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
};

export const datetimeLabel = (value) => {
  if (!value) return '';
  return `${dateLabel(value)} · ${timeLabel(value)}`;
};

/**
 * Format timestamp matching Meta Business Suite (e.g. "Sat 08:48", "Sun 13:31", "Mon 11:36")
 * in Asia/Kolkata timezone
 */
export const formatMetaTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return `${weekday} ${time}`;
};
