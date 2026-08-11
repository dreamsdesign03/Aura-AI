import { useState, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles, CheckCircle2, History, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const META_TEMPLATES = [
  {
    name: "hello_world",
    label: "Meta Sandbox Default (hello_world)",
    type: "meta",
    description: "Standard Meta WhatsApp test template (no variables required)"
  },
  {
    name: "lead_intro_v1",
    label: "Intro Hook Template",
    type: "meta",
    description: "Official Meta initial reach-out template for leads"
  },
  {
    name: "audit_proposal",
    label: "Brand Audit Delivery Template",
    type: "meta",
    description: "Sends personalized website audit link via WhatsApp"
  },
  {
    name: "meeting_followup",
    label: "Meeting Followup Template",
    type: "meta",
    description: "Follow-up nudge template to book a growth session"
  }
];

const QUICK_TEXT_TEMPLATES = [
  { label: "Intro Hook", text: "Hi {{name}} 👋 I noticed you're leading {{company}} and wanted to connect about boosting lead acquisition. Would you be open to a quick 5-min chat?" },
  { label: "Audit Proposal", text: "Hi {{name}}, we generated a personalized brand & acquisition audit for {{company}}. Would you like me to send over your audit breakdown?" },
  { label: "Meeting Drip", text: "Hi {{name}}, following up on our previous note. Do you have 10 minutes open this week to discuss custom growth strategies for {{company}}?" }
];

export default function SendWhatsAppModal({ lead, isOpen, onClose, onSuccess }) {
  const [sendType, setSendType] = useState("text"); // "text" or "template"
  const [selectedMetaTemplate, setSelectedMetaTemplate] = useState("hello_world");
  const [message, setMessage] = useState("");
  const [phoneOverride, setPhoneOverride] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState("compose"); // "compose" or "history"
  const { toast } = useToast();

  const leadName = lead ? `${lead.firstName || lead.first_name || ""} ${lead.lastName || lead.last_name || ""}`.trim() || "Lead" : "Lead";
  const firstName = lead?.firstName || lead?.first_name || leadName;
  const company = lead?.company || "Company";
  const defaultPhone = lead?.whatsapp || lead?.phone || "";
  const phone = phoneOverride || defaultPhone;

  useEffect(() => {
    if (isOpen && lead?.id) {
      fetchHistory();
    }
  }, [isOpen, lead?.id]);

  async function fetchHistory() {
    if (!lead?.id) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/whatsapp/messages/${lead.id}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.messages || []);
      }
    } catch (e) {
      console.error("Failed to load message history:", e);
    } finally {
      setLoadingHistory(false);
    }
  }

  if (!isOpen || !lead) return null;

  function applyQuickText(tplText) {
    const formatted = tplText
      .replace(/{{name}}/g, firstName)
      .replace(/{{company}}/g, company);
    setMessage(formatted);
    setSendType("text");
  }

  async function handleSend(e) {
    e?.preventDefault();
    if (sendType === "text" && !message.trim()) {
      toast({ title: "Please enter a message", variant: "destructive" });
      return;
    }
    setSending(true);

    try {
      const bodyPayload = {
        leadId: lead.id,
        phone: phone,
      };

      if (sendType === "template") {
        bodyPayload.templateName = selectedMetaTemplate;
        bodyPayload.templateParams = [firstName, company];
      } else {
        bodyPayload.message = message.trim();
      }

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send WhatsApp message");

      toast({
        title: "WhatsApp message dispatched!",
        description: data.metaResult?.success 
          ? `Sent via Meta Cloud API to ${phone}`
          : (data.simulated ? `Message recorded for ${leadName}` : `Meta API response: ${data.metaResult?.error || 'Sent'}`),
      });

      fetchHistory();
      if (onSuccess) onSuccess(data);
      if (sendType === "text") setMessage("");
      setActiveTab("history");
    } catch (err) {
      toast({ title: "Failed to send WhatsApp message", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: "#F0FDF4" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ background: "#25D366" }}>
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Meta WhatsApp Integration</h3>
              <p className="text-xs text-gray-500">{leadName} · {company}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-gray-100 px-6 bg-gray-50/50 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("compose")}
            className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "compose"
                ? "border-emerald-500 text-emerald-700 font-bold"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Send Message / Template
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "history"
                ? "border-emerald-500 text-emerald-700 font-bold"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Chat History ({history.length})
          </button>
        </div>

        {activeTab === "compose" ? (
          /* Compose & Template Form */
          <form onSubmit={handleSend} className="p-6 space-y-4">
            {/* Phone Field */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Recipient Phone (E.164 with Country Code)</label>
              <input
                type="text"
                value={phoneOverride || defaultPhone}
                onChange={e => setPhoneOverride(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            {/* Mode Switcher: Meta Template vs Custom Text */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Message Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSendType("text")}
                  className={`px-3 py-2 text-xs rounded-xl border font-semibold text-left transition-all ${
                    sendType === "text"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  💬 Custom Text Message
                </button>
                <button
                  type="button"
                  onClick={() => setSendType("template")}
                  className={`px-3 py-2 text-xs rounded-xl border font-semibold text-left transition-all ${
                    sendType === "template"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  ⚡ Official Meta Template
                </button>
              </div>
            </div>

            {sendType === "template" ? (
              /* Meta Approved Template Selection */
              <div className="space-y-3 p-3 bg-emerald-50/40 rounded-xl border border-emerald-100">
                <label className="block text-xs font-semibold text-emerald-900">Select Approved WhatsApp Template</label>
                <select
                  value={selectedMetaTemplate}
                  onChange={e => setSelectedMetaTemplate(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg border border-emerald-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-medium"
                >
                  {META_TEMPLATES.map(t => (
                    <option key={t.name} value={t.name}>
                      {t.label} ({t.name})
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-emerald-700 bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="font-bold">Template Payload Preview:</span>
                  <div className="mt-1 font-mono text-[10px] text-gray-600">
                    Template: <span className="text-emerald-700 font-bold">{selectedMetaTemplate}</span><br />
                    Parameters: [{firstName}, {company}]
                  </div>
                </div>
              </div>
            ) : (
              /* Custom Text & Quick Presets */
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs font-semibold text-gray-700">Quick Text Presets</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_TEXT_TEMPLATES.map(t => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => applyQuickText(t.text)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100 transition-colors"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Message Content</label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Type your WhatsApp message here..."
                    className="w-full p-3 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || (sendType === "text" && !message.trim())}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-xl transition-all disabled:opacity-50 shadow-sm"
                style={{ background: "#25D366" }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Dispatched..." : sendType === "template" ? "Send Meta Template" : "Send WhatsApp"}
              </button>
            </div>
          </form>
        ) : (
          /* Chat History Timeline */
          <div className="p-6 space-y-3 max-h-[380px] overflow-y-auto">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span className="text-xs font-semibold">Loading conversation thread...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-gray-400 space-y-1">
                <MessageCircle className="w-8 h-8 mx-auto text-gray-300" />
                <p className="text-xs font-semibold">No Meta WhatsApp messages recorded yet.</p>
                <p className="text-[11px] text-gray-400">Send a template or message above to start the thread.</p>
              </div>
            ) : (
              history.map((msg, i) => {
                const isOutbound = msg.direction === "outbound";
                return (
                  <div
                    key={msg.id || i}
                    className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                        isOutbound
                          ? "bg-emerald-600 text-white rounded-tr-none shadow-sm"
                          : "bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200/80"
                      }`}
                    >
                      {msg.templateName && (
                        <div className="text-[10px] uppercase font-bold opacity-80 mb-1 flex items-center gap-1">
                          <Layers className="w-3 h-3" /> Template: {msg.templateName}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content || msg.body}</p>
                      <div
                        className={`text-[9px] mt-1 text-right opacity-70 flex items-center justify-end gap-1`}
                      >
                        <span>{msg.sentAt ? new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        {isOutbound && <CheckCircle2 className="w-3 h-3 text-emerald-200" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

