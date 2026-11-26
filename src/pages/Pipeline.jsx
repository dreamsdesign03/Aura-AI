import { useState, useCallback, useMemo, useRef } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, closestCenter, } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getListLeadsQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Plus, Search, Phone, Mail, ChevronDown, ChevronLeft, Pencil, SlidersHorizontal, ArrowUpDown, Download, X, Loader2, MoreHorizontal, Settings2, MessageCircle, Check, Filter, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { cleanEmail } from "@/lib/emails";
import SendWhatsAppModal from "@/components/SendWhatsAppModal";
import SendTemplateModal from "@/components/SendTemplateModal";
import ComposeModal from "@/components/ComposeModal";
import NewMeetingModal from "@/components/NewMeetingModal";
import AddLeadModal from "@/components/AddLeadModal";

function AiCallConfirmModal({ lead, onConfirm, onCancel, isCalling }) {
  if (!lead) return null;
  const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.name || "Lead";
  const phone = lead.phone || lead.whatsapp || "No phone";
  const company = lead.company || "—";
  const city = lead.city || lead.branch || "Vadodara";
  const alreadyCalled = Boolean(lead.last_ai_call_status || lead.last_ai_call_at || lead.hasAiCall);
  const [allowDuplicate, setAllowDuplicate] = useState(true);
  const [callMethod, setCallMethod] = useState("sarvam"); // "sarvam" | "plivo"
  const [agentType, setAgentType] = useState("makeup_artist"); // "makeup_artist" | "customer"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150 text-gray-800" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-pink-100 flex items-center justify-between" style={{ background: "#FDF2F8" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-sm" style={{ background: "#CB3273" }}>
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Place Outbound Call</h3>
              <p className="text-xs text-pink-700 font-medium">{leadName} · {company} · {phone}</p>
            </div>
          </div>
          <button onClick={onCancel} disabled={isCalling} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {alreadyCalled && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-amber-900">
              <div className="text-[11.5px] leading-relaxed">
                <p className="font-bold text-amber-900">
                  Contact Already Called ({lead.last_ai_call_status ? lead.last_ai_call_status.toUpperCase() : "COMPLETED"})
                </p>
                <p className="text-amber-800 mt-0.5">
                  An outreach call has already been placed to this person. Duplicate calls are blocked to prevent spamming.
                </p>
                <label className="flex items-center gap-2 mt-2.5 cursor-pointer font-semibold text-amber-950 select-none">
                  <input
                    type="checkbox"
                    checked={allowDuplicate}
                    onChange={(e) => setAllowDuplicate(e.target.checked)}
                    className="w-3.5 h-3.5 accent-pink-600 rounded cursor-pointer"
                  />
                  <span>Allow repeat call (override duplicate block)</span>
                </label>
              </div>
            </div>
          )}

          {/* 1. Select Call Method */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              1. Select Call Method
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCallMethod("sarvam")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  callMethod === "sarvam"
                    ? "border-pink-500 bg-pink-50/70 ring-1 ring-pink-400 shadow-sm"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className={`w-4 h-4 ${callMethod === "sarvam" ? "text-pink-600" : "text-gray-400"}`} />
                  <span className="font-bold text-xs text-gray-900">AI Voice Agent</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">
                  Sarvam AI conversational outbound call
                </p>
              </button>

              <button
                type="button"
                onClick={() => setCallMethod("plivo")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  callMethod === "plivo"
                    ? "border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-400 shadow-sm"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Phone className={`w-4 h-4 ${callMethod === "plivo" ? "text-emerald-600" : "text-gray-400"}`} />
                  <span className="font-bold text-xs text-gray-900">Direct Plivo Call</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">
                  Direct telephone call via clinic line
                </p>
              </button>
            </div>
          </div>

          {/* 2. Select Agent Persona */}
          {callMethod === "sarvam" && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                2. Which Agent?
              </label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setAgentType("makeup_artist")}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${
                    agentType === "makeup_artist"
                      ? "border-pink-500 bg-pink-50/70 ring-1 ring-pink-400 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-pink-600" />
                      <span className="font-bold text-xs text-gray-900">Makeup Artist (Misha · Skinnonest)</span>
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-pink-100 text-pink-700">
                      Misha-Skinn-4e9816f8-ead9
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-snug">
                    Skinnonest coordinator for makeup artists, salons & clinics to introduce products and schedule an online meeting with Vishw.
                  </p>
                  <div className="mt-2 text-[10.5px] text-gray-500 flex flex-wrap items-center gap-3 pt-1 border-t border-pink-100/60">
                    <span>Name: <strong className="text-gray-800">{leadName}</strong></span>
                    <span>Phone: <strong className="text-gray-800">{phone}</strong></span>
                    <span>City: <strong className="text-gray-800">{city}</strong></span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAgentType("customer")}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${
                    agentType === "customer"
                      ? "border-pink-500 bg-pink-50/70 ring-1 ring-pink-400 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                      <span className="font-bold text-xs text-gray-900">Customer / Patient (Ria · Aura Clinic)</span>
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                      Aura-Outbou-824024af-4678
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-snug">
                    Aura Clinic consultation booking coordinator for clinic treatments, consultations and enquiries.
                  </p>
                  <div className="mt-2 text-[10.5px] text-gray-500 flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100">
                    <span>Name: <strong className="text-gray-800">{leadName}</strong></span>
                    <span>Phone: <strong className="text-gray-800">{phone}</strong></span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Plivo Info Box */}
          {callMethod === "plivo" && (
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Provider:</span>
                <span className="text-emerald-800 font-bold">Plivo Telephony</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Caller Line:</span>
                <span className="font-mono text-gray-900 font-semibold">+918065587555</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Destination:</span>
                <span className="font-mono text-gray-900 font-semibold">{phone}</span>
              </div>
              <p className="text-[11px] text-emerald-800 pt-1 leading-snug">
                Direct live outbound telephone call dialed through the clinic Plivo line.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isCalling}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ callMethod, agentType })}
            disabled={isCalling || (alreadyCalled && !allowDuplicate)}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: callMethod === "plivo" ? "#059669" : "#CB3273" }}
            title={alreadyCalled && !allowDuplicate ? "Duplicate call blocked" : "Place call"}
          >
            {isCalling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Initiating Call...</span>
              </>
            ) : (
              <>
                <Phone className="w-3.5 h-3.5" />
                {alreadyCalled && !allowDuplicate
                  ? "Already Called (Blocked)"
                  : callMethod === "plivo"
                  ? "Start Plivo Call"
                  : agentType === "makeup_artist"
                  ? "Start AI Call (Misha)"
                  : "Start AI Call (Ria)"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stage definitions ─────────────────────────────────────────────────────────
const STAGES = [
    { id: "new_enquiry", label: "New Enquiry", short: "NEW ENQUIRY", weight: 10 },
    { id: "enquiry_qualified", label: "Enquiry Qualified", short: "ENQUIRY QUALIFIED", weight: 20 },
    { id: "discovery_call", label: "Discovery Call", short: "DISCOVERY CALL", weight: 40 },
    { id: "quote_sent", label: "Quote / Estimation Sent", short: "QUOTE / EST. SENT", weight: 60 },
    { id: "follow_up", label: "Follow Up / Negotiation", short: "FOLLOW UP / NEGOT.", weight: 80 },
    { id: "project_won", label: "Project Won", short: "PROJECT WON", weight: 100 },
    { id: "project_lost", label: "Project Lost", short: "PROJECT LOST", weight: 0 },
];
const AVATAR_COLORS = [
    "#CB3273", "#CB3273", "#DE377C", "#0891B2",
    "#16A34A", "#DC2626", "#0D9488", "#9333EA",
];
// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAmount(n) {
    if (n >= 1_00_00_000)
        return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (n >= 1_00_00_000)
        return `₹${(n / 1_00_00_000).toFixed(1)}L`;
    if (n >= 1_000)
        return `₹${(n / 1_000).toFixed(0)}K`;
    return `₹${n}`;
}
function fmtDate(s) {
    if (!s)
        return "—";
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
// ── API ───────────────────────────────────────────────────────────────────────
async function fetchLeads() {
    const res = await fetch("/api/leads?limit=500", { credentials: "include" });
    if (!res.ok)
        return [];
    const j = await res.json();
    return j.leads ?? [];
}
async function patchLeadStatus(id, status) {
    const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
    });
    return res.json();
}
// ── DealCard ─────────────────────────────────────────────────────────────────
function DealCard({ lead, isDragging, onSendWhatsApp, onSendEmail, onAddActivity, onPhoneCall }) {
  const [, navigate] = useLocation();
  const name = `${lead.firstName || lead.first_name || ""} ${lead.lastName || lead.last_name || ""}`.trim() || lead.name || "Lead";
  const initials = `${lead.firstName?.[0] ?? lead.first_name?.[0] ?? name[0] ?? ""}${lead.lastName?.[0] ?? lead.last_name?.[0] ?? ""}`.toUpperCase() || "L";
  const avatarBg = AVATAR_COLORS[lead.id % AVATAR_COLORS.length];
  const dealAmount = lead.dealValue ?? lead.deal_value ?? null;
  const ownerName = lead.lead_owner || lead.leadOwner || lead.assignedToName || "—";
  const phoneNum = lead.phone || lead.whatsapp || "";
  const isCalled = Boolean(lead.last_ai_call_status || lead.last_ai_call_at || lead.hasAiCall);
  const isMessaged = Boolean(lead.whatsappSent || lead.whatsapp_sent || lead.emailSent || lead.last_contacted_at);
  const location = lead.city || lead.country || lead.location || null;
  const campaign = lead.campaign_name || lead.source || null;

  return (
    <div
      className={cn(
        "bg-white rounded-xl border select-none group transition-all relative overflow-hidden",
        isDragging
          ? "shadow-2xl opacity-75 border-[#CB3273] rotate-1"
          : "border-gray-200/80 hover:shadow-md hover:border-[#CB3273] cursor-pointer"
      )}
    >
      {/* Card body */}
      <div className="p-3 space-y-2" onClick={() => navigate(`/leads/${lead.id}`)}>
        {/* Contact Header: Avatar + Name + Edit Pencil */}
        <div className="flex items-start gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-xs"
            style={{ background: avatarBg }}
            title={name}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <span className="text-[13px] font-bold text-gray-900 leading-snug hover:text-blue-600 hover:underline truncate block" title={name}>
                {name}
              </span>
              <button
                type="button"
                className="p-1 rounded text-gray-300 hover:text-gray-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }}
                title="Edit lead"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
            {(lead.company || lead.designation) && (
              <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                {lead.company}{lead.company && lead.designation ? " · " : ""}{lead.designation || ""}
              </p>
            )}
          </div>
        </div>

        {/* Lead Owner */}
        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-gray-100 text-gray-500">
          <span className="text-gray-400 font-medium">Lead Owner:</span>
          <span className="font-semibold text-gray-800 truncate max-w-[130px]" title={ownerName}>
            {ownerName}
          </span>
        </div>

        {/* Phone Number */}
        {phoneNum && (
          <div className="flex items-center justify-between text-[11px] py-0.5 text-gray-500">
            <span className="text-gray-400 font-medium">Phone:</span>
            <span className="font-mono text-gray-800 font-medium text-[11px]">{phoneNum}</span>
          </div>
        )}

        {/* Email */}
        {cleanEmail(lead.email) && (
          <div className="flex items-center justify-between text-[11px] py-0.5 text-gray-500">
            <span className="text-gray-400 font-medium">Email:</span>
            <span className="text-gray-800 font-medium text-[11px] truncate max-w-[140px]" title={cleanEmail(lead.email)}>
              {cleanEmail(lead.email)}
            </span>
          </div>
        )}

        {/* Status Badges Row (Call Status + WA Status + Campaign) */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-100">
          {/* Call Status Badge */}
          {isCalled ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              Called
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
              Not Called
            </span>
          )}

          {/* Message Status Badge */}
          {isMessaged ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              WA Sent
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
              Not Sent
            </span>
          )}

          {/* Campaign Badge */}
          {campaign && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 truncate max-w-[130px]" title={campaign}>
              {campaign}
            </span>
          )}
        </div>

        {/* Location & Amount */}
        {(location || dealAmount != null) && (
          <div className="flex items-center justify-between text-[11px] pt-1 text-gray-500">
            {location && (
              <span className="text-gray-600 truncate max-w-[130px]" title={location}>
                {location}
              </span>
            )}
            {dealAmount != null && (
              <span className="font-semibold text-gray-800 ml-auto">
                {fmtAmount(Number(dealAmount))}
              </span>
            )}
          </div>
        )}

        {/* Create date */}
        <div className="flex items-center justify-between text-[10.5px] pt-1 text-gray-400 border-t border-gray-50">
          <span>Create date:</span>
          <span className="text-gray-700 font-medium">{fmtDate(lead.createdAt || lead.created_at)}</span>
        </div>
      </div>

      {/* Action icons row */}
      <div className="px-2.5 py-1.5 border-t border-gray-100 flex items-center gap-1.5 bg-gray-50/50" onClick={(e) => e.stopPropagation()}>
        {/* Phone Call */}
        {phoneNum ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPhoneCall ? onPhoneCall(lead) : (window.location.href = `tel:${phoneNum}`);
            }}
            className="p-1.5 rounded bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-200 transition-colors shadow-2xs"
            title={`AI Voice Call to ${name} (${phoneNum})`}
          >
            <Phone className="w-3.5 h-3.5 text-pink-600" />
          </button>
        ) : (
          <button
            type="button"
            className="p-1.5 rounded bg-gray-50 text-gray-400 hover:bg-gray-100 border border-gray-200 transition-colors shadow-2xs"
            title="No phone available"
            onClick={(e) => {
              e.stopPropagation();
              toast.error(`No phone number for ${name}`);
            }}
          >
            <Phone className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}

        {/* Add Activity / Meeting */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddActivity?.(lead);
          }}
          className="p-1.5 rounded bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors shadow-2xs"
          title={`Add activity or schedule meeting for ${name}`}
        >
          <Plus className="w-3.5 h-3.5 text-violet-600" />
        </button>

        {/* Send Email Integration */}
        {cleanEmail(lead.email) ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSendEmail?.(lead);
            }}
            className="p-1.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors shadow-2xs"
            title={`Send email to ${name} (${cleanEmail(lead.email)})`}
          >
            <Mail className="w-3.5 h-3.5 text-blue-600" />
          </button>
        ) : (
          <button
            type="button"
            className="p-1.5 rounded bg-gray-50 text-gray-400 hover:bg-gray-100 border border-gray-200 transition-colors shadow-2xs"
            title="No email available"
            onClick={(e) => {
              e.stopPropagation();
              toast.error(`No email address for ${name}`);
            }}
          >
            <Mail className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}

        {/* WhatsApp Integration */}
        {phoneNum ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSendWhatsApp?.(lead);
            }}
            className="p-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-2xs"
            title={`Send WhatsApp message to ${name} (${phoneNum})`}
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
          </button>
        ) : (
          <button
            type="button"
            className="p-1.5 rounded bg-gray-50 text-gray-400 hover:bg-gray-100 border border-gray-200 transition-colors shadow-2xs"
            title="No phone number for WhatsApp"
            onClick={(e) => {
              e.stopPropagation();
              toast.error(`No phone number for ${name}`);
            }}
          >
            <MessageCircle className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}

        {/* Edit / View Lead */}
        <button
          type="button"
          className="p-1.5 rounded bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors ml-auto shadow-2xs"
          title="Open lead details"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/leads/${lead.id}`);
          }}
        >
          <Pencil className="w-3.5 h-3.5 text-gray-600" />
        </button>
      </div>
    </div>
  );
}
// ── SortableCard ─────────────────────────────────────────────────────────────
function SortableCard({ lead, onSendWhatsApp, onSendEmail, onAddActivity, onPhoneCall }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: lead.id,
        data: { lead },
    });
    return (<div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }} {...attributes} {...listeners}>
      <DealCard lead={lead} isDragging={isDragging} onSendWhatsApp={onSendWhatsApp} onSendEmail={onSendEmail} onAddActivity={onAddActivity} onPhoneCall={onPhoneCall}/>
    </div>);
}
// ── Column ────────────────────────────────────────────────────────────────────
function Column({ stage, leads, collapsed, onToggleCollapse, onSendWhatsApp, onSendEmail, onAddActivity, onAddDeal, onPhoneCall }) {
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: stage.id });
    const totalAmount = leads.reduce((s, l) => s + Number(l.dealValue ?? 0), 0);
    const weighted = Math.round(totalAmount * stage.weight / 100);
    if (collapsed) {
        return (<div className="flex-shrink-0 w-9 border border-gray-200 bg-gray-50 rounded flex flex-col items-center py-3 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors self-stretch" onClick={onToggleCollapse} title={stage.label}>
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex-1 flex items-center" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          {stage.short}
        </span>
        <span className="mt-1 w-5 h-5 rounded-full bg-gray-200 text-[9px] font-bold text-gray-600 flex items-center justify-center">
          {leads.length}
        </span>
      </div>);
    }
    return (<div className="flex flex-col flex-shrink-0 w-[265px] border border-gray-200 bg-gray-50 rounded-xl self-stretch min-h-0">

      {/* ── Column header ────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center px-3 py-2 border-b border-gray-200 bg-gray-50 gap-1.5">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-600 flex-1 truncate">
          {stage.short}
        </span>
        <span className="text-[10.5px] font-semibold text-gray-500 flex-shrink-0">{leads.length}</span>
        <button onClick={onToggleCollapse} className="p-0.5 rounded hover:bg-gray-200 flex-shrink-0 transition-colors" title="Collapse column">
          <ChevronLeft className="w-3.5 h-3.5 text-gray-400"/>
        </button>
      </div>

      {/* ── Scrollable cards area (fills remaining height) ───────────── */}
      <div ref={setDropRef} className={cn("flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2 transition-colors", isOver && "bg-blue-50/60")}>
        <SortableContext id={stage.id} items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => <SortableCard key={lead.id} lead={lead} onSendWhatsApp={onSendWhatsApp} onSendEmail={onSendEmail} onAddActivity={onAddActivity} onPhoneCall={onPhoneCall}/>)}
        </SortableContext>

        {leads.length === 0 && (<div className={cn("flex-1 flex items-center justify-center rounded border border-dashed text-[11px] py-8 transition-colors", isOver ? "border-blue-300 text-blue-400 bg-blue-50" : "border-gray-200 text-gray-300")}>
            {isOver ? "Drop here" : "No deals"}
          </div>)}

        <button onClick={() => onAddDeal?.(stage.id)} className="w-full py-1.5 text-[11px] text-gray-400 hover:text-blue-600 flex items-center justify-center gap-1 rounded border border-dashed border-gray-200 hover:border-blue-300 hover:bg-white transition-all font-semibold">
          <Plus className="w-3 h-3"/> Add deal
        </button>
      </div>
    </div>);
}
// ── Pipeline page ─────────────────────────────────────────────────────────────
export default function Pipeline({ embedded = false }) {
    const qc = useQueryClient();
    const [, navigate] = useLocation();
    const { data: allLeads = [], isLoading } = useQuery({
        queryKey: ["leads-pipeline"],
        queryFn: fetchLeads,
        refetchOnWindowFocus: true,
        staleTime: 0
    });
    const [activeLead, setActiveLead] = useState(null);
    const [whatsappModalLead, setWhatsappModalLead] = useState(null);
    const [tplLeads, setTplLeads] = useState(null);
    const [emailModalLead, setEmailModalLead] = useState(null);
    const [activityModalLead, setActivityModalLead] = useState(null);
    const [confirmCallLead, setConfirmCallLead] = useState(null);
    const [isCallInFlight, setIsCallInFlight] = useState(false);
    const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
    const [addLeadStage, setAddLeadStage] = useState("new_enquiry");

    const handleStartAiCall = async ({ callMethod = "sarvam", agentType = "makeup_artist" } = {}) => {
        if (!confirmCallLead) return;
        setIsCallInFlight(true);
        try {
            const leadName = [confirmCallLead.firstName, confirmCallLead.lastName].filter(Boolean).join(" ") || confirmCallLead.name || "Lead";
            const leadPhone = confirmCallLead.phone || confirmCallLead.whatsapp || "";

            const res = await fetch("/api/ai-calls", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    leadId: confirmCallLead.id,
                    callMethod,
                    agentType,
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(`Call placed to ${leadName} (${leadPhone}).`);
                setConfirmCallLead(null);
                qc.invalidateQueries({ queryKey: ["leads-pipeline"] });
            } else {
                toast.error(data.error || "Could not place call.");
            }
        } catch (err) {
            toast.error("Failed to place call: " + err.message);
        } finally {
            setIsCallInFlight(false);
        }
    };
    const [search, setSearch] = useState("");
    const [ownerFilter, setOwnerFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("all");
    const [sortOption, setSortOption] = useState(() => localStorage.getItem("pipeline_sort_option") || "created_desc");
    const [collapsed, setCollapsed] = useState(new Set());

    const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
    const [showDateDropdown, setShowDateDropdown] = useState(false);
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    const handleOpenAddLead = (stageId = "new_enquiry") => {
        setAddLeadStage(stageId);
        setIsAddLeadModalOpen(true);
    };

    const mutate = useMutation({
        mutationFn: ({ id, status }) => patchLeadStatus(id, status),
        onMutate: async ({ id, status }) => {
            await qc.cancelQueries({ queryKey: ["leads-pipeline"] });
            await qc.cancelQueries({ queryKey: getListLeadsQueryKey() });
            const prev = qc.getQueryData(["leads-pipeline"]);
            qc.setQueryData(["leads-pipeline"], (old = []) => old.map(l => l.id === id ? { ...l, status } : l));
            return { prev };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev)
                qc.setQueryData(["leads-pipeline"], ctx.prev);
            toast.error("Failed to move deal");
        },
        onSuccess: () => {
            toast.success("Deal stage updated");
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: ["leads-pipeline"] });
            qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
            qc.refetchQueries({ queryKey: ["leads-pipeline"] });
            qc.refetchQueries({ queryKey: getListLeadsQueryKey() });
        },
    });

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    // Extract unique owners
    const uniqueOwners = useMemo(() => {
        const owners = new Set();
        for (const l of allLeads) {
            if (l.assignedToName) owners.add(l.assignedToName);
        }
        return Array.from(owners);
    }, [allLeads]);

    // Active filters count
    const activeFiltersCount = (ownerFilter !== "all" ? 1 : 0) + (dateFilter !== "all" ? 1 : 0) + (search ? 1 : 0);

    const resetFilters = () => {
        setSearch("");
        setOwnerFilter("all");
        setDateFilter("all");
        setSortOption("created_desc");
        toast.info("Filters reset");
    };

    const dateLabels = {
        all: "All Time",
        today: "Today",
        "7days": "Last 7 Days",
        "30days": "Last 30 Days",
        this_month: "This Month"
    };

    const sortLabels = {
        created_desc: "Newest First",
        created_asc: "Oldest First",
        value_desc: "Highest Amount",
        value_asc: "Lowest Amount",
        name_asc: "Lead Name A-Z"
    };

    // Helper to get numerical deal value
    const getDealVal = (l) => {
        const v = l.dealValue ?? l.deal_value ?? l.budget ?? 0;
        if (typeof v === "number") return v;
        if (typeof v === "string") {
            const num = parseFloat(v.replace(/[^0-9.]/g, ""));
            return isNaN(num) ? 0 : num;
        }
        return 0;
    };

    // Helper to get creation timestamp
    const getLeadDate = (l) => {
        const d = l.createdAt ?? l.created_at;
        return d ? new Date(d).getTime() : (Number(l.id) || 0);
    };

    // Filter deals
    const filteredLeads = useMemo(() => {
        return allLeads.filter(l => {
            if (search.trim()) {
                const q = search.toLowerCase();
                const text = `${l.firstName || l.first_name || ""} ${l.lastName || l.last_name || ""} ${l.company || ""} ${l.email || ""} ${l.phone || ""}`.toLowerCase();
                if (!text.includes(q)) return false;
            }
            if (ownerFilter !== "all") {
                const owner = (l.assignedToName || "").toLowerCase();
                if (!owner.includes(ownerFilter.toLowerCase())) return false;
            }
            if (dateFilter !== "all") {
                const created = new Date(l.createdAt || l.created_at || Date.now());
                const now = new Date();
                if (dateFilter === "today") {
                    if (created.toDateString() !== now.toDateString()) return false;
                } else if (dateFilter === "7days") {
                    const diffDays = (now - created) / (1000 * 3600 * 24);
                    if (diffDays > 7) return false;
                } else if (dateFilter === "30days") {
                    const diffDays = (now - created) / (1000 * 3600 * 24);
                    if (diffDays > 30) return false;
                } else if (dateFilter === "this_month") {
                    if (created.getMonth() !== now.getMonth() || created.getFullYear() !== now.getFullYear()) return false;
                }
            }
            return true;
        });
    }, [allLeads, search, ownerFilter, dateFilter]);

    // Sort leads inside columns
    const sortLeads = useCallback((leadsList) => {
        return [...leadsList].sort((a, b) => {
            if (sortOption === "created_desc") {
                return getLeadDate(b) - getLeadDate(a);
            }
            if (sortOption === "created_asc") {
                return getLeadDate(a) - getLeadDate(b);
            }
            if (sortOption === "value_desc") {
                return getDealVal(b) - getDealVal(a);
            }
            if (sortOption === "value_asc") {
                return getDealVal(a) - getDealVal(b);
            }
            if (sortOption === "name_asc") {
                const nameA = `${a.firstName || a.first_name || ""} ${a.lastName || a.last_name || ""}`.trim();
                const nameB = `${b.firstName || b.first_name || ""} ${b.lastName || b.last_name || ""}`.trim();
                return nameA.localeCompare(nameB);
            }
            return 0;
        });
    }, [sortOption]);

    const grouped = useCallback(() => {
        const map = new Map();
        for (const s of STAGES) map.set(s.id, []);
        for (const lead of filteredLeads) {
            const key = (lead.status ?? lead.pipeline_stage ?? "new_enquiry");
            if (map.has(key)) map.get(key).push(lead);
            else map.get("new_enquiry").push(lead);
        }
        for (const [key, list] of map.entries()) {
            map.set(key, sortLeads(list));
        }
        return map;
    }, [filteredLeads, sortLeads]);

    function handleSaveView() {
        localStorage.setItem("pipeline_sort_option", sortOption);
        toast.success(`Sales Pipeline view saved! Default sort set to "${sortLabels[sortOption]}".`);
    }

    function handleExportCSV() {
        if (filteredLeads.length === 0) {
            toast.error("No deals to export");
            return;
        }
        const headers = ["ID", "First Name", "Last Name", "Company", "Email", "Phone", "Stage", "Deal Amount (₹)", "Created Date"];
        const rows = filteredLeads.map(l => [
            l.id,
            `"${(l.firstName || l.first_name || "").replace(/"/g, '""')}"`,
            `"${(l.lastName || l.last_name || "").replace(/"/g, '""')}"`,
            `"${(l.company || "").replace(/"/g, '""')}"`,
            `"${(l.email || "").replace(/"/g, '""')}"`,
            `"${(l.phone || "").replace(/"/g, '""')}"`,
            `"${l.status || l.pipeline_stage || "new_enquiry"}"`,
            getDealVal(l),
            `"${l.createdAt || l.created_at || ""}"`
        ]);
        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `sales_pipeline_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${filteredLeads.length} deals to CSV`);
    }

    const toggleCollapse = (id) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        return next;
    });

    const handleDragStart = (e) => {
        const l = e.active.data.current?.lead;
        if (l)
            setActiveLead(l);
    };

    const handleDragEnd = (e) => {
        const { active, over } = e;
        setActiveLead(null);
        if (!over)
            return;
        const leadId = Number(active.id);
        const overId = String(over.id);
        const targetStage = STAGES.find(s => s.id === overId);
        if (!targetStage)
            return;

        mutate.mutate({ id: leadId, status: targetStage.id });
    };

    const g = grouped();

    const boardScrollRef = useRef(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStartX, setPanStartX] = useState(0);
    const [panScrollLeft, setPanScrollLeft] = useState(0);

    const handlePanMouseDown = (e) => {
        if (e.target.closest("button") || e.target.closest("input") || e.target.closest("a") || e.target.closest(".group")) {
            return;
        }
        setIsPanning(true);
        setPanStartX(e.pageX - (boardScrollRef.current?.offsetLeft || 0));
        setPanScrollLeft(boardScrollRef.current?.scrollLeft || 0);
    };

    const handlePanMouseLeaveOrUp = () => {
        setIsPanning(false);
    };

    const handlePanMouseMove = (e) => {
        if (!isPanning || !boardScrollRef.current) return;
        e.preventDefault();
        const x = e.pageX - boardScrollRef.current.offsetLeft;
        const walk = (x - panStartX) * 1.5;
        boardScrollRef.current.scrollLeft = panScrollLeft - walk;
    };

    const handleWheelScroll = (e) => {
        if (!boardScrollRef.current) return;
        if (e.deltaY !== 0 && !e.shiftKey) {
            const isInsideColumnScroll = e.target.closest(".overflow-y-auto");
            if (!isInsideColumnScroll) {
                boardScrollRef.current.scrollLeft += e.deltaY;
            }
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (<div className={cn("flex flex-col bg-white", embedded ? "flex-1 min-h-0 overflow-hidden" : "")} style={embedded ? undefined : { height: "calc(100vh - 56px)" }}>

      {/* ── Row 1: breadcrumb + add deal (only when standalone) ─────────── */}
      {!embedded && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white">
          {/* Left: All deals tab */}
          <div className="flex items-center gap-1">
            <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12.5px] font-semibold text-gray-800 hover:bg-gray-100 transition-colors">
              All deals
              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-semibold text-gray-600">
                {filteredLeads.length.toLocaleString()}
              </span>
            </button>
          </div>

          {/* Right */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => handleOpenAddLead("new_enquiry")} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-sm">
              <Plus className="w-3.5 h-3.5"/> Add deal
            </button>
          </div>
        </div>
      )}

      {/* ── Row 2: search + view controls ──────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white flex-wrap">
        {/* Search */}
        <div className="relative" style={{ width: 260 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
          <input type="text" placeholder="Search deals by name, company..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-8 pr-7 py-1.5 text-[12px] border border-gray-200 rounded bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-all"/>
          {search && (<button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3"/>
            </button>)}
        </div>

        {/* Active filters clear badge */}
        {activeFiltersCount > 0 && (<button onClick={resetFilters} className="text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded flex items-center gap-1 transition-colors">
            <X className="w-3 h-3"/> Clear {activeFiltersCount} filter(s)
          </button>)}

        {/* View controls */}
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {/* Sort Dropdown */}
          <div className="relative">
            <button onClick={() => { setShowSortDropdown(!showSortDropdown); setShowOwnerDropdown(false); setShowDateDropdown(false); }} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded border transition-colors", sortOption !== "created_desc" ? "border-blue-300 bg-blue-50 text-blue-700 font-semibold" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}>
              <ArrowUpDown className="w-3.5 h-3.5"/> Sort: {sortLabels[sortOption]}
            </button>
            {showSortDropdown && (<div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50 py-1 text-xs">
                {Object.entries(sortLabels).map(([k, lbl]) => (<button key={k} onClick={() => { setSortOption(k); setShowSortDropdown(false); }} className={cn("w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center justify-between", sortOption === k ? "text-blue-600 font-bold bg-blue-50/50" : "text-gray-700")}>
                    <span>{lbl}</span>
                    {sortOption === k && <Check className="w-3.5 h-3.5"/>}
                  </button>))}
              </div>)}
          </div>

          {/* Export CSV Button */}
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5"/> Export CSV ({filteredLeads.length})
          </button>

          {/* Save button */}
          <button onClick={handleSaveView} className="px-2.5 py-1.5 text-[12px] font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
            Save View
          </button>
        </div>
      </div>



      {/* ── Board ──────────────────────────────────────────────────── */}
      {isLoading ? (<div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500"/>
        </div>) : (<div ref={boardScrollRef} onMouseDown={handlePanMouseDown} onMouseLeave={handlePanMouseLeaveOrUp} onMouseUp={handlePanMouseLeaveOrUp} onMouseMove={handlePanMouseMove} onWheel={handleWheelScroll} className={cn("flex-1 min-h-0 overflow-x-auto transition-colors", isPanning ? "cursor-grabbing" : "cursor-grab")}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* items-stretch makes every column fill the full board height */}
            <div className="flex gap-2.5 px-4 py-3 h-full items-stretch min-w-max">
              {STAGES.map(stage => (<Column key={stage.id} stage={stage} leads={g.get(stage.id) ?? []} collapsed={collapsed.has(stage.id)} onToggleCollapse={() => toggleCollapse(stage.id)} onSendWhatsApp={(l) => setTplLeads([l])} onSendEmail={(l) => setEmailModalLead(l)} onAddActivity={(l) => setActivityModalLead(l)} onPhoneCall={(l) => setConfirmCallLead(l)} onAddDeal={(stageId) => handleOpenAddLead(stageId)}/>))}
            </div>

            <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
              {activeLead ? <DealCard lead={activeLead} isDragging/> : null}
            </DragOverlay>
          </DndContext>
        </div>)}

      {/* Integration Modals */}
      {tplLeads && (<SendTemplateModal leads={tplLeads} isOpen={true} onClose={() => setTplLeads(null)}/>)}
      {whatsappModalLead && (<SendWhatsAppModal lead={whatsappModalLead} isOpen={true} onClose={() => setWhatsappModalLead(null)}/>)}
      {emailModalLead && (<ComposeModal onClose={() => setEmailModalLead(null)} initialLead={emailModalLead} initialEmail={emailModalLead.email}/>)}
      {activityModalLead && (<NewMeetingModal leads={allLeads} onClose={() => setActivityModalLead(null)} defaultLeadId={activityModalLead.id}/>)}
      {confirmCallLead && (
        <AiCallConfirmModal
          lead={confirmCallLead}
          onConfirm={handleStartAiCall}
          onCancel={() => setConfirmCallLead(null)}
          isCalling={isCallInFlight}
        />
      )}
      
      {/* Add Lead / Deal Modal */}
      <AddLeadModal isOpen={isAddLeadModalOpen} initialStage={addLeadStage} onClose={() => setIsAddLeadModalOpen(false)}/>
    </div>);
}

export { Pipeline as PipelineBoard };
