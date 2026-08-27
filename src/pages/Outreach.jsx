import { useState, useRef, useCallback, useEffect } from "react";
import { useListOutreachEmails, useUpdateOutreachEmail, useSendOutreachEmail, useDeleteOutreachEmail, getListOutreachEmailsQueryKey, } from "@workspace/api-client-react";
import { tryParsePlanLimit, dispatchPlanLimitEvent } from "@/lib/fetchGuard";
import ComposeModal from "@/components/ComposeModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, Send, Mail, CheckCircle2, XCircle, Clock, Trash2, Edit3, Save, X, RefreshCw, ChevronRight, Globe, Pencil, Eye, Reply, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const SENDER_EMAIL = "aurabackoffice123@gmail.com";
const SENDER_NAME = "Aura AI";
function initials(first, last) {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}
function formatSafeDistance(value) {
    if (!value)
        return "";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true });
}
function normalizeEmail(r) {
    return {
        ...r,
        id: r.id,
        userId: r.user_id,
        leadId: r.lead_id,
        recipientEmail: r.recipient_email,
        toEmail: r.to_email,
        toName: r.to_name,
        company: r.company,
        subject: r.subject,
        body: r.body,
        status: r.status,
        createdAt: r.created_at,
        sentAt: r.sent_at,
        openedAt: r.opened_at,
        errorMsg: r.error_msg,
        auditRunId: r.audit_run_id,
        leadFirstName: r.lead_first_name ?? r.first_name,
        leadLastName: r.lead_last_name ?? r.last_name,
        leadDesignation: r.lead_designation ?? r.designation,
        leadPhoto: r.lead_photo ?? r.lead_photo_url,
        leadCompanyLogo: r.lead_company_logo,
        leadWebsite: r.lead_website ?? r.website,
        currency: r.currency,
        country: r.country,
    };
}
function CurrencyFlag({ currency }) {
    const map = {
        INR: "🇮🇳", AED: "🇦🇪", SAR: "🇸🇦", GBP: "🇬🇧",
        EUR: "🇪🇺", AUD: "🇦🇺", SGD: "🇸🇬", CAD: "🇨🇦", USD: "🇺🇸",
    };
    return <span className="text-sm">{map[currency] ?? "🌍"}</span>;
}
function StatusIcon({ status, opened }) {
    if (status === "sent" && opened)
        return <Eye className="w-3.5 h-3.5 text-blue-500"/>;
    if (status === "sent")
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/>;
    if (status === "failed")
        return <XCircle className="w-3.5 h-3.5 text-red-500"/>;
    return <Clock className="w-3.5 h-3.5 text-amber-500"/>;
}
export default function Outreach() {
    const qc = useQueryClient();
    const { data: emailsRaw = [], isLoading, refetch } = useListOutreachEmails({}, {
        queryKey: getListOutreachEmailsQueryKey(),
    });
    const emails = Array.isArray(emailsRaw) ? emailsRaw.map(normalizeEmail) : [];
    const updateEmail = useUpdateOutreachEmail({
        mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListOutreachEmailsQueryKey() }) },
    });
    const sendEmail = useSendOutreachEmail({
        mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListOutreachEmailsQueryKey() }) },
    });
    const deleteEmail = useDeleteOutreachEmail({
        mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListOutreachEmailsQueryKey() }) },
    });
    const { data: repliesRaw = [], refetch: refetchReplies } = useQuery({
        queryKey: ["outreach-replies"],
        queryFn: async () => {
            const res = await fetch("/api/outreach/replies");
            if (!res.ok)
                throw new Error("Failed to load replies");
            const data = await res.json();
            return data.replies ?? [];
        },
    });
    const replies = Array.isArray(repliesRaw) ? repliesRaw : [];
    const [replyPolling, setReplyPolling] = useState(false);
    const [replyPollError, setReplyPollError] = useState("");
    const checkReplies = useCallback(async () => {
        setReplyPolling(true);
        setReplyPollError("");
        try {
            const res = await fetch("/api/email/replies/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            const data = await res.json();
            if (!data.ok)
                setReplyPollError(data.error || "Could not check for replies");
            refetchReplies();
            qc.invalidateQueries({ queryKey: getListOutreachEmailsQueryKey() });
        }
        catch {
            setReplyPollError("Could not check for replies");
        }
        finally {
            setReplyPolling(false);
        }
    }, [refetchReplies, qc]);
    const [activeTab, setActiveTab] = useState("draft");
    const [selectedId, setSelectedId] = useState(null);
    const [composeOpen, setComposeOpen] = useState(false);
    const [composeInitial, setComposeInitial] = useState(null);
    const [inlineReplyText, setInlineReplyText] = useState("");
    const [inlineReplySending, setInlineReplySending] = useState(false);

    const handleInlineReply = async (recipientEmail, leadId, subjectTitle) => {
        if (!inlineReplyText.trim() || inlineReplySending) return;
        setInlineReplySending(true);
        try {
            const res = await fetch("/api/useQuickSendEmail", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    data: {
                        leadId,
                        toEmail: recipientEmail,
                        toName: selected ? `${selected.leadFirstName} ${selected.leadLastName}` : "",
                        subject: subjectTitle?.startsWith("Re:") ? subjectTitle : `Re: ${subjectTitle || "Reply"}`,
                        body: inlineReplyText,
                        userEmail: sessionStorage.getItem("aura_user_email") || "",
                    }
                })
            });
            const data = await res.json();
            if (data.success) {
                setInlineReplyText("");
                refetch();
                qc.invalidateQueries({ queryKey: getListOutreachEmailsQueryKey() });
            }
        } catch (err) {
            console.error("Failed to send reply:", err);
        } finally {
            setInlineReplySending(false);
        }
    };
    const [editSubject, setEditSubject] = useState("");
    const [editBody, setEditBody] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [generating, setGenerating] = useState(null);
    const [bulkStatus, setBulkStatus] = useState("idle");
    const [bulkMessage, setBulkMessage] = useState("");
    const sseRef = useRef(null);
    const tabs = [
        { key: "draft", label: "Drafts", icon: <Edit3 className="w-3.5 h-3.5"/> },
        { key: "sent", label: "Sent", icon: <CheckCircle2 className="w-3.5 h-3.5"/> },
        { key: "failed", label: "Failed", icon: <XCircle className="w-3.5 h-3.5"/> },
    ];
    const byTab = (tab) => emails.filter((e) => e.status === tab);
    const tabEmails = byTab(activeTab);
    const [readReplyIds, setReadReplyIds] = useState(new Set());
    // Filter out self-replies (emails sent by system account)
    const genuineReplies = replies.filter((r) => {
        const from = (r.from_email || "").toLowerCase();
        return from && !from.includes("aurabackoffice") && from !== SENDER_EMAIL.toLowerCase();
    });
    // Group activeTab emails into Gmail-style conversation threads by recipient/lead
    const threadMap = tabEmails.reduce((acc, email) => {
        const key = (email.toEmail || email.recipientEmail || `lead-${email.leadId || email.id}`).toLowerCase().trim();
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(email);
        return acc;
    }, {});
    const threadList = Object.entries(threadMap).map(([key, group]) => {
        // Sort emails in group DESC (newest first for root representation)
        group.sort((a, b) => new Date(b.sentAt || b.createdAt || 0) - new Date(a.sentAt || a.createdAt || 0));
        const root = group[0];
        // Find all genuine replies matching any email in this group or recipient key
        const groupReplies = genuineReplies.filter((r) => {
            const from = (r.from_email || "").toLowerCase().trim();
            const rootTo = (root.toEmail || root.recipientEmail || "").toLowerCase().trim();
            const leadMatch = r.lead_id && group.some(g => String(g.leadId) === String(r.lead_id));
            const outreachMatch = r.outreach_email_id && group.some(g => String(g.id) === String(r.outreach_email_id));
            const emailMatch = from && (from === key || (rootTo && rootTo.includes(from)) || (from && rootTo && from.includes(rootTo)));
            return leadMatch || outreachMatch || emailMatch;
        });
        // Check if there are any unread replies
        const unreadReplies = groupReplies.filter(r => !readReplyIds.has(r.id));
        return {
            ...root,
            threadKey: key,
            groupEmails: group,
            groupReplies,
            messageCount: group.length + groupReplies.length,
            replyCount: groupReplies.length,
            hasUnread: unreadReplies.length > 0,
            unreadCount: unreadReplies.length
        };
    });
    // Sort threads DESC by latest activity
    threadList.sort((a, b) => new Date(b.sentAt || b.createdAt || 0) - new Date(a.sentAt || a.createdAt || 0));
    // Currently selected thread & root email
    const selectedThread = selectedId ? threadList.find((t) => t.groupEmails.some(e => e.id === selectedId)) ?? null : null;
    const selected = selectedId ? emails.find((e) => e.id === selectedId) ?? null : null;
    const threadReplies = selectedThread ? selectedThread.groupReplies : [];
    
    // Robust stream replies lookup (with fallback matching)
    const activeStreamReplies = (selectedThread?.groupReplies && selectedThread.groupReplies.length > 0)
        ? selectedThread.groupReplies
        : genuineReplies.filter(r => {
            const from = (r.from_email || "").toLowerCase().trim();
            const selectedTo = (selected?.toEmail || selected?.recipientEmail || "").toLowerCase().trim();
            const leadMatch = r.lead_id && String(r.lead_id) === String(selected?.leadId);
            const outreachMatch = r.outreach_email_id && String(r.outreach_email_id) === String(selected?.id);
            const emailMatch = from && selectedTo && (from === selectedTo || selectedTo.includes(from) || from.includes(selectedTo));
            return leadMatch || outreachMatch || emailMatch;
        });

    // Full chronological message stream for current thread (Gmail style)
    const fullConversationStream = selectedThread ? [
        ...selectedThread.groupEmails.map(s => ({
            id: `sent-${s.id}`,
            isReply: false,
            rawId: s.id,
            senderName: SENDER_NAME,
            senderEmail: SENDER_EMAIL,
            recipientEmail: s.toEmail,
            subject: s.subject,
            body: s.body,
            date: s.sentAt || s.createdAt,
            status: s.status,
            openedAt: s.openedAt,
            errorMsg: s.errorMsg
        })),
        ...activeStreamReplies.map(r => ({
            id: `reply-${r.id}`,
            replyId: r.id,
            isReply: true,
            senderName: r.from_name || r.from_email,
            senderEmail: r.from_email,
            recipientEmail: SENDER_EMAIL,
            subject: r.subject || selectedThread.subject,
            body: r.body,
            date: r.received_at || r.created_at,
            isUnread: !readReplyIds.has(r.id)
        }))
    ].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)) : [];
    const handleSelectThread = (thread) => {
        setSelectedId(thread.id);
        setIsEditing(false);
        setEditSubject(thread.subject);
        setEditBody(thread.body);
        if (thread.groupReplies.length > 0) {
            setReadReplyIds(prev => {
                const next = new Set(prev);
                thread.groupReplies.forEach(r => next.add(r.id));
                return next;
            });
        }
    };
    useEffect(() => { checkReplies(); }, [checkReplies]);
    useEffect(() => {
        if (selected && !isEditing) {
            setEditSubject(selected.subject);
            setEditBody(selected.body);
        }
    }, [selected?.id]);
    const closeSse = () => {
        if (sseRef.current) {
            sseRef.current.close();
            sseRef.current = null;
        }
    };
    const generateSingle = useCallback((leadId) => {
        closeSse();
        setGenerating({ leadId, status: "running", message: "Auditing website…" });
        const API_BASE = "/api";
        const es = new EventSource(`${API_BASE}/outreach-ai/generate/${leadId}`);
        sseRef.current = es;
        es.addEventListener("progress", (e) => {
            try {
                const d = JSON.parse(e.data);
                setGenerating((prev) => prev ? { ...prev, message: d.message ?? "" } : null);
            }
            catch { }
        });
        es.addEventListener("done", (e) => {
            try {
                const d = JSON.parse(e.data);
                setGenerating({ leadId, status: "done", message: "Email generated!" });
                if (d.email) {
                    qc.invalidateQueries({ queryKey: getListOutreachEmailsQueryKey() });
                    setTimeout(() => {
                        setSelectedId(d.email.id);
                        setActiveTab("draft");
                        setGenerating(null);
                    }, 1200);
                }
            }
            catch { }
            closeSse();
        });
        es.addEventListener("error", (e) => {
            try {
                const d = JSON.parse(e.data);
                const planLimit = tryParsePlanLimit(d);
                if (planLimit)
                    dispatchPlanLimitEvent(planLimit);
                setGenerating({ leadId, status: "error", message: d.message ?? "Generation failed" });
            }
            catch {
                setGenerating((prev) => prev ? { ...prev, status: "error", message: "Connection error" } : null);
            }
            closeSse();
        });
    }, [qc]);
    const generateAll = useCallback(() => {
        closeSse();
        setBulkStatus("running");
        setBulkMessage("Starting bulk generation…");
        const API_BASE = "/api";
        const es = new EventSource(`${API_BASE}/outreach-ai/generate-all`);
        sseRef.current = es;
        es.addEventListener("progress", (e) => {
            try {
                const d = JSON.parse(e.data);
                setBulkMessage(d.message ?? "");
            }
            catch { }
        });
        es.addEventListener("done", (e) => {
            try {
                const d = JSON.parse(e.data);
                setBulkMessage(d.message ?? "All emails generated!");
                setBulkStatus("done");
                qc.invalidateQueries({ queryKey: getListOutreachEmailsQueryKey() });
            }
            catch { }
            closeSse();
            setTimeout(() => { setBulkStatus("idle"); setBulkMessage(""); }, 3000);
        });
        es.addEventListener("error", (e) => {
            try {
                const d = JSON.parse(e.data);
                const planLimit = tryParsePlanLimit(d);
                if (planLimit)
                    dispatchPlanLimitEvent(planLimit);
                setBulkMessage(d.message ?? "Bulk generation encountered an error");
            }
            catch {
                setBulkMessage("Bulk generation encountered an error");
            }
            setBulkStatus("error");
            closeSse();
        });
    }, [qc]);
    const handleSave = () => {
        if (!selected)
            return;
        updateEmail.mutate({ id: selected.id, data: { subject: editSubject, body: editBody } });
        setIsEditing(false);
    };
    const handleSend = () => {
        if (!selected)
            return;
        sendEmail.mutate({ id: selected.id });
    };
    const handleDelete = () => {
        if (!selected)
            return;
        deleteEmail.mutate({ id: selected.id });
        setSelectedId(null);
    };
    const draftCount = byTab("draft").length;
    const sentCount = byTab("sent").length;
    const failedCount = byTab("failed").length;
    return (<div className="flex flex-col h-full overflow-hidden" style={{ background: "#F8F9FA" }}>

      {/* Header */}
      <div className="px-3 md:px-6 py-3 md:py-4 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-gray-900">AI Outreach Engine</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {draftCount} drafts · {sentCount} sent · {failedCount} failed · {replies.length} replies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <RefreshCw className="w-3.5 h-3.5"/>
          </button>
          <button onClick={checkReplies} disabled={replyPolling} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-60">
            <RefreshCw className={cn("w-3.5 h-3.5", replyPolling && "animate-spin")}/>
            {replyPolling ? "Checking…" : "Check Replies"}
          </button>
          <button onClick={() => setComposeOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:bg-[#A4285E]" style={{ background: "#CB3273" }}>
            <Pencil className="w-3.5 h-3.5"/>
            Create New
          </button>
          <button onClick={generateAll} disabled={bulkStatus === "running"} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-all hover:bg-[#A4285E]" style={{ background: bulkStatus === "running" ? "#4A7C5E" : "#CB3273" }}>
            <Zap className="w-3.5 h-3.5"/>
            {bulkStatus === "running" ? "Generating…" : "Generate All"}
          </button>
        </div>
      </div>

      {/* Bulk progress bar */}
      {bulkStatus !== "idle" && (<div className={cn("px-6 py-2 text-xs font-medium flex items-center gap-2 flex-shrink-0", bulkStatus === "running" && "bg-amber-50 text-amber-700 border-b border-amber-100", bulkStatus === "done" && "bg-emerald-50 text-emerald-700 border-b border-emerald-100", bulkStatus === "error" && "bg-red-50 text-red-700 border-b border-red-100")}>
          {bulkStatus === "running" && <Zap className="w-3.5 h-3.5 animate-pulse"/>}
          {bulkStatus === "done" && <CheckCircle2 className="w-3.5 h-3.5"/>}
          {bulkStatus === "error" && <XCircle className="w-3.5 h-3.5"/>}
          {bulkMessage}
        </div>)}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel: list — full width on mobile when no selection, 320px on desktop */}
        <div className={cn("flex-col border-r border-gray-200 bg-white flex-shrink-0 md:flex md:w-80", selectedId ? "hidden md:flex" : "flex w-full")}>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {tabs.map((t) => {
            const count = byTab(t.key).length;
            return (<button key={t.key} onClick={() => { setActiveTab(t.key); setSelectedId(null); }} className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors", activeTab === t.key
                    ? "border-b-2 text-gray-900"
                    : "text-gray-400 hover:text-[#CB3273] hover:bg-[#FBE9F1]")} style={activeTab === t.key ? { borderBottomColor: "#CB3273", color: "#CB3273" } : {}}>
                  {t.icon}
                  {t.label}
                  {count > 0 && (<span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={activeTab === t.key
                        ? { background: "#CB3273", color: "#fff" }
                        : { background: "#E5E7EB", color: "#6B7280" }}>
                      {count}
                    </span>)}
                </button>);
        })}
          </div>

          {/* Email list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (Array.from({ length: 4 }).map((_, i) => (<div key={i} className="p-3 border-b border-gray-100 animate-pulse">
                  <div className="flex gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0"/>
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-gray-200 rounded w-3/4"/>
                      <div className="h-2.5 bg-gray-100 rounded w-1/2"/>
                      <div className="h-2.5 bg-gray-100 rounded w-full"/>
                    </div>
                  </div>
                </div>))) : threadList.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <Mail className="w-8 h-8 text-gray-300 mb-3"/>
                <p className="text-xs text-gray-400">
                  {activeTab === "draft" && "No draft emails yet. Click Generate All to create."}
                  {activeTab === "sent" && "No sent emails yet."}
                  {activeTab === "failed" && "No failed emails."}
                </p>
              </div>) : (threadList.map((thread) => {
            const isSelected = selectedId && thread.groupEmails.some(e => e.id === selectedId);
            const isGen = generating?.leadId === thread.leadId && generating?.status === "running";
            return (<button key={thread.threadKey} onClick={() => handleSelectThread(thread)} className={cn("w-full text-left px-3 py-3 border-b border-gray-100 transition-all flex gap-2.5 relative", isSelected ? "bg-[#FBE9F1] border-l-4 border-[#CB3273]" : thread.hasUnread ? "bg-blue-50/80 border-l-4 border-blue-600 font-semibold" : "hover:bg-gray-50")}>
                    {/* Gmail Blue Unread Dot */}
                    {thread.hasUnread && (<span className="absolute top-3 right-3 w-2.5 h-2.5 bg-blue-600 rounded-full shadow-sm animate-pulse" title="Unread reply"/>)}

                    {/* Avatar */}
                    <div className="flex-shrink-0 relative">
                      {thread.leadPhoto ? (<img src={thread.leadPhoto} className="w-8 h-8 rounded-full object-cover"/>) : thread.leadCompanyLogo ? (<img src={thread.leadCompanyLogo} className="w-8 h-8 rounded-full object-contain border border-gray-200 bg-white p-0.5"/>) : (<div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: thread.hasUnread ? "#2563EB" : "#CB3273" }}>
                          {initials(thread.leadFirstName, thread.leadLastName)}
                        </div>)}
                      {isGen && (<div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 animate-pulse border border-white"/>)}
                      {thread.replyCount > 0 && (<div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white border border-white" style={{ background: thread.hasUnread ? "#2563EB" : "#059669" }}>{thread.replyCount}</div>)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={cn("text-xs truncate", thread.hasUnread ? "font-bold text-blue-950" : "font-semibold text-gray-900")}>
                          {thread.leadFirstName} {thread.leadLastName}
                          {thread.messageCount > 1 && (<span className="ml-1 text-[11px] font-bold text-gray-500">({thread.messageCount})</span>)}
                        </span>
                        <div className="flex items-center gap-1 ml-1 pr-3">
                          {thread.hasUnread && (<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
                              UNREAD
                            </span>)}
                          {thread.replyCount > 0 && !thread.hasUnread && (<span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5" style={{ background: "#ECFDF5", color: "#059669" }}><MessageCircle className="w-2.5 h-2.5"/>{thread.replyCount}</span>)}
                          {thread.openedAt && (<span className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ background: "#EFF6FF", color: "#3B82F6" }}>OPENED</span>)}
                          <CurrencyFlag currency={thread.currency}/>
                          <StatusIcon status={thread.status} opened={!!thread.openedAt}/>
                        </div>
                      </div>
                      <div className={cn("text-[11px] truncate", thread.hasUnread ? "font-semibold text-gray-800" : "text-gray-500")}>{thread.company}</div>
                      <div className={cn("text-[11px] truncate mt-0.5 italic", thread.hasUnread ? "font-bold text-gray-900" : "text-gray-400")}>{thread.subject}</div>
                      {isGen && (<div className="text-[10px] text-amber-600 mt-0.5 font-medium animate-pulse">
                          {generating?.message}
                        </div>)}
                    </div>
                    {isSelected && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 self-center"/>}
                  </button>);
        }))}
          </div>
        </div>

        {/* Right panel: email preview — hidden on mobile when nothing selected */}
        <div className={cn("flex-1 flex flex-col overflow-hidden", !selected && "hidden md:flex")}>
          {/* Mobile back button */}
          {selected && (<button className="md:hidden flex items-center gap-1 px-3 py-2 text-xs text-gray-500 border-b border-gray-200 bg-white" onClick={() => { setSelectedId(null); }}>
              <ChevronRight className="w-3.5 h-3.5 rotate-180"/> Back to list
            </button>)}
          {!selected ? (<div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#FBE9F1" }}>
                <Mail className="w-8 h-8" style={{ color: "#CB3273" }}/>
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Select an email to preview</p>
              <p className="text-xs text-gray-400 max-w-xs">
                Generate hyper-personalised outreach emails using AI that audits each lead's website and identifies real problems.
              </p>
              {activeTab === "draft" && (<button onClick={generateAll} disabled={bulkStatus === "running"} className="mt-6 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition-all hover:bg-[#A4285E]" style={{ background: "#CB3273" }}>
                  <Zap className="w-4 h-4"/>
                  Generate All Emails
                </button>)}
            </div>) : (<div className="flex-1 flex flex-col overflow-hidden">

              {/* Email header */}
              <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-start justify-between flex-shrink-0">
                <div className="flex gap-3">
                  {selected.leadPhoto ? (<img src={selected.leadPhoto} className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>) : (<div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ background: "#CB3273" }}>
                      {initials(selected.leadFirstName, selected.leadLastName)}
                    </div>)}
                  <div>
                    <div className="font-semibold text-sm text-gray-900">
                      {selected.leadFirstName} {selected.leadLastName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {selected.leadDesignation} · {selected.company}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Mail className="w-3 h-3"/> To: {selected.toEmail}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Send className="w-3 h-3"/> From: <span className="font-medium text-gray-600">{SENDER_EMAIL}</span>
                      </span>
                      {selected.leadWebsite && (<a href={selected.leadWebsite} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-blue-500 hover:underline">
                          <Globe className="w-3 h-3"/> Website
                        </a>)}
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <CurrencyFlag currency={selected.currency}/> {selected.currency} · {selected.country}
                      </span>
                      {selected.openedAt && (<span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#EFF6FF", color: "#3B82F6" }}>
                          <Eye className="w-3 h-3"/>
                          Opened {formatSafeDistance(selected.openedAt)}
                        </span>)}
                      {selectedThread?.replyCount > 0 && (<span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#ECFDF5", color: "#059669" }}>
                          <Reply className="w-3 h-3"/>
                          {selectedThread.replyCount} {selectedThread.replyCount === 1 ? "Reply" : "Replies"}
                        </span>)}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {selected.status === "draft" && (<>
                      {!isEditing ? (<button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
                          <Edit3 className="w-3.5 h-3.5"/> Edit
                        </button>) : (<>
                          <button onClick={() => { setIsEditing(false); setEditSubject(selected.subject); setEditBody(selected.body); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100">
                            <X className="w-3.5 h-3.5"/> Cancel
                          </button>
                          <button onClick={handleSave} disabled={updateEmail.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-all hover:bg-[#A4285E]" style={{ background: "#CB3273" }}>
                            <Save className="w-3.5 h-3.5"/>
                            {updateEmail.isPending ? "Saving…" : "Save"}
                          </button>
                        </>)}
                      <button onClick={() => generateSingle(selected.leadId)} disabled={generating?.status === "running"} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-60">
                        <Zap className="w-3.5 h-3.5"/>
                        {generating?.leadId === selected.leadId && generating?.status === "running"
                    ? "Generating…"
                    : "Regenerate"}
                      </button>
                      <button onClick={handleSend} disabled={sendEmail.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-all hover:bg-[#A4285E]" style={{ background: "#CB3273" }}>
                        <Send className="w-3.5 h-3.5"/>
                        {sendEmail.isPending ? "Sending…" : "Send Email"}
                      </button>
                      <button onClick={handleDelete} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </>)}
                  {selected.status === "failed" && (<>
                      <button onClick={() => generateSingle(selected.leadId)} disabled={generating?.status === "running"} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 disabled:opacity-60">
                        <Zap className="w-3.5 h-3.5"/> Regenerate
                      </button>
                      <button onClick={() => sendEmail.mutate({ id: selected.id })} disabled={sendEmail.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-60">
                        <RefreshCw className={cn("w-3.5 h-3.5", sendEmail.isPending && "animate-spin")}/>
                        {sendEmail.isPending ? "Sending…" : "Resend"}
                      </button>
                      <button onClick={handleDelete} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </>)}
                  {selected.status === "sent" && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5"/>
                      Sent {formatSafeDistance(selected.sentAt)}
                    </div>
                  )}
                </div>
              </div>

              {/* Generation progress */}
              {generating?.leadId === selected.leadId && generating?.status === "running" && (<div className="px-6 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-700 font-medium flex-shrink-0">
                  <Zap className="w-3.5 h-3.5 animate-pulse"/>
                  {generating.message}
                </div>)}
              {generating?.leadId === selected.leadId && generating?.status === "done" && (<div className="px-6 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2 text-xs text-emerald-700 font-medium flex-shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5"/> Email generated successfully!
                </div>)}
              {generating?.leadId === selected.leadId && generating?.status === "error" && (<div className="px-6 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 text-xs text-red-700 font-medium flex-shrink-0">
                  <XCircle className="w-3.5 h-3.5"/> {generating.message}
                </div>)}

              {/* Error msg for failed */}
              {selected.status === "failed" && selected.errorMsg && (<div className="px-6 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 text-xs text-red-700 flex-shrink-0">
                  <XCircle className="w-3.5 h-3.5"/> <strong>Send Error:</strong> {selected.errorMsg}
                </div>)}

              {/* Email body — Exact Gmail-style conversation view */}
              <div className="flex-1 overflow-y-auto p-6 bg-white">
                <div className="max-w-3xl mx-auto space-y-6">

                  {selected.status === "sent" ? (
                    /* ── Gmail-style Thread View (Exact Gmail UI) ── */
                    <div className="space-y-6">
                      {/* Thread Header / Subject */}
                      <div className="border-b border-gray-200 pb-4">
                        <h2 className="text-lg font-normal text-gray-900 leading-snug">
                          {selectedThread?.subject || selected.subject}
                        </h2>
                      </div>

                      {/* Stream of all messages in chronological order */}
                      <div className="space-y-6">
                        {fullConversationStream.map((msg) => {
                          const isSentByUs = !msg.isReply;
                          const msgDateStr = msg.date ? new Date(msg.date).toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }) : '';
                          const distanceStr = formatSafeDistance(msg.date);
                          return (
                            <div
                              key={msg.id}
                              className="rounded-lg border border-gray-200/80 bg-white shadow-xs overflow-hidden"
                            >
                              {/* Gmail Header */}
                              <div className="px-5 py-3.5 bg-white flex items-center justify-between border-b border-gray-100">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-xs"
                                    style={{ background: isSentByUs ? "#CB3273" : "#059669" }}
                                  >
                                    {isSentByUs ? "A" : initials(msg.senderName, "")}
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                      {isSentByUs ? SENDER_NAME : msg.senderName}
                                      <span className="text-[11px] font-normal text-gray-500">&lt;{msg.senderEmail}&gt;</span>
                                    </div>
                                    <div className="text-[11px] text-gray-400 mt-0.5">
                                      to {isSentByUs ? msg.recipientEmail : "me"} ▾
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span className="text-[11px] text-gray-400 font-sans">
                                    {msgDateStr} ({distanceStr})
                                  </span>
                                  {isSentByUs ? (
                                    <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sent
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded bg-emerald-600 text-white shadow-xs">
                                      <Reply className="w-3 h-3" /> Received Reply
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Gmail Message Body */}
                              <div className="px-6 py-5 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-sans">
                                {msg.body || "(empty message)"}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Gmail Bottom Action Buttons (Reply / Forward) */}
                      <div className="pt-2">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const textarea = document.getElementById("gmail-quick-reply-input");
                              if (textarea) textarea.focus();
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all cursor-pointer shadow-xs"
                          >
                            <Reply className="w-3.5 h-3.5 text-gray-600" />
                            Reply
                          </button>
                          <button
                            onClick={() => {
                              setComposeInitial({
                                leadId: selected.leadId,
                                toEmail: selected.toEmail,
                                subject: `Fwd: ${selected.subject || ""}`,
                                body: `\n\n---------- Forwarded message ---------\nFrom: ${SENDER_NAME} <${SENDER_EMAIL}>\nSubject: ${selected.subject}\n\n${selected.body}`
                              });
                              setComposeOpen(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all cursor-pointer shadow-xs"
                          >
                            <Send className="w-3.5 h-3.5 text-gray-600 rotate-45" />
                            Forward
                          </button>
                        </div>

                        {/* Gmail Quick Reply Text Box */}
                        <div className="mt-4 border border-gray-200 rounded-xl bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                              <Reply className="w-3.5 h-3.5 text-[#CB3273]" />
                              Reply to {selected.leadFirstName || "Lead"} ({selected.toEmail})
                            </span>
                            <button
                              onClick={() => {
                                setComposeInitial({
                                  leadId: selected.leadId,
                                  toEmail: selected.toEmail,
                                  subject: selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject || ""}`
                                });
                                setComposeOpen(true);
                              }}
                              className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-1 transition-colors"
                            >
                              <Zap className="w-3 h-3 text-purple-500" /> AI Composer
                            </button>
                          </div>
                          <textarea
                            id="gmail-quick-reply-input"
                            rows={3}
                            value={inlineReplyText}
                            onChange={(e) => setInlineReplyText(e.target.value)}
                            placeholder="Write a reply..."
                            className="w-full p-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CB3273]/30 resize-none font-sans text-gray-800"
                          />
                          <div className="flex items-center justify-end gap-2 mt-2">
                            <button
                              onClick={() => handleInlineReply(selected.toEmail, selected.leadId, selected.subject)}
                              disabled={inlineReplySending || !inlineReplyText.trim()}
                              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                              style={{ background: "#CB3273" }}
                            >
                              {inlineReplySending ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sending…
                                </>
                              ) : (
                                <>
                                  <Send className="w-3.5 h-3.5" /> Send Reply
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Standard view for draft/failed ── */
                    <>
                      {/* Subject */}
                      <div className="mb-4">
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Subject</label>
                        {isEditing ? (<input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-800/20"/>) : (<div className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-900">
                            {selected.subject}
                          </div>)}
                      </div>

                      {/* Body */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Body</label>
                        {isEditing ? (<textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={20} className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-green-800/20 resize-none"/>) : (<div className="px-4 py-4 rounded-lg bg-white border border-gray-200 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-sans">
                            {selected.body}
                          </div>)}
                      </div>
                    </>
                  )}

                </div>
              </div>
            </div>)}

          {/* Per-lead generate if no emails in draft */}
          {selected === null && activeTab === "draft" && tabEmails.length === 0 && !isLoading && (<div />)}
        </div>
      </div>

      {/* Generate per lead button for leads that don't have an email yet */}
      {activeTab === "draft" && tabEmails.length > 0 && !selected && (<div className="px-6 py-3 border-t border-gray-200 bg-white flex-shrink-0 flex items-center justify-between">
          <span className="text-xs text-gray-500">Select a draft to preview, edit, and send</span>
        </div>)}

      {/* Compose Modal */}
      {composeOpen && (<ComposeModal initialEmail={composeInitial} onClose={() => {
                setComposeOpen(false);
                setComposeInitial(null);
                refetch();
            }}/>)}
    </div>);
}
