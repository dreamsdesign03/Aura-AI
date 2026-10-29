/** Thin fetch wrapper for the additive Clinic OS endpoints. */
const BASE = '/api/clinic';

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
  overview: (date) => request(`/overview${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  appointments: (from, to) => request(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createAppointment: (body) => request('/appointments', { method: 'POST', body: JSON.stringify(body) }),
  updateAppointment: (id, body) => request(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAppointment: (id) => request(`/appointments/${id}`, { method: 'DELETE' }),

  patients: (search) => request(`/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  patient: (id) => request(`/patients/${id}`),

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

  // Reviews
  reviews: () => request('/reviews'),
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

  // Inbox
  inbox: (limit) => request(`/inbox${limit ? `?limit=${limit}` : ''}`),

  // Dialer
  dialerLeads: () => request('/dialer/leads'),
  startDialerCall: (body) => request('/dialer/call', { method: 'POST', body: JSON.stringify(body) }),
  addDialerContact: (body) => request('/dialer/contact', { method: 'POST', body: JSON.stringify(body) }),

  // Call review
  callReviews: () => request('/call-review'),
  callReview: (id) => request(`/call-review/${id}`),

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
  const a = (first || '').trim()[0] || '';
  const b = (last || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
};

export const fullName = (p) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || p?.patient_name || p?.name || 'Patient';

export const timeLabel = (value) =>
  new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

export const dateLabel = (value) =>
  new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export const datetimeLabel = (value) =>
  `${dateLabel(value)} · ${timeLabel(value)}`;
