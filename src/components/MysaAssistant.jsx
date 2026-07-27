import { useState, useRef, useEffect, useId } from "react";
import { Sparkles, X, Send, Loader2, ChevronRight, RefreshCw, Users, BarChart2, Globe, Zap, Bot, CheckCircle2, AlertTriangle, ArrowRight, Search, Phone, } from "lucide-react";
// ── Constants ─────────────────────────────────────────────────────────────────
const DARK = "#0D0B18";
const DARK2 = "#161225";
const DARK3 = "#1E1A30";
const PURPLE = "#7C3AED";
const PURPLE_L = "#A78BFA";
const BORDER = "rgba(124,58,237,0.18)";
const EXAMPLE_PROMPTS = [
    { icon: Search, text: "Find 30 IT companies in Mumbai", color: "#7C3AED" },
    { icon: Globe, text: "Check which leads have dead websites", color: "#0EA5E9" },
    { icon: BarChart2, text: "How many meetings did I book this month?", color: "#10B981" },
    { icon: Zap, text: "Start outreach — 25 emails a day", color: "#F59E0B" },
    { icon: Bot, text: "Audit the top 5 newest leads", color: "#EC4899" },
    { icon: Users, text: "Search my leads in healthcare", color: "#8B5CF6" },
];
// ── SSE stream reader ─────────────────────────────────────────────────────────
async function readSSEStream(response, onEvent) {
    const reader = response.body?.getReader();
    if (!reader)
        return;
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (line.startsWith("event: ")) {
                    currentEvent = line.slice(7).trim();
                }
                else if (line.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        onEvent(currentEvent, data);
                    }
                    catch { /* ignore parse errors */ }
                    currentEvent = "message";
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
// ── Tool-start text ───────────────────────────────────────────────────────────
function getToolStartText(tool, params) {
    switch (tool) {
        case "find_leads": {
            const kw = String(params["keyword"] ?? params["industry"] ?? "businesses");
            const loc = String(params["location"] ?? "India");
            return `🗺️ Starting search for ${kw} in ${loc}…`;
        }
        case "run_brand_audit":
            return `🔍 Starting brand audit${params["website_url"] ? ` for ${params["website_url"]}` : ""}…`;
        case "check_website_health":
            return "🌐 Scanning lead websites for health issues…";
        case "start_autopilot":
            return "🚀 Enabling outreach automation…";
        case "stop_autopilot":
            return "⏹️ Pausing outreach automation…";
        case "create_icp":
            return "✨ Generating Ideal Customer Profile…";
        case "search_my_leads":
            return "🔎 Searching your lead database…";
        case "get_stats":
            return "📊 Fetching pipeline stats…";
        default:
            return `⚙️ Running ${tool}…`;
    }
}
// ── Inline result cards ───────────────────────────────────────────────────────
function LeadsCard({ data }) {
    return (<div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: DARK3 }}>
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <span className="text-[11px] font-bold" style={{ color: PURPLE_L }}>
          <Users className="w-3 h-3 inline mr-1"/>{data.total} Lead{data.total !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {data.leads.slice(0, 10).map((l, i) => (<div key={l.id} className="flex items-start gap-2 px-3 py-2" style={{ borderBottom: i < data.leads.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: `linear-gradient(135deg,${PURPLE},#4F35A8)` }}>
              {(l.company || l.name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold truncate" style={{ color: "#E2E8F0" }}>{l.company || l.name}</div>
              <div className="text-[10px] truncate" style={{ color: "#9CA3AF" }}>{l.industry} · {l.country}</div>
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              {l.bantScore > 0 && (<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: l.bantScore >= 65 ? "#064E3B" : "#1C1917", color: l.bantScore >= 65 ? "#34D399" : "#9CA3AF" }}>
                  {l.bantScore}
                </span>)}
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{
                background: l.websiteStatus === "working" ? "#064E3B" : l.websiteStatus === "dead" ? "#450A0A" : "#1C1917",
                color: l.websiteStatus === "working" ? "#34D399" : l.websiteStatus === "dead" ? "#F87171" : "#9CA3AF",
            }}>
                {l.websiteStatus || "?"}
              </span>
            </div>
          </div>))}
        {data.total > 10 && (<div className="px-3 py-2 text-[10px] text-center" style={{ color: "#6B7280" }}>+{data.total - 10} more</div>)}
      </div>
    </div>);
}
function LeadsImportedCard({ data }) {
    const sourceLabel = data.source === "google_maps" ? "Google Maps" : data.source === "apollo" ? "Apollo" : data.source;
    const sourceColor = data.source === "google_maps" ? "#0EA5E9" : data.source === "apollo" ? "#F59E0B" : "#6B7280";
    const leadsToShow = data.leads.slice(0, 12);
    return (<div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: DARK3 }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <span className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: "#34D399" }}>
          <CheckCircle2 className="w-3 h-3"/>
          {data.added} lead{data.added !== 1 ? "s" : ""} imported
        </span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${sourceColor}20`, color: sourceColor }}>
          via {sourceLabel}
        </span>
      </div>

      {/* Lead list */}
      <div className="max-h-48 overflow-y-auto">
        {leadsToShow.map((l, i) => {
            let domain = null;
            if (l.website) {
                try {
                    domain = new URL(l.website.startsWith("http") ? l.website : `https://${l.website}`).hostname.replace(/^www\./, "");
                }
                catch { /* ignore */ }
            }
            return (<div key={l.id ?? i} className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: i < leadsToShow.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <div className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: `linear-gradient(135deg,${PURPLE},#4F35A8)` }}>
                {(l.company || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold truncate" style={{ color: "#E2E8F0" }}>{l.company}</div>
                {domain && <div className="text-[9px] truncate" style={{ color: "#6B7280" }}>{domain}</div>}
              </div>
              {l.phone && (<div className="flex-shrink-0 flex items-center gap-0.5 max-w-[80px]" style={{ color: "#6B7280" }}>
                  <Phone className="w-2.5 h-2.5 flex-shrink-0"/>
                  <span className="text-[9px] truncate">{l.phone}</span>
                </div>)}
            </div>);
        })}
        {data.leads.length > 12 && (<div className="px-3 py-1.5 text-[10px] text-center" style={{ color: "#6B7280" }}>
            +{data.leads.length - 12} more
          </div>)}
      </div>

      {/* Footer CTA */}
      <div className="px-3 py-2" style={{ borderTop: `1px solid ${BORDER}` }}>
        <a href={`${import.meta.env.BASE_URL}leads?source=${encodeURIComponent(data.source)}`} className="text-[11px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-80" style={{ color: PURPLE_L }}>
          View all leads <ArrowRight className="w-3 h-3"/>
        </a>
      </div>
    </div>);
}
function StatsCard({ data }) {
    const stats = [
        { label: "Total Leads", value: data.totalLeads, color: "#7C3AED" },
        { label: "Qualified", value: data.qualifiedLeads, color: "#10B981" },
        { label: "Meetings This Week", value: data.meetingsThisWeek, color: "#0EA5E9" },
        { label: "Emails Today", value: data.emailsSentToday, color: "#F59E0B" },
        { label: "Proposals Sent", value: data.proposalsSent, color: "#8B5CF6" },
        { label: "Deals Won (mo)", value: data.dealsWonThisMonth, color: "#34D399" },
    ];
    return (<div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: DARK3 }}>
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <span className="text-[11px] font-bold" style={{ color: PURPLE_L }}><BarChart2 className="w-3 h-3 inline mr-1"/>Pipeline Stats</span>
      </div>
      <div className="grid grid-cols-2 gap-px p-1" style={{ background: BORDER }}>
        {stats.map(s => (<div key={s.label} className="px-3 py-2 flex flex-col" style={{ background: DARK3 }}>
            <span className="text-[18px] font-black" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{s.label}</span>
          </div>))}
      </div>
      {data.bounceRatePercent > 0 && (<div className="px-3 py-2 text-[10px]" style={{ color: data.bounceRatePercent > 5 ? "#F87171" : "#9CA3AF" }}>
          Bounce rate: {data.bounceRatePercent}%{data.bounceRatePercent > 5 ? " ⚠️ — autopilot paused" : ""}
        </div>)}
    </div>);
}
function HealthCard({ data }) {
    const total = data.working + data.down + data.dead;
    return (<div className="mt-2 rounded-xl p-3" style={{ border: `1px solid ${BORDER}`, background: DARK3 }}>
      <div className="text-[11px] font-bold mb-2" style={{ color: PURPLE_L }}><Globe className="w-3 h-3 inline mr-1"/>Website Health — {data.totalChecked} checked</div>
      <div className="flex gap-2">
        {[
            { label: "Working", value: data.working, color: "#34D399", bg: "#064E3B" },
            { label: "Down", value: data.down, color: "#F59E0B", bg: "#451A03" },
            { label: "Dead", value: data.dead, color: "#F87171", bg: "#450A0A" },
        ].map(s => (<div key={s.label} className="flex-1 rounded-lg p-2 text-center" style={{ background: s.bg }}>
            <div className="text-[16px] font-black" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[9px]" style={{ color: s.color + "BB" }}>{s.label}</div>
          </div>))}
      </div>
      {total > 0 && (<div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: DARK }}>
          <div className="h-full flex">
            {data.working > 0 && <div style={{ width: `${(data.working / total) * 100}%`, background: "#34D399" }}/>}
            {data.down > 0 && <div style={{ width: `${(data.down / total) * 100}%`, background: "#F59E0B" }}/>}
            {data.dead > 0 && <div style={{ width: `${(data.dead / total) * 100}%`, background: "#F87171" }}/>}
          </div>
        </div>)}
    </div>);
}
function AuditCard({ data }) {
    const score = data.brandScore ?? 0;
    const color = score >= 70 ? "#34D399" : score >= 45 ? "#F59E0B" : "#F87171";
    return (<div className="mt-2 rounded-xl p-3" style={{ border: `1px solid ${BORDER}`, background: DARK3 }}>
      <div className="text-[11px] font-bold mb-2" style={{ color: PURPLE_L }}>Brand Audit Complete</div>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-black border-2" style={{ borderColor: color, color, background: `${color}15` }}>
          {score}
        </div>
        <div>
          <div className="text-[12px] font-semibold" style={{ color: "#E2E8F0" }}>Brand Score</div>
          <div className="text-[10px]" style={{ color: "#9CA3AF" }}>{data.message?.split(".")[0] ?? ""}</div>
        </div>
      </div>
      {data.shareToken && (<a href={`/aura-ai/audit/share/${data.shareToken}`} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 text-[10px] font-semibold" style={{ color: PURPLE_L }}>
          View full report <ArrowRight className="w-3 h-3"/>
        </a>)}
    </div>);
}
function IcpCard({ data }) {
    return (<div className="mt-2 rounded-xl p-3" style={{ border: `1px solid ${BORDER}`, background: DARK3 }}>
      <div className="text-[11px] font-bold mb-1" style={{ color: PURPLE_L }}>ICP Created: {data.name}</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {[...data.industries, ...data.markets].slice(0, 6).map(t => (<span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: `${PURPLE}30`, color: PURPLE_L }}>
            {t}
          </span>))}
      </div>
    </div>);
}
function AutopilotCard({ data }) {
    return (<div className="mt-2 rounded-xl p-3 flex items-center gap-2" style={{ border: `1px solid ${BORDER}`, background: DARK3 }}>
      {data.ok ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0"/> : <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0"/>}
      <span className="text-[11px]" style={{ color: "#E2E8F0" }}>{data.message}</span>
    </div>);
}
function ErrorResultCard({ message }) {
    return (<div className="mt-2 rounded-xl p-3 flex items-start gap-2" style={{ border: "1px solid #F8717130", background: "#7F1D1D15" }}>
      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"/>
      <span className="text-[11px]" style={{ color: "#FCA5A5" }}>{message}</span>
    </div>);
}
function ResultCard({ card }) {
    const maybeError = card.data?.error;
    if (maybeError)
        return <ErrorResultCard message={maybeError}/>;
    if (card.type === "imported_leads")
        return <LeadsImportedCard data={card.data}/>;
    if (card.type === "leads")
        return <LeadsCard data={card.data}/>;
    if (card.type === "stats")
        return <StatsCard data={card.data}/>;
    if (card.type === "health")
        return <HealthCard data={card.data}/>;
    if (card.type === "audit")
        return <AuditCard data={card.data}/>;
    if (card.type === "icp")
        return <IcpCard data={card.data}/>;
    if (card.type === "autopilot")
        return <AutopilotCard data={card.data}/>;
    return null;
}
function ConfirmCard({ preview, onConfirm, onCancel, loading, }) {
    return (<div className="mt-2 rounded-xl p-3" style={{ border: `1px solid #F59E0B44`, background: "#451A0315" }}>
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"/>
        <p className="text-[11px] leading-relaxed" style={{ color: "#FCD34D" }}>{preview.preview}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={loading} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-bold transition-all" style={{ background: PURPLE, color: "#fff", opacity: loading ? 0.6 : 1 }}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin"/> : <CheckCircle2 className="w-3 h-3"/>}
          Confirm
        </button>
        <button onClick={onCancel} disabled={loading} className="flex-1 py-2 rounded-lg text-[12px] font-bold transition-all" style={{ background: DARK, color: "#9CA3AF", border: `1px solid ${BORDER}` }}>
          Cancel
        </button>
      </div>
    </div>);
}
// ── Live activity bubble (streams in real-time) ───────────────────────────────
function ActivityBubble({ activity, onConfirm, onCancel, confirmLoading, }) {
    const hasContent = activity.content.length > 0;
    return (<div className="flex justify-start mb-3">
      <div className="w-6 h-6 rounded-full flex-shrink-0 mr-2 flex items-center justify-center mt-0.5" style={{ background: `linear-gradient(135deg,${PURPLE},#4F35A8)`, animation: "pulse 1.5s infinite" }}>
        <Sparkles className="w-3 h-3 text-white"/>
      </div>
      <div className="max-w-[85%]">
        <div className="px-3 py-2 rounded-2xl rounded-tl-sm text-[13px] leading-relaxed whitespace-pre-wrap" style={{ background: DARK3, color: "#E2E8F0", border: `1px solid ${BORDER}` }}>
          {hasContent ? (activity.content) : (<span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400" style={{ animation: "bounce 0.8s infinite" }}/>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400" style={{ animation: "bounce 0.8s 0.15s infinite" }}/>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400" style={{ animation: "bounce 0.8s 0.3s infinite" }}/>
            </span>)}
        </div>
        {activity.toolResults.map((card, i) => <ResultCard key={i} card={card}/>)}
        {activity.needsConfirmation && (<ConfirmCard preview={activity.needsConfirmation} onConfirm={() => onConfirm(activity.needsConfirmation)} onCancel={onCancel} loading={confirmLoading}/>)}
      </div>
    </div>);
}
// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, onConfirm, onCancel, confirmLoading, }) {
    const isUser = msg.role === "user";
    return (<div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      {!isUser && (<div className="w-6 h-6 rounded-full flex-shrink-0 mr-2 flex items-center justify-center mt-0.5" style={{ background: `linear-gradient(135deg,${PURPLE},#4F35A8)` }}>
          <Sparkles className="w-3 h-3 text-white"/>
        </div>)}
      <div className={`max-w-[85%] ${isUser ? "order-last" : ""}`}>
        {isUser ? (<div className="px-3 py-2 rounded-2xl rounded-tr-sm text-[13px] leading-relaxed" style={{ background: `linear-gradient(135deg,${PURPLE},#4F35A8)`, color: "#fff" }}>
            {msg.content}
          </div>) : (<div>
            <div className="px-3 py-2 rounded-2xl rounded-tl-sm text-[13px] leading-relaxed whitespace-pre-wrap" style={{ background: DARK3, color: "#E2E8F0", border: `1px solid ${BORDER}` }}>
              {msg.content}
            </div>
            {msg.toolResults?.map((card, i) => <ResultCard key={i} card={card}/>)}
            {msg.needsConfirmation && (<ConfirmCard preview={msg.needsConfirmation} onConfirm={() => onConfirm(msg.needsConfirmation)} onCancel={onCancel} loading={confirmLoading}/>)}
          </div>)}
        <div className="text-[9px] mt-1 px-1" style={{ color: "#4B5563", textAlign: isUser ? "right" : "left" }}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>);
}
// ── Main component ────────────────────────────────────────────────────────────
export default function MysaAssistant({ open, onClose, }) {
    const uid = useId();
    const sessionId = useRef(`mysa-${uid}-${Date.now()}`);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const liveRef = useRef({ content: "", toolResults: [] });
    const [messages, setMessages] = useState([]);
    const [liveActivity, setLiveActivity] = useState(null);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [error, setError] = useState(null);
    // Scroll to bottom on new messages or live activity changes
    useEffect(() => {
        if (open)
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, liveActivity, open]);
    // Focus input when panel opens
    useEffect(() => {
        if (open)
            setTimeout(() => inputRef.current?.focus(), 200);
    }, [open]);
    function buildSSEHandler() {
        const handleEvent = (event, data) => {
            const d = data;
            switch (event) {
                case "thinking":
                    liveRef.current = { content: "", toolResults: [] };
                    setLiveActivity({ content: "", toolResults: [] });
                    break;
                case "tool_start": {
                    const text = getToolStartText(String(d["tool"] ?? ""), (d["params"] ?? {}));
                    liveRef.current = { ...liveRef.current, content: text };
                    setLiveActivity({ ...liveRef.current });
                    break;
                }
                case "progress": {
                    const msg = String(d["message"] ?? "");
                    liveRef.current = { ...liveRef.current, content: msg };
                    setLiveActivity({ ...liveRef.current });
                    break;
                }
                case "tool_done": {
                    const card = classifyResult(String(d["tool"] ?? ""), d["result"]);
                    liveRef.current = { ...liveRef.current, toolResults: [...liveRef.current.toolResults, card] };
                    setLiveActivity({ ...liveRef.current });
                    break;
                }
                case "needs_confirmation": {
                    const conf = d;
                    liveRef.current = { ...liveRef.current, needsConfirmation: conf };
                    setLiveActivity({ ...liveRef.current });
                    break;
                }
                case "reply": {
                    const text = String(d["text"] ?? "");
                    liveRef.current = { ...liveRef.current, content: text };
                    setLiveActivity({ ...liveRef.current });
                    break;
                }
                case "error": {
                    setError(String(d["message"] ?? "Something went wrong"));
                    setLiveActivity(null);
                    liveRef.current = { content: "", toolResults: [] };
                    break;
                }
                default:
                    break;
            }
        };
        return handleEvent;
    }
    function classifyResult(tool, result) {
        switch (tool) {
            case "search_my_leads": return { type: "leads", data: result };
            case "get_stats": return { type: "stats", data: result };
            case "check_website_health": return { type: "health", data: result };
            case "run_brand_audit": return { type: "audit", data: result };
            case "create_icp": return { type: "icp", data: result };
            case "find_leads": return { type: "imported_leads", data: result };
            case "start_autopilot":
            case "stop_autopilot": return { type: "autopilot", data: result };
            default: return { type: "generic", data: result };
        }
    }
    function finalizeActivity() {
        const act = liveRef.current;
        if (act.content || act.toolResults.length || act.needsConfirmation) {
            setMessages(prev => [...prev, {
                    role: "assistant",
                    content: act.content,
                    toolResults: act.toolResults.length ? act.toolResults : undefined,
                    needsConfirmation: act.needsConfirmation,
                    timestamp: new Date().toISOString(),
                }]);
        }
        setLiveActivity(null);
        liveRef.current = { content: "", toolResults: [] };
    }
    async function sendMessage(text) {
        const trimmed = text.trim();
        if (!trimmed || loading)
            return;
        setInput("");
        setError(null);
        setLoading(true);
        const userMsg = { role: "user", content: trimmed, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        liveRef.current = { content: "", toolResults: [] };
        setLiveActivity({ content: "", toolResults: [] });
        try {
            const res = await fetch("/api/assistant/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ message: trimmed, session_id: sessionId.current }),
            });
            if (!res.ok || !res.body) {
                const err = await res.json().catch(() => ({ error: "Unknown error" }));
                throw new Error(err.error ?? "Request failed");
            }
            await readSSEStream(res, buildSSEHandler());
            finalizeActivity();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
            setLiveActivity(null);
            liveRef.current = { content: "", toolResults: [] };
        }
        finally {
            setLoading(false);
        }
    }
    async function handleConfirm(preview) {
        setConfirmLoading(true);
        setError(null);
        // Remove confirm card from last message
        setMessages(prev => prev.map(m => m.needsConfirmation?.actionId === preview.actionId ? { ...m, needsConfirmation: undefined } : m));
        // Show activity bubble for the executing action
        liveRef.current = { content: "Executing…", toolResults: [] };
        setLiveActivity({ content: "Executing…", toolResults: [] });
        setLoading(true);
        try {
            const res = await fetch("/api/assistant/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    session_id: sessionId.current,
                    action_id: preview.actionId,
                    fallback_tool: preview.tool,
                    fallback_input: preview.input,
                }),
            });
            if (!res.ok || !res.body) {
                const err = await res.json().catch(() => ({ error: "Unknown error" }));
                throw new Error(err.error ?? "Confirm failed");
            }
            await readSSEStream(res, buildSSEHandler());
            finalizeActivity();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Confirm failed");
            setLiveActivity(null);
            liveRef.current = { content: "", toolResults: [] };
        }
        finally {
            setConfirmLoading(false);
            setLoading(false);
        }
    }
    function handleCancel() {
        // Remove confirm cards from messages
        setMessages(prev => prev.map(m => ({ ...m, needsConfirmation: undefined })));
        const cancelMsg = { role: "user", content: "Cancel", timestamp: new Date().toISOString() };
        const replyMsg = { role: "assistant", content: "Cancelled. What else can I help you with?", timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, cancelMsg, replyMsg]);
    }
    function handleKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    }
    function startNewChat() {
        sessionId.current = `mysa-${uid}-${Date.now()}`;
        setMessages([]);
        setLiveActivity(null);
        liveRef.current = { content: "", toolResults: [] };
        setInput("");
        setError(null);
    }
    const showWelcome = messages.length === 0 && !liveActivity;
    return (<>
      {/* Overlay for mobile */}
      {open && (<div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}/>)}

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 z-50 flex flex-col transition-transform duration-300" style={{
            width: "min(400px, 100vw)",
            background: DARK,
            borderLeft: `1px solid ${BORDER}`,
            transform: open ? "translateX(0)" : "translateX(100%)",
            boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.5)" : "none",
        }}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}`, background: DARK2 }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg,${PURPLE},#4F35A8)` }}>
              <Sparkles className="w-4 h-4 text-white"/>
            </div>
            <div>
              <div className="text-[13px] font-bold" style={{ color: "#E2E8F0" }}>Mysa</div>
              <div className="text-[9px]" style={{ color: "#6B7280" }}>AI Sales Assistant</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (<button onClick={startNewChat} title="New chat" className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: "#6B7280" }}>
                <RefreshCw className="w-3.5 h-3.5"/>
              </button>)}
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: "#6B7280" }}>
              <X className="w-4 h-4"/>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {showWelcome ? (
        /* Welcome state */
        <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center text-center pb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `linear-gradient(135deg,${PURPLE},#4F35A8)` }}>
                  <Sparkles className="w-7 h-7 text-white"/>
                </div>
                <h2 className="text-[17px] font-black leading-snug mb-1" style={{ color: "#E2E8F0" }}>
                  I'm Mysa, your AI<br />Sales Assistant
                </h2>
                <p className="text-[12px] leading-relaxed max-w-xs" style={{ color: "#9CA3AF" }}>
                  Ask me to find leads, run audits, check website health, or manage your outreach automation.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#6B7280" }}>
                  Try asking
                </div>
                {EXAMPLE_PROMPTS.map(({ icon: Icon, text, color }) => (<button key={text} onClick={() => sendMessage(text)} disabled={loading} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all" style={{ background: DARK3, border: `1px solid ${BORDER}`, color: "#E2E8F0", opacity: loading ? 0.5 : 1 }} onMouseEnter={e => { if (!loading)
                e.currentTarget.style.background = DARK2; }} onMouseLeave={e => { e.currentTarget.style.background = DARK3; }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}22` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color }}/>
                    </div>
                    <span className="text-[12px]">{text}</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0" style={{ color: "#4B5563" }}/>
                  </button>))}
              </div>
            </div>) : (
        /* Chat thread */
        <div>
              {messages.map((msg, i) => (<MessageBubble key={i} msg={msg} onConfirm={handleConfirm} onCancel={handleCancel} confirmLoading={confirmLoading}/>))}
              {liveActivity && (<ActivityBubble activity={liveActivity} onConfirm={handleConfirm} onCancel={handleCancel} confirmLoading={confirmLoading}/>)}
              {error && (<div className="mb-3 px-3 py-2 rounded-xl text-[11px] flex items-center gap-2" style={{ background: "#450A0A", color: "#F87171", border: "1px solid #7F1D1D" }}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0"/>
                  {error}
                </div>)}
              <div ref={bottomRef}/>
            </div>)}
        </div>

        {/* Input box */}
        <div className="flex-shrink-0 px-3 pb-4 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="flex items-end gap-2 px-3 py-2 rounded-2xl" style={{ background: DARK2, border: `1px solid ${BORDER}` }}>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="What can I help you do?" rows={1} disabled={loading} className="flex-1 resize-none bg-transparent border-none outline-none text-[13px] leading-relaxed placeholder:text-gray-600" style={{ color: "#E2E8F0", minHeight: 24, maxHeight: 120 }} onInput={e => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
        }}/>
            <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading} className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all" style={{
            background: input.trim() && !loading ? `linear-gradient(135deg,${PURPLE},#4F35A8)` : DARK3,
            color: input.trim() && !loading ? "#fff" : "#4B5563",
        }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
            </button>
          </div>
          <p className="text-[9px] text-center mt-2" style={{ color: "#374151" }}>
            Mysa only uses tools it was given — no hallucinations, no rogue actions.
          </p>
        </div>
      </div>
    </>);
}
