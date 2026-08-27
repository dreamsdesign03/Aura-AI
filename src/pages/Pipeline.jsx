import { useState, useCallback, useMemo, useRef } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, closestCenter, } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getListLeadsQueryKey, getGetQualifyQueueQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Plus, Search, Phone, Mail, ChevronDown, ChevronLeft, Pencil, SlidersHorizontal, ArrowUpDown, Download, X, Loader2, MoreHorizontal, Settings2, MessageCircle, Check, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import SendWhatsAppModal from "@/components/SendWhatsAppModal";
import ComposeModal from "@/components/ComposeModal";
import NewMeetingModal from "@/components/NewMeetingModal";

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
        return `₹${(n / 1_00_000).toFixed(1)}L`;
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
function DealCard({ lead, isDragging, onSendWhatsApp, onSendEmail, onAddActivity }) {
    const [, navigate] = useLocation();
    const l = lead;
    const name = `${lead.firstName || lead.first_name || ""} ${lead.lastName || lead.last_name || ""}`.trim() || "Lead";
    const initials = `${lead.firstName?.[0] ?? lead.first_name?.[0] ?? ""}${lead.lastName?.[0] ?? lead.last_name?.[0] ?? ""}`.toUpperCase() || "L";
    const avatarBg = AVATAR_COLORS[lead.id % AVATAR_COLORS.length];
    const dealAmount = l.dealValue ?? l.deal_value ?? null;
    const closeDate = l.closeDate ?? l.close_date ?? null;
    const ownerName = l.assignedToName || null;
    const phoneNum = lead.phone || lead.whatsapp || "";

    return (<div className={cn("bg-white rounded border select-none group transition-shadow", isDragging
            ? "shadow-2xl opacity-75 border-blue-400 rotate-1"
            : "border-gray-200 hover:shadow-md hover:border-blue-300 cursor-pointer")}>
      {/* Card body */}
      <div className="px-3 pt-2.5 pb-2" onClick={() => navigate(`/leads/${lead.id}`)}>

        {/* Name row */}
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span className="text-[12.5px] font-semibold text-blue-600 leading-snug hover:underline line-clamp-2 flex-1">
            {name}
            {lead.company && (<span className="text-gray-500 font-normal"> — {lead.company}</span>)}
          </span>
          <button className="p-0.5 rounded text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }} title="Edit">
            <Pencil className="w-3 h-3"/>
          </button>
        </div>

        {/* Amount */}
        {dealAmount != null && (<div className="text-[11.5px] text-gray-600 mb-0.5">
            Amount: <span className="font-semibold">{fmtAmount(Number(dealAmount))}</span>
          </div>)}

        {/* Close date */}
        {closeDate && (<div className="text-[11.5px] text-gray-500 mb-0.5">
            Close date: <span className="text-gray-700">{fmtDate(closeDate)}</span>
          </div>)}

        {/* Deal owner */}
        {ownerName && (<div className="text-[11.5px] text-gray-500 mb-0.5">
            Deal owner: <span className="text-gray-700">{ownerName}</span>
          </div>)}

        {/* Create date */}
        <div className="text-[11.5px] text-gray-500">
          Create date: <span className="text-gray-700">{fmtDate(lead.createdAt || lead.created_at)}</span>
        </div>

        {/* Assignee row */}
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ background: avatarBg }} title={name}>
            {initials}
          </div>
          <span className="text-[10.5px] text-gray-400 truncate">{name}</span>
        </div>
      </div>

      {/* Action icons — high visibility & connected to Email / WhatsApp integrations */}
      <div className="px-2 py-1.5 border-t border-gray-100 flex items-center gap-1" onClick={e => e.stopPropagation()}>
        {/* Phone Call */}
        {phoneNum ? (
          <a href={`tel:${phoneNum}`} className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title={`Call ${name} (${phoneNum})`} onClick={e => e.stopPropagation()}>
            <Phone className="w-3.5 h-3.5"/>
          </a>
        ) : (
          <button className="p-1.5 rounded bg-gray-50 text-gray-400 hover:bg-gray-100 transition-colors" title="No phone available" onClick={e => { e.stopPropagation(); toast.error(`No phone number for ${name}`); }}>
            <Phone className="w-3.5 h-3.5"/>
          </button>
        )}

        {/* Add Activity / Meeting */}
        <button onClick={e => { e.stopPropagation(); onAddActivity?.(lead); }} className="p-1.5 rounded bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors" title={`Add activity or schedule meeting for ${name}`}>
          <Plus className="w-3.5 h-3.5"/>
        </button>

        {/* Send Email Integration */}
        {lead.email ? (
          <button onClick={e => { e.stopPropagation(); onSendEmail?.(lead); }} className="p-1.5 rounded bg-pink-50 text-pink-600 hover:bg-pink-100 transition-colors" title={`Send email to ${name} (${lead.email})`}>
            <Mail className="w-3.5 h-3.5"/>
          </button>
        ) : (
          <button className="p-1.5 rounded bg-gray-50 text-gray-400 hover:bg-gray-100 transition-colors" title="No email available" onClick={e => { e.stopPropagation(); toast.error(`No email address for ${name}`); }}>
            <Mail className="w-3.5 h-3.5"/>
          </button>
        )}

        {/* WhatsApp Integration */}
        <button onClick={e => { e.stopPropagation(); onSendWhatsApp?.(lead); }} className="p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" title={`Send WhatsApp message to ${name}`}>
          <MessageCircle className="w-3.5 h-3.5"/>
        </button>

        {/* Edit Lead */}
        <button className="p-1.5 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors ml-auto" title="Edit deal" onClick={e => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }}>
          <Pencil className="w-3.5 h-3.5"/>
        </button>
      </div>
    </div>);
}
// ── SortableCard ─────────────────────────────────────────────────────────────
function SortableCard({ lead, onSendWhatsApp, onSendEmail, onAddActivity }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: lead.id,
        data: { lead },
    });
    return (<div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }} {...attributes} {...listeners}>
      <DealCard lead={lead} isDragging={isDragging} onSendWhatsApp={onSendWhatsApp} onSendEmail={onSendEmail} onAddActivity={onAddActivity}/>
    </div>);
}
// ── Column ────────────────────────────────────────────────────────────────────
function Column({ stage, leads, collapsed, onToggleCollapse, onSendWhatsApp, onSendEmail, onAddActivity }) {
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
    return (<div className="flex flex-col flex-shrink-0 w-[240px] border border-gray-200 bg-gray-50 rounded self-stretch min-h-0">

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
          {leads.map(lead => <SortableCard key={lead.id} lead={lead} onSendWhatsApp={onSendWhatsApp} onSendEmail={onSendEmail} onAddActivity={onAddActivity}/>)}
        </SortableContext>

        {leads.length === 0 && (<div className={cn("flex-1 flex items-center justify-center rounded border border-dashed text-[11px] py-8 transition-colors", isOver ? "border-blue-300 text-blue-400 bg-blue-50" : "border-gray-200 text-gray-300")}>
            {isOver ? "Drop here" : "No deals"}
          </div>)}

        <button className="w-full py-1.5 text-[11px] text-gray-400 hover:text-blue-600 flex items-center justify-center gap-1 rounded border border-dashed border-gray-200 hover:border-blue-300 hover:bg-white transition-all">
          <Plus className="w-3 h-3"/> Add deal
        </button>
      </div>

      {/* ── Sticky footer (total + weighted) ─────────────────────────── */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-3 py-2 rounded-b text-[10.5px] text-gray-500 space-y-0.5">
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-semibold text-gray-800 truncate">{totalAmount > 0 ? fmtAmount(totalAmount) : "—"}</span>
          <span className="text-gray-400 truncate">| Total amount</span>
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-semibold text-gray-800 truncate">{weighted > 0 ? fmtAmount(weighted) : "—"}</span>
          <span className="text-gray-400 truncate">({stage.weight}%) | Weighted amount</span>
        </div>
      </div>
    </div>);
}
// ── Pipeline page ─────────────────────────────────────────────────────────────
export default function Pipeline() {
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
    const [emailModalLead, setEmailModalLead] = useState(null);
    const [activityModalLead, setActivityModalLead] = useState(null);
    const [search, setSearch] = useState("");
    const [ownerFilter, setOwnerFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("all");
    const [sortOption, setSortOption] = useState(() => localStorage.getItem("pipeline_sort_option") || "created_desc");
    const [collapsed, setCollapsed] = useState(new Set());

    const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
    const [showDateDropdown, setShowDateDropdown] = useState(false);
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

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
            qc.invalidateQueries({ queryKey: getGetQualifyQueueQueryKey() });
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

    function handleDragStart(ev) {
        const lead = allLeads.find(l => l.id === ev.active.id);
        if (lead)
            setActiveLead(lead);
    }
    function handleDragEnd(ev) {
        setActiveLead(null);
        const { active, over } = ev;
        if (!over)
            return;
        const lead = allLeads.find(l => l.id === active.id);
        if (!lead)
            return;
        const overId = over.id;
        let targetStatus;
        if (STAGES.some(s => s.id === overId)) {
            targetStatus = overId;
        }
        else {
            const containerId = over.data.current?.sortable?.containerId;
            if (containerId && STAGES.some(s => s.id === containerId)) {
                targetStatus = containerId;
            }
            else {
                targetStatus = allLeads.find(l => l.id === overId)?.status;
            }
        }
        if (!targetStatus || targetStatus === lead.status)
            return;
        mutate.mutate({ id: lead.id, status: targetStatus });
    }
    const toggleCollapse = (id) => setCollapsed(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });
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
    return (<div className="flex flex-col bg-white" style={{ height: "calc(100vh - 56px)" }}>

      {/* ── Row 1: breadcrumb + add deal ───────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white">
        {/* Left: Deals breadcrumb + All deals tab */}
        <div className="flex items-center gap-1">
          <button className="flex items-center gap-1 px-2.5 py-1 rounded border border-gray-200 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Deals
            <ChevronDown className="w-3 h-3 text-gray-400"/>
          </button>
          <span className="text-gray-300 mx-1">·</span>
          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12.5px] font-semibold text-gray-800 hover:bg-gray-100 transition-colors">
            All deals
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-semibold text-gray-600">
              {filteredLeads.length.toLocaleString()}
            </span>
          </button>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => navigate("/leads")} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5"/> Add deal
          </button>
        </div>
      </div>

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
              {STAGES.map(stage => (<Column key={stage.id} stage={stage} leads={g.get(stage.id) ?? []} collapsed={collapsed.has(stage.id)} onToggleCollapse={() => toggleCollapse(stage.id)} onSendWhatsApp={(l) => setWhatsappModalLead(l)} onSendEmail={(l) => setEmailModalLead(l)} onAddActivity={(l) => setActivityModalLead(l)}/>))}
            </div>

            <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
              {activeLead ? <DealCard lead={activeLead} isDragging/> : null}
            </DragOverlay>
          </DndContext>
        </div>)}

      {/* Integration Modals */}
      {whatsappModalLead && (<SendWhatsAppModal lead={whatsappModalLead} isOpen={true} onClose={() => setWhatsappModalLead(null)}/>)}
      {emailModalLead && (<ComposeModal onClose={() => setEmailModalLead(null)} initialLead={emailModalLead} initialEmail={emailModalLead.email}/>)}
      {activityModalLead && (<NewMeetingModal leads={allLeads} onClose={() => setActivityModalLead(null)} defaultLeadId={activityModalLead.id}/>)}
    </div>);
}
