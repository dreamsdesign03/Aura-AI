import { useState, useCallback } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, closestCenter, } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, Search, Phone, Mail, ChevronDown, ChevronLeft, Pencil, SlidersHorizontal, ArrowUpDown, Download, X, Loader2, MoreHorizontal, Settings2, MessageCircle, } from "lucide-react";
import { cn } from "@/lib/utils";
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
    "#7C3AED", "#DB2777", "#D97706", "#0891B2",
    "#16A34A", "#DC2626", "#0D9488", "#9333EA",
];
// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAmount(n) {
    if (n >= 1_00_00_000)
        return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (n >= 1_00_000)
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
function DealCard({ lead, isDragging }) {
    const [, navigate] = useLocation();
    const l = lead;
    const name = `${lead.firstName} ${lead.lastName}`.trim();
    const initials = `${lead.firstName?.[0] ?? ""}${lead.lastName?.[0] ?? ""}`.toUpperCase();
    const avatarBg = AVATAR_COLORS[lead.id % AVATAR_COLORS.length];
    const dealAmount = l.dealValue ?? null;
    const closeDate = l.closeDate ?? null;
    const ownerName = l.assignedToName ?? "Dreamsdesign Sales";
    const waNum = (l.whatsapp ?? lead.phone ?? "").replace(/[^0-9]/g, "");
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
        <div className="text-[11.5px] text-gray-500 mb-0.5">
          Deal owner: <span className="text-gray-700">{ownerName}</span>
        </div>

        {/* Create date */}
        <div className="text-[11.5px] text-gray-500">
          Create date: <span className="text-gray-700">{fmtDate(lead.createdAt)}</span>
        </div>

        {/* Assignee row */}
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ background: avatarBg }} title={name}>
            {initials}
          </div>
          <span className="text-[10.5px] text-gray-400 truncate">{name}</span>
        </div>
      </div>

      {/* Action icons — always visible, subtle */}
      <div className="px-2 py-1.5 border-t border-gray-100 flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
        <a href={`tel:${lead.phone}`} className="p-1.5 rounded hover:bg-blue-50 hover:text-blue-600 text-gray-300 transition-colors" title="Call" onClick={e => e.stopPropagation()}>
          <Phone className="w-3 h-3"/>
        </a>
        <button className="p-1.5 rounded hover:bg-blue-50 hover:text-blue-600 text-gray-300 transition-colors" title="Add activity">
          <Plus className="w-3 h-3"/>
        </button>
        <a href={`mailto:${lead.email}`} className="p-1.5 rounded hover:bg-blue-50 hover:text-blue-600 text-gray-300 transition-colors" title="Email" onClick={e => e.stopPropagation()}>
          <Mail className="w-3 h-3"/>
        </a>
        {waNum && (<a href={`https://wa.me/${waNum}`} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-green-50 hover:text-green-600 text-gray-300 transition-colors" title="WhatsApp" onClick={e => e.stopPropagation()}>
            <MessageCircle className="w-3 h-3"/>
          </a>)}
        <button className="p-1.5 rounded hover:bg-blue-50 hover:text-blue-600 text-gray-300 transition-colors ml-auto" title="Edit deal" onClick={e => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }}>
          <Pencil className="w-3 h-3"/>
        </button>
      </div>
    </div>);
}
// ── SortableCard ─────────────────────────────────────────────────────────────
function SortableCard({ lead }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: lead.id,
        data: { lead },
    });
    return (<div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }} {...attributes} {...listeners}>
      <DealCard lead={lead} isDragging={isDragging}/>
    </div>);
}
// ── Column ────────────────────────────────────────────────────────────────────
function Column({ stage, leads, collapsed, onToggleCollapse, }) {
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
          {leads.map(lead => <SortableCard key={lead.id} lead={lead}/>)}
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
    const { data: allLeads = [], isLoading } = useQuery({ queryKey: ["leads-pipeline"], queryFn: fetchLeads });
    const [activeLead, setActiveLead] = useState(null);
    const [search, setSearch] = useState("");
    const [collapsed, setCollapsed] = useState(new Set());
    const mutate = useMutation({
        mutationFn: ({ id, status }) => patchLeadStatus(id, status),
        onMutate: async ({ id, status }) => {
            await qc.cancelQueries({ queryKey: ["leads-pipeline"] });
            const prev = qc.getQueryData(["leads-pipeline"]);
            qc.setQueryData(["leads-pipeline"], (old = []) => old.map(l => l.id === id ? { ...l, status } : l));
            return { prev };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev)
                qc.setQueryData(["leads-pipeline"], ctx.prev);
        },
        onSettled: () => qc.invalidateQueries({ queryKey: ["leads-pipeline"] }),
    });
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const filteredLeads = search.trim()
        ? allLeads.filter(l => `${l.firstName} ${l.lastName} ${l.company} ${l.email}`.toLowerCase().includes(search.toLowerCase()))
        : allLeads;
    const grouped = useCallback(() => {
        const map = new Map();
        for (const s of STAGES)
            map.set(s.id, []);
        for (const lead of filteredLeads) {
            const key = (lead.status ?? "new_enquiry");
            map.has(key) ? map.get(key).push(lead) : map.get("new_enquiry").push(lead);
        }
        return map;
    }, [filteredLeads]);
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
              {allLeads.length.toLocaleString()}
            </span>
          </button>
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors" title="New view">
            <Plus className="w-3.5 h-3.5"/>
          </button>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5">
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors">
            <MoreHorizontal className="w-4 h-4"/>
          </button>
          <button onClick={() => navigate("/leads")} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5"/> Add deal
          </button>
        </div>
      </div>

      {/* ── Row 2: search + view controls ──────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        {/* Search */}
        <div className="relative" style={{ width: 280 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
          <input type="text" placeholder="Search deals…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-8 pr-7 py-1.5 text-[12px] border border-gray-200 rounded bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-all"/>
          {search && (<button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3"/>
            </button>)}
        </div>

        {/* View controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap">
            Board view <ChevronDown className="w-3 h-3 text-gray-400"/>
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap">
            <Settings2 className="w-3.5 h-3.5"/> DD Sales Pipeline <ChevronDown className="w-3 h-3 text-gray-400"/>
          </button>
          <div className="w-px h-4 bg-gray-200"/>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors whitespace-nowrap">
            <SlidersHorizontal className="w-3.5 h-3.5"/> Filters
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
            <ArrowUpDown className="w-3.5 h-3.5"/> Sort
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5"/> Export
          </button>
          <button className="px-2.5 py-1.5 text-[12px] font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
            Save
          </button>
        </div>
      </div>

      {/* ── Row 3: filter chips ─────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 border-b border-gray-100 bg-white">
        {["Deal owner", "Create date", "Last activity date", "Close date"].map(label => (<button key={label} className="flex items-center gap-1 px-2.5 py-1 text-[11.5px] text-gray-600 border border-gray-200 rounded hover:border-blue-300 hover:text-blue-600 bg-white transition-colors whitespace-nowrap">
            {label} <ChevronDown className="w-3 h-3"/>
          </button>))}
        <button className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
          <Plus className="w-3 h-3"/>
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
          <Pencil className="w-3 h-3"/>
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] text-gray-500 border border-gray-200 rounded hover:border-blue-300 hover:text-blue-600 bg-white transition-colors ml-1 whitespace-nowrap">
          <SlidersHorizontal className="w-3 h-3"/> Advanced filters
        </button>
      </div>

      {/* ── Board ──────────────────────────────────────────────────── */}
      {isLoading ? (<div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500"/>
        </div>) : (<div className="flex-1 min-h-0 overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* items-stretch makes every column fill the full board height */}
            <div className="flex gap-2.5 px-4 py-3 h-full items-stretch min-w-max">
              {STAGES.map(stage => (<Column key={stage.id} stage={stage} leads={g.get(stage.id) ?? []} collapsed={collapsed.has(stage.id)} onToggleCollapse={() => toggleCollapse(stage.id)}/>))}
            </div>

            <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
              {activeLead ? <DealCard lead={activeLead} isDragging/> : null}
            </DragOverlay>
          </DndContext>
        </div>)}
    </div>);
}
