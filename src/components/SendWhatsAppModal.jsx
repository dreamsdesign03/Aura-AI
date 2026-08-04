import { useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEMPLATES = [
  { label: "Intro Hook", text: "Hi {{name}} 👋 I noticed you're leading {{company}} and wanted to connect about boosting lead acquisition. Would you be open to a quick 5-min chat?" },
  { label: "Audit Proposal", text: "Hi {{name}}, we generated a personalized brand & acquisition audit for {{company}}. Would you like me to send over your audit breakdown?" },
  { label: "Meeting Drip", text: "Hi {{name}}, following up on our previous note. Do you have 10 minutes open this week to discuss custom growth strategies for {{company}}?" }
];

export default function SendWhatsAppModal({ lead, isOpen, onClose, onSuccess }) {
  const [message, setMessage] = useState("");
  const [phoneOverride, setPhoneOverride] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  if (!isOpen || !lead) return null;

  const leadName = `${lead.firstName || lead.first_name || ""} ${lead.lastName || lead.last_name || ""}`.trim() || "Lead";
  const company = lead.company || "Company";
  const defaultPhone = lead.whatsapp || lead.phone || "";
  const phone = phoneOverride || defaultPhone;

  function applyTemplate(tplText) {
    const formatted = tplText
      .replace(/{{name}}/g, lead.firstName || lead.first_name || leadName)
      .replace(/{{company}}/g, company);
    setMessage(formatted);
  }

  async function handleSend(e) {
    e?.preventDefault();
    if (!message.trim()) {
      toast({ title: "Please enter a message", variant: "destructive" });
      return;
    }
    setSending(true);

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadId: lead.id,
          phone: phone,
          message: message.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send WhatsApp message");

      toast({
        title: "WhatsApp message sent",
        description: data.simulated ? `Message recorded for ${leadName}` : `Sent via WhatsApp to ${phone}`,
      });

      if (onSuccess) onSuccess(data);
      onClose();
      setMessage("");
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
              <h3 className="text-base font-bold text-gray-900">Send WhatsApp Message</h3>
              <p className="text-xs text-gray-500">{leadName} · {company}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSend} className="p-6 space-y-4">
          {/* Phone Field */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">WhatsApp Phone Number</label>
            <input
              type="text"
              value={phoneOverride || defaultPhone}
              onChange={e => setPhoneOverride(e.target.value)}
              placeholder="+91 9876543210"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          {/* Quick Templates */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-semibold text-gray-700">Quick Templates</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => applyTemplate(t.text)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message Area */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Message Content</label>
            <textarea
              rows={5}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your WhatsApp message here..."
              className="w-full p-3 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none leading-relaxed"
            />
          </div>

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
              disabled={sending || !message.trim()}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-xl transition-all disabled:opacity-50 shadow-sm"
              style={{ background: "#25D366" }}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending..." : "Send WhatsApp"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
