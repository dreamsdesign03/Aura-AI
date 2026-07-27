import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Zap, BarChart3, RefreshCw, Mail, Play, Send, AlertCircle, CheckCircle2, Clock, XCircle, Radar, Users, Activity, Loader2, Brain, Shield, TrendingUp, Power, PauseCircle, Thermometer, Calendar, } from "lucide-react";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function formatRelative(iso) {
    if (!iso)
        return "Never";
    try {
        const diff = Date.now() - new Date(iso).getTime();
        if (diff < 60000)
            return "just now";
        if (diff < 3600000)
            return `${Math.round(diff / 60000)}m ago`;
        if (diff < 86400000)
            return `${Math.round(diff / 3600000)}h ago`;
        return `${Math.round(diff / 86400000)}d ago`;
    }
    catch {
        return "—";
    }
}
const STAGE_LABELS = {
    new: "New", contacted: "Contacted", audit_sent: "Audit Sent",
    engaged: "Engaged", call_booked: "Call Booked",
    show_up_confirmed: "Show Up", no_show: "No Show",
    proposal_sent: "Proposal Sent", won: "Won", lost: "Lost",
    unsubscribed: "Unsubscribed",
};
const STAGE_COLORS = {
    new: "#9CA3AF", contacted: "#60A5FA", audit_sent: "#A78BFA",
    engaged: "#34D399", call_booked: "#FBBF24", show_up_confirmed: "#10B981",
    no_show: "#F87171", proposal_sent: "#FB923C", won: "#22C55E", lost: "#EF4444",
    unsubscribed: "#D1D5DB",
};
const AGENT_META = [
    { key: "scout", label: "Scout Agent", icon: Radar, color: "#3B82F6",
        desc: "Checks website status for new leads — live, down, or no website." },
    { key: "sales", label: "Sales Agent", icon: Brain, color: "#7C3AED",
        desc: "Runs real 61-signal brand audits and sends personalized cold emails." },
    { key: "followup", label: "Follow-Up Agent", icon: RefreshCw, color: "#10B981",
        desc: "AI-written D3/D6/D9/D14 follow-ups via Claude Haiku." },
    { key: "brain", label: "Orchestrator", icon: Zap, color: "#C9A84C",
        desc: "Coordinates all agents every 30 minutes automatically." },
];
const RUN_ENDPOINTS = {
    scout: "/api/agents/scout/run",
    sales: "/api/agents/sales/run",
    followup: "/api/agents/followup/run",
    brain: "/api/agents/orchestrator/tick",
};
function BounceRateBar({ rate }) {
    const pct = Math.min(Math.round(rate * 100), 100);
    const color = pct > 5 ? "#EF4444" : pct > 3 ? "#F59E0B" : "#10B981";
    const label = pct > 5 ? "CRITICAL — auto-paused" : pct > 3 ? "Warning" : "Healthy";
    return (<div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-semibold" style={{ color }}>{label}</span>
        <span className="text-gray-500">{pct}% of last 50 sends</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }}/>
      </div>
      <p className="text-[10px] text-gray-400 mt-1">Auto-pause triggers at &gt;5%. Below 2% is excellent.</p>
    </div>);
}
function RampBar({ sentToday, dailyCap }) {
    const pct = Math.min(Math.round((sentToday / Math.max(dailyCap, 1)) * 100), 100);
    const color = pct >= 100 ? "#EF4444" : pct >= 80 ? "#F59E0B" : "#4F35A8";
    return (<div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-semibold text-gray-700">{sentToday} sent today</span>
        <span className="text-gray-500">cap: {dailyCap}/day</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }}/>
      </div>
    </div>);
}
export default function SalesAgentControl() {
    const qc = useQueryClient();
    const [runningAgent, setRunningAgent] = useState(null);
    const [runResult, setRunResult] = useState(null);
    const [sendingReport, setSendingReport] = useState(false);
    const [reportResult, setReportResult] = useState(null);
    const { data: hub, isLoading: hubLoading } = useQuery({
        queryKey: ["agent-hub-status"],
        queryFn: () => fetch(`${BASE}/api/agent-hub/status`, { credentials: "include" }).then(r => r.json()),
        refetchInterval: 12000,
    });
    const { data: activities } = useQuery({
        queryKey: ["agent-activities"],
        queryFn: () => fetch(`${BASE}/api/agents/activities?limit=40`, { credentials: "include" }).then(r => r.json()),
        refetchInterval: 12000,
    });
    const { data: pipeline } = useQuery({
        queryKey: ["pipeline-stats"],
        queryFn: () => fetch(`${BASE}/api/agents/pipeline-stats`, { credentials: "include" }).then(r => r.json()),
        refetchInterval: 30000,
    });
    const { data: reports } = useQuery({
        queryKey: ["agent-reports"],
        queryFn: () => fetch(`${BASE}/api/agents/reports`, { credentials: "include" }).then(r => r.json()),
    });
    const toggleMutation = useMutation({
        mutationFn: (agent) => fetch(`${BASE}/api/agents/orchestrator/toggle`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent }),
        }).then(r => r.json()),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-hub-status"] }),
    });
    const pauseEmailMutation = useMutation({
        mutationFn: (paused) => fetch(`${BASE}/api/agent-hub/autopilot-email-pause`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paused }),
        }).then(r => r.json()),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-hub-status"] }),
    });
    async function runAgent(key) {
        setRunningAgent(key);
        setRunResult(null);
        try {
            const res = await fetch(`${BASE}${RUN_ENDPOINTS[key]}`, { method: "POST", credentials: "include" });
            const data = await res.json();
            const nums = Object.entries(data).filter(([k]) => k !== "ok").map(([k, v]) => `${v} ${k}`).join(", ");
            setRunResult(`✓ Done: ${nums || "0 items"}`);
            qc.invalidateQueries({ queryKey: ["agent-hub-status"] });
            qc.invalidateQueries({ queryKey: ["agent-activities"] });
            qc.invalidateQueries({ queryKey: ["pipeline-stats"] });
        }
        catch {
            setRunResult("✗ Error running agent");
        }
        finally {
            setRunningAgent(null);
        }
    }
    async function sendReport() {
        setSendingReport(true);
        setReportResult(null);
        try {
            const res = await fetch(`${BASE}/api/agents/report/send`, { method: "POST", credentials: "include" });
            const data = await res.json();
            setReportResult(data.ok ? `✓ Report sent to ${data.email}` : "✗ Failed to send report");
            qc.invalidateQueries({ queryKey: ["agent-reports"] });
            qc.invalidateQueries({ queryKey: ["agent-hub-status"] });
        }
        catch {
            setReportResult("✗ Error sending report");
        }
        finally {
            setSendingReport(false);
        }
    }
    function isAgentActive(key) {
        if (!hub?.orchestrator)
            return false;
        const o = hub.orchestrator;
        if (key === "scout")
            return o.scoutActive;
        if (key === "sales")
            return o.salesActive;
        if (key === "followup")
            return o.followupActive;
        if (key === "brain")
            return o.brainActive;
        return false;
    }
    function getLastRun(key) {
        if (!hub?.orchestrator)
            return null;
        const o = hub.orchestrator;
        if (key === "scout")
            return o.lastScoutRun;
        if (key === "sales")
            return o.lastSalesRun;
        if (key === "followup")
            return o.lastFollowupRun;
        if (key === "brain")
            return o.lastBrainTick;
        return null;
    }
    const orch = hub?.orchestrator;
    const warmup = hub?.warmup;
    const emailPaused = orch?.autopilotEmailPaused ?? false;
    const bounceRate = warmup?.bounceRate ?? 0;
    const bouncePct = Math.round(bounceRate * 100);
    const maxStageCount = Math.max(1, ...Object.values(pipeline?.stageCount ?? {}));
    return (<div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#4F35A8,#7C3AED)" }}>
              <Bot className="w-5 h-5 text-white"/>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Autopilot Control Room</h1>
          </div>
          <p className="text-sm text-gray-500 ml-11.5">24/7 Sales Brain — Real audits → Personalized emails → D3/D6/D9/D14 follow-ups.</p>
        </div>
        <div className="flex items-center gap-2">
          {orch && (<span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${orch.brainActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${orch.brainActive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}/>
              {orch.brainActive ? "Brain Online" : "Brain Paused"}
            </span>)}
        </div>
      </div>

      {/* ── MASTER EMAIL TOGGLE ───────────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 p-5 flex items-start gap-4 transition-all ${emailPaused
            ? "border-amber-300 bg-amber-50"
            : bouncePct > 5
                ? "border-red-300 bg-red-50"
                : "border-violet-200 bg-violet-50"}`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${emailPaused ? "bg-amber-200" : bouncePct > 5 ? "bg-red-200" : "bg-violet-200"}`}>
          {emailPaused
            ? <PauseCircle className="w-6 h-6 text-amber-700"/>
            : bouncePct > 5
                ? <AlertCircle className="w-6 h-6 text-red-700"/>
                : <Power className="w-6 h-6 text-violet-700"/>}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">
                {emailPaused
            ? "Email Sending — PAUSED"
            : bouncePct > 5
                ? "Email Sending — AUTO-PAUSED (bounce rate too high)"
                : "Email Sending — Active"}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {emailPaused
            ? "No emails will be sent until you resume. Agents still run audits and log activities."
            : bouncePct > 5
                ? `Bounce rate is ${bouncePct}% (threshold: 5%). Resume only after resolving deliverability issues.`
                : `Sending ${warmup?.sentToday ?? 0}/${warmup?.dailyCap ?? 15} emails today · IST business hours only · D3/D6/D9/D14 sequence`}
              </p>
            </div>
            <button onClick={() => pauseEmailMutation.mutate(!emailPaused)} disabled={pauseEmailMutation.isPending || hubLoading} className={`flex-shrink-0 ml-4 flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50 ${emailPaused
            ? "bg-violet-600 text-white"
            : "bg-white border-2 border-amber-400 text-amber-700"}`}>
              {pauseEmailMutation.isPending
            ? <Loader2 className="w-4 h-4 animate-spin"/>
            : emailPaused
                ? <><Power className="w-4 h-4"/> Resume Sending</>
                : <><PauseCircle className="w-4 h-4"/> Pause Sending</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── DELIVERABILITY HEALTH ─────────────────────────────────────────────── */}
      {warmup && (<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Warmup Ramp */}
          <div className="rounded-2xl border p-5" style={{ borderColor: "hsl(220 13% 91%)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-violet-500"/>
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Warmup Ramp</span>
            </div>
            {warmup.firstSendDate ? (<>
                <div className="text-2xl font-bold text-gray-900 mb-0.5">Day {warmup.sendingDay}</div>
                <div className="text-xs text-gray-500 mb-3">Week {warmup.weekNumber} · Cap: {warmup.dailyCap}/day</div>
                <RampBar sentToday={warmup.sentToday} dailyCap={warmup.dailyCap}/>
                <div className="mt-3 grid grid-cols-4 gap-1">
                  {[{ w: 1, cap: 15 }, { w: 2, cap: 25 }, { w: 3, cap: 40 }, { w: 4, cap: 80 }].map(({ w, cap }) => (<div key={w} className={`rounded-lg p-1.5 text-center ${warmup.weekNumber >= w ? "bg-violet-100" : "bg-gray-50"}`}>
                      <div className="text-[9px] font-bold text-gray-400">W{w}</div>
                      <div className={`text-xs font-bold ${warmup.weekNumber >= w ? "text-violet-700" : "text-gray-400"}`}>{cap}</div>
                    </div>))}
                </div>
              </>) : (<div>
                <div className="text-2xl font-bold text-gray-900 mb-0.5">Not started</div>
                <div className="text-xs text-gray-500">First send will start the warmup clock.</div>
                <div className="mt-2 text-[11px] text-violet-700 bg-violet-50 rounded-lg px-3 py-2">
                  Week 1 cap: 15 emails/day → grows to 80/day by Week 4.
                </div>
              </div>)}
          </div>

          {/* Bounce Rate */}
          <div className="rounded-2xl border p-5" style={{ borderColor: "hsl(220 13% 91%)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Thermometer className="w-4 h-4 text-orange-500"/>
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Bounce Rate</span>
            </div>
            <div className={`text-2xl font-bold mb-0.5 ${bouncePct > 5 ? "text-red-600" : bouncePct > 3 ? "text-amber-600" : "text-green-600"}`}>
              {bouncePct}%
            </div>
            <div className="text-xs text-gray-500 mb-3">of last 50 sends</div>
            <BounceRateBar rate={bounceRate}/>
          </div>

          {/* Today's Activity */}
          <div className="rounded-2xl border p-5" style={{ borderColor: "hsl(220 13% 91%)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-green-500"/>
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Today's Activity</span>
            </div>
            {hub?.today && (<div className="space-y-2.5">
                {[
                    { label: "Sites checked", val: hub.today.websitesScanned, color: "#3B82F6" },
                    { label: "Audits done", val: hub.today.auditsGenerated, color: "#7C3AED" },
                    { label: "Emails sent", val: hub.today.emailsSent + hub.today.followupsSent, color: "#10B981" },
                    { label: "Meetings booked", val: hub.today.meetingsBookedToday, color: "#C9A84C" },
                ].map(({ label, val, color }) => (<div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className="text-sm font-bold" style={{ color }}>{val}</span>
                  </div>))}
              </div>)}
          </div>
        </div>)}

      {/* Run result flash */}
      {runResult && (<div className={`rounded-xl px-4 py-3 text-sm font-medium ${runResult.startsWith("✓") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {runResult}
        </div>)}

      {/* ── 4 AGENT CARDS ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-gray-400"/>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Agent Controls</span>
          <div className="h-px flex-1" style={{ background: "hsl(220 13% 91%)" }}/>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {AGENT_META.map(({ key, label, icon: Icon, color, desc }) => {
            const active = isAgentActive(key);
            const lastRun = getLastRun(key);
            const running = runningAgent === key;
            return (<div key={key} className="rounded-2xl border p-5" style={{ background: "#fff", borderColor: active ? color + "55" : "hsl(220 13% 91%)" }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: active ? color + "18" : "#F3F4F6" }}>
                      <Icon className="w-5 h-5" style={{ color: active ? color : "#9CA3AF" }}/>
                    </div>
                    <div>
                      <div className="text-[14px] font-bold text-gray-900 flex items-center gap-2">
                        {label}
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={active ? { background: color + "18", color } : { background: "#F3F4F6", color: "#9CA3AF" }}>
                          {active ? "● Online" : "Paused"}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{desc}</p>
                    </div>
                  </div>
                  <button onClick={() => toggleMutation.mutate(key)} disabled={hubLoading} className="flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold border transition-all hover:opacity-80" style={active
                    ? { background: color + "15", color, borderColor: color + "40" }
                    : { background: "#F3F4F6", color: "#6B7280", borderColor: "#E5E7EB" }}>
                    {active ? "Pause" : "Resume"}
                  </button>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="w-3.5 h-3.5"/>
                    Last run: <span className="font-semibold text-gray-600 ml-0.5">{formatRelative(lastRun)}</span>
                  </div>
                  {key === "sales" && orch && (<div className="text-xs text-gray-500">
                      <span className="font-bold text-gray-800">{orch.totalAuditsSent}</span> audits sent
                    </div>)}
                  {key === "followup" && orch && (<div className="text-xs text-gray-500">
                      <span className="font-bold text-gray-800">{orch.totalFollowupsSent}</span> follow-ups sent
                    </div>)}
                </div>
                <button onClick={() => runAgent(key)} disabled={running || !!runningAgent} className="w-full rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50" style={{ background: running ? "#F3F4F6" : color + "15", color: running ? "#9CA3AF" : color, border: `1px solid ${color}30` }}>
                  {running ? <Loader2 className="w-4 h-4 animate-spin"/> : <Play className="w-4 h-4"/>}
                  {running ? "Running…" : `Run ${label}`}
                </button>
              </div>);
        })}
        </div>
      </div>

      {/* ── PIPELINE FUNNEL ──────────────────────────────────────────────────── */}
      {pipeline && (<section>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-gray-400"/>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Pipeline Funnel</span>
            <div className="h-px flex-1" style={{ background: "hsl(220 13% 91%)" }}/>
            <span className="text-xs text-gray-400">{pipeline.total} total leads</span>
          </div>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "hsl(220 13% 91%)" }}>
            {Object.entries(pipeline.stageCount)
                .sort((a, b) => b[1] - a[1])
                .map(([stage, count]) => {
                const pct = Math.round((count / maxStageCount) * 100);
                const color = STAGE_COLORS[stage] ?? "#9CA3AF";
                return (<div key={stage} className="flex items-center gap-4 px-5 py-3 border-b last:border-0" style={{ borderColor: "hsl(220 13% 91%)" }}>
                    <div className="w-28 text-xs font-semibold text-gray-600 flex-shrink-0">{STAGE_LABELS[stage] ?? stage}</div>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }}/>
                    </div>
                    <div className="w-8 text-right text-sm font-bold" style={{ color }}>{count}</div>
                  </div>);
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(pipeline.statusCount).map(([s, count]) => (<span key={s} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{
                    background: s === "live" ? "#DCFCE7" : s === "down" ? "#FEE2E2" : "#F3F4F6",
                    color: s === "live" ? "#15803D" : s === "down" ? "#DC2626" : "#6B7280",
                }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s === "live" ? "#22C55E" : s === "down" ? "#EF4444" : "#9CA3AF" }}/>
                {count} {s === "unchecked" ? "unchecked" : s}
              </span>))}
          </div>
        </section>)}

      {/* ── CUMULATIVE STATS ─────────────────────────────────────────────────── */}
      {orch && (<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
                { label: "Total Leads", value: pipeline?.total ?? 0, icon: Users, color: "#4F35A8" },
                { label: "Audits Sent", value: orch.totalAuditsSent, icon: Mail, color: "#7C3AED" },
                { label: "Follow-Ups Sent", value: orch.totalFollowupsSent, icon: RefreshCw, color: "#10B981" },
                { label: "Reports Sent", value: reports?.length ?? 0, icon: TrendingUp, color: "#C9A84C" },
            ].map(({ label, value, icon: Icon, color }) => (<div key={label} className="rounded-xl p-4 border text-center" style={{ background: "#FAFAFA", borderColor: "hsl(220 13% 91%)" }}>
              <div className="flex items-center justify-center gap-1.5 mb-1.5" style={{ color }}>
                <Icon className="w-4 h-4"/>
                <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
            </div>))}
        </div>)}

      {/* ── ACTIVITY LOG ─────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-gray-400"/>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Recent Activity Log</span>
          <div className="h-px flex-1" style={{ background: "hsl(220 13% 91%)" }}/>
          <button onClick={() => qc.invalidateQueries({ queryKey: ["agent-activities"] })} className="text-xs text-violet-600 font-semibold flex items-center gap-1 hover:text-violet-800">
            <RefreshCw className="w-3 h-3"/> Refresh
          </button>
        </div>
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "hsl(220 13% 91%)" }}>
          {!activities || activities.length === 0 ? (<div className="p-8 text-center text-sm text-gray-400">No activities yet. Run an agent to see logs here.</div>) : (<div className="divide-y divide-gray-100">
              {activities.slice(0, 30).map(a => {
                const agentColor = a.agentName === "scout" ? "#3B82F6" : a.agentName === "sales" ? "#7C3AED" : a.agentName === "followup" ? "#10B981" : "#C9A84C";
                return (<div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-shrink-0">
                      {a.status === "success"
                        ? <CheckCircle2 className="w-4 h-4 text-green-500"/>
                        : a.status === "pending"
                            ? <Loader2 className="w-4 h-4 text-yellow-500"/>
                            : a.status === "skipped"
                                ? <Clock className="w-4 h-4 text-gray-400"/>
                                : <XCircle className="w-4 h-4 text-red-400"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: agentColor }}>[{a.agentName.toUpperCase()}]</span>
                        <span className="text-xs font-semibold text-gray-800">{a.activityType.replace(/_/g, " ")}</span>
                        {a.channel && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500">{a.channel}</span>}
                        {a.leadId && <span className="text-[10px] text-gray-400">lead #{a.leadId}</span>}
                      </div>
                      {a.errorMessage && <p className="text-[11px] text-red-500 mt-0.5 truncate">{a.errorMessage}</p>}
                    </div>
                    <div className="flex-shrink-0 text-[11px] text-gray-400">{formatRelative(a.executedAt)}</div>
                  </div>);
            })}
            </div>)}
        </div>
      </section>

      {/* ── DAILY REPORT ─────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Send className="w-4 h-4 text-gray-400"/>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Daily Report — 08:30 AM IST</span>
          <div className="h-px flex-1" style={{ background: "hsl(220 13% 91%)" }}/>
          <button onClick={sendReport} disabled={sendingReport} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-90 disabled:opacity-50" style={{ background: "linear-gradient(135deg,#4F35A8,#7C3AED)", color: "#fff" }}>
            {sendingReport ? <Loader2 className="w-3 h-3 animate-spin"/> : <Send className="w-3 h-3"/>}
            Send Now
          </button>
        </div>
        {reportResult && (<div className={`rounded-xl px-4 py-2.5 text-sm font-medium mb-3 ${reportResult.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {reportResult}
          </div>)}
        <p className="text-xs text-gray-400 mb-3">Sends automatically daily at 08:30 AM IST to dreamsdesign.in@gmail.com</p>
        {reports && reports.length > 0 ? (<div className="rounded-2xl border overflow-hidden" style={{ borderColor: "hsl(220 13% 91%)" }}>
            {reports.slice(0, 5).map(r => (<div key={r.id} className="flex items-center gap-4 px-5 py-3 border-b last:border-0 hover:bg-gray-50" style={{ borderColor: "hsl(220 13% 91%)" }}>
                <div>
                  <div className="text-xs font-bold text-gray-800">{r.reportDate}</div>
                  <div className="text-[11px] text-gray-400">{formatRelative(r.sentAt)}</div>
                </div>
                <div className="flex-1"/>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span><span className="font-bold text-gray-800">{r.emailsSent}</span> emails</span>
                  <span><span className="font-bold text-gray-800">{r.callsBooked}</span> calls</span>
                  <span><span className="font-bold text-gray-800">{r.meetingsToday}</span> meetings</span>
                </div>
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0"/>
              </div>))}
          </div>) : (<div className="rounded-xl border p-6 text-center text-sm text-gray-400" style={{ borderColor: "hsl(220 13% 91%)" }}>
            No reports yet. Click "Send Now" to send today's report instantly.
          </div>)}
      </section>

      {/* ── ERROR LOG ────────────────────────────────────────────────────────── */}
      {orch?.errors && orch.errors.length > 0 && (<section>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-red-400"/>
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Recent Errors ({orch.errors.length})</span>
            <div className="h-px flex-1" style={{ background: "hsl(220 13% 91%)" }}/>
          </div>
          <div className="rounded-xl border border-red-100 overflow-hidden bg-red-50">
            {orch.errors.slice(-10).reverse().map((e, i) => (<div key={i} className="flex items-start gap-2 px-4 py-2.5 border-b border-red-100 last:border-0">
                <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5"/>
                <span className="text-[11px] text-red-700 leading-snug">{e}</span>
              </div>))}
          </div>
        </section>)}
    </div>);
}
