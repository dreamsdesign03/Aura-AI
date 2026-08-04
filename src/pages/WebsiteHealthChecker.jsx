import { useState, useCallback, useEffect } from "react";
import { Globe, Play, CheckCircle2, XCircle, AlertCircle, Trash2, RotateCcw, Loader2, ShieldCheck, Link2Off, HelpCircle, Clock, ExternalLink, ChevronDown, ChevronUp, X, } from "lucide-react";
const API = "/api";
// ── Helpers ───────────────────────────────────────────────────────────────────
function formatRelative(iso) {
    if (!iso)
        return "—";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000)
        return "just now";
    if (diff < 3600000)
        return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000)
        return `${Math.round(diff / 3600000)}h ago`;
    return `${Math.round(diff / 86400000)}d ago`;
}
function statusBadge(status) {
    switch (status) {
        case "live": return { label: "Live", bg: "#D1FAE5", text: "#065F46", icon: CheckCircle2 };
        case "down": return { label: "Down", bg: "#FEE2E2", text: "#991B1B", icon: XCircle };
        case "no_website": return { label: "No Website", bg: "#F3F4F6", text: "#6B7280", icon: HelpCircle };
        case "unchecked": return { label: "Unchecked", bg: "#FEF3C7", text: "#92400E", icon: Clock };
        default: return { label: status, bg: "#F3F4F6", text: "#6B7280", icon: AlertCircle };
    }
}
// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmDeleteModal({ count, onConfirm, onCancel, loading, }) {
    return (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={e => { if (e.target === e.currentTarget)
        onCancel(); }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" style={{ background: "#fff" }}>
        <div className="p-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: "#FEE2E2" }}>
            <Trash2 className="w-6 h-6 text-red-600"/>
          </div>
          <h3 className="text-center text-[16px] font-bold text-gray-900 mb-2">Delete {count} Dead Lead{count !== 1 ? "s" : ""}?</h3>
          <p className="text-center text-[13px] text-gray-500 mb-6 leading-relaxed">
            This permanently removes {count === 1 ? "this lead" : "these leads"} from your pipeline.
            This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel} disabled={loading} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border" style={{ borderColor: "#E5E7EB", color: "#6B7280" }}>
              Cancel
            </button>
            <button onClick={onConfirm} disabled={loading} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-1.5" style={{ background: loading ? "#D1D5DB" : "#DC2626" }}>
              {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Deleting…</> : "Delete All"}
            </button>
          </div>
        </div>
      </div>
    </div>);
}
export default function WebsiteHealthChecker() {
    const [jobState, setJobState] = useState(null);
    const [counts, setCounts] = useState(null);
    const [deadLeads, setDeadLeads] = useState([]);
    const [deadTotal, setDeadTotal] = useState(0);
    const [selected, setSelected] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [deletingIds, setDeletingIds] = useState([]);
    const [showConfirm, setShowConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState(null);
    const [showDeadPool, setShowDeadPool] = useState(true);
    const [activeFilter, setActiveFilter] = useState(null);
    const [filteredLeads, setFilteredLeads] = useState([]);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const [filteredLoading, setFilteredLoading] = useState(false);
    function showToast(type, msg) {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 4000);
    }
    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API}/leads/website-check/status`, { credentials: "include" });
            if (!res.ok)
                return;
            // New flat response shape: { running, checked, total, working, dead, no_website, counts, ... }
            const data = await res.json();
            // Map flat response to JobState shape used by the UI
            const c = data.counts;
            setJobState({
                running: data.running, total: data.total, checked: data.checked,
                live: data.working, down: c?.down ?? 0,
                dead: data.dead, noWebsite: data.no_website,
                startedAt: data.startedAt, finishedAt: data.finishedAt, errors: 0,
            });
            setCounts(c ?? { total: data.total, live: data.working, down: 0, dead: data.dead, no_website: data.no_website, unchecked: 0 });
            setRunning(data.running);
        }
        catch { /* silent */ }
        setLoading(false);
    }, []);
    const fetchDeadPool = useCallback(async () => {
        try {
            const res = await fetch(`${API}/leads/dead-pool?limit=200`, { credentials: "include" });
            if (!res.ok)
                return;
            const data = await res.json();
            setDeadLeads(data.leads);
            setDeadTotal(data.total);
        }
        catch { /* silent */ }
    }, []);
    const fetchFilteredLeads = useCallback(async (filter) => {
        if (!filter)
            return;
        setFilteredLoading(true);
        try {
            const res = await fetch(`${API}/leads/website-check/leads?status=${filter}&limit=200`, { credentials: "include" });
            if (!res.ok)
                return;
            const data = await res.json();
            setFilteredLeads(data.leads);
            setFilteredTotal(data.total);
        }
        catch { /* silent */ }
        setFilteredLoading(false);
    }, []);
    function handleCardClick(filter) {
        if (activeFilter === filter) {
            setActiveFilter(null);
            setFilteredLeads([]);
            setFilteredTotal(0);
        }
        else {
            setActiveFilter(filter);
            fetchFilteredLeads(filter);
        }
    }
    useEffect(() => {
        fetchStatus();
        fetchDeadPool();
    }, [fetchStatus, fetchDeadPool]);
    // Poll while running
    useEffect(() => {
        if (!running)
            return;
        const id = setInterval(() => {
            fetchStatus();
        }, 2000);
        return () => clearInterval(id);
    }, [running, fetchStatus]);
    // When job finishes, refresh dead pool
    useEffect(() => {
        if (jobState && !jobState.running && jobState.finishedAt) {
            fetchDeadPool();
        }
    }, [jobState?.running, jobState?.finishedAt, fetchDeadPool]);
    async function startCheck() {
        if (running)
            return;
        setRunning(true);
        try {
            const res = await fetch(`${API}/leads/website-check/run`, { method: "POST", credentials: "include" });
            const data = await res.json();
            if (!data.started)
                showToast("error", data.message ?? "Failed to start");
            else if (data.already_running)
                showToast("success", "Health check is already running…");
        }
        catch {
            showToast("error", "Failed to start check");
            setRunning(false);
        }
        setTimeout(fetchStatus, 500);
    }
    async function bulkDelete(ids) {
        setDeleting(true);
        try {
            const res = await fetch(`${API}/leads/bulk-delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ lead_ids: ids, confirm: true }),
            });
            if (!res.ok)
                throw new Error("Delete failed");
            setDeadLeads(p => p.filter(l => !ids.includes(l.id)));
            setDeadTotal(p => p - ids.length);
            setSelected(new Set());
            showToast("success", `Deleted ${ids.length} lead${ids.length !== 1 ? "s" : ""}`);
        }
        catch {
            showToast("error", "Failed to delete leads");
        }
        finally {
            setDeleting(false);
            setShowConfirm(false);
            setDeletingIds([]);
        }
    }
    async function markNotDead(ids) {
        try {
            await fetch(`${API}/leads/bulk-mark`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ lead_ids: ids, is_dead_website: false }),
            });
            setDeadLeads(p => p.filter(l => !ids.includes(l.id)));
            setDeadTotal(p => p - ids.length);
            setSelected(new Set());
            showToast("success", `Marked ${ids.length} lead${ids.length !== 1 ? "s" : ""} as active`);
        }
        catch {
            showToast("error", "Failed to update leads");
        }
    }
    const progress = jobState && jobState.total > 0
        ? Math.round((jobState.checked / jobState.total) * 100)
        : 0;
    const allSelected = deadLeads.length > 0 && selected.size === deadLeads.length;
    const someSelected = selected.size > 0;
    function toggleAll() {
        if (allSelected)
            setSelected(new Set());
        else
            setSelected(new Set(deadLeads.map(l => l.id)));
    }
    function toggleOne(id) {
        setSelected(p => {
            const next = new Set(p);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }
    return (<div className="p-4 md:p-6 space-y-5 max-w-5xl">
      {/* Toast */}
      {toast && (<div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-[13px] font-semibold flex items-center gap-2" style={{ background: toast.type === "success" ? "#059669" : "#DC2626", color: "#fff" }}>
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
          {toast.msg}
        </div>)}

      {/* Confirm Modal */}
      {showConfirm && (<ConfirmDeleteModal count={deletingIds.length} onConfirm={() => bulkDelete(deletingIds)} onCancel={() => { setShowConfirm(false); setDeletingIds([]); }} loading={deleting}/>)}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #3B82F6, #1D4ED8)" }}>
              <Globe className="w-5 h-5 text-white"/>
            </div>
            <h1 className="text-[18px] font-bold text-gray-900">Website Health Checker</h1>
          </div>
          <p className="text-[13px] text-gray-500 ml-11.5">
            Scan all lead websites — find dead links, remove ghost leads from your pipeline.
          </p>
        </div>

        <button onClick={startCheck} disabled={running} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all" style={{ background: running ? "#93C5FD" : "#3B82F6", cursor: running ? "not-allowed" : "pointer" }}>
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin"/> Checking…</>
            : <><Play className="w-4 h-4"/> Run Check</>}
        </button>
      </div>

      {/* ── Progress Bar ──────────────────────────────────────────────── */}
      {running && jobState && (<div className="rounded-xl border p-4" style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-semibold text-blue-700 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin"/>
              Checking websites… {jobState.checked} / {jobState.total}
            </span>
            <span className="text-[13px] font-bold text-blue-700">{progress}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full" style={{ background: "#BFDBFE" }}>
            <div className="h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #3B82F6, #1D4ED8)" }}/>
          </div>
          <div className="flex gap-4 mt-3 text-[11px] text-blue-600">
            <span>✅ Live: {jobState.live}</span>
            <span>❌ Down: {jobState.down}</span>
            <span>⬜ No URL: {jobState.noWebsite}</span>
            {jobState.errors > 0 && <span className="text-red-500">⚠ Errors: {jobState.errors}</span>}
          </div>
        </div>)}

      {/* ── Stats Cards ────────────────────────────────────────────────── */}
      {!loading && counts && (<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
                { label: "Total Leads", value: counts.total ?? 0, icon: Globe, color: "#A4285E", bg: "#FBE9F1", filter: null },
                { label: "Live", value: counts.live ?? 0, icon: CheckCircle2, color: "#059669", bg: "#ECFDF5", filter: "live" },
                { label: "Down / Dead", value: counts.dead ?? 0, icon: XCircle, color: "#DC2626", bg: "#FEF2F2", filter: "dead" },
                { label: "No Website", value: counts.no_website ?? 0, icon: HelpCircle, color: "#6B7280", bg: "#F3F4F6", filter: "no_website" },
                { label: "Unchecked", value: counts.unchecked ?? 0, icon: Clock, color: "#DE377C", bg: "#FEF3C7", filter: "unchecked" },
            ].map(({ label, value, icon: Icon, color, bg, filter }) => {
                const isActive = activeFilter === filter && filter !== null;
                const isClickable = filter !== null;
                return (<div key={label} onClick={() => isClickable && handleCardClick(filter)} className="rounded-xl border p-3.5 text-center transition-all" style={{
                        background: isActive ? bg : "#fff",
                        borderColor: isActive ? color : "hsl(220 13% 91%)",
                        cursor: isClickable ? "pointer" : "default",
                        boxShadow: isActive ? `0 0 0 2px ${color}33` : undefined,
                        transform: isActive ? "translateY(-1px)" : undefined,
                    }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2" style={{ background: isActive ? "#fff" : bg }}>
                  <Icon className="w-4 h-4" style={{ color }}/>
                </div>
                <div className="text-[22px] font-black" style={{ color }}>{value.toLocaleString()}</div>
                <div className="text-[11px] font-medium mt-0.5" style={{ color: isActive ? color : "#9CA3AF" }}>{label}</div>
                {isClickable && (<div className="text-[10px] mt-1" style={{ color: isActive ? color : "#CBD5E1", opacity: isActive ? 1 : 0.7 }}>
                    {isActive ? "▲ hide" : "click to view"}
                  </div>)}
              </div>);
            })}
        </div>)}

      {/* ── Filtered Leads Table ──────────────────────────────────────── */}
      {activeFilter && (<div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(220 13% 91%)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{
                background: activeFilter === "live" ? "#ECFDF5" : activeFilter === "dead" ? "#FEF2F2" : activeFilter === "no_website" ? "#F3F4F6" : "#FEF3C7",
                borderBottom: "1px solid hsl(220 13% 91%)",
            }}>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold" style={{
                color: activeFilter === "live" ? "#065F46" : activeFilter === "dead" ? "#991B1B" : activeFilter === "no_website" ? "#374151" : "#92400E"
            }}>
                {activeFilter === "live" ? "✅ Live Websites" : activeFilter === "dead" ? "❌ Dead Websites" : activeFilter === "no_website" ? "⬜ No Website" : "🕐 Unchecked Leads"}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{
                background: activeFilter === "live" ? "#059669" : activeFilter === "dead" ? "#DC2626" : activeFilter === "no_website" ? "#6B7280" : "#DE377C"
            }}>
                {filteredTotal.toLocaleString()}
              </span>
            </div>
            <button onClick={() => { setActiveFilter(null); setFilteredLeads([]); setFilteredTotal(0); }} className="p-1 rounded-lg hover:bg-black/10 transition-colors">
              <X className="w-4 h-4 text-gray-500"/>
            </button>
          </div>

          {/* Loading */}
          {filteredLoading && (<div className="flex items-center justify-center gap-2 py-10 text-[13px] text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin"/> Loading…
            </div>)}

          {/* Empty */}
          {!filteredLoading && filteredLeads.length === 0 && (<div className="py-10 text-center text-[13px] text-gray-400">No leads in this category yet.</div>)}

          {/* Table */}
          {!filteredLoading && filteredLeads.length > 0 && (<div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: "#F9FAFB", borderBottom: "1px solid hsl(220 13% 91%)" }}>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Lead</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Website</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Status</th>
                    {(activeFilter === "dead" || activeFilter === "live") && (<th className="px-3 py-2.5 text-left font-semibold text-gray-500">Reason / Code</th>)}
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Checked</th>
                    {activeFilter === "dead" && (<th className="px-3 py-2.5 text-right font-semibold text-gray-500">Actions</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead, idx) => {
                    const badge = statusBadge(lead.websiteStatus ?? "unchecked");
                    const BadgeIcon = badge.icon;
                    return (<tr key={lead.id} style={{ background: idx % 2 === 0 ? "#fff" : "#FAFAFA", borderBottom: "1px solid hsl(220 13% 93%)" }}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{lead.firstName} {lead.lastName}</div>
                          <div className="text-gray-400 text-[11px]">{lead.company}</div>
                        </td>
                        <td className="px-3 py-3 max-w-[180px]">
                          {lead.website ? (<a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline truncate" title={lead.website}>
                              <ExternalLink className="w-3 h-3 flex-shrink-0"/>
                              <span className="truncate">{lead.website}</span>
                            </a>) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: badge.bg, color: badge.text }}>
                            <BadgeIcon className="w-3 h-3"/>
                            {badge.label}
                          </span>
                        </td>
                        {(activeFilter === "dead" || activeFilter === "live") && (<td className="px-3 py-3 text-gray-400 max-w-[160px]">
                            <span className="truncate block" title={lead.websiteCheckReason ?? ""}>
                              {lead.websiteCheckReason ?? "—"}
                              {lead.websiteHttpCode ? <span className="ml-1 text-[10px]">HTTP {lead.websiteHttpCode}</span> : null}
                            </span>
                          </td>)}
                        <td className="px-3 py-3 text-gray-400 whitespace-nowrap">
                          {formatRelative(lead.websiteCheckedAt)}
                        </td>
                        {activeFilter === "dead" && (<td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => markNotDead([lead.id])} className="p-1.5 rounded-lg hover:bg-green-100" title="Mark as active">
                                <RotateCcw className="w-3.5 h-3.5 text-green-600"/>
                              </button>
                              <button onClick={() => { setDeletingIds([lead.id]); setShowConfirm(true); }} className="p-1.5 rounded-lg hover:bg-red-100" title="Delete lead">
                                <Trash2 className="w-3.5 h-3.5 text-red-500"/>
                              </button>
                            </div>
                          </td>)}
                      </tr>);
                })}
                </tbody>
              </table>
              {filteredTotal > filteredLeads.length && (<div className="px-4 py-3 text-[12px] text-gray-400 border-t" style={{ borderColor: "hsl(220 13% 91%)" }}>
                  Showing first {filteredLeads.length} of {filteredTotal.toLocaleString()} leads
                </div>)}
            </div>)}
        </div>)}

      {/* Last run info */}
      {jobState?.finishedAt && !running && (<div className="flex items-center gap-2 text-[12px] text-gray-400">
          <Clock className="w-3.5 h-3.5"/>
          Last check completed {formatRelative(jobState.finishedAt)}
          {jobState.errors > 0 && <span className="text-amber-500 ml-2">· {jobState.errors} errors</span>}
        </div>)}

      {/* ── Dead Pool (hidden when "dead" filter card is active) ───────── */}
      {activeFilter !== "dead" && <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(220 13% 91%)" }}>
        {/* Dead pool header */}
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none" style={{ background: deadTotal > 0 ? "#FEF2F2" : "#F9FAFB", borderBottom: showDeadPool ? "1px solid hsl(220 13% 91%)" : "none" }} onClick={() => setShowDeadPool(p => !p)}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: deadTotal > 0 ? "#FEE2E2" : "#F3F4F6" }}>
              <Link2Off className="w-4 h-4" style={{ color: deadTotal > 0 ? "#DC2626" : "#9CA3AF" }}/>
            </div>
            <div>
              <span className="text-[14px] font-bold" style={{ color: deadTotal > 0 ? "#991B1B" : "#374151" }}>
                Dead Websites
              </span>
              {deadTotal > 0 && (<span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#DC2626", color: "#fff" }}>
                  {deadTotal}
                </span>)}
            </div>
            {deadTotal === 0 && <span className="text-[12px] text-gray-400">No dead websites found</span>}
          </div>
          <div className="flex items-center gap-2">
            {showDeadPool && someSelected && (<div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <button onClick={() => markNotDead(Array.from(selected))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border" style={{ borderColor: "#BBF7D0", color: "#059669", background: "#F0FDF4" }}>
                  <ShieldCheck className="w-3.5 h-3.5"/> Mark Active ({selected.size})
                </button>
                <button onClick={() => { setDeletingIds(Array.from(selected)); setShowConfirm(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border" style={{ borderColor: "#FCA5A5", color: "#DC2626", background: "#FEF2F2" }}>
                  <Trash2 className="w-3.5 h-3.5"/> Delete ({selected.size})
                </button>
              </div>)}
            {showDeadPool
                ? <ChevronUp className="w-4 h-4 text-gray-400"/>
                : <ChevronDown className="w-4 h-4 text-gray-400"/>}
          </div>
        </div>

        {/* Dead pool table */}
        {showDeadPool && deadLeads.length > 0 && (<div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid hsl(220 13% 91%)" }}>
                  <th className="px-4 py-2.5 text-left w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" style={{ accentColor: "#DC2626" }}/>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Lead</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Website</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Status</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Reason</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Checked</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deadLeads.map((lead, idx) => {
                    const badge = statusBadge(lead.websiteStatus);
                    const BadgeIcon = badge.icon;
                    const isSelected = selected.has(lead.id);
                    return (<tr key={lead.id} className="transition-colors" style={{
                            background: isSelected ? "#FFF5F5" : idx % 2 === 0 ? "#fff" : "#FAFAFA",
                            borderBottom: "1px solid hsl(220 13% 93%)",
                        }}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(lead.id)} className="rounded" style={{ accentColor: "#DC2626" }}/>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-900">{lead.firstName} {lead.lastName}</div>
                        <div className="text-gray-400 text-[11px]">{lead.company}</div>
                      </td>
                      <td className="px-3 py-3 max-w-[180px]">
                        {lead.website ? (<a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline truncate" title={lead.website}>
                            <ExternalLink className="w-3 h-3 flex-shrink-0"/>
                            <span className="truncate">{lead.website}</span>
                          </a>) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: badge.bg, color: badge.text }}>
                          <BadgeIcon className="w-3 h-3"/>
                          {badge.label}
                        </span>
                        {lead.websiteHttpCode && (<span className="ml-1.5 text-[10px] text-gray-400">HTTP {lead.websiteHttpCode}</span>)}
                      </td>
                      <td className="px-3 py-3 text-gray-400 max-w-[160px]">
                        <span className="truncate block" title={lead.websiteCheckReason ?? ""}>
                          {lead.websiteCheckReason ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-400 whitespace-nowrap">
                        {formatRelative(lead.websiteCheckedAt)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => markNotDead([lead.id])} className="p-1.5 rounded-lg transition-colors hover:bg-green-100" title="Mark as active">
                            <RotateCcw className="w-3.5 h-3.5 text-green-600"/>
                          </button>
                          <button onClick={() => { setDeletingIds([lead.id]); setShowConfirm(true); }} className="p-1.5 rounded-lg transition-colors hover:bg-red-100" title="Delete lead">
                            <Trash2 className="w-3.5 h-3.5 text-red-500"/>
                          </button>
                        </div>
                      </td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>)}

        {/* Empty state */}
        {showDeadPool && deadLeads.length === 0 && !loading && (<div className="py-12 text-center">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3" style={{ color: "#D1FAE5" }}/>
            <p className="text-[14px] font-semibold text-gray-500">No dead websites detected</p>
            <p className="text-[12px] text-gray-400 mt-1">
              {counts?.unchecked && counts.unchecked > 0
                    ? `${counts.unchecked} leads not yet checked — run a check to scan them`
                    : "All lead websites are healthy"}
            </p>
          </div>)}

        {loading && (<div className="py-10 flex items-center justify-center gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin"/>
            <span className="text-[13px]">Loading…</span>
          </div>)}
      </div>}

      {/* ── How it works ─────────────────────────────────────────────── */}
      <div className="rounded-xl border p-4" style={{ borderColor: "hsl(220 13% 91%)", background: "#FAFAFA" }}>
        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">How it works</div>
        <div className="grid md:grid-cols-3 gap-3">
          {[
            { step: "1", title: "Scan All Leads", desc: "Checks every lead with a website URL using HTTP/HTTPS (5 concurrent, retry once).", icon: Globe, color: "#3B82F6" },
            { step: "2", title: "Mark Dead Sites", desc: "Leads whose website fails both attempts are tagged as Dead Websites.", icon: XCircle, color: "#DC2626" },
            { step: "3", title: "Clean Your Pipeline", desc: "Bulk delete ghost leads or mark them active if the site comes back online.", icon: Trash2, color: "#059669" },
        ].map(({ step, title, desc, icon: Icon, color }) => (<div key={step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold" style={{ background: color }}>
                {step}
              </div>
              <div>
                <div className="text-[12px] font-bold text-gray-800 mb-0.5">{title}</div>
                <div className="text-[11px] text-gray-500 leading-relaxed">{desc}</div>
              </div>
            </div>))}
        </div>
      </div>
    </div>);
}
