import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2, AlertTriangle, ExternalLink, CheckCircle2, ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, Zap, Users, Download, ArrowUpRight, Check, UserPlus, Shield, AlertCircle, Activity, MessageSquare, Inbox, } from "lucide-react";
const HUBSPOT_ORANGE = "#FF7A59";
const API_BASE = "/api";
class HsScopeError extends Error {
    scope;
    constructor(scope, message) {
        super(message);
        this.scope = scope;
        this.name = "HsScopeError";
    }
}
function hsFetch(path, opts) {
    return fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        ...opts,
    }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
            if (data.code === "SCOPE_MISSING")
                throw new HsScopeError(data.scope ?? "conversations.read", data.error ?? "Scope required");
            throw new Error(data.error ?? "HubSpot error");
        }
        return data;
    });
}
// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) { return n.toLocaleString(); }
function fmtTime(iso) {
    if (!iso)
        return "Never";
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000)
        return "Just now";
    if (diff < 3_600_000)
        return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)
        return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}
const ACTION_COLOR = {
    created: "#16a34a",
    updated: "#2563eb",
    skipped: "#9ca3af",
    conflict: "#d97706",
    error: "#dc2626",
};
const ACTION_BG = {
    created: "#f0fdf4",
    updated: "#eff6ff",
    skipped: "#f9fafb",
    conflict: "#fffbeb",
    error: "#fef2f2",
};
const DIRECTION_ICON = {
    from_hubspot: <ArrowDownToLine className="w-3.5 h-3.5"/>,
    to_hubspot: <ArrowUpFromLine className="w-3.5 h-3.5"/>,
};
function StatCard({ label, value, sub, color }) {
    return (<div className="flex flex-col gap-0.5">
      <span className="text-2xl font-bold" style={{ color: color ?? "#A4285E" }}>{value}</span>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>);
}
function Pill({ label, color, bg }) {
    return (<span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color, background: bg }}>{label}</span>);
}
function Stat({ label, value, icon }) {
    return (<div className="flex items-center gap-2">
      {icon && <span className="text-gray-400">{icon}</span>}
      <div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>);
}
// ── Main page ─────────────────────────────────────────────────────────────────
export default function HubSpot() {
    const [activeTab, setActiveTab] = useState("sync");
    const qc = useQueryClient();
    const { data: statusData, isLoading: statusLoading } = useQuery({
        queryKey: ["hs-status"],
        queryFn: () => hsFetch("/integrations/hubspot/status").catch(() => ({ connected: false })),
        staleTime: 30_000,
        retry: false,
    });
    const connected = statusData?.connected === true;
    const notConnected = !statusLoading && !connected;
    const tabs = [
        { key: "sync", label: "Sync Dashboard", icon: <ArrowLeftRight className="w-3.5 h-3.5"/> },
        { key: "log", label: "Sync Log", icon: <Activity className="w-3.5 h-3.5"/> },
        { key: "contacts", label: "Import Contacts", icon: <Download className="w-3.5 h-3.5"/> },
        { key: "conversations", label: "Import Inbox", icon: <Inbox className="w-3.5 h-3.5"/> },
        { key: "push-contacts", label: "Push Contacts", icon: <UserPlus className="w-3.5 h-3.5"/> },
        { key: "push-deals", label: "Push Deals", icon: <ArrowUpRight className="w-3.5 h-3.5"/> },
    ];
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: HUBSPOT_ORANGE }}>
            <img src="https://cdn.worldvectorlogo.com/logos/hubspot.svg" alt="HubSpot" className="w-6 h-6 object-contain" onError={e => { e.target.style.display = "none"; }}/>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">HubSpot CRM Sync</h1>
            <p className="text-sm text-gray-500">Two-way sync · HubSpot is primary · conflicts auto-resolved</p>
          </div>
        </div>
        {statusLoading ? (<span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "#F3F4F6", color: "#6B7280" }}>
            <Loader2 className="w-3 h-3 animate-spin"/> Checking…
          </span>) : connected ? (<span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "#E8F5E9", color: "#A4285E" }}>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/> Connected
          </span>) : (<span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "#FEF2F2", color: "#DC2626" }}>
            <span className="w-2 h-2 rounded-full bg-red-500"/> Not connected
          </span>)}
      </div>

      {/* Connection banner */}
      {notConnected && (<div className="flex items-start gap-3 p-4 rounded-xl border" style={{ background: "#FFF7ED", borderColor: "#FED7AA" }}>
          <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0"/>
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-800">HubSpot is not connected</p>
            <p className="text-sm text-orange-700 mt-0.5">
              Open the <strong>Integrations</strong> panel in your Replit workspace, search for HubSpot, and connect your account. All sync features activate automatically once connected.
            </p>
          </div>
          <a href="https://docs.replit.com/cloud-services/integrations/overview" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-800 whitespace-nowrap mt-0.5">
            How to connect <ExternalLink className="w-3 h-3"/>
          </a>
        </div>)}

      {/* HubSpot is primary notice */}
      <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: "#F0F7FF", borderColor: "#BFDBFE" }}>
        <Shield className="w-4 h-4 text-blue-600 flex-shrink-0"/>
        <p className="text-xs text-blue-700">
          <strong>HubSpot is primary:</strong> when both sides change the same field, HubSpot's value always wins. Conflicts are logged so you can review them.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg w-fit overflow-x-auto" style={{ background: "#F3F4F6" }}>
        {tabs.map(t => (<button key={t.key} onClick={() => setActiveTab(t.key)} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap" style={activeTab === t.key
                ? { background: "#fff", color: "#A4285E", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }
                : { color: "#6B7280" }}>
            {t.icon}{t.label}
          </button>))}
      </div>

      {activeTab === "sync" && <SyncDashboard onRefresh={() => qc.invalidateQueries({ queryKey: ["sync-status"] })}/>}
      {activeTab === "log" && <SyncLogTab />}
      {activeTab === "contacts" && <ContactsTab />}
      {activeTab === "conversations" && <ConversationsTab />}
      {activeTab === "push-contacts" && <PushContactsTab />}
      {activeTab === "push-deals" && <PushDealsTab />}
    </div>);
}
// ── Sync Dashboard tab ────────────────────────────────────────────────────────
function SyncDashboard({ onRefresh }) {
    const [runResult, setRunResult] = useState(null);
    const [dryRun, setDryRun] = useState(false);
    const { data: status, isLoading, refetch } = useQuery({
        queryKey: ["sync-status"],
        queryFn: () => hsFetch("/sync/status"),
        refetchInterval: 15_000,
        retry: false,
    });
    const runMut = useMutation({
        mutationFn: () => hsFetch("/sync/run", { method: "POST", body: JSON.stringify({ dryRun }) }),
        onSuccess: (res) => {
            setRunResult(res);
            refetch();
            onRefresh();
        },
    });
    const isRunning = status?.isRunning || runMut.isPending;
    const t = status?.totals;
    return (<div className="space-y-5">
      {/* Sync controls */}
      <div className="p-5 rounded-xl border" style={{ borderColor: "#E5E7EB", background: "#FAFAFA" }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-gray-900">Two-way sync</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Last run: {isLoading ? "…" : fmtTime(status?.lastRunAt ?? null)}
              {status?.isRunning && <span className="ml-2 text-blue-600 font-medium">● Running…</span>}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
              <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="rounded"/>
              Dry run (preview only)
            </label>
            <button onClick={() => runMut.mutate()} disabled={isRunning} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all" style={{ background: isRunning ? "#9CA3AF" : HUBSPOT_ORANGE, cursor: isRunning ? "not-allowed" : "pointer" }}>
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowLeftRight className="w-4 h-4"/>}
              {isRunning ? "Syncing…" : dryRun ? "Preview Sync" : "Sync Now"}
            </button>
          </div>
        </div>

        {runMut.isError && (<div className="mt-3 p-3 rounded-lg text-sm text-red-700" style={{ background: "#FEF2F2" }}>
            {runMut.error.message}
          </div>)}

        {runResult && (<div className="mt-4 p-4 rounded-xl border" style={{ background: runResult.dryRun ? "#FFFBEB" : "#F0FDF4", borderColor: runResult.dryRun ? "#FEF3C7" : "#BBF7D0" }}>
            <p className="text-sm font-semibold mb-3" style={{ color: runResult.dryRun ? "#92400E" : "#14532D" }}>
              {runResult.dryRun ? "Dry-run preview — no changes were made" : "✓ Sync complete"}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">← Pull from HubSpot</p>
                <div className="flex gap-4 flex-wrap">
                  <SyncTotals totals={runResult.pull}/>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">→ Push to HubSpot</p>
                <div className="flex gap-4 flex-wrap">
                  <SyncTotals totals={runResult.push}/>
                </div>
              </div>
            </div>
          </div>)}
      </div>

      {/* All-time stats */}
      {t && (<div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-5 rounded-xl border" style={{ borderColor: "#E5E7EB" }}>
          <StatCard label="Created" value={fmt(t.created)} color="#16a34a"/>
          <StatCard label="Updated" value={fmt(t.updated)} color="#2563eb"/>
          <StatCard label="Skipped" value={fmt(t.skipped)} color="#9ca3af"/>
          <StatCard label="Conflicts" value={fmt(t.conflicts)} color="#d97706" sub="HubSpot won"/>
          <StatCard label="Errors" value={fmt(t.errors)} color="#dc2626"/>
        </div>)}

      {/* Live conflict / error counts */}
      {status && (status.liveConflicts > 0 || status.liveErrors > 0) && (<div className="flex gap-3 flex-wrap">
          {status.liveConflicts > 0 && (<div className="flex items-center gap-2 p-3 rounded-xl border flex-1 min-w-[200px]" style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}>
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0"/>
              <div>
                <p className="text-sm font-semibold text-amber-800">{fmt(status.liveConflicts)} conflict{status.liveConflicts !== 1 ? "s" : ""}</p>
                <p className="text-xs text-amber-700">HubSpot's value was applied. Review in Sync Log.</p>
              </div>
            </div>)}
          {status.liveErrors > 0 && (<div className="flex items-center gap-2 p-3 rounded-xl border flex-1 min-w-[200px]" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0"/>
              <div>
                <p className="text-sm font-semibold text-red-800">{fmt(status.liveErrors)} error{status.liveErrors !== 1 ? "s" : ""}</p>
                <p className="text-xs text-red-700">Some records couldn't sync. See Sync Log for details.</p>
              </div>
            </div>)}
        </div>)}

      {/* Recent activity */}
      {status?.recentActivity && status.recentActivity.length > 0 && (<div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Recent activity</p>
          <div className="space-y-2">
            {status.recentActivity.map(entry => (<LogRow key={entry.id} entry={entry}/>))}
          </div>
        </div>)}

      {isLoading && (<div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400"/>
        </div>)}
    </div>);
}
function SyncTotals({ totals }) {
    return (<>
      {totals.created > 0 && <span className="text-xs font-semibold text-green-700">+{totals.created} created</span>}
      {totals.updated > 0 && <span className="text-xs font-semibold text-blue-700">{totals.updated} updated</span>}
      {totals.skipped > 0 && <span className="text-xs font-semibold text-gray-500">{totals.skipped} skipped</span>}
      {totals.conflicts > 0 && <span className="text-xs font-semibold text-amber-700">{totals.conflicts} conflicts</span>}
      {totals.errors > 0 && <span className="text-xs font-semibold text-red-700">{totals.errors} errors</span>}
      {totals.created === 0 && totals.updated === 0 && totals.conflicts === 0 && totals.errors === 0 &&
            <span className="text-xs text-gray-400">Nothing to sync</span>}
    </>);
}
function LogRow({ entry }) {
    const color = ACTION_COLOR[entry.action] ?? "#374151";
    const bg = ACTION_BG[entry.action] ?? "#F9FAFB";
    return (<div className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: "#E5E7EB", background: bg }}>
      <span className="text-gray-400 flex-shrink-0">{DIRECTION_ICON[entry.direction] ?? <ArrowLeftRight className="w-3.5 h-3.5"/>}</span>
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0" style={{ color, background: "transparent" }}>
        {entry.action}
      </span>
      <span className="text-xs text-gray-600 flex-1 truncate">
        {entry.direction === "from_hubspot" ? "HS → AuraAI" : "AuraAI → HS"}
        {entry.mysaId ? ` · Lead #${entry.mysaId}` : ""}
        {entry.hubspotId ? ` · HS ${entry.hubspotId}` : ""}
        {entry.reason ? ` · ${entry.reason}` : ""}
      </span>
      {entry.isDryRun === 1 && <span className="text-xs text-amber-600 font-medium flex-shrink-0">dry-run</span>}
      <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(entry.createdAt)}</span>
    </div>);
}
// ── Sync Log tab ──────────────────────────────────────────────────────────────
function SyncLogTab() {
    const [page, setPage] = useState(1);
    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ["sync-log", page],
        queryFn: () => hsFetch(`/sync/log?page=${page}&limit=50`),
        retry: false,
    });
    const logs = data?.logs ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.ceil(total / 50);
    return (<div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total.toLocaleString()} total sync events</p>
        <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all" style={{ borderColor: "#E5E7EB", color: "#374151" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}/> Refresh
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>}

      {!isLoading && logs.length === 0 && (<div className="text-center py-12 text-gray-400">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30"/>
          <p className="text-sm">No sync events yet. Run a sync to get started.</p>
        </div>)}

      <div className="space-y-1.5">
        {logs.map(entry => (<div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border text-xs" style={{ borderColor: "#E5E7EB", background: ACTION_BG[entry.action] ?? "#FAFAFA" }}>
            <span className="text-gray-400 mt-0.5 flex-shrink-0">{DIRECTION_ICON[entry.direction] ?? <ArrowLeftRight className="w-3.5 h-3.5"/>}</span>
            <span className="px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ color: ACTION_COLOR[entry.action] ?? "#374151", background: "rgba(0,0,0,0.04)" }}>
              {entry.action}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-gray-700 truncate">
                {entry.direction === "from_hubspot" ? "HubSpot → AuraAI" : "AuraAI → HubSpot"}
                {entry.mysaId ? ` | Lead #${entry.mysaId}` : ""}
                {entry.hubspotId ? ` | HS ${entry.hubspotId}` : ""}
              </p>
              {entry.reason && <p className="text-gray-500 truncate mt-0.5">{entry.reason}</p>}
              {Array.isArray(entry.fieldChanges) && entry.fieldChanges.length > 0 && (<p className="text-gray-400 mt-0.5">
                  Fields: {entry.fieldChanges.map((f) => f.field).join(", ")}
                </p>)}
            </div>
            {entry.isDryRun === 1 && <span className="text-amber-600 font-medium flex-shrink-0">dry-run</span>}
            <span className="text-gray-400 flex-shrink-0 whitespace-nowrap">{timeAgo(entry.createdAt)}</span>
          </div>))}
      </div>

      {totalPages > 1 && (<div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-40" style={{ borderColor: "#E5E7EB" }}>← Prev</button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-40" style={{ borderColor: "#E5E7EB" }}>Next →</button>
        </div>)}
    </div>);
}
function ConversationsTab() {
    const qc = useQueryClient();
    const [importResult, setImportResult] = useState(null);
    const { data, isLoading, error: queryError, refetch, isFetching } = useQuery({
        queryKey: ["hs-conversations"],
        queryFn: () => hsFetch("/hubspot/conversations"),
        staleTime: 60_000,
        retry: false,
    });
    const importMut = useMutation({
        mutationFn: () => hsFetch("/hubspot/import-conversations", { method: "POST" }),
        onSuccess: (res) => {
            setImportResult(res);
            qc.invalidateQueries({ queryKey: ["leads"] });
            qc.invalidateQueries({ queryKey: ["chatbot-leads"] });
            qc.invalidateQueries({ queryKey: ["hs-inbox-threads"] });
        },
    });
    const threads = data?.threads ?? [];
    const withContact = threads.filter(t => t.contact?.email);
    const open = threads.filter(t => t.status === "OPEN");
    const isScopeError = queryError instanceof HsScopeError;
    const importScopeError = importMut.error instanceof HsScopeError ? importMut.error : null;
    return (<div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-xl border" style={{ background: "#F0F7FF", borderColor: "#BFDBFE" }}>
        <MessageSquare className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5"/>
        <p className="text-xs text-blue-700">
          <strong>Import Inbox:</strong> Fetches conversations from your HubSpot inbox, extracts the associated contact, and upserts a Chat Lead for each one — linking the full message thread. Existing leads (same email) are matched and their threads updated automatically.
        </p>
      </div>

      {/* 403 Scope error — missing conversations.read */}
      {isScopeError && (<div className="p-4 rounded-xl border flex items-start gap-3" style={{ background: "#FFF7ED", borderColor: "#FED7AA" }}>
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-semibold text-orange-800 mb-1">Scope missing: <code className="font-mono bg-orange-100 px-1 rounded">conversations.read</code></p>
            <p className="text-xs text-orange-700 mb-2">
              Your HubSpot Private App does not have the <strong>conversations.read</strong> scope. Add it in your HubSpot account:
            </p>
            <ol className="text-xs text-orange-700 space-y-0.5 list-decimal list-inside">
              <li>Go to <strong>HubSpot → Settings → Private Apps</strong></li>
              <li>Click your app → <strong>Scopes</strong> tab</li>
              <li>Enable <code className="font-mono bg-orange-100 px-1 rounded">conversations.read</code> under Conversations</li>
              <li>Save &amp; regenerate the token, then update <strong>HUBSPOT_API_KEY</strong> if it changed</li>
            </ol>
            <button onClick={() => refetch()} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: "#FED7AA", color: "#9A3412", background: "#FFF7ED" }}>
              <RefreshCw className="w-3 h-3"/> Retry
            </button>
          </div>
        </div>)}

      {!isScopeError && (<>
          {/* Controls */}
          <div className="flex items-center justify-between p-4 rounded-xl border" style={{ borderColor: "#E5E7EB", background: "#FAFAFA" }}>
            <div className="flex items-center gap-6">
              <Stat label="Conversations" value={data?.total ?? (isLoading ? "…" : "—")} icon={<MessageSquare className="w-4 h-4"/>}/>
              <Stat label="With contact" value={isLoading ? "…" : withContact.length} icon={<Users className="w-4 h-4"/>}/>
              <Stat label="Open threads" value={isLoading ? "…" : open.length} icon={<Inbox className="w-4 h-4"/>}/>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all" style={{ borderColor: "#E5E7EB", color: "#374151" }}>
                <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}/> Refresh
              </button>
              <button onClick={() => importMut.mutate()} disabled={importMut.isPending || isLoading || withContact.length === 0} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all" style={{ background: (importMut.isPending || withContact.length === 0) ? "#9CA3AF" : "#A4285E" }}>
                {importMut.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
                {importMut.isPending ? "Importing…" : "Import to Chat Leads"}
              </button>
            </div>
          </div>

          {importResult && (<div className="p-4 rounded-xl border" style={{ background: "#F0FDF4", borderColor: "#BBF7D0" }}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600"/>
                <span className="text-sm font-semibold text-green-800">Import complete</span>
              </div>
              <p className="text-sm text-green-700">
                {importResult.imported} new leads · {importResult.updated} threads updated · {importResult.skipped} skipped · {importResult.total} total
              </p>
              {importResult.errors.length > 0 && (<p className="text-xs text-red-600 mt-1">{importResult.errors.length} errors — {importResult.errors[0]}</p>)}
              <p className="text-xs text-green-600 mt-1">View leads in <strong>Chat Leads → HubSpot Inbox</strong> tab.</p>
            </div>)}

          {importScopeError && (<div className="p-4 rounded-xl border flex items-start gap-3" style={{ background: "#FFF7ED", borderColor: "#FED7AA" }}>
              <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5"/>
              <p className="text-sm text-orange-800">
                Scope missing: <code className="font-mono bg-orange-100 px-1 rounded">conversations.read</code>. Add it to your HubSpot Private App scopes, then retry.
              </p>
            </div>)}

          {importMut.isError && !importScopeError && (<div className="p-4 rounded-xl border text-sm text-red-700" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
              {importMut.error.message}
            </div>)}

          {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>}

          {!isLoading && threads.length === 0 && !queryError && (<div className="text-center py-12 text-gray-400">
              <Inbox className="w-8 h-8 mx-auto mb-2 opacity-30"/>
              <p className="text-sm">No conversations found in your HubSpot inbox.</p>
            </div>)}

          {!isLoading && threads.length > 0 && (<div className="rounded-xl border overflow-hidden" style={{ borderColor: "#E5E7EB" }}>
              <table className="w-full text-sm">
                <thead style={{ background: "#F9FAFB" }}>
                  <tr>
                    {["Contact", "Email", "Channel", "Subject / ID", "Status", "Created"].map(h => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {threads.slice(0, 100).map(t => (<tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{t.contact?.name || <span className="text-gray-400 italic">No contact</span>}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{t.contact?.email ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-1.5 py-0.5 rounded-md font-mono bg-gray-100 text-gray-600 uppercase text-[10px]">{t.channel ?? "email"}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[180px] truncate" title={t.subject ?? t.id}>
                        {t.subject || <span className="text-gray-400 font-mono">{t.id}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={t.status} color={t.status === "OPEN" ? "#16a34a" : "#6b7280"} bg={t.status === "OPEN" ? "#f0fdf4" : "#f9fafb"}/>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{fmtTime(t.createdAt)}</td>
                    </tr>))}
                </tbody>
              </table>
              {threads.length > 100 && (<div className="px-4 py-2 text-xs text-gray-400 border-t" style={{ borderColor: "#E5E7EB" }}>
                  Showing first 100 of {threads.length} threads
                </div>)}
            </div>)}
        </>)}
    </div>);
}
// ── Import Contacts tab (preserved) ──────────────────────────────────────────
function ContactsTab() {
    const qc = useQueryClient();
    const [importResult, setImportResult] = useState(null);
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ["hs-contacts"],
        queryFn: () => hsFetch("/hubspot/contacts"),
        staleTime: 60_000,
        retry: false,
    });
    const importMut = useMutation({
        mutationFn: () => hsFetch("/hubspot/import", { method: "POST" }),
        onSuccess: (res) => {
            setImportResult(res);
            qc.invalidateQueries({ queryKey: ["leads"] });
        },
    });
    const contacts = data?.contacts ?? [];
    return (<div className="space-y-4">
      <div className="flex items-center justify-between p-4 rounded-xl border" style={{ borderColor: "#E5E7EB", background: "#FAFAFA" }}>
        <div className="flex items-center gap-6">
          <Stat label="Total contacts" value={data?.total ?? "—"} icon={<Users className="w-4 h-4"/>}/>
          <Stat label="With email" value={contacts.filter(c => c.properties.email).length || (isLoading ? "—" : "0")} icon={<Check className="w-4 h-4"/>}/>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all" style={{ borderColor: "#E5E7EB", color: "#374151" }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}/> Refresh
          </button>
          <button onClick={() => importMut.mutate()} disabled={importMut.isPending || isLoading} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all" style={{ background: importMut.isPending ? "#9CA3AF" : "#A4285E" }}>
            {importMut.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
            {importMut.isPending ? "Importing…" : "Import all to AuraAI"}
          </button>
        </div>
      </div>

      {importResult && (<div className="p-4 rounded-xl border" style={{ background: "#F0FDF4", borderColor: "#BBF7D0" }}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600"/>
            <span className="text-sm font-semibold text-green-800">Import complete</span>
          </div>
          <p className="text-sm text-green-700">{importResult.imported} imported · {importResult.skipped} skipped (duplicates)</p>
          {importResult.errors.length > 0 && <p className="text-xs text-red-600 mt-1">{importResult.errors.length} errors</p>}
        </div>)}

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>}

      {!isLoading && contacts.length > 0 && (<div className="rounded-xl border overflow-hidden" style={{ borderColor: "#E5E7EB" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "#F9FAFB" }}>
              <tr>
                {["Name", "Email", "Company", "Status"].map(h => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.slice(0, 100).map(c => (<tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{[c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.properties.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.properties.company ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Pill label={c.properties.hs_lead_status ?? c.properties.lifecyclestage ?? "—"} color="#374151" bg="#F3F4F6"/>
                  </td>
                </tr>))}
            </tbody>
          </table>
          {contacts.length > 100 && (<div className="px-4 py-2 text-xs text-gray-400 border-t" style={{ borderColor: "#E5E7EB" }}>
              Showing first 100 of {contacts.length} contacts
            </div>)}
        </div>)}
    </div>);
}
// ── Push Contacts tab (preserved) ─────────────────────────────────────────────
function PushContactsTab() {
    const [result, setResult] = useState(null);
    const pushMut = useMutation({
        mutationFn: () => hsFetch("/hubspot/push-contacts-bulk", { method: "POST", body: JSON.stringify({}) }),
        onSuccess: (res) => setResult(res),
    });
    return (<div className="space-y-4">
      <div className="p-4 rounded-xl border" style={{ borderColor: "#E5E7EB", background: "#FAFAFA" }}>
        <p className="text-sm font-semibold text-gray-900 mb-1">Push all AuraAI leads to HubSpot</p>
        <p className="text-xs text-gray-500 mb-4">Upserts all org leads as HubSpot contacts (by email). Existing contacts are updated, new ones are created.</p>
        <button onClick={() => pushMut.mutate()} disabled={pushMut.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: pushMut.isPending ? "#9CA3AF" : HUBSPOT_ORANGE }}>
          {pushMut.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowUpRight className="w-4 h-4"/>}
          {pushMut.isPending ? "Pushing…" : "Push all contacts"}
        </button>
      </div>
      {result && (<div className="p-4 rounded-xl border" style={{ background: "#F0FDF4", borderColor: "#BBF7D0" }}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600"/>
            <span className="text-sm font-semibold text-green-800">Push complete</span>
          </div>
          <p className="text-sm text-green-700">{result.pushed} pushed · {result.failed} failed of {result.total} total</p>
          {result.errors.length > 0 && <p className="text-xs text-red-600 mt-1">{result.errors.slice(0, 3).join("; ")}</p>}
        </div>)}
      {pushMut.isError && (<div className="p-4 rounded-xl border text-sm text-red-700" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          {pushMut.error.message}
        </div>)}
    </div>);
}
// ── Push Deals tab (preserved) ────────────────────────────────────────────────
function PushDealsTab() {
    const [pipeline, setPipeline] = useState("");
    const [stage, setStage] = useState("");
    const [result, setResult] = useState(null);
    const [leadIdsText, setLeadIdsText] = useState("");
    const { data: pipelinesData, isLoading: pipeLoading } = useQuery({
        queryKey: ["hs-pipelines"],
        queryFn: () => hsFetch("/hubspot/pipelines"),
        staleTime: 300_000,
    });
    const pipelines = (pipelinesData?.pipelines ?? []).map((p) => ({
        id: p.id,
        label: p.label ?? p.id,
        stages: (p.stages ?? []).map((s) => ({ id: s.id, label: s.label ?? s.id })),
    }));
    const selectedPipeline = pipelines.find(p => p.id === pipeline);
    const pushMut = useMutation({
        mutationFn: () => {
            const leadIds = leadIdsText.split(",").map(s => Number(s.trim())).filter(Boolean);
            return hsFetch("/hubspot/push-deals-bulk", {
                method: "POST",
                body: JSON.stringify({ leadIds, pipeline, dealstage: stage }),
            });
        },
        onSuccess: (res) => setResult(res),
    });
    return (<div className="space-y-4">
      <div className="p-4 rounded-xl border space-y-4" style={{ borderColor: "#E5E7EB", background: "#FAFAFA" }}>
        <p className="text-sm font-semibold text-gray-900">Push hot leads as HubSpot deals</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pipeline</label>
            {pipeLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400"/> : (<select value={pipeline} onChange={e => { setPipeline(e.target.value); setStage(""); }} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#E5E7EB" }}>
                <option value="">Select pipeline…</option>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>)}
          </div>

          {selectedPipeline && (<div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deal stage</label>
              <select value={stage} onChange={e => setStage(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#E5E7EB" }}>
                <option value="">Select stage…</option>
                {selectedPipeline.stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>)}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lead IDs (comma-separated, leave blank for all qualified leads)</label>
            <input type="text" value={leadIdsText} onChange={e => setLeadIdsText(e.target.value)} placeholder="e.g. 12, 45, 88" className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#E5E7EB" }}/>
          </div>
        </div>

        <button onClick={() => pushMut.mutate()} disabled={!pipeline || !stage || pushMut.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: !pipeline || !stage ? "#9CA3AF" : HUBSPOT_ORANGE }}>
          {pushMut.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Zap className="w-4 h-4"/>}
          {pushMut.isPending ? "Pushing deals…" : "Push deals to HubSpot"}
        </button>
      </div>

      {result && (<div className="p-4 rounded-xl border" style={{ background: "#F0FDF4", borderColor: "#BBF7D0" }}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600"/>
            <span className="text-sm font-semibold text-green-800">Deals pushed</span>
          </div>
          <p className="text-sm text-green-700">{result.pushed} pushed · {result.failed} failed</p>
        </div>)}

      {pushMut.isError && (<div className="p-4 rounded-xl border text-sm text-red-700" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          {pushMut.error.message}
        </div>)}
    </div>);
}
