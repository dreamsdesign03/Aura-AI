import { useState } from "react";
import { X, PhoneOutgoing, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function BulkCallModal({ isOpen, onClose, selectedLeads, onComplete }) {
  const { toast } = useToast();
  const [name, setName] = useState(`Aura Leads - ${format(new Date(), "dd MMM HH:mm")}`);
  const [scheduleMode, setScheduleMode] = useState("now"); // now, schedule
  const [scheduledAt, setScheduledAt] = useState("");
  const [concurrent, setConcurrent] = useState(1);
  const [autoRetry, setAutoRetry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const validLeads = selectedLeads.filter(l => {
    if (l.do_not_call) return false;
    const p = (l.phone || l.whatsapp || "").replace(/\D/g, "");
    return p.length >= 10;
  });

  const skippedLeads = selectedLeads.filter(l => !validLeads.includes(l));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validLeads.length === 0) {
      toast({ title: "No valid leads", description: "None of the selected leads have a valid phone number.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name,
        leadIds: validLeads.map(l => l.id),
        concurrent,
        autoRetry,
      };

      if (scheduleMode === "schedule") {
        if (!scheduledAt) {
          throw new Error("Please select a date and time");
        }
        // Format to YYYY-MM-DD HH:mm:ss for IST (naive approach)
        const dt = new Date(scheduledAt);
        payload.scheduled = format(dt, "yyyy-MM-dd HH:mm:ss");
      }

      const res = await fetch("/api/omnidim/bulk-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start bulk call");

      toast({
        title: "Campaign created",
        description: `${data.queued} leads queued for AI calling.`,
      });
      onComplete?.(data);
      onClose();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-100" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: "#FDF2F8" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: "#CB3273" }}>
              <PhoneOutgoing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">New AI Bulk Call Campaign</h3>
              <p className="text-xs text-pink-700 font-medium">{selectedLeads.length} leads selected</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-sm">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Campaign Name</label>
            <input 
              type="text" required value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-pink-300 outline-none" 
              placeholder="E.g. Oct 2026 Follow-ups"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">When to call</label>
              <select 
                value={scheduleMode} onChange={e => setScheduleMode(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-pink-300 outline-none"
              >
                <option value="now">Call Now</option>
                <option value="schedule">Schedule for later</option>
              </select>
            </div>
            {scheduleMode === "schedule" && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Scheduled Date & Time (IST)</label>
                <input 
                  type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-pink-300 outline-none"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Concurrent Calls (Max 1)</label>
              <input 
                type="number" min="1" max="1" required value={concurrent} onChange={e => setConcurrent(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-pink-300 outline-none"
              />
            </div>
            <div className="flex items-center mt-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-600">
                <input type="checkbox" checked={autoRetry} onChange={e => setAutoRetry(e.target.checked)} className="rounded text-pink-500 focus:ring-pink-400" />
                Auto-retry no-answers (Next day)
              </label>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500 font-medium">Leads to be called:</span>
              <span className="text-green-600 font-bold">{validLeads.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 font-medium">Skipped leads:</span>
              <span className="text-red-500 font-bold">{skippedLeads.length}</span>
            </div>
            {skippedLeads.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-gray-400 text-[10px] mb-1">Reasons: Missing phone, do_not_call, or invalid format.</p>
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 py-2.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || validLeads.length === 0} className="flex-[2] py-2.5 flex items-center justify-center gap-2 text-xs font-bold text-white rounded-xl disabled:opacity-50 transition-colors shadow-sm" style={{ background: "#CB3273" }}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</> : "Start Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
