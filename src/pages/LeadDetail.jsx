import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetLead, useUpdateLead, useListMeetings, useListLeads, useListTeamMembers, getListMeetingsQueryKey } from "@workspace/api-client-react";
import { getGetLeadQueryKey, getListLeadsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthUser } from "@/contexts/AuthContext";
import { StatusBadge, Tag } from "@/components/Badge";
import { bandColorFromKey, bandLabelFromKey, scoreToBandKey, formatDate, formatRelative } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ArrowLeft, ChevronLeft, ChevronRight, Globe, Globe as Linkedin, Phone, Mail, Building2, MapPin, MessageCircle, Pencil, X, Check, Loader2, Sparkles, CalendarPlus, CalendarDays, Download, UserCheck, Send, FileText, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { NewMeetingModal, downloadICS } from "@/components/NewMeetingModal";
import { AiPanelOverlay } from "@/components/AiLoader";
import { IntelReport } from "@/components/IntelReport";

const INPUT_CLS = "w-full text-xs rounded border border-gray-300 bg-white text-gray-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500";
const LABEL_CLS = "text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5";

function buildMysaIntelData(lead) {
    if (!lead) return { companyName: "Lead", website: "example.com", healthScore: 70, criticalCount: 2, hero: { monthlyRisk: "₹1,85,000", annualRisk: "₹22,20,000", fixTimeline: "14 Days" }, why: { quote: "Digital conversion barriers route inquiries to competitors.", body: "<p>Lead data is being analyzed.</p>", negativeTags: [], positiveTags: [] }, compare: [], categoryScores: [], findings: [], roadmap: [] };
    const fn = String(lead.firstName || lead.first_name || lead.company || "Lead").trim();
    const ln = String(lead.lastName || lead.last_name || "").trim();
    const companyName = lead.company || (ln ? `${fn} ${ln}` : fn);
    const websiteStr = typeof lead.website === 'string' ? lead.website : '';
    const domain = websiteStr ? websiteStr.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : `${String(companyName).toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    const location = [lead.city, lead.country].filter(Boolean).join(', ') || 'India';
    const industry = lead.industry || 'Healthcare / Clinic';
    const bant = lead.bantScore ?? 68;

    return {
        companyName,
        website: domain,
        healthScore: bant,
        criticalCount: 3,
        hero: {
            monthlyRisk: "₹1,85,000",
            annualRisk: "₹22,20,000",
            fixTimeline: "14 Days",
        },
        why: {
            quote: `Potential clients are searching for top ${industry} providers in ${location}, but missing digital conversion channels route inquiries to competitors.`,
            body: `<p><strong>${companyName}</strong> has strong market trust and local authority in ${location}. However, missing automated booking systems, schema metadata, and conversion tracking mean visitors drop off without converting.</p>`,
            negativeTags: ["Missing Conversion Pixel", "Manual Inquiry Response", "Mobile Speed Penalty"],
            positiveTags: ["Verified Local Listing", "Active Contact Channel", "Strong Specialty Fit"],
        },
        compare: [
            { name: "Digital Conversion Tracking", company: { status: "fail", label: "Missing" }, competitors: { status: "pass", label: "Active Pixel" }, industry: { status: "pass", label: "Standard" } },
            { name: "Automated WhatsApp Booking", company: { status: "warn", label: "Manual" }, competitors: { status: "pass", label: "Automated" }, industry: { status: "pass", label: "Standard" } },
            { name: "Local Search & Map Pack Rank", company: { status: "pass", label: "Indexed" }, competitors: { status: "pass", label: "Top 3" }, industry: { status: "pass", label: "Optimized" } },
            { name: "Mobile Load Performance", company: { status: "warn", label: "2.8s Load" }, competitors: { status: "pass", label: "1.1s Load" }, industry: { status: "pass", label: "Sub-1.5s" } },
        ],
        categoryScores: [
            { name: "Website Conversion & Booking", score: Math.round(Math.min(10, (bant / 10) * 0.9)) },
            { name: "Local SEO & Search Visibility", score: Math.round(Math.min(10, (bant / 10) * 0.8)) },
            { name: "Ad Pixel & Retargeting Setup", score: Math.round(Math.min(10, (bant / 10) * 0.6)) },
            { name: "Mobile Speed & User Experience", score: Math.round(Math.min(10, (bant / 10) * 0.95)) },
        ],
        findings: [
            { title: "No Automated WhatsApp Response Hook", severity: "critical", category: "Outreach", description: "Leads reaching out through forms or phone listings are not receiving instant WhatsApp confirmations, leading to a 40% loss in response rate." },
            { title: "Meta & Google Retargeting Pixels Absent", severity: "critical", category: "Tracking", description: "No conversion pixels detected on domain. Visitor traffic cannot be retargeted with follow-up campaigns." },
            { title: "Schema.org LocalBusiness Structured Data Missing", severity: "warning", category: "SEO", description: "Search engines cannot verify specialty clinic attributes, lowering Google Maps organic rank." },
        ],
        roadmap: [
            { title: "Phase 1: Conversion & Tracking Setup", time: "Days 1 - 3", impact: "High", points: ["Deploy WhatsApp Instant Booking Hook", "Install Meta & Google Tag Manager", "Add One-Click Calling CTA"] },
            { title: "Phase 2: Local Search & Google Maps Boost", time: "Days 4 - 7", impact: "High", points: ["Add Schema.org Clinic Metadata", "Optimize Google My Business Profile", "Enable Reviews Auto-Collector"] },
            { title: "Phase 3: Automated Nurturing Sequences", time: "Days 8 - 14", impact: "Medium", points: ["Launch 3-Touchpoint WhatsApp Follow-up", "Automate Meeting Reminders"] },
        ],
    };
}

export default function LeadDetail() {
    const [, params] = useRoute("/leads/:id");
    const id = Number(params?.id);
    const [, navigate] = useLocation();
    const qc = useQueryClient();
    const [activeTab, setActiveTab] = useState("overview");
    const navList = useMemo(() => {
        try {
            const raw = sessionStorage.getItem("leadsNavList");
            return raw ? JSON.parse(raw) : [];
        }
        catch {
            return [];
        }
    }, []);
    const currentIndex = navList.indexOf(id);
    const prevId = currentIndex > 0 ? navList[currentIndex - 1] : null;
    const nextId = currentIndex !== -1 && currentIndex < navList.length - 1 ? navList[currentIndex + 1] : null;
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const [rescoring, setRescoring] = useState(false);
    const [rescoreError, setRescoreError] = useState(null);
    const ALREADY_SCORED_MSG = "This lead has already been scored. Refresh or use Re-score to update.";
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiModalType, setAiModalType] = useState("outreach");
    const [genLoading, setGenLoading] = useState(false);
    const [genResult, setGenResult] = useState(null);
    const [sendSuccess, setSendSuccess] = useState(false);

    const handleGenerateAiOutreach = async () => {
        setAiModalType("outreach");
        setAiModalOpen(true);
        setGenLoading(true);
        setGenResult(null);
        setSendSuccess(false);
        try {
            const res = await fetch("/api/outreach/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leadId: id }),
            }).then(r => r.json());
            setGenResult(res);
        } catch (e) {
            console.error(e);
        } finally {
            setGenLoading(false);
        }
    };

    const handleGenerateAiProposal = async () => {
        setAiModalType("proposal");
        setAiModalOpen(true);
        setGenLoading(true);
        setGenResult(null);
        setSendSuccess(false);
        try {
            const res = await fetch("/api/proposals/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leadId: id }),
            }).then(r => r.json());
            setGenResult(res);
        } catch (e) {
            console.error(e);
        } finally {
            setGenLoading(false);
        }
    };
    const { toast } = useToast();
    const { data: allMeetings = [] } = useListMeetings();
    const { data: leadsResp } = useListLeads();
    const { data: teamMembers = [] } = useListTeamMembers();
    const authUser = useAuthUser();
    const canReassign = authUser?.role === "owner" || authUser?.role === "admin";
    const leadMeetings = allMeetings.filter(m => m.lead?.id === id);
    useEffect(() => {
        setRescoreError(null);
    }, [id]);
    const { data: fetchedLead, isLoading: isLeadLoading } = useGetLead(id, {
        query: { enabled: !!id, queryKey: getGetLeadQueryKey(id) },
    });
    const leadFromList = (leadsResp?.leads ?? []).find(l => Number(l.id) === Number(id));
    const lead = fetchedLead || leadFromList;
    const isLoading = isLeadLoading && !lead;
    const updateLead = useUpdateLead({
        mutation: {
            onSuccess: () => {
                qc.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
                qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
                setIsEditing(false);
                setDraft(null);
                setSaveError(null);
            },
            onError: () => setSaveError("Failed to save changes. Please try again."),
        },
    });
    const startEditing = () => {
        if (!lead)
            return;
        setDraft({
            firstName: lead.firstName ?? "",
            lastName: lead.lastName ?? "",
            email: lead.email ?? "",
            phone: lead.phone ?? "",
            website: lead.website ?? "",
            linkedInUrl: lead.linkedInUrl ?? "",
            company: lead.company ?? "",
            designation: lead.designation ?? "",
            industry: lead.industry ?? "",
            country: lead.country ?? "",
            companySize: lead.companySize ?? "",
            source: lead.source ?? "",
            notes: lead.notes ?? "",
            tags: (lead.tags ?? []).join(", "),
        });
        setSaveError(null);
        setIsEditing(true);
    };
    const cancelEditing = () => {
        setIsEditing(false);
        setDraft(null);
        setSaveError(null);
    };
    const saveEditing = () => {
        if (!draft)
            return;
        const tagsArray = draft.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        updateLead.mutate({
            id,
            data: {
                firstName: draft.firstName || undefined,
                lastName: draft.lastName || undefined,
                email: draft.email || undefined,
                phone: draft.phone || null,
                website: draft.website || null,
                linkedInUrl: draft.linkedInUrl || null,
                company: draft.company || undefined,
                designation: draft.designation || undefined,
                industry: draft.industry || undefined,
                country: draft.country || undefined,
                companySize: draft.companySize || null,
                source: draft.source || undefined,
                notes: draft.notes || null,
                tags: tagsArray,
            },
        });
    };
    const set = (field) => (e) => setDraft((d) => d ? { ...d, [field]: e.target.value } : d);
    const API_BASE = "/api";
    const rescore = async () => {
        if (!lead)
            return;
        const isInitialScore = !bantBreakdown && lead.bantScore == null;
        setRescoring(true);
        setRescoreError(null);
        try {
            const url = isInitialScore
                ? `${API_BASE}/qualify/${id}/ai`
                : `${API_BASE}/qualify/${id}/ai?force=true`;
            const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" });
            if (!res.ok) {
                if (res.status === 409) {
                    const body = await res.json().catch(() => ({}));
                    if (body?.error === "ALREADY_SCORED") {
                        setRescoreError(ALREADY_SCORED_MSG);
                        return;
                    }
                }
                throw new Error("Scoring failed");
            }
            const data = await res.json();
            await qc.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
            await qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
            const newScore = data?.totalScore ?? data?.bantScore ?? null;
            const bandKey = data?.band;
            const bandLabel = bandKey === "hot" ? "Hot" : bandKey === "qualified" ? "Qualified" : bandKey === "nurture" ? "Nurture" : bandKey === "disqualify" ? "Disqualify" : undefined;
            const bandTextColor = bandKey === "hot" ? "text-red-600" : bandKey === "qualified" ? "text-green-700" : bandKey === "nurture" ? "text-amber-600" : bandKey === "disqualify" ? "text-slate-500" : "";
            toast({
                title: isInitialScore ? "Lead scored!" : "AI score updated",
                description: newScore !== null
                    ? (<span>
              BANT score: {newScore} / 100
              {bandLabel && (<> — <span className={`font-semibold ${bandTextColor}`}>{bandLabel}</span></>)}
            </span>)
                    : isInitialScore
                        ? "Lead has been scored successfully."
                        : "Lead has been re-scored successfully.",
            });
        }
        catch {
            setRescoreError(isInitialScore ? "Scoring failed. Please try again." : "Re-scoring failed. Please try again.");
        }
        finally {
            setRescoring(false);
        }
    };
    const refreshLead = async () => {
        setRescoreError(null);
        await qc.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
        await qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    };
    if (isLoading) {
        return (<div className="p-6">
        <div className="h-4 rounded animate-pulse w-48 mb-2"/>
        <div className="h-4 rounded animate-pulse w-96"/>
      </div>);
    }
    if (!lead) {
        return <div className="p-6 text-muted-foreground text-sm">Lead not found</div>;
    }
    const bantBreakdown = lead.bantBreakdown;
    const leadOptionsFromList = (leadsResp?.leads ?? []).map((l) => ({
        id: l.id,
        firstName: l.firstName ?? "",
        lastName: l.lastName ?? "",
        company: l.company ?? "",
    }));
    const currentLeadOption = lead
        ? { id: lead.id, firstName: lead.firstName ?? "", lastName: lead.lastName ?? "", company: lead.company ?? "" }
        : null;
    const leadOptions = leadOptionsFromList.length > 0
        ? leadOptionsFromList
        : currentLeadOption
            ? [currentLeadOption]
            : [];
    const fn = (lead.firstName || lead.first_name || lead.company || "Lead").trim();
    const ln = (lead.lastName || lead.last_name || "").trim();
    const leadFullName = ln ? `${fn} ${ln}` : fn;
    const initials = leadFullName.substring(0, 2).toUpperCase();

    return (<div className="p-6 space-y-4">
      {showScheduleModal && leadOptions.length > 0 && (<NewMeetingModal leads={leadOptions} defaultLeadId={id} onClose={() => setShowScheduleModal(false)} onCreated={(meeting, shouldDownload) => {
                setShowScheduleModal(false);
                if (shouldDownload)
                    downloadICS(meeting);
                qc.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
                qc.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
                qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
                toast({ title: "Meeting scheduled", description: `${meeting.type.replace(/_/g, " ")} meeting created successfully.` });
            }}/>)}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/leads">
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gray-900">
              <ArrowLeft className="w-3.5 h-3.5"/> Leads
            </button>
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-xs text-foreground font-medium">{leadFullName}</span>
          {navList.length > 0 && currentIndex !== -1 && (<span className="text-[11px] text-muted-foreground">({currentIndex + 1} of {navList.length})</span>)}
        </div>
        {navList.length > 1 && (<div className="flex items-center gap-1">
            <button onClick={() => prevId && navigate(`/leads/${prevId}`)} disabled={!prevId} className="flex items-center gap-1 px-2.5 py-1 rounded border border-gray-200 text-xs text-muted-foreground hover:text-gray-900 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-3.5 h-3.5"/> Previous
            </button>
            <button onClick={() => nextId && navigate(`/leads/${nextId}`)} disabled={!nextId} className="flex items-center gap-1 px-2.5 py-1 rounded border border-gray-200 text-xs text-muted-foreground hover:text-gray-900 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next <ChevronRight className="w-3.5 h-3.5"/>
            </button>
          </div>)}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl border border-gray-200 p-5 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {isEditing && draft ? (<div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className={LABEL_CLS}>First Name</div>
                        <input className={INPUT_CLS} value={draft.firstName} onChange={set("firstName")}/>
                      </div>
                      <div className="flex-1">
                        <div className={LABEL_CLS}>Last Name</div>
                        <input className={INPUT_CLS} value={draft.lastName} onChange={set("lastName")}/>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className={LABEL_CLS}>Designation</div>
                        <input className={INPUT_CLS} value={draft.designation} onChange={set("designation")}/>
                      </div>
                      <div className="flex-1">
                        <div className={LABEL_CLS}>Company</div>
                        <input className={INPUT_CLS} value={draft.company} onChange={set("company")}/>
                      </div>
                    </div>
                  </div>) : (<div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Photo */}
                    <div className="flex-shrink-0">
                      {lead.photoUrl ? (<img src={lead.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-gray-100 shadow-sm"/>) : (                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-sm" style={{ background: "#A4285E" }}>
                          {initials}
                        </div>)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold text-gray-900">{leadFullName}</h1>
                        {/* Company logo */}
                        {lead.companyLogo && (<img src={lead.companyLogo} alt={lead.company} className="h-6 object-contain"/>)}
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5 font-medium">{lead.designation || "Owner"} {lead.company ? `· ${lead.company}` : ""}</div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <StatusBadge status={lead.status}/>
                        {lead.bantScore != null && (() => {
                const bandKey = lead.bantBand ?? scoreToBandKey(lead.bantScore);
                return (<span className={cn("text-xs font-bold", bandColorFromKey(bandKey))}>
                              BANT: {lead.bantScore} ({bandLabelFromKey(bandKey)})
                            </span>);
            })()}
                        {lead.keywords?.map((k) => <Tag key={k} label={k}/>)}
                        {lead.tags?.map((t) => <Tag key={t} label={t}/>)}
                      </div>
                    </div>
                  </div>)}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {isEditing ? (<>
                    <button onClick={saveEditing} disabled={updateLead.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: "#A4285E" }}>
                      <Check className="w-3.5 h-3.5"/>
                      {updateLead.isPending ? "Saving..." : "Save"}
                    </button>
                    <button onClick={cancelEditing} disabled={updateLead.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      <X className="w-3.5 h-3.5"/>
                      Cancel
                    </button>
                  </>) : (<>
                    <button onClick={() => setShowScheduleModal(true)} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-95 shadow-xs" style={{ background: "#A4285E" }}>
                      <CalendarPlus className="w-3.5 h-3.5"/>
                      Schedule Meeting
                    </button>
                    <button onClick={startEditing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-all">
                      <Pencil className="w-3.5 h-3.5 text-gray-500"/>
                      Edit
                    </button>
                    <select value={lead.status || "new_enquiry"} onChange={(e) => updateLead.mutate({ id, data: { status: e.target.value } })} className="text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                      {[["new_enquiry", "New Enquiry"], ["enquiry_qualified", "Enquiry Qualified"], ["discovery_call", "Discovery Call"], ["quote_sent", "Quote / Estimation Sent"], ["follow_up", "Follow Up / Negotiation"], ["project_won", "Project Won"], ["project_lost", "Project Lost"]].map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                    </select>
                  </>)}
              </div>
            </div>

            {saveError && (<div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{saveError}</div>)}

            {isEditing && draft ? (<div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className={LABEL_CLS}>Email</div>
                    <input className={INPUT_CLS} type="email" value={draft.email} onChange={set("email")}/>
                  </div>
                  <div>
                    <div className={LABEL_CLS}>Phone</div>
                    <input className={INPUT_CLS} value={draft.phone} onChange={set("phone")} placeholder="—"/>
                  </div>
                  <div>
                    <div className={LABEL_CLS}>Website</div>
                    <input className={INPUT_CLS} value={draft.website} onChange={set("website")} placeholder="—"/>
                  </div>
                  <div>
                    <div className={LABEL_CLS}>LinkedIn URL</div>
                    <input className={INPUT_CLS} value={draft.linkedInUrl} onChange={set("linkedInUrl")} placeholder="—"/>
                  </div>
                  <div>
                    <div className={LABEL_CLS}>Industry</div>
                    <input className={INPUT_CLS} value={draft.industry} onChange={set("industry")}/>
                  </div>
                  <div>
                    <div className={LABEL_CLS}>Country</div>
                    <input className={INPUT_CLS} value={draft.country} onChange={set("country")}/>
                  </div>
                  <div>
                    <div className={LABEL_CLS}>Company Size</div>
                    <input className={INPUT_CLS} value={draft.companySize} onChange={set("companySize")} placeholder="—"/>
                  </div>
                  <div>
                    <div className={LABEL_CLS}>Source</div>
                    <input className={INPUT_CLS} value={draft.source} onChange={set("source")}/>
                  </div>
                  <div>
                    <div className={LABEL_CLS}>Tags (comma-separated)</div>
                    <input className={INPUT_CLS} value={draft.tags} onChange={set("tags")} placeholder="tag1, tag2"/>
                  </div>
                </div>
                <div>
                  <div className={LABEL_CLS}>Notes</div>
                  <textarea className={cn(INPUT_CLS, "resize-none h-20")} value={draft.notes} onChange={set("notes")} placeholder="Add notes about this lead..."/>
                </div>
              </div>) : (<>
                {/* Contact details grid */}
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0"/>
                    <a href={`mailto:${lead.email}`} className="hover:text-gray-900 truncate">{lead.email}</a>
                  </div>
                  {lead.phone && (<div className="flex items-center gap-2 text-xs text-gray-500">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0"/>
                      <a href={`tel:${lead.phone}`} className="hover:text-gray-900">{lead.phone}</a>
                    </div>)}
                  {lead.whatsapp && typeof lead.whatsapp === "string" && (<div className="flex items-center gap-2 text-xs text-gray-500">
                      <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#25D366" }}/>
                      <a href={`https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="hover:text-gray-900">{lead.whatsapp}</a>
                    </div>)}
                  {lead.linkedInUrl && (<div className="flex items-center gap-2 text-xs text-gray-500">
                      <Linkedin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#0A66C2" }}/>
                      <a href={lead.linkedInUrl} target="_blank" rel="noreferrer" className="hover:text-gray-900">LinkedIn Profile</a>
                    </div>)}
                  {lead.website && (<div className="flex items-center gap-2 text-xs text-gray-500">
                      <Globe className="w-3.5 h-3.5 flex-shrink-0"/>
                      <a href={lead.website} target="_blank" rel="noreferrer" className="hover:text-gray-900 truncate">{lead.website}</a>
                    </div>)}
                  {(lead.city || lead.country) && (<div className="flex items-center gap-2 text-xs text-gray-500">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0"/>
                      <span>{[lead.city, lead.country].filter(Boolean).join(", ")}</span>
                    </div>)}
                  {lead.industry && (<div className="flex items-center gap-2 text-xs text-gray-500">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0"/>
                      <span>{lead.industry}{lead.companySize ? ` · ${lead.companySize}` : ""}</span>
                    </div>)}
                </div>

                {lead.notes && (<div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Notes</div>
                    <div className="text-xs text-gray-700">{lead.notes}</div>
                  </div>)}
              </>)}
          </div>

          {/* BANT Breakdown */}
          {!bantBreakdown && (<div className="rounded-xl border border-dashed border-gray-300 p-5 bg-white shadow-sm flex flex-col items-center gap-3 text-center relative" style={{ minHeight: rescoring ? 160 : undefined }}>
              {rescoring && (<AiPanelOverlay icon="sparkles" message="AI is scoring this lead…" subMessages={[
                    "Evaluating Budget signals",
                    "Checking Authority & decision power",
                    "Assessing Need & pain points",
                    "Analysing Timeline urgency",
                ]}/>)}
              <Sparkles className="w-6 h-6 text-teal-600"/>
              <div>
                <div className="text-sm font-semibold text-foreground mb-1">No BANT score yet</div>
                <div className="text-xs text-muted-foreground">Run an AI analysis to instantly score this lead's Budget, Authority, Need, and Timeline.</div>
              </div>
              {rescoreError && (<div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5 w-full">
                  {rescoreError}
                  {rescoreError === ALREADY_SCORED_MSG && (<button onClick={refreshLead} className="ml-1.5 underline font-medium hover:text-red-800 transition-colors">
                      Refresh
                    </button>)}
                </div>)}
              <button onClick={rescore} disabled={rescoring} className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                {rescoring ? (<Loader2 className="w-3 h-3 animate-spin"/>) : (<Sparkles className="w-3 h-3"/>)}
                {rescoring ? "Scoring…" : "Score with AI"}
              </button>
            </div>)}
          {bantBreakdown && (<div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-foreground uppercase tracking-wider">BANT Breakdown</div>
                <button onClick={rescore} disabled={rescoring} className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md border border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {rescoring ? (<Loader2 className="w-3 h-3 animate-spin"/>) : (<Sparkles className="w-3 h-3"/>)}
                  {rescoring ? "Scoring…" : "Re-score with AI"}
                </button>
              </div>
              {rescoreError && (<div className="mb-3 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
                  {rescoreError}
                  {rescoreError === ALREADY_SCORED_MSG && (<button onClick={refreshLead} className="ml-1.5 underline font-medium hover:text-red-800 transition-colors">
                      Refresh
                    </button>)}
                </div>)}
              <div className="grid grid-cols-4 gap-3">
                {["budget", "authority", "need", "timeline"].map((dim) => {
                const score = bantBreakdown[dim] ?? 0;
                const reason = bantBreakdown.reasoning?.[dim];
                return (<div key={dim} className="text-center">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{dim}</div>
                      <div className={cn("text-2xl font-bold", bandColorFromKey(scoreToBandKey(score)))}>{score}</div>
                      <div className="w-full bg-gray-50 rounded-full h-1 mt-1.5">
                        <div className="h-1 rounded-full transition-all" style={{ width: `${score}%`, background: "#1A7A45" }}/>
                      </div>
                      {reason && (<div className="mt-2 text-[10px] text-muted-foreground leading-relaxed text-left">{reason}</div>)}
                    </div>);
            })}
              </div>
              {bantBreakdown.reasoning && (<div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#1A7A45" }}/>
                  <span className="text-[10px] text-muted-foreground italic">AI reasoning</span>
                </div>)}
            </div>)}

          {/* Touchpoints */}
          {lead.touchpoints?.length > 0 && (<div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
              <div className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Outreach History</div>
              <div className="space-y-2">
                {(lead.touchpoints ?? []).map((tp) => (<div key={tp.id} className="flex items-start gap-3 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: tp.status === "sent" ? "#1A7A45" : "#94a3b8" }}/>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{tp.channel} · Day {tp.day}</span>
                        <StatusBadge status={tp.status}/>
                      </div>
                      {tp.subject && <div className="text-muted-foreground mt-0.5">Subject: {tp.subject}</div>}
                      <div className="text-gray-400 text-[10px]">{formatRelative(tp.createdAt)}</div>
                    </div>
                  </div>))}
              </div>
            </div>)}

          {/* CRM Meetings */}
          <div className="rounded-xl border border-gray-200 p-5 bg-white shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-bold text-gray-900 uppercase tracking-wider">CRM MEETINGS</div>
              <button onClick={() => setShowScheduleModal(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-all hover:opacity-95 shadow-xs" style={{ background: "#A4285E" }}>
                <CalendarPlus className="w-3.5 h-3.5"/> Schedule
              </button>
            </div>
            {leadMeetings.length === 0 ? (<div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                <CalendarDays className="w-7 h-7 text-gray-300"/>
                <div className="text-xs text-gray-400 font-medium">No meetings scheduled yet</div>
              </div>) : (<div className="space-y-2">
                {leadMeetings.map((m) => {
                const d = new Date(m.scheduledAt);
                const dateLabel = d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
                return (<div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5 text-xs bg-gray-50/50">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CalendarDays className="w-4 h-4 text-emerald-700 flex-shrink-0"/>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-800 capitalize">{(m.type || "").replace(/_/g, " ")}</div>
                          <div className="text-gray-500 text-[11px]">{dateLabel} · {m.duration} min</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">{m.status}</span>
                        <button onClick={() => downloadICS(m)} title="Download .ics" className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
                          <Download className="w-3.5 h-3.5"/>
                        </button>
                      </div>
                    </div>);
            })}
              </div>)}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Assignment card */}
          <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
            <div className="flex items-center gap-1.5 mb-3">
              <UserCheck className="w-3.5 h-3.5 text-indigo-500"/>
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Assigned To</div>
            </div>
            {lead.assignedToName ? (<div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">{lead.assignedToName}</span>
              </div>) : (<p className="text-xs text-gray-400 mb-2">No rep assigned yet</p>)}
            {canReassign && (<select value={lead.assignedToId ?? ""} onChange={(e) => {
                const val = e.target.value;
                const selected = val ? teamMembers.find(m => m.id === Number(val)) : null;
                const displayName = selected
                    ? [selected.firstName, selected.lastName].filter(Boolean).join(" ") || selected.email
                    : null;
                updateLead.mutate({ id, data: { assignedToId: val ? Number(val) : null } }, {
                    onSuccess: () => {
                        toast({
                            title: displayName ? `Assigned to ${displayName}` : "Lead unassigned",
                            description: displayName
                                ? `This lead is now assigned to ${displayName}.`
                                : "This lead has been unassigned.",
                        });
                    },
                    onError: () => {
                        toast({ title: "Reassignment failed", description: "Could not update the assignment. Check your permissions.", variant: "destructive" });
                    },
                });
            }} className="w-full text-xs rounded border border-gray-200 bg-white text-gray-700 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                <option value="">— Unassigned —</option>
                {teamMembers.map((m) => (<option key={m.id} value={m.id}>
                    {[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email}
                  </option>))}
              </select>)}
          </div>

          <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Lead Info</div>
            <div className="space-y-2 text-xs">
              {[
            ["Source", (lead.source ?? "").replace(/_/g, " ")],
            ["Industry", lead.industry],
            ["City", lead.city ?? "—"],
            ["Country", lead.country],
            ["Company Size", lead.companySize ?? "—"],
            ["Annual Revenue", lead.annualRevenue ?? "—"],
            ["Sequence Day", lead.sequenceDay > 0 ? `Day ${lead.sequenceDay}` : "Not assigned"],
            ["Added", formatDate(lead.createdAt)],
            ["Last Contact", lead.lastContactedAt ? formatDate(lead.lastContactedAt) : "Never"],
        ].map(([label, value]) => (<div key={label} className="flex justify-between gap-2">
                  <span className="text-gray-400 flex-shrink-0">{label}</span>
                  <span className="text-gray-800 text-right capitalize">{value}</span>
                </div>))}
            </div>
            {(lead.keywords?.length > 0 || lead.tags?.length > 0) && (<div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Keywords</div>
                <div className="flex flex-wrap gap-1">
                  {lead.keywords?.map((k) => <Tag key={k} label={k}/>)}
                  {lead.tags?.map((t) => <Tag key={t} label={t}/>)}
                </div>
              </div>)}
          </div>

          <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</div>
            <div className="space-y-2">
              <Link href={`/audit?leadId=${lead.id}`}>
                <button className="w-full text-xs py-1.5 px-3 rounded border border-gray-200 text-muted-foreground hover:text-gray-900 hover:bg-gray-50 text-left">Run Brand Audit</button>
              </Link>
              <Link href={`/qualify?leadId=${lead.id}`}>
                <button className="w-full text-xs py-1.5 px-3 rounded border border-gray-200 text-muted-foreground hover:text-gray-900 hover:bg-gray-50 text-left">BANT Score</button>
              </Link>
              <button onClick={handleGenerateAiOutreach} className="w-full text-xs py-2 px-3 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 font-semibold hover:bg-purple-100 text-left flex items-center justify-between transition-all">
                <span>⚡ Generate AI Outreach Email</span>
                <Sparkles className="w-3.5 h-3.5 text-purple-600"/>
              </button>
              <button onClick={handleGenerateAiProposal} className="w-full text-xs py-2 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 text-left flex items-center justify-between transition-all">
                <span>📄 Create AI Sales Proposal</span>
                <FileText className="w-3.5 h-3.5 text-emerald-600"/>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Outreach & Proposal Generator Modal ── */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                {aiModalType === "outreach" ? (
                  <Sparkles className="w-5 h-5 text-purple-600" />
                ) : (
                  <FileText className="w-5 h-5 text-emerald-600" />
                )}
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    {aiModalType === "outreach" ? "AI Tailored Outreach Email" : "AI Custom Sales Proposal"}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Targeted to {leadFullName} · {lead.company || "Clinic"}
                  </p>
                </div>
              </div>
              <button onClick={() => setAiModalOpen(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {genLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                <p className="text-sm font-semibold text-gray-800">
                  Analyzing client products, services & target market...
                </p>
                <p className="text-xs text-gray-500">
                  Building custom {aiModalType === "outreach" ? "outreach email" : "sales proposal"} for {lead.company || leadFullName}
                </p>
              </div>
            ) : genResult ? (
              <div className="space-y-4 text-xs">
                {sendSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{aiModalType === "outreach" ? "Outreach email sent successfully!" : "Proposal sent to client!"}</span>
                  </div>
                )}

                {aiModalType === "outreach" ? (
                  <div className="space-y-3">
                    <div>
                      <label className="font-semibold text-gray-700 block mb-1">Recipient Email</label>
                      <input type="text" readOnly value={genResult.recipient_email || lead.email || ""} className="w-full p-2 border rounded-lg bg-gray-50 text-gray-800" />
                    </div>
                    <div>
                      <label className="font-semibold text-gray-700 block mb-1">Subject</label>
                      <input type="text" value={genResult.subject || ""} onChange={e => setGenResult({...genResult, subject: e.target.value})} className="w-full p-2 border rounded-lg font-semibold text-gray-900" />
                    </div>
                    <div>
                      <label className="font-semibold text-gray-700 block mb-1">Personalized Email Body</label>
                      <textarea rows={10} value={genResult.body || ""} onChange={e => setGenResult({...genResult, body: e.target.value})} className="w-full p-3 border rounded-lg text-gray-800 font-sans leading-relaxed" />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                      <button onClick={() => setAiModalOpen(false)} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                      <button onClick={async () => {
                        await fetch("/api/outreach/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: genResult.id }) });
                        setSendSuccess(true);
                      }} className="px-5 py-2 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700 flex items-center gap-1.5 shadow">
                        <Send className="w-3.5 h-3.5" /> Send Outreach Email
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                      <h4 className="font-bold text-emerald-900 text-sm">{genResult.title}</h4>
                      <p className="text-gray-700 text-xs">{genResult.content?.executiveSummary}</p>
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-800 mb-1">Understanding & Client Challenges</h5>
                      <p className="text-gray-600 bg-gray-50 p-3 rounded-lg border">{genResult.content?.understandingAndChallenges}</p>
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-800 mb-1">Proposed Growth Solution</h5>
                      <p className="text-gray-600 bg-gray-50 p-3 rounded-lg border whitespace-pre-line">{genResult.content?.proposedSolution}</p>
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-800 mb-1">Investment & ROI</h5>
                      <p className="text-emerald-800 bg-emerald-50 p-3 rounded-lg border font-semibold">{genResult.content?.investmentPackage}</p>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                      <button onClick={() => setAiModalOpen(false)} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
                      <button onClick={async () => {
                        await fetch("/api/proposals/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: genResult.id }) });
                        setSendSuccess(true);
                      }} className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 flex items-center gap-1.5 shadow">
                        <Send className="w-3.5 h-3.5" /> Send Proposal to Client
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>);
}
