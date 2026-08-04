import { useState, useEffect, useCallback } from "react";
import { usePlan } from "@/hooks/usePlan";
import { Bot, Zap, Mail, RefreshCw, Search, Play, ToggleLeft, ToggleRight, Clock, AlertTriangle, Activity, Users, TrendingUp, Loader2, Filter, MessageSquare, Globe, History, User, Lock, FileText, } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, } from "recharts";
// ── Helpers ────────────────────────────────────────────────────────────────────
function relativeTime(iso) {
    if (!iso)
        return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000)
        return "just now";
    if (diff < 3600000)
        return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000)
        return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}
function activityIcon(type) {
    if (type.includes("whatsapp"))
        return "💬";
    if (type.includes("email") || type.includes("followup") || type.includes("follow_up"))
        return "✉️";
    if (type.includes("audit"))
        return "🔍";
    if (type.includes("scout") || type.includes("website"))
        return "🌐";
    if (type.includes("hubspot"))
        return "🔗";
    if (type.includes("lost") || type.includes("exhausted"))
        return "📉";
    if (type.includes("skip") || type.includes("duplicate"))
        return "⏭️";
    if (type.includes("hunt") || type.includes("fetched") || type.includes("hunter"))
        return "🎯";
    if (type.includes("error"))
        return "⚠️";
    return "⚡";
}
function activityLabel(type) {
    const map = {
        email_sent: "Email delivered",
        followup_sent: "Follow-up delivered",
        followup_skipped_meeting_booked: "Follow-up skipped — meeting booked",
        followup_failed: "Failed to send follow-up",
        audit_started: "Brand audit started",
        audit_completed: "Brand audit completed",
        website_checked: "Website scanned",
        scout_website_checked: "Website scanned",
        scout_batch_done: "Scout batch complete",
        email_failed: "Failed to send email",
        whatsapp_failed: "WhatsApp failed",
        hunter_error: "Lead Hunter error",
        hubspot_synced: "HubSpot synced",
        lead_marked_lost: "Lead marked lost",
        whatsapp_sent: "WhatsApp message sent",
        lead_fetched: "Lead imported",
        duplicate_skipped: "Duplicate skipped",
        hunter_completed: "Nightly hunt complete",
        agent_toggled: "Agent toggled",
        tick_started: "Orchestrator tick started",
        tick_completed: "Orchestrator tick complete",
    };
    return map[type] ?? type.replace(/_/g, " ");
}
const PURPLE = "#8E1F54";
const GREEN = "#059669";
const GRAD = "linear-gradient(135deg, #A4285E 0%, #8E1F54 100%)";
const AGENT_FILTERS = [
    { key: "all", label: "All" },
    { key: "scout", label: "Scout" },
    { key: "sales", label: "Sales" },
    { key: "followup", label: "Follow-Up" },
    { key: "lead_hunter", label: "Lead Hunter" },
];
function AgentCard({ name, description, icon, active, lastRun, stat, extraStats, onToggle, onRun, running, accentColor }) {
    return (<div style={{
            background: "#fff",
            border: `1.5px solid ${active ? accentColor + "30" : "#E5E7EB"}`,
            borderRadius: 16,
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            boxShadow: active ? `0 4px 20px ${accentColor}18` : "0 1px 4px rgba(0,0,0,0.06)",
            transition: "all 0.25s",
        }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: active ? `${accentColor}15` : "#F3F4F6",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.2s",
        }}>
            <span style={{ color: active ? accentColor : "#9CA3AF" }}>{icon}</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{name}</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>{description}</div>
          </div>
        </div>
        <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }} title={active ? "Pause agent" : "Activate agent"}>
          {active
            ? <ToggleRight size={32} style={{ color: accentColor }}/>
            : <ToggleLeft size={32} style={{ color: "#D1D5DB" }}/>}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
            background: active ? `${accentColor}15` : "#F3F4F6",
            color: active ? accentColor : "#9CA3AF",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: active ? accentColor : "#9CA3AF",
            display: "inline-block",
            boxShadow: active ? `0 0 0 2px ${accentColor}40` : "none",
        }}/>
          {active ? "Active — 24/7" : "Paused"}
        </span>
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>
          <Clock size={10} style={{ display: "inline", marginRight: 3 }}/>
          {relativeTime(lastRun)}
        </span>
      </div>

      <div style={{
            background: "#F9FAFB", borderRadius: 10, padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
        <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>{stat.label}</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: accentColor }}>{stat.value}</span>
      </div>

      {extraStats && extraStats.length > 0 && (<div style={{
                display: "grid",
                gridTemplateColumns: `repeat(${extraStats.length}, 1fr)`,
                gap: 8,
            }}>
          {extraStats.map(s => (<div key={s.label} style={{
                    background: `${accentColor}08`,
                    border: `1px solid ${accentColor}20`,
                    borderRadius: 10,
                    padding: "8px 10px",
                    textAlign: "center",
                }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: accentColor, lineHeight: 1.1 }}>
                {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
              </div>
              <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, marginTop: 3, lineHeight: 1.3 }}>
                {s.label}
              </div>
            </div>))}
        </div>)}

      {onRun && (<button onClick={onRun} disabled={running} style={{
                width: "100%", border: `1.5px solid ${accentColor}40`,
                background: running ? "#F9FAFB" : `${accentColor}08`,
                color: accentColor, borderRadius: 10, padding: "9px 14px",
                fontSize: 12, fontWeight: 700, cursor: running ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: running ? 0.7 : 1, transition: "all 0.15s",
            }}>
          {running
                ? <><Loader2 size={13} className="animate-spin"/> Running…</>
                : <><Play size={13}/> Run Now</>}
        </button>)}
    </div>);
}
// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AgentHub() {
    const [hub, setHub] = useState(null);
    const [activities, setActivities] = useState([]);
    const [toggleHistory, setToggleHistory] = useState([]);
    const [emailHistory, setEmailHistory] = useState([]);
    const [emailFailureHealth, setEmailFailureHealth] = useState(null);
    const [resettingFailure, setResettingFailure] = useState(false);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState({});
    const [agentFilter, setAgentFilter] = useState("all");
    const [lastRefresh, setLastRefresh] = useState(Date.now());
    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/agent-hub/status", { credentials: "include" });
            if (res.ok)
                setHub(await res.json());
        }
        catch { /* silent */ }
    }, []);
    const fetchActivities = useCallback(async (filter) => {
        try {
            const qs = filter !== "all" ? `?agent=${filter}&limit=100` : "?limit=100";
            const res = await fetch(`/api/agent-hub/activity${qs}`, { credentials: "include" });
            if (res.ok)
                setActivities(await res.json());
        }
        catch { /* silent */ }
    }, []);
    const fetchToggleHistoryData = useCallback(async () => {
        try {
            const res = await fetch("/api/agent-hub/toggle-history?limit=50", { credentials: "include" });
            if (res.ok)
                setToggleHistory(await res.json());
        }
        catch { /* silent */ }
    }, []);
    const fetchEmailHistory = useCallback(async () => {
        try {
            const res = await fetch("/api/agent-hub/email-health/history", { credentials: "include" });
            if (res.ok)
                setEmailHistory(await res.json());
        }
        catch { /* silent */ }
    }, []);
    const fetchEmailFailureHealth = useCallback(async () => {
        try {
            const res = await fetch("/api/agent-hub/email-failure-health", { credentials: "include" });
            if (res.ok)
                setEmailFailureHealth(await res.json());
        }
        catch { /* silent */ }
    }, []);
    const fetchAll = useCallback(async (filter = agentFilter) => {
        await Promise.all([fetchStatus(), fetchActivities(filter), fetchToggleHistoryData(), fetchEmailHistory(), fetchEmailFailureHealth()]);
        setLastRefresh(Date.now());
        setLoading(false);
    }, [fetchStatus, fetchActivities, fetchToggleHistoryData, fetchEmailHistory, fetchEmailFailureHealth, agentFilter]);
    useEffect(() => {
        fetchAll(agentFilter);
        const id = setInterval(() => fetchAll(agentFilter), 10000);
        return () => clearInterval(id);
    }, [agentFilter]); // eslint-disable-line react-hooks/exhaustive-deps
    async function toggleAgent(agent) {
        await fetch(`/api/agent-hub/${agent}/toggle`, {
            method: "POST",
            credentials: "include",
        });
        await Promise.all([fetchStatus(), fetchToggleHistoryData()]);
    }
    async function resetEmailFailureCounter() {
        setResettingFailure(true);
        try {
            await fetch("/api/agent-hub/email-failure-health/reset", { method: "POST", credentials: "include" });
            await fetchEmailFailureHealth();
        }
        finally {
            setResettingFailure(false);
        }
    }
    async function runAgent(key, agent) {
        setRunning(r => ({ ...r, [key]: true }));
        try {
            await fetch(`/api/agent-hub/${agent}/run-now`, { method: "POST", credentials: "include" });
            await fetchAll();
        }
        finally {
            setRunning(r => ({ ...r, [key]: false }));
        }
    }
    const { data: planInfo } = usePlan();
    const status = hub?.orchestrator ?? null;
    const lhStatus = hub?.leadHunter ?? null;
    const today = hub?.today;
    const emailHealth = hub?.emailHealth ?? null;
    const errCount = status?.errors.length ?? 0;
    return (<div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 80px" }}>

      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: GRAD,
            display: "flex", alignItems: "center", justifyContent: "center",
        }}>
            <Bot size={18} style={{ color: "#fff" }}/>
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111827", margin: 0 }}>Automation 🤖</h1>
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>24/7 Sales Brain — all agents in one place</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "#F0FDF4", border: "1px solid #BBF7D0",
            borderRadius: 99, padding: "3px 10px",
            fontSize: 11, fontWeight: 600, color: "#16A34A",
        }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", display: "inline-block" }}/>
            Live — auto-refreshes every 10s
          </div>
          <button onClick={() => fetchAll()} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            <RefreshCw size={11}/> Refresh now
          </button>
        </div>
      </div>

      {loading ? (<div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
          <Loader2 size={28} style={{ color: PURPLE }} className="animate-spin"/>
        </div>) : (<>
          {/* ── Autopilot Email Kill Switch ───────────────────────────── */}
          {status && (<div style={{
                    background: status.autopilotEmailPaused ? "#FEF2F2" : "#F0FDF4",
                    border: `2px solid ${status.autopilotEmailPaused ? "#FCA5A5" : "#86EFAC"}`,
                    borderRadius: 14,
                    padding: "16px 20px",
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                    width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                    background: status.autopilotEmailPaused ? "#FEE2E2" : "#DCFCE7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Mail size={20} style={{ color: status.autopilotEmailPaused ? "#DC2626" : "#16A34A" }}/>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: status.autopilotEmailPaused ? "#B91C1C" : "#15803D" }}>
                    {status.autopilotEmailPaused ? "🔴 Automation Emails: PAUSED" : "🟢 Automation Emails: ACTIVE"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2, maxWidth: 560 }}>
                    {status.autopilotEmailPaused
                    ? "Sales & Follow-up agents will NOT send emails. Manual outreach and system emails (OTP, invites, booking confirmations) are unaffected."
                    : "Sales & Follow-up agents are sending automated emails. Pause this if your lead data isn't ready for outreach yet."}
                  </div>
                </div>
              </div>
              <button onClick={() => toggleAgent("autopilot_email")} style={{
                    background: status.autopilotEmailPaused ? "#16A34A" : "#DC2626",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                }}>
                {status.autopilotEmailPaused ? "▶ Resume Sending" : "⏸ Pause Sending"}
              </button>
            </div>)}

          {/* ── Today's DB Metrics ────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Today's Activity (from database)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { icon: <Users size={14}/>, label: "Leads Fetched Today", value: today?.leadsHuntedToday ?? 0, color: "#CB3273" },
                { icon: <Clock size={14}/>, label: "Meetings Booked", value: today?.meetingsBookedToday ?? 0, color: GREEN },
                { icon: <Mail size={14}/>, label: "Emails Sent", value: today?.emailsSent ?? 0, color: "#0891B2" },
                { icon: <RefreshCw size={14}/>, label: "Follow-Ups", value: today?.followupsSent ?? 0, color: "#DE377C" },
                { icon: <MessageSquare size={14}/>, label: "WhatsApp Sent", value: today?.whatsappSent ?? 0, color: "#25D366" },
                { icon: <Globe size={14}/>, label: "Sites Scanned", value: today?.websitesScanned ?? 0, color: "#0891B2" },
                { icon: <FileText size={14}/>, label: "Proposals Sent", value: today?.proposalsSent ?? 0, color: "#DE377C" },
                { icon: <AlertTriangle size={14}/>, label: "Errors Today", value: today?.errors ?? 0, color: "#DC2626" },
            ].map(s => (<div key={s.label} style={{
                    background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
                    padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, color: s.color }}>
                    {s.icon}
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9CA3AF" }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                </div>))}
            </div>
          </div>

          {/* ── Cumulative Totals ─────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            {[
                { icon: <Mail size={15}/>, label: "Total Proposals Sent (all-time)", value: status?.totalProposalsSent ?? 0, color: PURPLE },
                { icon: <RefreshCw size={15}/>, label: "Total Follow-Ups (all-time)", value: status?.totalFollowupsSent ?? 0, color: GREEN },
                { icon: <TrendingUp size={15}/>, label: "Leads Added by Hunter", value: lhStatus?.config.totalPipelineAdded ?? 0, color: "#DE377C" },
            ].map(s => (<div key={s.label} style={{
                    background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
                    padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                }}>
                <div style={{ color: s.color }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                </div>
              </div>))}
          </div>

          {/* ── Email Health Panel ────────────────────────────────────── */}
          {emailHealth && (<div style={{
                    background: emailHealth.limitCritical ? "#FEF2F2"
                        : emailHealth.limitWarning ? "#FFFBEB"
                            : "#F0FDF4",
                    border: `1px solid ${emailHealth.limitCritical ? "#FECACA" : emailHealth.limitWarning ? "#FBE9F1" : "#BBF7D0"}`,
                    borderRadius: 14,
                    padding: "16px 20px",
                    marginBottom: 20,
                }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Mail size={16} style={{ color: emailHealth.limitCritical ? "#DC2626" : emailHealth.limitWarning ? "#DE377C" : "#059669" }}/>
                  <span style={{ fontSize: 13, fontWeight: 700, color: emailHealth.limitCritical ? "#DC2626" : emailHealth.limitWarning ? "#92400E" : "#065F46" }}>
                    Gmail Send Health
                  </span>
                  {emailHealth.limitCritical && (<span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#DC2626", color: "#fff" }}>
                      LIMIT REACHED
                    </span>)}
                  {!emailHealth.limitCritical && emailHealth.limitWarning && (<span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#DE377C", color: "#fff" }}>
                      ⚠ APPROACHING LIMIT
                    </span>)}
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#059669" }}>{emailHealth.sentToday}</div>
                    <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Delivered</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: emailHealth.failedToday > 0 ? "#DC2626" : "#9CA3AF" }}>{emailHealth.failedToday}</div>
                    <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Failed</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#374151" }}>{emailHealth.gmailDailyLimit}</div>
                    <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Daily Limit</div>
                  </div>
                </div>
              </div>

              {/* Quota progress bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>Daily quota used</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: emailHealth.limitCritical ? "#DC2626" : emailHealth.limitWarning ? "#DE377C" : "#374151" }}>
                    {emailHealth.sentToday} / {emailHealth.gmailDailyLimit} ({emailHealth.usagePct}%)
                  </span>
                </div>
                <div style={{ background: "#E5E7EB", borderRadius: 99, height: 8, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    borderRadius: 99,
                    width: `${emailHealth.usagePct}%`,
                    background: emailHealth.limitCritical ? "#DC2626"
                        : emailHealth.limitWarning ? "#DE377C"
                            : "#059669",
                    transition: "width 0.4s ease",
                }}/>
                </div>
                {emailHealth.limitWarning && !emailHealth.limitCritical && (<div style={{ fontSize: 11, color: "#92400E", marginTop: 6, fontWeight: 600 }}>
                    ⚠ Only {emailHealth.gmailDailyLimit - emailHealth.sentToday} sends remaining today — consider pausing agents to avoid hitting the Gmail limit.
                  </div>)}
                {emailHealth.limitCritical && (<div style={{ fontSize: 11, color: "#DC2626", marginTop: 6, fontWeight: 600 }}>
                    Gmail daily limit likely reached — further sends may fail. Consider pausing agents until midnight.
                  </div>)}
                {!emailHealth.limitWarning && (<div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>
                    {emailHealth.gmailDailyLimit - emailHealth.sentToday} sends remaining today (resets at midnight)
                  </div>)}
              </div>

              {/* 7-day trend chart */}
              {emailHistory.length > 0 && (<div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                    7-Day Email Delivery Trend
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={emailHistory} barGap={2} barCategoryGap="30%">
                      <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={28} allowDecimals={false}/>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #E5E7EB", padding: "6px 10px" }} formatter={(value, name) => [value, name === "delivered" ? "Delivered" : "Failed"]} labelStyle={{ fontWeight: 700, color: "#374151", marginBottom: 2 }}/>
                      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} formatter={(value) => value === "delivered" ? "Delivered" : "Failed"}/>
                      <Bar dataKey="delivered" fill="#059669" radius={[3, 3, 0, 0]} maxBarSize={24}/>
                      <Bar dataKey="failed" fill="#DC2626" radius={[3, 3, 0, 0]} maxBarSize={24}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>)}

              {/* Consecutive failure spike counter */}
              {emailFailureHealth !== null && (<div style={{
                        marginTop: 16,
                        background: "#fff",
                        border: `1px solid ${emailFailureHealth.consecutiveFailures >= emailFailureHealth.threshold ? "#FECACA"
                            : emailFailureHealth.consecutiveFailures > 0 ? "#FBE9F1"
                                : "#D1FAE5"}`,
                        borderRadius: 10,
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                    }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: emailFailureHealth.consecutiveFailures >= emailFailureHealth.threshold ? "#FEE2E2"
                            : emailFailureHealth.consecutiveFailures > 0 ? "#FEF3C7"
                                : "#D1FAE5",
                        fontSize: 16,
                    }}>
                      {emailFailureHealth.consecutiveFailures >= emailFailureHealth.threshold ? "🔴"
                        : emailFailureHealth.consecutiveFailures > 0 ? "🟡"
                            : "🟢"}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
                          Consecutive Failure Counter
                        </span>
                        <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                        background: emailFailureHealth.consecutiveFailures >= emailFailureHealth.threshold ? "#FEE2E2"
                            : emailFailureHealth.consecutiveFailures > 0 ? "#FEF3C7"
                                : "#D1FAE5",
                        color: emailFailureHealth.consecutiveFailures >= emailFailureHealth.threshold ? "#DC2626"
                            : emailFailureHealth.consecutiveFailures > 0 ? "#92400E"
                                : "#059669",
                    }}>
                          {emailFailureHealth.consecutiveFailures} / {emailFailureHealth.threshold} threshold
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                        {emailFailureHealth.consecutiveFailures === 0
                        ? "No consecutive failures — email delivery is healthy"
                        : emailFailureHealth.consecutiveFailures >= emailFailureHealth.threshold
                            ? `Spike alert triggered — ${emailFailureHealth.consecutiveFailures} failures in a row`
                            : `${emailFailureHealth.consecutiveFailures} failure${emailFailureHealth.consecutiveFailures > 1 ? "s" : ""} in a row — approaching alert threshold`}
                      </div>
                      {emailFailureHealth.consecutiveFailures > 0 && emailFailureHealth.lastFailureError && (<div style={{
                            marginTop: 4, fontSize: 10, color: "#B91C1C",
                            fontFamily: "monospace",
                            background: "#FFF5F5", borderRadius: 4, padding: "2px 6px",
                            maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {emailFailureHealth.lastFailureError}
                        </div>)}
                      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
                        Data as of {relativeTime(emailFailureHealth.fetchedAt)}
                      </div>
                    </div>
                  </div>
                  {emailFailureHealth.consecutiveFailures > 0 && (<button onClick={resetEmailFailureCounter} disabled={resettingFailure} style={{
                            flexShrink: 0,
                            background: resettingFailure ? "#F9FAFB" : "#fff",
                            border: "1.5px solid #E5E7EB",
                            borderRadius: 8,
                            padding: "7px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: resettingFailure ? "#9CA3AF" : "#374151",
                            cursor: resettingFailure ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", gap: 5,
                            opacity: resettingFailure ? 0.7 : 1,
                        }}>
                      {resettingFailure
                            ? <><Loader2 size={11} className="animate-spin"/> Resetting…</>
                            : <><RefreshCw size={11}/> Reset Counter</>}
                    </button>)}
                </div>)}
            </div>)}

          {/* ── Master Brain Toggle ────────────────────────────────────── */}
          <div style={{
                background: status?.brainActive ? GRAD : "#F9FAFB",
                border: status?.brainActive ? "none" : "1.5px solid #E5E7EB",
                borderRadius: 16, padding: "16px 20px", marginBottom: 20,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                transition: "all 0.3s",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Zap size={22} style={{ color: status?.brainActive ? "#FBE9F1" : "#9CA3AF" }}/>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: status?.brainActive ? "#fff" : "#374151" }}>
                  Sales Brain Master Switch
                </div>
                <div style={{ fontSize: 11, color: status?.brainActive ? "rgba(255,255,255,0.7)" : "#9CA3AF" }}>
                  {status?.brainActive
                ? "All agents running — orchestrator ticks every 30 min"
                : "All agents paused — toggle to resume automation"}
                </div>
              </div>
            </div>
            <button onClick={() => toggleAgent("brain")} style={{ background: "none", border: "none", cursor: "pointer" }}>
              {status?.brainActive
                ? <ToggleRight size={38} style={{ color: "#FBE9F1" }}/>
                : <ToggleLeft size={38} style={{ color: "#D1D5DB" }}/>}
            </button>
          </div>

          {/* ── Agent Cards ───────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 28 }}>
            <AgentCard name="Scout Agent" description="Checks website status of new leads" icon={<Globe size={18}/>} active={status?.scoutActive ?? false} lastRun={status?.lastScoutRun ?? null} stat={{ label: "Sites scanned today", value: today?.websitesScanned ?? 0 }} onToggle={() => toggleAgent("scout")} onRun={() => runAgent("scout", "scout")} running={running["scout"] ?? false} accentColor="#0891B2"/>
            <AgentCard name="Sales Agent" description="Sends 50 personalized proposal pitch emails per day" icon={<Mail size={18}/>} active={status?.salesActive ?? false} lastRun={status?.lastSalesRun ?? null} stat={{ label: "Emails sent today", value: today?.emailsSent ?? 0 }} onToggle={() => toggleAgent("sales")} onRun={() => runAgent("sales", "sales")} running={running["sales"] ?? false} accentColor={PURPLE}/>
            <AgentCard name="Follow-Up Agent" description="Day-2, 7, 10 plain-text follow-ups (skips if meeting booked)" icon={<RefreshCw size={18}/>} active={status?.followupActive ?? false} lastRun={status?.lastFollowupRun ?? null} stat={{ label: "Follow-ups sent today", value: today?.followupsSent ?? 0 }} onToggle={() => toggleAgent("followup")} onRun={() => runAgent("followup", "followup")} running={running["followup"] ?? false} accentColor={GREEN}/>
            <AgentCard name="Lead Hunter" description="Nightly Apollo.io hunt — all orgs with active ICPs, 100/day cap" icon={<TrendingUp size={18}/>} active={lhStatus?.active ?? false} lastRun={lhStatus?.config.lastRunAt ?? null} stat={{ label: "Added to pipeline (lifetime)", value: lhStatus?.config.totalPipelineAdded ?? 0 }} extraStats={[
                { label: "Leads Found", value: lhStatus?.config.totalLeadsFound ?? 0 },
                { label: "Qualified", value: lhStatus?.config.totalQualified ?? 0 },
                { label: "Added to Pipeline", value: lhStatus?.config.totalPipelineAdded ?? 0 },
            ]} onToggle={() => toggleAgent("lead_hunter")} onRun={() => runAgent("lead_hunter", "lead_hunter")} running={running["lead_hunter"] ?? false} accentColor="#DE377C"/>
          </div>

          {/* ── Toggle History ────────────────────────────────────────── */}
          <div style={{
                background: "#fff", border: "1px solid #E5E7EB",
                borderRadius: 16, overflow: "hidden", marginBottom: 20,
            }}>
            <div style={{
                padding: "14px 18px",
                borderBottom: "1px solid #F3F4F6",
                display: "flex", alignItems: "center", gap: 8,
            }}>
              <History size={16} style={{ color: PURPLE }}/>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Toggle History</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 7px",
                background: `${PURPLE}15`, color: PURPLE, borderRadius: 99,
            }}>
                {toggleHistory.length} events
              </span>
            </div>

            {toggleHistory.length === 0 ? (<div style={{ padding: "28px 20px", textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>
                No toggle events yet — changes will appear here as agents are turned on or off
              </div>) : (<div style={{ maxHeight: 320, overflowY: "auto" }}>
                {toggleHistory.map(entry => {
                    const detail = entry.detail ?? {};
                    const active = detail.active;
                    const userName = detail.userName;
                    const agentLabel = {
                        scout: "Scout Agent", sales: "Sales Agent",
                        followup: "Follow-Up Agent", brain: "Sales Brain",
                        lead_hunter: "Lead Hunter",
                    }[entry.agentName] ?? entry.agentName;
                    return (<div key={entry.id} style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 18px",
                            borderBottom: "1px solid #F9FAFB",
                        }}>
                      <div style={{
                            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                            background: active ? "#F0FDF4" : "#FFF7ED",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14,
                        }}>
                        {active ? "▶" : "⏸"}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
                            {agentLabel}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                            background: active ? "#D1FAE5" : "#FEF3C7",
                            color: active ? "#059669" : "#92400E",
                        }}>
                            {active ? "Turned ON" : "Turned OFF"}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                          <User size={10} style={{ color: "#9CA3AF", flexShrink: 0 }}/>
                          <span style={{ fontSize: 11, color: "#6B7280" }}>
                            {userName ?? "Unknown user"}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0 }}>
                        {relativeTime(entry.executedAt)}
                      </div>
                    </div>);
                })}
              </div>)}
          </div>

          {/* ── Errors Panel ──────────────────────────────────────────── */}
          {errCount > 0 && status?.errors && (<div style={{
                    background: "#FEF2F2", border: "1px solid #FECACA",
                    borderRadius: 14, padding: "14px 18px", marginBottom: 24,
                }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={16} style={{ color: "#DC2626" }}/>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>
                  {errCount} Recent Error{errCount > 1 ? "s" : ""}
                </span>
              </div>
              {status.errors.slice(0, 5).map((e, i) => (<div key={i} style={{
                        fontSize: 12, color: "#7F1D1D",
                        background: "#fff5f5", borderRadius: 8, padding: "5px 10px", marginBottom: 4,
                        fontFamily: "monospace",
                    }}>
                  {e}
                </div>))}
            </div>)}

          {/* ── Live Activity Feed (Latest Mail History per Lead) ──────────────── */}
          {(() => {
            const mailActivities = activities.filter(a => 
              ["email_sent", "followup_sent", "email_failed", "followup_failed"].includes(a.activityType)
            );
            const leadMailMap = new Map();
            for (const a of mailActivities) {
              const key = a.leadName || a.companyName || a.id;
              if (!leadMailMap.has(key)) leadMailMap.set(key, a);
            }
            const displayActivities = Array.from(leadMailMap.values());

            return (
              <div style={{
                background: "#fff", border: "1px solid #E5E7EB",
                borderRadius: 16, overflow: "hidden",
              }}>
                {/* Feed header with agent filter */}
                <div style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid #F3F4F6",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Activity size={16} style={{ color: PURPLE }}/>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Live Mail Activity Feed</span>
                    <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 7px",
                    background: `${PURPLE}15`, color: PURPLE, borderRadius: 99,
                }}>
                      {displayActivities.length} leads
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Filter size={12} style={{ color: "#9CA3AF" }}/>
                    <div style={{ display: "flex", gap: 4 }}>
                      {AGENT_FILTERS.map(f => (<button key={f.key} onClick={() => { setAgentFilter(f.key); fetchActivities(f.key); }} style={{
                        padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                        border: agentFilter === f.key ? `1.5px solid ${PURPLE}` : "1.5px solid #E5E7EB",
                        background: agentFilter === f.key ? `${PURPLE}10` : "#fff",
                        color: agentFilter === f.key ? PURPLE : "#6B7280",
                        cursor: "pointer",
                    }}>
                          {f.label}
                        </button>))}
                    </div>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                      Updated {relativeTime(new Date(lastRefresh).toISOString())}
                    </span>
                  </div>
                </div>

                {displayActivities.length === 0 ? (<div style={{ padding: "40px 20px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                    No mail history yet — latest emails and follow-ups per lead will log here
                  </div>) : (<div style={{ maxHeight: 480, overflowY: "auto" }}>
                    {displayActivities.map(a => (<div key={a.id} style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        padding: "10px 18px",
                        borderBottom: "1px solid #F9FAFB",
                        transition: "background 0.15s",
                    }} onMouseEnter={e => (e.currentTarget.style.background = "#FAFAFA")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: a.status === "failed" ? "#FEF2F2"
                            : a.status === "skipped" ? "#FFF7ED"
                                : "#F0FDF4",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14,
                    }}>
                      {activityIcon(a.activityType)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>
                          {activityLabel(a.activityType)}
                        </span>
                        <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                        background: a.status === "failed" ? "#FEE2E2"
                            : a.status === "skipped" ? "#FEF3C7"
                                : "#D1FAE5",
                        color: a.status === "failed" ? "#DC2626"
                            : a.status === "skipped" ? "#92400E"
                                : "#059669",
                    }}>
                          {a.status}
                        </span>
                        <span style={{
                        fontSize: 10, fontWeight: 600, padding: "1px 6px",
                        background: "#F3F4F6", color: "#6B7280", borderRadius: 99,
                        textTransform: "capitalize",
                    }}>
                          {a.agentName}
                        </span>
                      </div>

                      {/* Lead / company name */}
                      {(a.leadName || a.companyName) && (<div style={{ fontSize: 11, color: "#374151", fontWeight: 600, marginTop: 2 }}>
                          {[a.leadName, a.companyName].filter(Boolean).join(" — ")}
                        </div>)}

                      {/* Detail summary */}
                      {a.detail && typeof a.detail === "object" && (<div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                          {Object.entries(a.detail)
                            .filter(([, v]) => typeof v === "string" || typeof v === "number")
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
                            .join(" · ")}
                        </div>)}

                      {/* Error message */}
                      {a.errorMessage && (<div style={{ fontSize: 11, color: "#DC2626", marginTop: 2, fontFamily: "monospace" }}>
                          {a.errorMessage.slice(0, 120)}
                        </div>)}
                    </div>

                    <div style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0, marginTop: 2 }}>
                      {relativeTime(a.executedAt)}
                    </div>
                  </div>))}
              </div>)}
            </div>
            );
          })()}

          {/* ── Schedule Info ─────────────────────────────────────────── */}
          <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20,
            }}>
            <div style={{
                background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
                ⚡ Orchestrator Schedule
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>
                Ticks every <strong>30 minutes</strong> automatically.<br />
                Scout → Sales → Follow-Up → on each cycle.
              </div>
            </div>
            <div style={{
                background: "#FFFBEB", border: "1px solid #FBE9F1", borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>
                🎯 Lead Hunter Schedule
              </div>
              <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.6 }}>
                Nightly at <strong>01:00 IST</strong> (19:30 UTC).<br />
                Runs for all orgs with active ICPs — 100 leads/day cap.
              </div>
            </div>
          </div>
        </>)}
    </div>);
}
