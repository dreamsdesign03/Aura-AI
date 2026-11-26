import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PhoneIncoming, PhoneOutgoing, RefreshCw, Search, Loader2,
  ChevronDown, ChevronRight, Play, CheckCircle2, Clock, Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { useIsAdmin } from '@/contexts/AuthContext';

const SOURCE_META = {
  all: { label: 'All calls' },
  bulk: { label: 'Bulk outbound', className: 'bg-pink-50 text-pink-700 border-pink-200' },
  dialer: { label: 'Dialer', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  inbound: { label: 'Inbound', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  single: { label: 'Direct outbound', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const TYPE_META = {
  marketing_sales: {
    label: 'Marketing & Sales',
    dot: 'bg-blue-500',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  patient_consultation: {
    label: 'Patient Consultation',
    dot: 'bg-emerald-500',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  customer_care: {
    label: 'Customer Care',
    dot: 'bg-amber-500',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

const SOURCE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'bulk', label: 'Bulk outbound' },
  { id: 'dialer', label: 'Dialer' },
  { id: 'inbound', label: 'Inbound' },
];

const TYPE_TABS = [
  { id: 'all', label: 'All types' },
  { id: 'marketing_sales', label: 'Marketing & Sales' },
  { id: 'patient_consultation', label: 'Patient Consultation' },
  { id: 'customer_care', label: 'Customer Care' },
];

function fmtDuration(secs) {
  const s = Number(secs) || 0;
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function turnText(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.en_text || t.content || t.text || t.transcript || '';
}

function isUserTurn(t) {
  const role = (t?.role || t?.speaker || '').toLowerCase();
  return role === 'user' || role === 'customer' || role === 'patient';
}

function isSystemTurn(t) {
  const role = (t?.role || t?.speaker || '').toLowerCase();
  return role === 'system';
}

export default function AllConversations() {
  const [source, setSource] = useState('all');
  const [type, setType] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ conversations: [], counts: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(null);
  const [syncingPlivo, setSyncingPlivo] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const abortRef = useRef(null);

  // Debounce the search box.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (source !== 'all') qs.set('source', source);
      if (type !== 'all') qs.set('type', type);
      if (search) qs.set('search', search);

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch(`/api/bulk-calling/conversations?${qs.toString()}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData({
        conversations: Array.isArray(json.conversations) ? json.conversations : [],
        counts: json.counts || { total: 0, by_type: {}, by_source: {} },
      });
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Could not load conversations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [source, type, search]);

  useEffect(() => { load(); }, [load]);

  // Keep the feed fresh while the tab is open.
  useEffect(() => {
    const id = setInterval(() => load({ quiet: true }), 20000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async (row) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (details[row.id]) return;
    setLoadingDetail(row.id);
    try {
      const res = await fetch(`/api/bulk-calling/conversations/${row.id}`, { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setDetails((prev) => ({ ...prev, [row.id]: json.conversation }));
    } catch (err) {
      setDetails((prev) => ({ ...prev, [row.id]: { error: err.message } }));
    } finally {
      setLoadingDetail(null);
    }
  };

  const counts = data.counts || {};
  const byType = counts.by_type || {};
  const bySource = counts.by_source || {};
  const total = counts.total || 0;

  const summary = useMemo(() => ([
    { id: 'marketing_sales', label: 'Marketing & Sales', value: byType.marketing_sales || 0, meta: TYPE_META.marketing_sales },
    { id: 'patient_consultation', label: 'Patient Consultation', value: byType.patient_consultation || 0, meta: TYPE_META.patient_consultation },
    { id: 'customer_care', label: 'Customer Care', value: byType.customer_care || 0, meta: TYPE_META.customer_care },
  ]), [byType]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="aura-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Conversations</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{loading && !data.counts ? '—' : total}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Bulk · Dialer · Inbound</div>
        </div>
        {summary.map((s) => (
          <div key={s.id} className="aura-card p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <span className={`w-2 h-2 rounded-full ${s.meta.dot}`} />
              {s.label}
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{loading && !data.counts ? '—' : s.value}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">classified from transcript</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="aura-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {SOURCE_TABS.map((tab) => {
            const active = source === tab.id;
            const count = tab.id === 'all' ? total : (bySource[tab.id] || 0);
            return (
              <button
                key={tab.id}
                onClick={() => setSource(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  active
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 ${active ? 'text-gray-300' : 'text-gray-400'}`}>{loading && !data.counts ? '—' : count}</span>
              </button>
            );
          })}

          <div className="flex-1" />

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, phone, transcript…"
              className="w-64 pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
          </div>

          <button
            onClick={async () => {
              setSyncingPlivo(true);
              setSyncMessage('');
              try {
                const response = await fetch('/api/bulk-calling/conversations/sync-plivo', { method: 'POST', credentials: 'include' });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
                setSyncMessage(`Plivo checked ${result.checked || 0} calls · ${result.imported || 0} new calls added${result.recordingsFound ? ` · ${result.recordingsFound} recordings found` : ''}.`);
                await load({ quiet: true });
              } catch (err) {
                setSyncMessage(err.message || 'Plivo sync failed');
              } finally {
                setSyncingPlivo(false);
              }
            }}
            disabled={syncingPlivo}
            className="inline-flex items-center gap-2 px-3 py-2 border border-pink-200 rounded-lg text-xs font-semibold text-pink-700 bg-pink-50 hover:bg-pink-100 disabled:opacity-50"
            title="Import recent Plivo call history"
          >
            {syncingPlivo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncingPlivo ? 'Syncing Plivo…' : 'Sync Plivo'}
          </button>
          <button
            onClick={() => load({ quiet: true })}
            disabled={refreshing}
            className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
          {TYPE_TABS.map((tab) => {
            const active = type === tab.id;
            const meta = tab.id === 'all' ? null : TYPE_META[tab.id];
            const count = tab.id === 'all' ? total : (byType[tab.id] || 0);
            return (
              <button
                key={tab.id}
                onClick={() => setType(tab.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                  active
                    ? (meta ? meta.className : 'bg-gray-900 text-white border-gray-900')
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {tab.label}
                <span className="ml-1 opacity-60">{loading && !data.counts ? '—' : count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {syncMessage && (
        <div className="bg-pink-50 border border-pink-200 text-pink-800 text-xs font-medium rounded-xl px-4 py-3">{syncMessage}</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="aura-card p-12 flex justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : data.conversations.length === 0 ? (
        <div className="aura-card p-16 text-center">
          <Sparkles className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <h3 className="text-gray-900 font-bold mb-1">No conversations found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Inbound, dialer, and bulk-outbound calls with transcripts will appear here automatically,
            classified as Marketing &amp; Sales, Patient Consultation, or Customer Care.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.conversations.map((c) => (
            <ConversationCard
              key={c.id}
              conversation={c}
              expanded={expandedId === c.id}
              detail={details[c.id]}
              loadingDetail={loadingDetail === c.id}
              onToggle={() => toggle(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationCard({ conversation: c, expanded, detail, loadingDetail, onToggle }) {
  const isAdmin = useIsAdmin();
  const sourceMeta = SOURCE_META[c.source] || SOURCE_META.single;
  const typeMeta = TYPE_META[c.conversation_type] || {
    label: c.conversation_type_label || 'Unclassified',
    dot: 'bg-gray-400',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  const inbound = (c.direction || '').toLowerCase() === 'inbound';
  const turns = detail?.transcript || [];

  return (
    <div className="aura-card overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${inbound ? 'bg-sky-50 text-sky-600' : 'bg-pink-50 text-pink-600'}`}>
            {inbound ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-gray-900 truncate">{c.display_name || 'Unknown caller'}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${sourceMeta.className || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {sourceMeta.label}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeMeta.className}`}>
                {typeMeta.label}
              </span>
              {c.outcome && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                  {c.outcome.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
              <span className="font-medium">{c.display_phone || '—'}</span>
              {c.started_at && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(c.started_at), 'MMM d, yyyy h:mm a')}
                </span>
              )}
              <span>{fmtDuration(c.duration_secs)}</span>
              {c.turn_count > 0 && <span>{c.turn_count} turns</span>}
              {c.purpose && <span className="text-gray-400">· {c.purpose}</span>}
            </div>

            {isAdmin && (c.transcript_summary ? (
              <p className="mt-1.5 text-[11px] text-gray-600 line-clamp-2">{c.transcript_summary}</p>
            ) : c.transcript_preview ? (
              <p className="mt-1.5 text-[11px] text-gray-500 line-clamp-2">{c.transcript_preview}</p>
            ) : null)}
          </div>

          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              {isAdmin && c.has_transcript && <CheckCircle2 className="w-3 h-3 text-green-500" />}
              {c.conversation_confidence > 0 && <span>{Math.round(c.conversation_confidence * 100)}%</span>}
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/40 p-4">
          {loadingDetail ? (
            <div className="text-[11px] text-gray-400 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading conversation…
            </div>
          ) : detail?.error ? (
            <div className="text-[11px] text-red-500">{detail.error}</div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Type</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeMeta.className}`}>{typeMeta.label}</span>
                <span className="text-[10px] text-gray-400">
                  {c.classification_source === 'transcript'
                    ? 'classified from conversation'
                    : c.classification_source === 'metadata'
                      ? 'classified from call metadata'
                      : 'default category'}
                </span>
              </div>

              {isAdmin && (turns.length === 0 ? (
                <div className="text-[11px] text-gray-400">
                  No transcript was stored for this call.
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {turns.map((t, idx) => {
                    const text = turnText(t);
                    const indic = t?.indic_text && t.indic_text.trim() !== text ? t.indic_text.trim() : '';
                    const user = isUserTurn(t);
                    const system = isSystemTurn(t);
                    return (
                      <div
                        key={idx}
                        className={`text-[11px] leading-relaxed p-2.5 rounded-lg ${
                          system
                            ? 'bg-gray-100 text-gray-600'
                            : user
                              ? 'bg-blue-50 text-blue-900 text-right'
                              : 'bg-pink-50 text-pink-900'
                        }`}
                      >
                        <div className="font-semibold text-[10px] text-gray-500 mb-0.5">
                          {system ? 'System' : user ? 'User / Patient' : 'Ria (AI Coordinator)'}
                        </div>
                        <div className="whitespace-pre-wrap">{text}</div>
                        {indic && (
                          <div className="text-[10px] text-gray-500 mt-1 pt-1 border-t border-black/5 italic">{indic}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {isAdmin && c.recording_url && (
                <div className="mt-3">
                  <a
                    href={c.recording_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-pink-600 hover:underline mb-2"
                  >
                    <Play className="w-3 h-3" /> Recording
                  </a>
                  <audio controls preload="none" src={c.recording_url} className="w-full" />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
