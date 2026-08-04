import { useState, useEffect, useCallback } from "react";
import { FileText, TrendingUp, Flame, ChevronDown, ChevronUp, Search, X, BarChart2, Clock, Phone, Globe, MapPin, Building2, User, Target, AlertTriangle, CheckCircle2, ExternalLink, } from "lucide-react";
const LEAD_STATUSES = ["new_enquiry", "enquiry_qualified", "discovery_call", "quote_sent", "follow_up", "project_won", "project_lost"];
const STATUS_LABELS = { new_enquiry: "New Enquiry", enquiry_qualified: "Enquiry Qualified", discovery_call: "Discovery Call", quote_sent: "Quote / Estimation Sent", follow_up: "Follow Up / Negotiation", project_won: "Project Won", project_lost: "Project Lost" };
const STATUS_DOT = { new_enquiry: "#3B82F6", enquiry_qualified: "#CB3273", discovery_call: "#0D9488", quote_sent: "#DE377C", follow_up: "#DE377C", project_won: "#16A34A", project_lost: "#EF4444" };
const STATUS_BG = { new_enquiry: "#EFF6FF", enquiry_qualified: "#FBE9F1", discovery_call: "#F0FDFA", quote_sent: "#FFFBEB", follow_up: "#FFF7ED", project_won: "#F0FDF4", project_lost: "#FEF2F2" };
const TIER_META = {
    HOT: { icon: "🔥", bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
    WARM: { icon: "☀️", bg: "#FFFBEB", color: "#DE377C", border: "#FBE9F1" },
    COOL: { icon: "💧", bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
    COLD: { icon: "❄️", bg: "#F9FAFB", color: "#6B7280", border: "#E5E7EB" },
};
function TierBadge({ tier }) {
    const t = (tier?.toUpperCase() ?? "COLD");
    const m = TIER_META[t] ?? TIER_META.COLD;
    return <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>{m.icon} {t}</span>;
}
function InfoChip({ icon, label, value }) {
    if (!value || value === "Unknown" || value === "Prospect" || value === "Other")
        return null;
    return (<div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12 }}>
      <span style={{ color: "#9CA3AF", marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div><span style={{ color: "#9CA3AF", fontWeight: 500 }}>{label}: </span><span style={{ color: "#374151", fontWeight: 600 }}>{value}</span></div>
    </div>);
}
function QualChip({ label, value }) {
    if (!value)
        return null;
    return (<div style={{ padding: "6px 12px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #F3F4F6" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{value}</div>
    </div>);
}
function StatusSelect({ leadId, current, onUpdate }) {
    const [saving, setSaving] = useState(false);
    const dot = STATUS_DOT[current] ?? "#9CA3AF";
    const bg = STATUS_BG[current] ?? "#F9FAFB";
    async function handleChange(e) {
        const next = e.target.value;
        setSaving(true);
        try {
            await fetch("/api/leads/bulk", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [leadId], status: next }) });
            onUpdate(leadId, next);
        }
        finally {
            setSaving(false);
        }
    }
    return (<div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span style={{ position: "absolute", left: 8, width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0, pointerEvents: "none" }}/>
      <select value={current} onChange={handleChange} disabled={saving} onClick={e => e.stopPropagation()} style={{ paddingLeft: 22, paddingRight: 22, paddingTop: 5, paddingBottom: 5, fontSize: 11, fontWeight: 700, borderRadius: 20, border: `1px solid ${dot}55`, background: saving ? "#F9FAFB" : bg, color: dot, cursor: saving ? "wait" : "pointer", appearance: "none", outline: "none", minWidth: 140, transition: "all .15s" }}>
        {LEAD_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>
      <ChevronDown style={{ position: "absolute", right: 7, width: 11, height: 11, color: dot, pointerEvents: "none" }}/>
    </div>);
}
function TranscriptModal({ lead, onClose, onStatusUpdate }) {
    const bd = lead.bantBreakdown;
    const tier = ((bd?.tier ?? "COLD").toUpperCase());
    const isNewLead = typeof bd?.isDecisionMaker === "string" || typeof bd?.budget === "string";
    const transcript = bd?.transcript ?? [];
    return (<div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,.55)" }} onClick={e => { if (e.target === e.currentTarget)
        onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{lead.firstName} {lead.lastName}</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span>{lead.email}</span>{lead.phone && <span>· {lead.phone}</span>}
              {lead.bantScore != null && <span style={{ background: "#FBE9F1", color: "#8E1F54", padding: "1px 8px", borderRadius: 12, fontWeight: 700, fontSize: 11 }}>BANT {lead.bantScore}/12</span>}
              <TierBadge tier={tier}/>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><X className="w-4 h-4 text-gray-500"/></button>
        </div>
        <div style={{ padding: "10px 22px", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>Status:</span>
          <StatusSelect leadId={lead.id} current={lead.status ?? "new_enquiry"} onUpdate={onStatusUpdate}/>
        </div>
        <div style={{ padding: "12px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", flexWrap: "wrap", gap: 12 }}>
          <InfoChip icon={<Building2 className="w-3.5 h-3.5"/>} label="Company" value={lead.company}/>
          <InfoChip icon={<User className="w-3.5 h-3.5"/>} label="Role" value={lead.designation !== "Prospect" ? lead.designation : null}/>
          <InfoChip icon={<Globe className="w-3.5 h-3.5"/>} label="Website" value={lead.website}/>
          <InfoChip icon={<MapPin className="w-3.5 h-3.5"/>} label="Location" value={lead.country !== "Unknown" ? lead.country : (bd?.location || null)}/>
          <InfoChip icon={<Target className="w-3.5 h-3.5"/>} label="Industry" value={lead.industry !== "Other" ? lead.industry : null}/>
        </div>
        {isNewLead && (<div style={{ padding: "10px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {typeof bd?.budget === "string" && bd.budget && <QualChip label="Budget" value={bd.budget}/>}
            {bd?.isDecisionMaker && <QualChip label="Decision Maker" value={bd.isDecisionMaker}/>}
            {typeof bd?.timeline === "string" && bd.timeline && <QualChip label="Timeline" value={bd.timeline}/>}
          </div>)}
        {(bd?.problemSummary || bd?.biggestChallenge || lead.notes || bd?.goals?.length || bd?.aiOpportunities?.length || bd?.objections?.length) && (<div style={{ padding: "12px 22px", borderBottom: "1px solid #F3F4F6" }}>
            {(bd?.problemSummary || bd?.biggestChallenge) && <div style={{ padding: "9px 13px", background: "#FBE9F1", borderRadius: 8, fontSize: 13, color: "#8E1F54", fontStyle: "italic", marginBottom: 10 }}>"{bd?.problemSummary || bd?.biggestChallenge}"</div>}
            {lead.notes && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}><strong>Sales summary:</strong> {lead.notes}</div>}
            {bd?.goals && bd.goals.length > 0 && <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}><strong>Goals:</strong> {bd.goals.join(", ")}</div>}
            {((bd?.aiOpportunities?.length ?? 0) > 0 || bd?.recommendedPackage) && <div style={{ fontSize: 12, color: "#059669", marginBottom: 4, display: "flex", gap: 6, alignItems: "flex-start" }}><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/><span><strong>Recommended:</strong> {bd?.aiOpportunities?.join(", ") || bd?.recommendedPackage}</span></div>}
            {(bd?.objections?.length ?? 0) > 0 && <div style={{ fontSize: 12, color: "#DC2626", display: "flex", gap: 6, alignItems: "flex-start" }}><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/><span><strong>Objections:</strong> {bd.objections.join("; ")}</span></div>}
          </div>)}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 22px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#9CA3AF", letterSpacing: "0.06em", marginBottom: 12 }}>Full Conversation {transcript.length > 0 ? `(${transcript.length} messages)` : ""}</div>
          {transcript.length === 0
            ? <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "24px 0" }}>This lead was captured via the Growth Quest form — no chat transcript.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {transcript.map((msg, i) => (<div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, fontWeight: 600 }}>{msg.role === "user" ? "Visitor" : "Krish (AI)"}</div>
                    <div style={{ maxWidth: "82%", padding: "9px 13px", borderRadius: 14, borderBottomLeftRadius: msg.role === "user" ? 14 : 3, borderBottomRightRadius: msg.role === "user" ? 3 : 14, background: msg.role === "user" ? "#A4285E" : "#F3F4F6", color: msg.role === "user" ? "#fff" : "#111827", fontSize: 13, lineHeight: 1.55 }}>{msg.content}</div>
                  </div>))}
              </div>}
        </div>
      </div>
    </div>);
}
function LeadCard({ lead, onViewTranscript, onStatusUpdate }) {
    const [expanded, setExpanded] = useState(false);
    const bd = lead.bantBreakdown;
    const tier = ((bd?.tier ?? "COLD").toUpperCase());
    const isNewLead = typeof bd?.isDecisionMaker === "string" || typeof bd?.budget === "string";
    const currentStatus = lead.status ?? "new_enquiry";
    const isUnseen = currentStatus === "new_enquiry";
    const dot = STATUS_DOT[currentStatus] ?? "#9CA3AF";
    const serviceLabel = bd?.serviceInterest || lead.industry || bd?.industry || "—";
    function fmt(d) {
        const diff = Date.now() - new Date(d).getTime();
        if (diff < 60000)
            return "just now";
        if (diff < 3600000)
            return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000)
            return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 7 * 86400000)
            return `${Math.floor(diff / 86400000)}d ago`;
        return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    }
    return (<div style={{ background: isUnseen ? "#fff" : "#FAFAFA", border: `1px solid ${isUnseen ? "#DBEAFE" : "#E5E7EB"}`, borderLeft: `4px solid ${isUnseen ? "#DE377C" : "#E5E7EB"}`, borderRadius: 14, overflow: "hidden", boxShadow: isUnseen ? "0 2px 8px rgba(255,107,53,0.09)" : "none", opacity: currentStatus === "project_lost" ? 0.65 : 1 }}>
      <div onClick={() => setExpanded(e => !e)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: isUnseen ? "linear-gradient(135deg,#DE377C,#CB3273,#E15C94)" : "linear-gradient(135deg,#9CA3AF,#6B7280)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15 }}>
          {lead.firstName[0]?.toUpperCase() ?? "?"}
        </div>
        <div style={{ flex: "0 0 210px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: isUnseen ? "#111827" : "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.firstName} {lead.lastName}</span>
            {isUnseen && <span style={{ fontSize: 9, fontWeight: 800, background: "#DE377C", color: "#fff", padding: "1px 6px", borderRadius: 10, letterSpacing: "0.04em", flexShrink: 0 }}>NEW</span>}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.email}</div>
          {lead.phone && <div style={{ fontSize: 11, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}><Phone className="w-3 h-3"/> {lead.phone}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: isUnseen ? "#374151" : "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{serviceLabel}</div>
          {lead.company && lead.company !== "Unknown" && <div style={{ fontSize: 11, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}><Building2 className="w-3 h-3"/> {lead.company}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <StatusSelect leadId={lead.id} current={currentStatus} onUpdate={onStatusUpdate}/>
          <TierBadge tier={tier}/>
          <div style={{ textAlign: "center", minWidth: 40 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: tier === "HOT" ? "#DC2626" : tier === "WARM" ? "#DE377C" : "#9CA3AF" }}>{lead.bantScore ?? "—"}</span>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>/12</span>
          </div>
          <div style={{ fontSize: 12, color: "#9CA3AF", minWidth: 50, textAlign: "right" }}>{fmt(lead.createdAt)}</div>
          <button onClick={e => { e.stopPropagation(); onViewTranscript(); }} style={{ fontSize: 11, fontWeight: 700, color: "#DE377C", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>Details</button>
        </div>
        <div onClick={() => setExpanded(e => !e)} style={{ cursor: "pointer", flexShrink: 0 }}>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400"/> : <ChevronDown className="w-4 h-4 text-gray-400"/>}
        </div>
      </div>

      {!isUnseen && <div style={{ height: 2, background: `linear-gradient(90deg,${dot}33,transparent)` }}/>}

      {expanded && (<div style={{ borderTop: "1px solid #F3F4F6", padding: "14px 16px 16px", background: isUnseen ? "#FFFBF5" : "#F9FAFB" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8, marginBottom: 12 }}>
            <InfoChip icon={<Phone className="w-3 h-3"/>} label="Phone" value={lead.phone}/>
            <InfoChip icon={<Building2 className="w-3 h-3"/>} label="Company" value={lead.company !== "Unknown" ? lead.company : null}/>
            <InfoChip icon={<User className="w-3 h-3"/>} label="Role" value={lead.designation !== "Prospect" ? lead.designation : null}/>
            <InfoChip icon={<Globe className="w-3 h-3"/>} label="Website" value={lead.website}/>
            <InfoChip icon={<Target className="w-3 h-3"/>} label="Industry" value={lead.industry !== "Other" ? lead.industry : null}/>
            <InfoChip icon={<MapPin className="w-3 h-3"/>} label="Location" value={lead.country !== "Unknown" ? lead.country : (bd?.location || null)}/>
          </div>
          {isNewLead && (<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {typeof bd?.budget === "string" && bd.budget && <QualChip label="Budget" value={bd.budget}/>}
              {bd?.isDecisionMaker && <QualChip label="Decision Maker" value={bd.isDecisionMaker}/>}
              {typeof bd?.timeline === "string" && bd.timeline && <QualChip label="Timeline" value={bd.timeline}/>}
              {bd?.goals && bd.goals.length > 0 && <QualChip label="Goals" value={bd.goals.slice(0, 3).join(", ")}/>}
            </div>)}
          {(bd?.biggestChallenge || bd?.problemSummary) && <div style={{ fontSize: 13, color: "#92400E", background: "#FFFBEB", borderRadius: 8, padding: "9px 13px", fontStyle: "italic", marginBottom: 8 }}>"{bd?.biggestChallenge || bd?.problemSummary}"</div>}
          {lead.notes && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}><strong>Notes:</strong> {lead.notes}</div>}
          {((bd?.aiOpportunities?.length ?? 0) > 0 || bd?.recommendedPackage) && <div style={{ fontSize: 12, color: "#059669", marginBottom: 5, display: "flex", gap: 5, alignItems: "flex-start" }}><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/><span><strong>Recommended:</strong> {bd?.aiOpportunities?.join(", ") || bd?.recommendedPackage}</span></div>}
          {(bd?.objections?.length ?? 0) > 0 && <div style={{ fontSize: 12, color: "#DC2626", display: "flex", gap: 5, alignItems: "flex-start" }}><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/><span><strong>Objections:</strong> {bd.objections.join("; ")}</span></div>}
        </div>)}
    </div>);
}
export default function FormLeads() {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterTier, setFilterTier] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");
    const [transcriptLead, setTranscriptLead] = useState(null);
    const [sortDesc, setSortDesc] = useState(true);
    useEffect(() => {
        fetchLeads(true);
        const interval = setInterval(() => fetchLeads(false), 20000);
        return () => clearInterval(interval);
    }, []);
    async function fetchLeads(showSpinner = true) {
        if (showSpinner)
            setLoading(true);
        try {
            const res = await fetch("/api/leads?source=Growth+Quest+Form+-+Dreamsdesign&limit=500", { credentials: "include" });
            const data = await res.json();
            setLeads(Array.isArray(data.leads) ? data.leads : []);
        }
        catch {
            if (showSpinner)
                setLeads([]);
        }
        finally {
            if (showSpinner)
                setLoading(false);
        }
    }
    const handleStatusUpdate = useCallback((id, status) => {
        setLeads(p => p.map(l => l.id === id ? { ...l, status } : l));
        setTranscriptLead(p => p?.id === id ? { ...p, status } : p);
    }, []);
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = todayStart - 6 * 86400000;
    const todayCount = leads.filter(l => new Date(l.createdAt).getTime() >= todayStart).length;
    const weekCount = leads.filter(l => new Date(l.createdAt).getTime() >= weekStart).length;
    const hotCount = leads.filter(l => (l.bantBreakdown?.tier ?? "").toUpperCase() === "HOT").length;
    const newCount = leads.filter(l => (l.status ?? "new_enquiry") === "new_enquiry").length;
    const filtered = leads.filter(l => {
        const tier = (l.bantBreakdown?.tier ?? "COLD").toUpperCase();
        if (filterTier !== "all" && tier !== filterTier)
            return false;
        const st = l.status ?? "new_enquiry";
        if (filterStatus !== "all" && st !== filterStatus)
            return false;
        if (search) {
            const q = search.toLowerCase();
            return `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || (l.phone ?? "").includes(q) || (l.company ?? "").toLowerCase().includes(q) || (l.industry ?? "").toLowerCase().includes(q);
        }
        return true;
    }).sort((a, b) => {
        const an = (a.status ?? "new_enquiry") === "new_enquiry" ? 1 : 0;
        const bn = (b.status ?? "new_enquiry") === "new_enquiry" ? 1 : 0;
        if (an !== bn)
            return bn - an;
        return sortDesc ? (b.bantScore ?? 0) - (a.bantScore ?? 0) : (a.bantScore ?? 0) - (b.bantScore ?? 0);
    });
    return (<div style={{ padding: "24px 28px", maxWidth: 1160, margin: "0 auto" }}>
      {transcriptLead && <TranscriptModal lead={transcriptLead} onClose={() => setTranscriptLead(null)} onStatusUpdate={handleStatusUpdate}/>}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#DE377C,#CB3273,#E15C94)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FileText className="w-5 h-5 text-white"/>
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>Growth Quest Form Leads</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Leads captured via the interactive Growth Quest qualification form</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <a href="/aura-ai/form-quest" target="_blank" style={{ display: "flex", alignItems: "center", gap: 5, background: "linear-gradient(135deg,#DE377C,#CB3273)", color: "#fff", padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            <ExternalLink className="w-3.5 h-3.5"/> Open Form
          </a>
          <button onClick={() => fetchLeads(true)} style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#C2410C", padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Refresh</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
            { label: "Unchecked", value: newCount, icon: <Clock className="w-4 h-4"/>, color: "#DE377C" },
            { label: "This Week", value: weekCount, icon: <TrendingUp className="w-4 h-4"/>, color: "#CB3273" },
            { label: "HOT Leads", value: hotCount, icon: <Flame className="w-4 h-4"/>, color: "#EF4444" },
            { label: "Today", value: todayCount, icon: <FileText className="w-4 h-4"/>, color: "#DE377C" },
        ].map(s => (<div key={s.label} style={{ background: "#fff", border: "1px solid #F3F4F6", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>))}
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {["all", ...LEAD_STATUSES].map(s => {
            const cnt = s === "all" ? leads.length : leads.filter(l => (l.status ?? "new_enquiry") === s).length;
            const active = filterStatus === s;
            const dot = STATUS_DOT[s];
            return (<button key={s} onClick={() => setFilterStatus(s)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: active ? (dot ?? "#DE377C") : "#F3F4F6", color: active ? "#fff" : "#6B7280", transition: "all .15s" }}>
              {dot && !active && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, display: "inline-block", flexShrink: 0 }}/>}
              {s === "all" ? "All" : STATUS_LABELS[s]} <span style={{ fontSize: 11, fontWeight: 700, opacity: .75 }}>({cnt})</span>
            </button>);
        })}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search className="w-4 h-4" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, phone, company…" style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: "1px solid #E5E7EB", borderRadius: 10, fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }}/>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "HOT", "WARM", "COOL", "COLD"].map(t => (<button key={t} onClick={() => setFilterTier(t)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: filterTier === t ? "#DE377C" : "#F3F4F6", color: filterTier === t ? "#fff" : "#6B7280", transition: "all .15s" }}>
              {t === "all" ? "All Tiers" : t}
            </button>))}
        </div>
        <button onClick={() => setSortDesc(v => !v)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", border: "1px solid #E5E7EB", borderRadius: 10, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
          <BarChart2 className="w-3.5 h-3.5"/> BANT {sortDesc ? "↓" : "↑"}
        </button>
      </div>

      {!loading && filtered.length > 0 && (<div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 10, fontWeight: 500 }}>
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
          {newCount > 0 && filterStatus === "all" && <span style={{ marginLeft: 8, color: "#DE377C", fontWeight: 700 }}>· {newCount} unchecked</span>}
        </div>)}

      {loading ? (<div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF", fontSize: 15 }}>Loading leads…</div>) : filtered.length === 0 ? (<div style={{ textAlign: "center", padding: "60px 0", background: "#FAFAFA", borderRadius: 16, border: "1px solid #F3F4F6" }}>
          <FileText className="w-10 h-10" style={{ color: "#E5E7EB", margin: "0 auto 12px" }}/>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>No form leads yet</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>
            {leads.length === 0
                ? <span>Share the form link with customers to start collecting leads. <a href="/aura-ai/form-quest" target="_blank" style={{ color: "#DE377C", fontWeight: 600 }}>Open Form →</a></span>
                : "Try adjusting your search or filter"}
          </div>
        </div>) : (<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(lead => (<LeadCard key={lead.id} lead={lead} onViewTranscript={() => setTranscriptLead(lead)} onStatusUpdate={handleStatusUpdate}/>))}
        </div>)}

      {/* Standalone link box */}
      <div style={{ marginTop: 32, padding: "18px 20px", background: "linear-gradient(135deg,#1A0A00,#0F0A00)", borderRadius: 16, border: "1px solid rgba(255,107,53,.25)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#DE377C", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>🔗 Standalone Public Link</div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginBottom: 10 }}>Share this link with your customers — they can fill out the Growth Quest form and their responses will automatically appear here as leads.</p>
        <div style={{ background: "rgba(0,0,0,.3)", borderRadius: 10, padding: "11px 16px", fontFamily: "monospace", fontSize: 13, color: "#DE377C", letterSpacing: .5 }}>
          {window.location.origin}/aura-ai/form-quest
        </div>
      </div>
    </div>);
}
