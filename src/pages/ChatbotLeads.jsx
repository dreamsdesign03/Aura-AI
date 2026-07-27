import { useState, useEffect, useCallback } from "react";
import { MessageCircle, TrendingUp, Flame, ChevronDown, ChevronUp, Search, X, BarChart2, Clock, Star, Phone, Globe, MapPin, Building2, User, Target, Zap, AlertTriangle, CheckCircle2, Inbox, Loader2, MessageSquare, } from "lucide-react";
// ── Status constants (mirrors main Leads page) ──────────────────────────────
const LEAD_STATUSES = [
    "new_enquiry", "enquiry_qualified", "discovery_call",
    "quote_sent", "follow_up", "project_won", "project_lost",
];
const STATUS_LABELS = {
    new_enquiry: "New Enquiry",
    enquiry_qualified: "Enquiry Qualified",
    discovery_call: "Discovery Call",
    quote_sent: "Quote / Estimation Sent",
    follow_up: "Follow Up / Negotiation",
    project_won: "Project Won",
    project_lost: "Project Lost",
};
const STATUS_DOT = {
    new_enquiry: "#3B82F6",
    enquiry_qualified: "#8B5CF6",
    discovery_call: "#0D9488",
    quote_sent: "#F59E0B",
    follow_up: "#F97316",
    project_won: "#16A34A",
    project_lost: "#EF4444",
};
const STATUS_BG = {
    new_enquiry: "#EFF6FF",
    enquiry_qualified: "#F5F3FF",
    discovery_call: "#F0FDFA",
    quote_sent: "#FFFBEB",
    follow_up: "#FFF7ED",
    project_won: "#F0FDF4",
    project_lost: "#FEF2F2",
};
const TIER_META = {
    HOT: { icon: "🔥", bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
    WARM: { icon: "☀️", bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" },
    COOL: { icon: "💧", bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
    COLD: { icon: "❄️", bg: "#F9FAFB", color: "#6B7280", border: "#E5E7EB" },
};
// ── Small reusable components ───────────────────────────────────────────────
function TierBadge({ tier }) {
    const t = (tier?.toUpperCase() ?? "COLD");
    const m = TIER_META[t] ?? TIER_META.COLD;
    return (<span style={{
            background: m.bg, color: m.color, border: `1px solid ${m.border}`,
            padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4,
        }}>
      {m.icon} {t}
    </span>);
}
function BANTBar({ label, score, max = 3 }) {
    const s = Math.min(max, Math.max(0, score ?? 0));
    const pct = (s / max) * 100;
    const color = pct >= 80 ? "#DC2626" : pct >= 50 ? "#D97706" : pct >= 25 ? "#2563EB" : "#9CA3AF";
    return (<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", width: 12, flexShrink: 0 }}>{label[0]}</span>
      <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s ease" }}/>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, width: 26, textAlign: "right", flexShrink: 0 }}>{s}/{max}</span>
    </div>);
}
function InfoChip({ icon, label, value }) {
    if (!value || value === "Unknown" || value === "Prospect" || value === "Other")
        return null;
    return (<div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12 }}>
      <span style={{ color: "#9CA3AF", marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <span style={{ color: "#9CA3AF", fontWeight: 500 }}>{label}: </span>
        <span style={{ color: "#374151", fontWeight: 600 }}>{value}</span>
      </div>
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
// ── Status dropdown (same look as main Leads page) ──────────────────────────
function StatusSelect({ leadId, current, onUpdate }) {
    const [saving, setSaving] = useState(false);
    const dot = STATUS_DOT[current] ?? "#9CA3AF";
    const bg = STATUS_BG[current] ?? "#F9FAFB";
    async function handleChange(e) {
        const next = e.target.value;
        setSaving(true);
        try {
            await fetch("/api/leads/bulk", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [leadId], status: next }),
            });
            onUpdate(leadId, next);
        }
        finally {
            setSaving(false);
        }
    }
    return (<div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span style={{
            position: "absolute", left: 8, width: 8, height: 8,
            borderRadius: "50%", background: dot, flexShrink: 0,
            pointerEvents: "none",
        }}/>
      <select value={current} onChange={handleChange} disabled={saving} onClick={e => e.stopPropagation()} style={{
            paddingLeft: 22, paddingRight: 22, paddingTop: 5, paddingBottom: 5,
            fontSize: 11, fontWeight: 700, borderRadius: 20,
            border: `1px solid ${dot}55`,
            background: saving ? "#F9FAFB" : bg,
            color: dot,
            cursor: saving ? "wait" : "pointer",
            appearance: "none",
            outline: "none",
            minWidth: 140,
            transition: "all 0.15s",
        }}>
        {LEAD_STATUSES.map(s => (<option key={s} value={s}>{STATUS_LABELS[s]}</option>))}
      </select>
      <ChevronDown style={{ position: "absolute", right: 7, width: 11, height: 11, color: dot, pointerEvents: "none" }}/>
    </div>);
}
// ── Transcript modal ────────────────────────────────────────────────────────
function TranscriptModal({ lead, onClose, onStatusUpdate }) {
    const bd = lead.bantBreakdown;
    const transcript = bd?.transcript ?? [];
    const tier = ((bd?.tier ?? "COLD").toUpperCase());
    const isNewLead = typeof bd?.isDecisionMaker === "string" || typeof bd?.budget === "string";
    return (<div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.55)" }} onClick={e => { if (e.target === e.currentTarget)
        onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>
              {lead.firstName} {lead.lastName}
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span>{lead.email}</span>
              {lead.phone && <span>· {lead.phone}</span>}
              {lead.bantScore != null && (<span style={{ background: "#F5F3FF", color: "#5C1A8C", padding: "1px 8px", borderRadius: 12, fontWeight: 700, fontSize: 11 }}>
                  BANT {lead.bantScore}/12
                </span>)}
              <TierBadge tier={tier}/>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <X className="w-4 h-4 text-gray-500"/>
          </button>
        </div>

        {/* Status row in modal */}
        <div style={{ padding: "10px 22px", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>Status:</span>
          <StatusSelect leadId={lead.id} current={lead.status ?? "new_enquiry"} onUpdate={onStatusUpdate}/>
        </div>

        {/* Contact info */}
        <div style={{ padding: "12px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", flexWrap: "wrap", gap: 12 }}>
          <InfoChip icon={<Building2 className="w-3.5 h-3.5"/>} label="Company" value={lead.company}/>
          <InfoChip icon={<User className="w-3.5 h-3.5"/>} label="Role" value={lead.designation !== "Prospect" ? lead.designation : null}/>
          <InfoChip icon={<Globe className="w-3.5 h-3.5"/>} label="Website" value={lead.website}/>
          <InfoChip icon={<MapPin className="w-3.5 h-3.5"/>} label="Location" value={lead.country !== "Unknown" ? lead.country : (bd?.location || null)}/>
          <InfoChip icon={<Target className="w-3.5 h-3.5"/>} label="Industry" value={lead.industry !== "Other" ? lead.industry : null}/>
        </div>

        {/* Qualification chips for new leads */}
        {isNewLead && (<div style={{ padding: "10px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {typeof bd?.budget === "string" && bd.budget && <QualChip label="Budget" value={bd.budget}/>}
            {bd?.isDecisionMaker && <QualChip label="Decision Maker" value={bd.isDecisionMaker}/>}
            {typeof bd?.timeline === "string" && bd.timeline && <QualChip label="Timeline" value={bd.timeline}/>}
            {bd?.companySize && <QualChip label="Company Size" value={bd.companySize}/>}
          </div>)}

        {/* BANT bars for old leads */}
        {!isNewLead && bd && (typeof bd.budget === "number" || typeof bd.authority === "number") && (<div style={{ padding: "12px 22px", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#9CA3AF", letterSpacing: "0.06em", marginBottom: 8 }}>BANT Breakdown</div>
            <div style={{ display: "grid", gap: 6 }}>
              <BANTBar label="Budget" score={typeof bd.budget === "number" ? bd.budget : undefined}/>
              <BANTBar label="Authority" score={bd.authority}/>
              <BANTBar label="Need" score={bd.need}/>
              <BANTBar label="Timeline" score={typeof bd.timeline === "number" ? bd.timeline : undefined}/>
            </div>
          </div>)}

        {/* AI analysis */}
        {(bd?.problemSummary || bd?.biggestChallenge || bd?.businessDescription || lead.notes || bd?.recommendedPackage || (bd?.aiOpportunities?.length ?? 0) > 0 || (bd?.objections?.length ?? 0) > 0 || (bd?.goals?.length ?? 0) > 0) && (<div style={{ padding: "12px 22px", borderBottom: "1px solid #F3F4F6" }}>
            {(bd?.problemSummary || bd?.biggestChallenge) && (<div style={{ padding: "9px 13px", background: "#F5F3FF", borderRadius: 8, fontSize: 13, color: "#5C1A8C", fontStyle: "italic", marginBottom: 10 }}>
                "{bd?.problemSummary || bd?.biggestChallenge}"
              </div>)}
            {bd?.businessDescription && <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}><strong>Business:</strong> {bd.businessDescription}</div>}
            {lead.notes && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}><strong>Sales summary:</strong> {lead.notes}</div>}
            {bd?.goals && bd.goals.length > 0 && <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}><strong>Goals:</strong> {bd.goals.join(", ")}</div>}
            {((bd?.aiOpportunities?.length ?? 0) > 0 || bd?.recommendedPackage) && (<div style={{ fontSize: 12, color: "#059669", marginBottom: 4, display: "flex", gap: 6, alignItems: "flex-start" }}>
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/>
                <span><strong>Recommended:</strong> {bd?.aiOpportunities?.length ? bd.aiOpportunities.join(", ") : bd?.recommendedPackage}</span>
              </div>)}
            {(bd?.objections?.length ?? 0) > 0 && (<div style={{ fontSize: 12, color: "#DC2626", display: "flex", gap: 6, alignItems: "flex-start" }}>
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/>
                <span><strong>Objections:</strong> {bd.objections.join("; ")}</span>
              </div>)}
          </div>)}

        {/* Transcript */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 22px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#9CA3AF", letterSpacing: "0.06em", marginBottom: 12 }}>
            Full Conversation {transcript.length > 0 ? `(${transcript.length} messages)` : ""}
          </div>
          {transcript.length === 0 ? (<div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
              {isNewLead ? "This lead was captured via the structured qualification form — no free-text chat to show." : "No transcript saved for this lead."}
            </div>) : (<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {transcript.map((msg, i) => (<div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2, fontWeight: 600 }}>
                    {msg.role === "user" ? "Visitor" : "Krish (AI)"}
                  </div>
                  <div style={{
                    maxWidth: "82%", padding: "9px 13px", borderRadius: 14,
                    borderBottomLeftRadius: msg.role === "user" ? 14 : 3,
                    borderBottomRightRadius: msg.role === "user" ? 3 : 14,
                    background: msg.role === "user" ? "#4F35A8" : "#F3F4F6",
                    color: msg.role === "user" ? "#fff" : "#111827",
                    fontSize: 13, lineHeight: 1.55,
                }}>
                    {msg.content}
                  </div>
                </div>))}
            </div>)}
        </div>
      </div>
    </div>);
}
// ── Lead card ───────────────────────────────────────────────────────────────
function LeadCard({ lead, onViewTranscript, onStatusUpdate }) {
    const [expanded, setExpanded] = useState(false);
    const bd = lead.bantBreakdown;
    const tier = ((bd?.tier ?? "COLD").toUpperCase());
    const isNewLead = typeof bd?.isDecisionMaker === "string" || typeof bd?.budget === "string";
    const serviceLabel = bd?.serviceInterest || lead.industry || bd?.industry || "—";
    const currentStatus = lead.status ?? "new_enquiry";
    const isUnseen = currentStatus === "new_enquiry";
    const dot = STATUS_DOT[currentStatus] ?? "#9CA3AF";
    function formatDate(d) {
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
    return (<div style={{
            background: isUnseen ? "#fff" : "#FAFAFA",
            border: `1px solid ${isUnseen ? "#DBEAFE" : "#E5E7EB"}`,
            borderLeft: `4px solid ${isUnseen ? "#3B82F6" : "#E5E7EB"}`,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: isUnseen ? "0 2px 8px rgba(59,130,246,0.08)" : "none",
            transition: "all 0.15s",
            opacity: (currentStatus === "project_lost") ? 0.65 : 1,
        }}>

      {/* ── Top row ── */}
      <div onClick={() => setExpanded(e => !e)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}>
        {/* Avatar */}
        <div style={{
            width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
            background: isUnseen
                ? "linear-gradient(135deg, #4F35A8, #7C3AED)"
                : "linear-gradient(135deg, #9CA3AF, #6B7280)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 15,
        }}>
          {lead.firstName[0]?.toUpperCase() ?? "?"}
        </div>

        {/* Name + email + phone */}
        <div style={{ flex: "0 0 210px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: isUnseen ? "#111827" : "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {lead.firstName} {lead.lastName}
            </span>
            {isUnseen && (<span style={{ fontSize: 9, fontWeight: 800, background: "#3B82F6", color: "#fff", padding: "1px 6px", borderRadius: 10, letterSpacing: "0.04em", flexShrink: 0 }}>
                NEW
              </span>)}
          </div>
          <div style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.email}</div>
          {lead.phone && (<div style={{ fontSize: 11, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
              <Phone className="w-3 h-3"/> {lead.phone}
            </div>)}
        </div>

        {/* Service / Company */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: isUnseen ? "#374151" : "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {serviceLabel}
          </div>
          {(lead.company && lead.company !== "Unknown") && (<div style={{ fontSize: 11, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
              <Building2 className="w-3 h-3"/> {lead.company}
            </div>)}
        </div>

        {/* Right cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }} onClick={e => e.stopPropagation()}>

          {/* Status dropdown */}
          <StatusSelect leadId={lead.id} current={currentStatus} onUpdate={onStatusUpdate}/>

          <TierBadge tier={tier}/>

          <div style={{ textAlign: "center", minWidth: 40 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: tier === "HOT" ? "#DC2626" : tier === "WARM" ? "#D97706" : "#9CA3AF" }}>
              {lead.bantScore ?? "—"}
            </span>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>/12</span>
          </div>

          <div style={{ fontSize: 12, color: "#9CA3AF", minWidth: 50, textAlign: "right" }}>{formatDate(lead.createdAt)}</div>

          <button onClick={e => { e.stopPropagation(); onViewTranscript(); }} style={{
            fontSize: 11, fontWeight: 700, color: "#5C1A8C",
            background: "#F5F3FF", border: "1px solid #DDD6FE",
            borderRadius: 8, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap",
        }}>
            Transcript
          </button>
        </div>

        {/* Expand chevron */}
        <div onClick={() => setExpanded(e => !e)} style={{ cursor: "pointer", flexShrink: 0 }}>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400"/>
            : <ChevronDown className="w-4 h-4 text-gray-400"/>}
        </div>
      </div>

      {/* Status bar strip at bottom of header for non-new leads */}
      {!isUnseen && (<div style={{ height: 2, background: `linear-gradient(90deg, ${dot}33, transparent)` }}/>)}

      {/* ── Expanded panel ── */}
      {expanded && (<div style={{ borderTop: "1px solid #F3F4F6", padding: "14px 16px 16px", background: isUnseen ? "#FAFEFF" : "#F9FAFB" }}>

          {/* BANT bars — old AI leads only */}
          {!isNewLead && bd && (typeof bd.budget === "number" || typeof bd.authority === "number") && (<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
              <BANTBar label="Budget" score={typeof bd.budget === "number" ? bd.budget : undefined}/>
              <BANTBar label="Authority" score={bd.authority}/>
              <BANTBar label="Need" score={bd.need}/>
              <BANTBar label="Timeline" score={typeof bd.timeline === "number" ? bd.timeline : undefined}/>
            </div>)}

          {/* Contact details */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 12 }}>
            <InfoChip icon={<Phone className="w-3 h-3"/>} label="Phone" value={lead.phone}/>
            <InfoChip icon={<Building2 className="w-3 h-3"/>} label="Company" value={lead.company !== "Unknown" ? lead.company : null}/>
            <InfoChip icon={<User className="w-3 h-3"/>} label="Role" value={lead.designation !== "Prospect" ? lead.designation : null}/>
            <InfoChip icon={<Globe className="w-3 h-3"/>} label="Website" value={lead.website}/>
            <InfoChip icon={<Target className="w-3 h-3"/>} label="Industry" value={lead.industry !== "Other" ? lead.industry : null}/>
            <InfoChip icon={<MapPin className="w-3 h-3"/>} label="Location" value={lead.country !== "Unknown" ? lead.country : (bd?.location || null)}/>
          </div>

          {/* Qualification chips — new Krish leads */}
          {isNewLead && (<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {typeof bd?.budget === "string" && bd.budget && <QualChip label="Budget" value={bd.budget}/>}
              {bd?.isDecisionMaker && <QualChip label="Decision Maker" value={bd.isDecisionMaker}/>}
              {typeof bd?.timeline === "string" && bd.timeline && <QualChip label="Timeline" value={bd.timeline}/>}
              {bd?.companySize && <QualChip label="Company Size" value={bd.companySize}/>}
            </div>)}

          {(bd?.problemSummary || bd?.biggestChallenge) && (<div style={{ fontSize: 13, color: "#5C1A8C", background: "#F5F3FF", borderRadius: 8, padding: "9px 13px", fontStyle: "italic", marginBottom: 10 }}>
              "{bd?.problemSummary || bd?.biggestChallenge}"
            </div>)}
          {bd?.businessDescription && <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}><strong>Business:</strong> {bd.businessDescription}</div>}
          {lead.notes && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}><strong>Sales summary:</strong> {lead.notes}</div>}
          {bd?.goals && bd.goals.length > 0 && <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}><strong>Goals:</strong> {bd.goals.join(", ")}</div>}

          {((bd?.aiOpportunities?.length ?? 0) > 0 || bd?.recommendedPackage) && (<div style={{ fontSize: 12, color: "#059669", marginBottom: 5, display: "flex", gap: 5, alignItems: "flex-start" }}>
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/>
              <span><strong>Recommended:</strong> {bd?.aiOpportunities?.length ? bd.aiOpportunities.join(", ") : bd?.recommendedPackage}</span>
            </div>)}
          {(bd?.objections?.length ?? 0) > 0 && (<div style={{ fontSize: 12, color: "#DC2626", display: "flex", gap: 5, alignItems: "flex-start" }}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/>
              <span><strong>Objections:</strong> {bd.objections.join("; ")}</span>
            </div>)}

        </div>)}
    </div>);
}
// ── HubSpot Inbox Tab — thread-first view ────────────────────────────────────
function ThreadMessageBubble({ m }) {
    const isOut = m.direction === "OUTGOING";
    return (<div style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start" }}>
      <div style={{
            maxWidth: "82%",
            padding: "8px 12px",
            borderRadius: isOut ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
            background: isOut ? "#5C1A8C" : "#fff",
            color: isOut ? "#fff" : "#111827",
            border: isOut ? "none" : "1px solid #EDE9FE",
            fontSize: 12.5,
            lineHeight: 1.55,
        }}>
        {m.senderName && (<div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, marginBottom: 3 }}>
            {m.senderName}{m.senderEmail ? ` <${m.senderEmail}>` : ""}
          </div>)}
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
        <div style={{ fontSize: 10, opacity: 0.45, marginTop: 4, textAlign: "right" }}>
          {new Date(m.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
        </div>
      </div>
    </div>);
}
function HubSpotInboxTab() {
    const [page, setPage] = useState(1);
    const [threads, setThreads] = useState(null);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [search, setSearch] = useState("");
    const LIMIT = 20;
    useEffect(() => { loadPage(page); }, [page]);
    async function loadPage(p) {
        setLoading(true);
        try {
            const res = await fetch(`/api/hubspot/inbox-threads?page=${p}&limit=${LIMIT}`, { credentials: "include" });
            const data = await res.json();
            setThreads(data.threads ?? []);
            setTotal(data.total ?? 0);
        }
        catch {
            setThreads([]);
        }
        finally {
            setLoading(false);
        }
    }
    function fmtDate(d) {
        if (!d)
            return "—";
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
    const totalPages = Math.max(1, Math.ceil(total / LIMIT));
    const q = search.toLowerCase();
    const filtered = (threads ?? []).filter(t => !q ||
        (t.contactName ?? "").toLowerCase().includes(q) ||
        (t.contactEmail ?? "").toLowerCase().includes(q) ||
        (t.subject ?? "").toLowerCase().includes(q));
    if (loading && threads === null) {
        return (<div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF" }}>
        <Loader2 className="w-6 h-6" style={{ margin: "0 auto 8px", animation: "spin 1s linear infinite" }}/>
        <div style={{ fontSize: 13 }}>Loading threads…</div>
      </div>);
    }
    if (!loading && threads && threads.length === 0) {
        return (<div style={{ textAlign: "center", padding: "60px 0", background: "#FAFAFA", borderRadius: 16, border: "1px solid #F3F4F6" }}>
        <Inbox className="w-10 h-10" style={{ color: "#EDE9FE", margin: "0 auto 12px" }}/>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>No threads imported yet</div>
        <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>
          Go to <strong>HubSpot → Import Inbox</strong> tab to bring in conversations from your HubSpot inbox.
        </div>
      </div>);
    }
    return (<div>
      {/* Search + count */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search className="w-4 h-4" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contact, email, subject…" style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: "1px solid #E5E7EB", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box" }}/>
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF", flexShrink: 0 }}>{total} thread{total !== 1 ? "s" : ""} imported</div>
        <button onClick={() => loadPage(page)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
          <MessageSquare style={{ width: 13, height: 13 }}/> Refresh
        </button>
      </div>

      {/* Thread rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map(t => {
            const msgs = t.messages;
            const isExpanded = expandedId === t.id;
            const preview = msgs.length > 0 ? (msgs[msgs.length - 1].text ?? "").slice(0, 100) : null;
            return (<div key={t.id} style={{
                    background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
                    overflow: "hidden", transition: "box-shadow 0.15s",
                    boxShadow: isExpanded ? "0 2px 8px rgba(92,26,140,0.08)" : "none",
                }}>
              {/* Row header */}
              <button onClick={() => setExpandedId(isExpanded ? null : t.id)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                }}>
                {/* Channel badge */}
                <span style={{
                    padding: "2px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: "#F3F4F6", color: "#6B7280",
                    textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
                }}>{t.channel}</span>

                {/* Contact */}
                <div style={{ flex: "0 0 180px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.contactName || <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>No contact</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.contactEmail ?? "—"}</div>
                </div>

                {/* Subject / preview */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: t.subject ? 500 : 400, color: t.subject ? "#374151" : "#9CA3AF", fontStyle: t.subject ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.subject ?? "No subject"}
                  </div>
                  {preview && (<div style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</div>)}
                </div>

                {/* Right meta */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>{msgs.length} msg{msgs.length !== 1 ? "s" : ""}</span>
                  <span style={{
                    padding: "2px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: t.status === "OPEN" ? "#DCFCE7" : "#F3F4F6",
                    color: t.status === "OPEN" ? "#16A34A" : "#6B7280",
                    textTransform: "uppercase", letterSpacing: "0.04em",
                }}>{t.status}</span>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtDate(t.lastMessageAt ?? t.createdAt)}</span>
                  {isExpanded
                    ? <ChevronUp style={{ width: 14, height: 14, color: "#9CA3AF" }}/>
                    : <ChevronDown style={{ width: 14, height: 14, color: "#9CA3AF" }}/>}
                </div>
              </button>

              {/* Expanded messages */}
              {isExpanded && (<div style={{ borderTop: "1px solid #F3F4F6", padding: "14px 16px", background: "#FAFAFA" }}>
                  {msgs.length === 0 ? (<div style={{ textAlign: "center", fontSize: 12, color: "#9CA3AF", padding: "8px 0" }}>
                      No messages stored for this thread.
                    </div>) : (<div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
                      {msgs.map(m => <ThreadMessageBubble key={m.id} m={m}/>)}
                    </div>)}
                  <div style={{ marginTop: 10, fontSize: 11, color: "#C4B5FD", display: "flex", gap: 8 }}>
                    <span>Thread ID: <code style={{ fontFamily: "monospace" }}>{t.threadId}</code></span>
                    <span>· Imported {fmtDate(t.importedAt)}</span>
                  </div>
                </div>)}
            </div>);
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (<div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 20 }}>
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: page === 1 ? "#F9FAFB" : "#fff", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 13, color: page === 1 ? "#9CA3AF" : "#374151" }}>← Prev</button>
          <span style={{ fontSize: 13, color: "#6B7280" }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: page >= totalPages ? "#F9FAFB" : "#fff", cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 13, color: page >= totalPages ? "#9CA3AF" : "#374151" }}>Next →</button>
        </div>)}
    </div>);
}
const SOURCE_OPTIONS = [
    { key: "chatbot", label: "Chatbot Leads", icon: <MessageCircle className="w-3.5 h-3.5"/>, apiSource: "MysaAI+Chatbot+-+Dreamsdesign" },
    // hubspot_inbox uses thread-first view from /api/hubspot/inbox-threads — no leads API source needed
    { key: "hubspot_inbox", label: "HubSpot Inbox", icon: <Inbox className="w-3.5 h-3.5"/>, apiSource: null },
    { key: "all", label: "All Sources", icon: null, apiSource: null },
];
export default function ChatbotLeads() {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterTier, setFilterTier] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterSource, setFilterSource] = useState("chatbot");
    const [transcriptLead, setTranscriptLead] = useState(null);
    const [sortDesc, setSortDesc] = useState(true);
    useEffect(() => {
        if (filterSource !== "hubspot_inbox")
            fetchLeads(filterSource);
    }, [filterSource]);
    async function fetchLeads(src = filterSource) {
        if (src === "hubspot_inbox")
            return; // thread-first view handles it via HubSpotInboxTab
        setLoading(true);
        try {
            const opt = SOURCE_OPTIONS.find(s => s.key === src);
            const url = opt.apiSource
                ? `/api/leads?source=${opt.apiSource}&limit=500`
                : `/api/leads?limit=500&tags=chatbot,hubspot_inbox`;
            const res = await fetch(url, { credentials: "include" });
            const data = await res.json();
            // For "all", client-filter to chatbot or hubspot_inbox tagged leads
            let list = Array.isArray(data.leads) ? data.leads : [];
            if (src === "all") {
                list = list.filter(l => (l.source ?? "").toLowerCase().includes("chatbot") ||
                    (l.source ?? "") === "hubspot_inbox" ||
                    (l.tags ?? []).some(t => t === "chatbot" || t === "hubspot_inbox"));
            }
            setLeads(list);
        }
        catch {
            setLeads([]);
        }
        finally {
            setLoading(false);
        }
    }
    const handleStatusUpdate = useCallback((id, status) => {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
        setTranscriptLead(prev => prev?.id === id ? { ...prev, status } : prev);
    }, []);
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = todayStart - 6 * 86400000;
    const todayCount = leads.filter(l => new Date(l.createdAt).getTime() >= todayStart).length;
    const weekCount = leads.filter(l => new Date(l.createdAt).getTime() >= weekStart).length;
    const hotCount = leads.filter(l => (l.bantBreakdown?.tier ?? "").toUpperCase() === "HOT").length;
    const newCount = leads.filter(l => (l.status ?? "new_enquiry") === "new_enquiry").length;
    const filtered = leads
        .filter(l => {
        const tier = (l.bantBreakdown?.tier ?? "COLD").toUpperCase();
        if (filterTier !== "all" && tier !== filterTier)
            return false;
        const st = l.status ?? "new_enquiry";
        if (filterStatus !== "all" && st !== filterStatus)
            return false;
        if (search) {
            const q = search.toLowerCase();
            return (`${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
                l.email.toLowerCase().includes(q) ||
                (l.phone ?? "").includes(q) ||
                (l.company ?? "").toLowerCase().includes(q) ||
                (l.bantBreakdown?.serviceInterest ?? "").toLowerCase().includes(q) ||
                (l.industry ?? "").toLowerCase().includes(q));
        }
        return true;
    })
        .sort((a, b) => {
        // new_enquiry always floats to top within the same sort
        const aNew = (a.status ?? "new_enquiry") === "new_enquiry" ? 1 : 0;
        const bNew = (b.status ?? "new_enquiry") === "new_enquiry" ? 1 : 0;
        if (aNew !== bNew)
            return bNew - aNew;
        return sortDesc ? (b.bantScore ?? 0) - (a.bantScore ?? 0) : (a.bantScore ?? 0) - (b.bantScore ?? 0);
    });
    return (<div style={{ padding: "24px 28px", maxWidth: 1160, margin: "0 auto" }}>
      {transcriptLead && (<TranscriptModal lead={transcriptLead} onClose={() => setTranscriptLead(null)} onStatusUpdate={handleStatusUpdate}/>)}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, #4F35A8, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MessageCircle className="w-5 h-5 text-white"/>
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>Chatbot Leads</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
            {filterSource === "chatbot" ? "Leads captured via the Dreamsdesign website chatbot" :
            filterSource === "hubspot_inbox" ? "Conversations imported from HubSpot inbox" :
                "All chatbot and HubSpot inbox leads"}
          </p>
        </div>
        <button onClick={() => fetchLeads(filterSource)} style={{ marginLeft: "auto", background: "#F5F3FF", border: "1px solid #DDD6FE", color: "#5C1A8C", padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      {/* Source tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, padding: 4, background: "#F3F4F6", borderRadius: 10, width: "fit-content" }}>
        {SOURCE_OPTIONS.map(opt => (<button key={opt.key} onClick={() => setFilterSource(opt.key)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                background: filterSource === opt.key ? "#fff" : "transparent",
                color: filterSource === opt.key ? "#4F35A8" : "#6B7280",
                boxShadow: filterSource === opt.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s",
            }}>
            {opt.icon}
            {opt.label}
          </button>))}
      </div>

      {/* HubSpot Inbox — thread-first view */}
      {filterSource === "hubspot_inbox" && <HubSpotInboxTab />}

      {/* Lead-centric view (Chatbot Leads + All Sources) */}
      {filterSource !== "hubspot_inbox" && <>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
                { label: "Unchecked", value: newCount, icon: <Clock className="w-4 h-4"/>, color: "#3B82F6" },
                { label: "This Week", value: weekCount, icon: <TrendingUp className="w-4 h-4"/>, color: "#7C3AED" },
                { label: "HOT Leads", value: hotCount, icon: <Flame className="w-4 h-4"/>, color: "#EF4444" },
                { label: "Today", value: todayCount, icon: <Star className="w-4 h-4"/>, color: "#F59E0B" },
            ].map(stat => (<div key={stat.label} style={{ background: "#fff", border: "1px solid #F3F4F6", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${stat.color}18`, display: "flex", alignItems: "center", justifyContent: "center", color: stat.color, flexShrink: 0 }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, fontWeight: 600 }}>{stat.label}</div>
            </div>
          </div>))}
      </div>

      {/* Status tab row */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {["all", ...LEAD_STATUSES].map(s => {
                const count = s === "all" ? leads.length : leads.filter(l => (l.status ?? "new_enquiry") === s).length;
                const active = filterStatus === s;
                const dot = STATUS_DOT[s];
                return (<button key={s} onClick={() => setFilterStatus(s)} style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        cursor: "pointer", border: "none",
                        background: active ? (dot ?? "#4F35A8") : "#F3F4F6",
                        color: active ? "#fff" : "#6B7280",
                        transition: "all 0.15s",
                    }}>
              {dot && !active && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, display: "inline-block", flexShrink: 0 }}/>}
              {s === "all" ? "All" : STATUS_LABELS[s]}
              <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.75 }}>({count})</span>
            </button>);
            })}
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search className="w-4 h-4" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, phone, company…" style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: "1px solid #E5E7EB", borderRadius: 10, fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }}/>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "HOT", "WARM", "COOL", "COLD"].map(t => (<button key={t} onClick={() => setFilterTier(t)} style={{
                    padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                    background: filterTier === t ? "#4F35A8" : "#F3F4F6",
                    color: filterTier === t ? "#fff" : "#6B7280",
                    transition: "all 0.15s",
                }}>
              {t === "all" ? "All Tiers" : t}
            </button>))}
        </div>
        <button onClick={() => setSortDesc(v => !v)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", border: "1px solid #E5E7EB", borderRadius: 10, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
          <BarChart2 className="w-3.5 h-3.5"/>
          BANT {sortDesc ? "↓" : "↑"}
        </button>
      </div>

      {/* Lead count */}
      {!loading && filtered.length > 0 && (<div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 10, fontWeight: 500 }}>
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
          {filterStatus !== "all" ? ` · ${STATUS_LABELS[filterStatus] ?? filterStatus}` : ""}
          {filterTier !== "all" ? ` · ${filterTier}` : ""}
          {search ? ` · "${search}"` : ""}
          {newCount > 0 && filterStatus === "all" && (<span style={{ marginLeft: 8, color: "#3B82F6", fontWeight: 700 }}>· {newCount} unchecked</span>)}
        </div>)}

      {/* List */}
      {loading ? (<div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF", fontSize: 15 }}>Loading leads…</div>) : filtered.length === 0 ? (<div style={{ textAlign: "center", padding: "60px 0", background: "#FAFAFA", borderRadius: 16, border: "1px solid #F3F4F6" }}>
          <MessageCircle className="w-10 h-10" style={{ color: "#E5E7EB", margin: "0 auto 12px" }}/>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>No leads found</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>
            {leads.length === 0 ? "Leads captured via the Dreamsdesign widget will appear here" : "Try adjusting your search or filter"}
          </div>
        </div>) : (<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(lead => (<LeadCard key={lead.id} lead={lead} onViewTranscript={() => setTranscriptLead(lead)} onStatusUpdate={handleStatusUpdate}/>))}
        </div>)}

      </>}

      {/* Embed code */}
      <div style={{ marginTop: 32, padding: "18px 20px", background: "#0A0818", borderRadius: 16, border: "1px solid #2A2040" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          <Zap className="w-3.5 h-3.5" style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }}/>
          WordPress Embed Code
        </div>
        <pre style={{ margin: 0, fontSize: 12, color: "#A5F3FC", overflowX: "auto", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {`<!-- Add this anywhere in your WordPress theme (footer.php or header.php) -->
<div id="mysa-chatbot"></div>
<script src="${window.location.origin}/aura-ai/chatbot.js" defer></script>`}
        </pre>
        <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          Copy and paste into your WordPress site's footer before &lt;/body&gt;
        </div>
      </div>
    </div>);
}
