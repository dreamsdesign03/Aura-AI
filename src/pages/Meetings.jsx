import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useListAppointments, useUpdateAppointment, useDeleteAppointment, useListMeetings, useUpdateMeeting, useDeleteMeeting, useListLeads, getListAppointmentsQueryKey, getListMeetingsQueryKey, } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, ChevronLeft, ChevronRight, Video, MapPin, Calendar, CheckCircle2, Loader2, Trash2, CalendarDays, Users, User, Download, Plus, Pencil, X, AlertCircle, Brain, ExternalLink, RefreshCw, } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewMeetingModal, downloadICS, MEETING_TYPES } from "@/components/NewMeetingModal";
import TranscriptModal from "@/components/TranscriptModal";
import CalendlyEmbed from "@/components/CalendlyEmbed";
// ── Constants ─────────────────────────────────────────────────────────────────
const DESCRIPTION = `Hello there,

PLEASE READ BEFORE BOOKING 👇

1. Fill in the form carefully so Dr. Aditya Shah can prepare for your consultation.
2. Please review the details before confirming your slot.

Can't wait to help you!

Thanks,
Aura Laser & Cosmetic Clinic | Skinnonest`;
// ── Helpers ───────────────────────────────────────────────────────────────────
function statusColor(s) {
    if (s === "confirmed")
        return { bg: "#dcfce7", text: "#16a34a" };
    if (s === "completed")
        return { bg: "#dbeafe", text: "#1d4ed8" };
    if (s === "cancelled")
        return { bg: "#fee2e2", text: "#dc2626" };
    return { bg: "#f3f4f6", text: "#6b7280" };
}
// ── HostPanel (left side, shared across all steps) ───────────────────────────
function HostPanel({ selectedDate, selectedTimeLabel }) {
    return (<div className="w-64 flex-shrink-0 border-r border-gray-200 p-7 flex flex-col gap-5">
      <div className="flex flex-col items-start gap-3">
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-md" style={{ background: "linear-gradient(135deg,#0E7490,#DB2777)" }}>
          AS
        </div>
        <div>
          <div className="text-[11px] text-gray-500 font-medium">Dr. Aditya Shah</div>
          <div className="text-base font-bold text-gray-900 mt-0.5 leading-tight">Clinic Consultation</div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">Aura Laser &amp; Cosmetic Clinic | Skinnonest</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"/>
          <span>30 min</span>
        </div>
        {selectedDate && (<div className="flex items-start gap-2 text-xs text-gray-600">
            <CalendarDays className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5"/>
            <span className="leading-relaxed">
              {selectedTimeLabel && <span className="font-semibold text-gray-800">{selectedTimeLabel}, </span>}
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </span>
          </div>)}
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <div className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full border border-gray-400 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-400"/>
            </div>
          </div>
          <span>India Standard Time</span>
        </div>
      </div>

      <div className="pt-1 border-t border-gray-100">
        <div className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-line">{DESCRIPTION}</div>
      </div>
    </div>);
}
// ── Booking Widget (Calendly embed) ───────────────────────────────────────────
function BookingWidget() {
    return (<div className="flex items-start justify-center py-8 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl flex overflow-hidden" style={{ width: "min(1050px, 100%)", minHeight: "780px" }}>
        <HostPanel/>
        <div className="flex-1 p-6 md:p-8 flex flex-col min-w-0">
          <div className="mb-4">
            <div className="text-base font-bold text-gray-900">Schedule your Clinic Consultation</div>
            <div className="text-xs text-gray-500 mt-0.5">Pick a time — confirmation &amp; calendar invite are sent automatically by Calendly.</div>
          </div>
          <CalendlyEmbed height={750}/>
        </div>
      </div>
    </div>);
}
// ── Admin Bookings View ───────────────────────────────────────────────────────
function AdminView() {
    const qc = useQueryClient();
    const { data: appts = [], isLoading } = useListAppointments();
    const appointments = appts;
    const updateAppt = useUpdateAppointment();
    const deleteAppt = useDeleteAppointment({
        mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListAppointmentsQueryKey() }) },
    });
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState("");
    const syncCalendly = useCallback(async () => {
        setSyncing(true);
        setSyncError("");
        try {
            const r = await fetch("/api/calendly/sync");
            const j = await r.json();
            if (!r.ok || j.error) {
                setSyncError(j.error ?? "Calendly sync failed. Is CALENDLY_TOKEN set?");
            }
            qc.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
        }
        catch {
            setSyncError("Network error during Calendly sync.");
        }
        finally {
            setSyncing(false);
        }
    }, [qc]);
    useEffect(() => {
        syncCalendly();
        const interval = setInterval(syncCalendly, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [syncCalendly]);
    const [activeId, setActiveId] = useState(null);
    const active = appointments.find(a => a.id === activeId);
    async function handleStatusChange(id, status) {
        try {
            await updateAppt.mutateAsync({ id, data: { status } });
            qc.setQueryData(getListAppointmentsQueryKey(), (prev) => prev ? prev.map((a) => a.id === id ? { ...a, status } : a) : prev);
            qc.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
        }
        catch {
            qc.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
        }
    }
    const [transcriptApptId, setTranscriptApptId] = useState(null);
    const upcoming = appointments.filter(a => {
        const now = new Date().toISOString().split("T")[0];
        return a.scheduledDate >= now && a.status === "confirmed";
    });
    const past = appointments.filter(a => !upcoming.includes(a));
    const [hStr, mStr] = active ? active.scheduledTime.split(":") : ["0", "00"];
    const h = Number(hStr);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const activeTimeLabel = active ? `${h12}:${mStr} ${suffix} IST` : "";
    return (<>
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-3 md:p-6" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* List panel */}
      <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Appointments ({appointments.length})
          </span>
          <div className="flex items-center gap-1.5">
            {syncError && <span className="text-[10px] text-red-500 max-w-[140px] truncate">{syncError}</span>}
            <button onClick={syncCalendly} disabled={syncing} className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all border border-green-700 text-green-800 hover:bg-green-50 disabled:opacity-60" title="Sync bookings from Calendly">
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")}/>
              {syncing ? "Syncing…" : "Sync Calendly"}
            </button>
          </div>
        </div>

        {isLoading ? (<div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse"/>)}
          </div>) : appointments.length === 0 ? (<div className="flex flex-col items-center justify-center flex-1 p-10 text-center">
            <CalendarDays className="w-8 h-8 text-gray-200 mb-3"/>
            <div className="text-sm text-gray-400">No appointments yet</div>
            <div className="text-xs text-gray-300 mt-1">Bookings will appear here</div>
          </div>) : (<div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {[{ label: "Upcoming", items: upcoming }, { label: "Past / Other", items: past }].map(({ label, items }) => items.length > 0 ? (<div key={label}>
                  <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50">{label}</div>
                  {items.map(appt => {
                    const sc = statusColor(appt.status);
                    const [hh, mm] = appt.scheduledTime.split(":");
                    const hnum = Number(hh);
                    const suf = hnum >= 12 ? "PM" : "AM";
                    const h12a = hnum > 12 ? hnum - 12 : hnum === 0 ? 12 : hnum;
                    const tl = `${h12a}:${mm} ${suf}`;
                    return (<button key={appt.id} onClick={() => setActiveId(appt.id)} className={cn("w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors", activeId === appt.id && "bg-green-50 border-l-2 border-green-700")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-gray-900 truncate">{appt.name}</div>
                            <div className="text-[11px] text-gray-500 truncate">{appt.email}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: sc.text, background: sc.bg }}>
                                {appt.status}
                              </span>
                              {appt.location === "meet"
                            ? <Video className="w-3 h-3 text-blue-400"/>
                            : <MapPin className="w-3 h-3 text-red-400"/>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-[11px] font-medium text-gray-700">
                              {new Date(appt.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </div>
                            <div className="text-[10px] text-gray-400">{tl}</div>
                          </div>
                        </div>
                      </button>);
                })}
                </div>) : null)}
          </div>)}
      </div>

      {/* Detail panel */}
      <div className="md:col-span-3">
        {!active ? (<div className="rounded-xl border border-dashed border-gray-200 bg-white h-full flex flex-col items-center justify-center p-12 text-center">
            <User className="w-8 h-8 text-gray-200 mb-3"/>
            <div className="text-sm text-gray-400">Select an appointment to view details</div>
          </div>) : (<div className="space-y-4">
            {/* Header card */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-base font-bold text-gray-900">{active.name}</div>
                  <div className="text-sm text-gray-500">{active.email}</div>
                  {active.phone && <div className="text-sm text-gray-500">{active.phone}</div>}
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                    <CalendarDays className="w-3.5 h-3.5 text-gray-400"/>
                    {new Date(active.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · {activeTimeLabel}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                    {active.location === "meet"
                ? <><Video className="w-3.5 h-3.5 text-blue-500"/> Google Meet</>
                : <><MapPin className="w-3.5 h-3.5 text-red-500"/> In-person – Vadodara</>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {active.meetingLink && (<a href={active.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors">
                        <Video className="w-2.5 h-2.5"/> Join Zoom <ExternalLink className="w-2.5 h-2.5"/>
                      </a>)}
                    {active.googleCalendarEventId && (<span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-2.5 h-2.5"/> In Google Calendar
                      </span>)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <select value={active.status} onChange={e => handleStatusChange(active.id, e.target.value)} disabled={updateAppt.isPending} className="text-xs rounded-lg border border-gray-200 bg-white text-gray-900 px-2.5 py-1.5 focus:outline-none disabled:opacity-50">
                      {["confirmed", "completed", "cancelled", "noshow"].map(s => (<option key={s} value={s}>{s}</option>))}
                    </select>
                    <button onClick={() => { if (confirm("Delete this appointment?")) {
            deleteAppt.mutate({ id: active.id });
            setActiveId(null);
        } }} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                      <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                  <button onClick={() => setTranscriptApptId(active.id)} className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors">
                    <Brain className="w-3 h-3"/> AI Transcript & Proposal
                  </button>
                </div>
              </div>
            </div>

            {/* Form responses */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">Qualification Answers</div>
              <div className="space-y-3">
                {[
                { label: "Business Summary", val: active.businessSummary },
                { label: "Specific Problem", val: active.specificProblem },
                { label: "Desired Result (3-6 months)", val: active.desiredResult },
                { label: "Why I Can Help", val: active.whyCanHelp },
                { label: "Investment Willingness", val: active.investmentWillingness },
                { label: "Min Investment Confirmation", val: active.minInvestmentConfirm },
                { label: "How Soon Can They Start", val: active.startSoon },
                { label: "Business Partner on Call", val: active.businessPartner || "None mentioned" },
            ].map(({ label, val }) => val ? (<div key={label} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
                    <div className="text-xs text-gray-800 leading-relaxed">{val}</div>
                  </div>) : null)}

                {(active.services?.length ?? 0) > 0 && (<div>
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Services Interested In</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(active.services ?? []).map(svc => (<span key={svc} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-800 border border-green-200">
                          {svc}
                        </span>))}
                    </div>
                    {active.otherService && <div className="text-xs text-gray-600 mt-1">Other: {active.otherService}</div>}
                  </div>)}
              </div>
            </div>
          </div>)}
      </div>
    </div>

    {transcriptApptId !== null && (() => {
            const ta = appointments.find(a => a.id === transcriptApptId);
            return (<TranscriptModal appointmentId={transcriptApptId} clientName={ta?.name} company={undefined} industry={undefined} onClose={() => setTranscriptApptId(null)}/>);
        })()}
    </>);
}
// ── CRM Meetings View ─────────────────────────────────────────────────────────
const MEETING_STATUSES = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];
function toDatetimeLocal(isoStr) {
    const d = new Date(isoStr);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function CrmMeetingsView() {
    const { data: meetings = [], isLoading } = useListMeetings();
    const { data: leadsResp } = useListLeads();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const updateMeeting = useUpdateMeeting();
    const deleteMeeting = useDeleteMeeting();
    const [showModal, setShowModal] = useState(false);
    const [activeId, setActiveId] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState(null);
    const [editError, setEditError] = useState(null);
    const [transcriptMeetingId, setTranscriptMeetingId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [deleteError, setDeleteError] = useState(null);
    const activeMeeting = meetings.find(m => m.id === activeId);
    function startEdit(m) {
        const safeStatus = MEETING_STATUSES.includes(m.status)
            ? m.status
            : "scheduled";
        setEditForm({
            scheduledAt: toDatetimeLocal(m.scheduledAt),
            duration: m.duration,
            type: (MEETING_TYPES.includes(m.type) ? m.type : "discovery"),
            status: safeStatus,
            meetingUrl: m.meetingUrl ?? "",
            notes: m.notes ?? "",
        });
        setEditError(null);
        setIsEditing(true);
    }
    async function handleSave() {
        if (!activeMeeting || !editForm)
            return;
        setEditError(null);
        if (!editForm.scheduledAt) {
            setEditError("Please enter a valid date and time.");
            return;
        }
        const parsedDate = new Date(editForm.scheduledAt);
        if (isNaN(parsedDate.getTime())) {
            setEditError("The date and time you entered is invalid.");
            return;
        }
        if (editForm.duration < 15 || editForm.duration > 480) {
            setEditError("Duration must be between 15 and 480 minutes.");
            return;
        }
        const updatedFields = {
            scheduledAt: parsedDate.toISOString(),
            duration: editForm.duration,
            type: editForm.type,
            status: editForm.status,
            meetingUrl: editForm.meetingUrl.trim() || null,
            notes: editForm.notes.trim() || null,
        };
        try {
            await updateMeeting.mutateAsync({
                id: activeMeeting.id,
                data: updatedFields,
            });
            queryClient.setQueryData(getListMeetingsQueryKey(), (prev) => prev
                ? prev.map((m) => m.id === activeMeeting.id ? { ...m, ...updatedFields } : m)
                : prev);
            queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
            setIsEditing(false);
            toast({ title: "Meeting updated", duration: 2000 });
        }
        catch {
            setEditError("Failed to save changes. Please try again.");
        }
    }
    async function handleDelete(id) {
        setDeleteError(null);
        try {
            await deleteMeeting.mutateAsync({ id });
            await queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
            setConfirmDeleteId(null);
            setActiveId(null);
            toast({ title: "Meeting deleted" });
        }
        catch {
            setDeleteError("Failed to delete the meeting. Please try again.");
        }
    }
    const handleCreated = (meeting, shouldDownload) => {
        setShowModal(false);
        setActiveId(meeting.id);
        if (shouldDownload)
            downloadICS(meeting);
    };
    const rawLeads = leadsResp?.leads ?? [];
    const leadOptions = rawLeads.map((l) => ({
        id: l.id,
        firstName: l.firstName ?? "",
        lastName: l.lastName ?? "",
        company: l.company ?? "",
    }));
    function formatMeetingTime(m) {
        const d = new Date(m.scheduledAt);
        return d.toLocaleString("en-US", {
            month: "short", day: "numeric", year: "numeric",
            hour: "numeric", minute: "2-digit", hour12: true,
        });
    }
    return (<>
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-3 md:p-6" style={{ minHeight: "calc(100vh - 120px)" }}>
      {showModal && (<NewMeetingModal leads={leadOptions} onClose={() => setShowModal(false)} onCreated={handleCreated}/>)}

      {/* List panel */}
      <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            CRM Meetings ({meetings.length})
          </span>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 text-xs font-semibold text-white px-2.5 py-1.5 rounded-lg transition-all" style={{ background: "#1A3D2B" }}>
            <Plus className="w-3.5 h-3.5"/> New
          </button>
        </div>

        {isLoading ? (<div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse"/>)}
          </div>) : meetings.length === 0 ? (<div className="flex flex-col items-center justify-center flex-1 p-10 text-center">
            <CalendarDays className="w-8 h-8 text-gray-200 mb-3"/>
            <div className="text-sm text-gray-400">No CRM meetings yet</div>
            <div className="text-xs text-gray-300 mt-1">Click &ldquo;New&rdquo; to schedule one</div>
          </div>) : (<div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {meetings.map(m => {
                const sc = statusColor(m.status);
                return (<button key={m.id} onClick={() => { setActiveId(m.id); setIsEditing(false); }} className={cn("w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors", activeId === m.id && "bg-green-50 border-l-2 border-green-700")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">
                        {m.lead ? `${m.lead.firstName} ${m.lead.lastName}` : `Meeting #${m.id}`}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{m.lead?.company ?? ""}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: sc.text, background: sc.bg }}>
                          {m.status}
                        </span>
                        <span className="text-[10px] text-gray-400 capitalize">{m.type.replace(/_/g, " ")}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[11px] font-medium text-gray-700">
                        {new Date(m.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(m.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                      </div>
                    </div>
                  </div>
                </button>);
            })}
          </div>)}
      </div>

      {/* Detail panel */}
      <div className="md:col-span-3">
        {!activeMeeting ? (<div className="rounded-xl border border-dashed border-gray-200 bg-white h-full flex flex-col items-center justify-center p-12 text-center">
            <CalendarDays className="w-8 h-8 text-gray-200 mb-3"/>
            <div className="text-sm text-gray-400">Select a meeting to view details</div>
          </div>) : isEditing && editForm ? (
        /* ── Edit form ── */
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold text-gray-900">
                  {activeMeeting.lead
                ? `${activeMeeting.lead.firstName} ${activeMeeting.lead.lastName}`
                : `Meeting #${activeMeeting.id}`}
                </div>
                {activeMeeting.lead?.company && (<div className="text-sm text-gray-500">{activeMeeting.lead.company}</div>)}
              </div>
              <button onClick={() => setIsEditing(false)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition-colors" title="Cancel editing">
                <X className="w-4 h-4"/>
              </button>
            </div>

            {(() => {
                const labelCls = "block text-[11px] font-semibold text-gray-600 mb-1";
                const inputCls = "w-full text-sm rounded-lg border border-gray-200 bg-white text-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-700/20 focus:border-green-700 transition-colors";
                const setField = (k, v) => setEditForm(f => f ? { ...f, [k]: v } : f);
                return (<div className="space-y-3 border-t border-gray-100 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={labelCls}>Date &amp; Time</label>
                      <input type="datetime-local" value={editForm.scheduledAt} onChange={e => setField("scheduledAt", e.target.value)} className={inputCls}/>
                    </div>
                    <div>
                      <label className={labelCls}>Duration (min)</label>
                      <input type="number" min={15} max={480} value={editForm.duration} onChange={e => setField("duration", Number(e.target.value))} className={inputCls}/>
                    </div>
                    <div>
                      <label className={labelCls}>Meeting Type</label>
                      <select value={editForm.type} onChange={e => setField("type", e.target.value)} className={inputCls}>
                        {MEETING_TYPES.map(t => (<option key={t} value={t}>{t.replace(/_/g, " ")}</option>))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Status</label>
                    <select value={editForm.status} onChange={e => setField("status", e.target.value)} className={inputCls}>
                      {MEETING_STATUSES.map(s => (<option key={s} value={s}>{s.replace(/_/g, " ")}</option>))}
                    </select>
                  </div>

                  <div>
                    <label className={labelCls}>Location / Video Link <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="text" value={editForm.meetingUrl} onChange={e => setField("meetingUrl", e.target.value)} placeholder="e.g. https://meet.google.com/abc-defg-hij or Conference Room A" className={inputCls}/>
                  </div>

                  <div>
                    <label className={labelCls}>Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea rows={3} value={editForm.notes} onChange={e => setField("notes", e.target.value)} className={inputCls + " resize-none"}/>
                  </div>

                  {editError && (<div className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-100 text-xs text-red-600">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/> {editError}
                    </div>)}

                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setIsEditing(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleSave} disabled={updateMeeting.isPending} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50" style={{ background: "#1A3D2B" }}>
                      {updateMeeting.isPending
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Saving…</>
                        : "Save Changes"}
                    </button>
                  </div>
                </div>);
            })()}
          </div>) : (
        /* ── Read-only detail view ── */
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-bold text-gray-900">
                  {activeMeeting.lead
                ? `${activeMeeting.lead.firstName} ${activeMeeting.lead.lastName}`
                : `Meeting #${activeMeeting.id}`}
                </div>
                {activeMeeting.lead?.company && (<div className="text-sm text-gray-500">{activeMeeting.lead.company}</div>)}
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                  <CalendarDays className="w-3.5 h-3.5 text-gray-400"/>
                  {formatMeetingTime(activeMeeting)}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                  <Clock className="w-3.5 h-3.5 text-gray-400"/>
                  {activeMeeting.duration} min · <span className="capitalize">{activeMeeting.type.replace(/_/g, " ")}</span>
                </div>
                {activeMeeting.meetingUrl && (<div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                    {activeMeeting.meetingUrl.startsWith("http")
                    ? <Video className="w-3.5 h-3.5 text-blue-500 flex-shrink-0"/>
                    : <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0"/>}
                    <a href={activeMeeting.meetingUrl.startsWith("http") ? activeMeeting.meetingUrl : undefined} target="_blank" rel="noreferrer" className={cn("truncate max-w-xs", activeMeeting.meetingUrl.startsWith("http") && "text-blue-600 underline hover:text-blue-800")}>
                      {activeMeeting.meetingUrl}
                    </a>
                  </div>)}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(activeMeeting)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors" title="Edit meeting details">
                    <Pencil className="w-3.5 h-3.5"/> Edit
                  </button>
                  <button onClick={() => downloadICS(activeMeeting)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors" title="Download .ics calendar file">
                    <Download className="w-3.5 h-3.5"/> Download .ics
                  </button>
                  <button onClick={() => setConfirmDeleteId(activeMeeting.id)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors" title="Delete this meeting">
                    <Trash2 className="w-3.5 h-3.5"/> Delete
                  </button>
                </div>
                {activeMeeting.googleCalendarEventId && (<span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-2.5 h-2.5"/> In Google Calendar
                  </span>)}
                <button onClick={() => setTranscriptMeetingId(activeMeeting.id)} className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors">
                  <Brain className="w-3 h-3"/> AI Transcript & Proposal
                </button>
              </div>
            </div>

            {activeMeeting.notes && (<div className="border-t border-gray-100 pt-4">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</div>
                <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{activeMeeting.notes}</div>
              </div>)}

            {(activeMeeting.painPoints?.length ?? 0) > 0 && (<div className="border-t border-gray-100 pt-4">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Pain Points</div>
                <div className="flex flex-wrap gap-1.5">
                  {(activeMeeting.painPoints ?? []).map((p, i) => (<span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">{p}</span>))}
                </div>
              </div>)}

            {activeMeeting.nextAction && (<div className="border-t border-gray-100 pt-4">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Next Action</div>
                <div className="text-xs text-gray-700">{activeMeeting.nextAction}</div>
              </div>)}
          </div>)}
      </div>
    </div>

    {transcriptMeetingId !== null && (() => {
            const tm = meetings.find(m => m.id === transcriptMeetingId);
            return (<TranscriptModal meetingId={transcriptMeetingId} clientName={tm?.lead ? `${tm.lead.firstName} ${tm.lead.lastName}` : undefined} company={tm?.lead?.company ?? undefined} industry={tm?.lead?.industry ?? undefined} onClose={() => setTranscriptMeetingId(null)}/>);
        })()}

    {confirmDeleteId !== null && (() => {
            const tm = meetings.find(m => m.id === confirmDeleteId);
            const label = tm?.lead ? `${tm.lead.firstName} ${tm.lead.lastName}` : `Meeting #${confirmDeleteId}`;
            return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-600"/>
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">Delete meeting?</div>
                <div className="text-xs text-gray-500 mt-1">
                  This will permanently remove the meeting with <span className="font-semibold">{label}</span>. This action cannot be undone.
                </div>
              </div>
            </div>
            {deleteError && (<div className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-100 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/> {deleteError}
              </div>)}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)} disabled={deleteMeeting.isPending} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50" style={{ background: "#dc2626" }}>
                {deleteMeeting.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Deleting…</>
                    : "Delete"}
              </button>
            </div>
          </div>
        </div>);
        })()}
    </>);
}
// ── Main Meetings page ────────────────────────────────────────────────────────
export default function Meetings() {
    const [mainTab, setMainTab] = useState("manage");
    return (<div className="min-h-screen" style={{ background: "#f5f5f5" }}>
      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-6 flex items-center gap-1">
        {([
            { key: "book", label: "📅 Book a Meeting", icon: <Calendar className="w-3.5 h-3.5"/> },
            { key: "manage", label: "📋 Manage Bookings", icon: <Users className="w-3.5 h-3.5"/> },
            { key: "crm", label: "🤝 CRM Meetings", icon: <CalendarDays className="w-3.5 h-3.5"/> },
        ]).map(tab => (<button key={tab.key} onClick={() => setMainTab(tab.key)} className={cn("flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px", mainTab === tab.key
                ? "border-green-700 text-green-800"
                : "border-transparent text-gray-400 hover:text-gray-700")}>
            {tab.label}
          </button>))}
      </div>

      {mainTab === "book" && <BookingWidget />}
      {mainTab === "manage" && <AdminView />}
      {mainTab === "crm" && <CrmMeetingsView />}
    </div>);
}
