import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Loader2, RefreshCw } from "lucide-react";

const NOT_WA_MSG = "This is not a WhatsApp active number";
const SEND_DELAY_MS = 1500;

// Mirrors server-side rules (server/whatsapp.js) so the preview matches what is sent.
function cleanTplValue(v) {
  return String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, " ").trim();
}
function normalisePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) d = "91" + d;
  return /^\d{11,15}$/.test(d) ? d : "";
}
function leadFullName(l) {
  return `${l.firstName || l.first_name || ""} ${l.lastName || l.last_name || ""}`.trim();
}
function leadVars(l) {
  return {
    first_name: cleanTplValue(leadFullName(l).split(/\s+/)[0]) || "there",
    company: cleanTplValue(l.company) || "your store",
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function SendTemplateModal({ leads, isOpen, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | sending | done
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const resultsRef = useRef([]);
  resultsRef.current = results;

  useEffect(() => {
    if (!isOpen) return;
    setPhase("idle");
    setResults([]);
    fetch("/api/whatsapp/templates", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const list = d.templates || [];
        setTemplates(list);
        setTemplateId((cur) => cur || list[0]?.id || "");
      })
      .catch(() => {});
  }, [isOpen]);

  async function refreshStatuses() {
    const wamids = resultsRef.current.filter((r) => r.status === "sent" && r.wamid).map((r) => r.wamid);
    if (wamids.length === 0) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/whatsapp/template-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ wamids }),
      });
      const data = await res.json();
      const byId = new Map((data.statuses || []).map((s) => [s.wamid, s]));
      setResults((prev) => prev.map((r) => {
        const s = r.wamid && byId.get(r.wamid);
        if (!s || (s.status !== "not_whatsapp" && s.status !== "failed")) return r;
        return { ...r, status: s.status, error: s.status === "not_whatsapp" ? NOT_WA_MSG : (s.errorMessage || "Delivery failed") };
      }));
    } catch {
      /* ignore — user can retry with the button */
    } finally {
      setRefreshing(false);
    }
  }

  // Meta usually reports "not on WhatsApp" (131026) asynchronously via webhook — check once after the run.
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(refreshStatuses, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!isOpen || !leads || leads.length === 0) return null;

  const tpl = templates.find((t) => t.id === templateId);
  const previewVars = leadVars(leads[0]);
  const previewHeader = tpl?.header ? tpl.header.replace(/{{(\w+)}}/g, (_, k) => previewVars[k] ?? "") : "";
  const previewBody = tpl?.body ? tpl.body.replace(/{{(\w+)}}/g, (_, k) => previewVars[k] ?? "") : "";
  const preview = tpl ? (previewHeader ? `${previewHeader}\n\n${previewBody}` : previewBody) : "";

  async function handleSend() {
    if (!tpl) return;
    setPhase("sending");
    setResults([]);
    setTotal(leads.length);
    const out = [];
    for (let i = 0; i < leads.length; i++) {
      const l = leads[i];
      const rawPhone = l.whatsapp || l.phone || "";
      const base = { leadId: l.id, name: leadFullName(l) || l.company || "Contact", phone: rawPhone };
      if (!normalisePhone(rawPhone)) {
        out.push({ ...base, status: "skipped", error: "No valid phone number" });
        setResults([...out]);
        continue;
      }
      try {
        const res = await fetch("/api/whatsapp/send-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ leadId: l.id, phone: rawPhone, name: leadFullName(l), company: l.company || "", templateId: tpl.id }),
        });
        const d = await res.json();
        out.push({ ...base, status: d.status || (d.success ? "sent" : "failed"), error: d.error || null, wamid: d.wamid || null });
      } catch (e) {
        out.push({ ...base, status: "failed", error: e.message || "Network error" });
      }
      setResults([...out]);
      if (i < leads.length - 1) await sleep(SEND_DELAY_MS);
    }
    setPhase("done");
  }

  const count = (s) => results.filter((r) => r.status === s).length;
  const notWa = results.filter((r) => r.status === "not_whatsapp");
  const failed = results.filter((r) => r.status === "failed");
  const skipped = results.filter((r) => r.status === "skipped");
  const sending = phase === "sending";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: "#F0FDF4" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: "#262524" }}>
              <MessageCircle className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">Send WhatsApp Template</h3>
          </div>
          <button onClick={onClose} disabled={sending} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {phase === "idle" && (<>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Template</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none">
                {templates.map((t) => (<option key={t.id} value={t.id}>{t.name} · {t.language}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Preview (first selected contact)</label>
              <div className="text-xs text-gray-800 bg-green-50 border border-green-100 rounded-lg p-3 whitespace-pre-line">{preview || "Loading…"}</div>
            </div>
            <div className="text-xs text-gray-600"><b>{leads.length}</b> contact{leads.length === 1 ? "" : "s"} selected</div>
          </>)}

          {phase !== "idle" && (<>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 py-2"><div className="text-base font-bold text-emerald-700">{count("sent")}</div><div className="text-[10px] text-emerald-700">Sent</div></div>
              <div className="rounded-lg bg-red-50 py-2"><div className="text-base font-bold text-red-700">{notWa.length}</div><div className="text-[10px] text-red-700">Not on WhatsApp</div></div>
              <div className="rounded-lg bg-amber-50 py-2"><div className="text-base font-bold text-amber-700">{failed.length}</div><div className="text-[10px] text-amber-700">Failed</div></div>
            </div>
            {sending && (<div className="flex items-center gap-2 text-xs text-gray-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending {results.length} / {total}…</div>)}

            {notWa.length > 0 && (<div>
              <div className="text-[11px] font-semibold text-red-700 mb-1">Not on WhatsApp</div>
              {notWa.map((r, i) => (<div key={i} className="text-[11px] text-gray-700 flex justify-between gap-2"><span className="truncate">{r.name} · {r.phone}</span><span className="text-red-600 flex-shrink-0">{NOT_WA_MSG}</span></div>))}
            </div>)}
            {failed.length > 0 && (<div>
              <div className="text-[11px] font-semibold text-amber-700 mb-1">Failed</div>
              {failed.map((r, i) => (<div key={i} className="text-[11px] text-gray-700 flex justify-between gap-2"><span className="truncate">{r.name} · {r.phone}</span><span className="text-amber-700 text-right">{r.error}</span></div>))}
            </div>)}
            {skipped.length > 0 && (<div>
              <div className="text-[11px] font-semibold text-gray-500 mb-1">Skipped (no valid phone)</div>
              {skipped.map((r, i) => (<div key={i} className="text-[11px] text-gray-600 truncate">{r.name}{r.phone ? ` · ${r.phone}` : ""}</div>))}
            </div>)}
          </>)}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          {phase === "done" && count("sent") > 0 && (
            <button onClick={refreshStatuses} disabled={refreshing} className="mr-auto flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 underline disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> Check delivery status
            </button>
          )}
          {phase === "idle" ? (
            <button onClick={handleSend} disabled={!tpl} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50" style={{ background: "#262524" }}>
              <Send className="w-3.5 h-3.5" /> Send to {leads.length}
            </button>
          ) : (
            <button onClick={onClose} disabled={sending} className="px-4 py-1.5 text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg disabled:opacity-50">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
