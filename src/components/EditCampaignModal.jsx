import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DAYS = [["Monday", "M"], ["Tuesday", "T"], ["Wednesday", "W"], ["Thursday", "T"], ["Friday", "F"], ["Saturday", "S"], ["Sunday", "S"]];

// Defaults match the Sarvam "Schedule campaign" wizard.
const DEFAULT_SV = {
  startMode: "now", startAt: "",
  endMode: "today", endAt: "",
  aps: 0.5,
  days: DAYS.map(d => d[0]),
  startTime: "09:00", endTime: "18:00",
  retryEnabled: true, maxRetries: 3, intervalMin: 30,
  customOn: false, customIntervals: "",
  busy: true, noAnswer: true, failed: true,
  shortOn: false, shortSec: 30,
  provOn: true, provMax: 3, provInt: 5,
  intOn: true, intMax: 3, intInt: 5
};

function toSarvamSettings(sv) {
  const custom = sv.retryEnabled && sv.customOn
    ? String(sv.customIntervals).split(/[ ,]+/).map(Number).filter(n => Number.isFinite(n) && n >= 1)
    : [];
  return {
    start: { mode: sv.startMode, at: sv.startAt },
    end: { mode: sv.endMode, at: sv.endAt },
    attemptsPerSecond: Number(sv.aps),
    allowedDays: sv.days,
    startTime: sv.startTime,
    endTime: sv.endTime,
    retry: {
      enabled: sv.retryEnabled,
      maxRetries: Number(sv.maxRetries),
      intervalMin: Number(sv.intervalMin),
      customIntervals: custom.length ? custom : null,
      on: {
        busy: sv.busy,
        no_answer: sv.noAnswer,
        failed: sv.failed,
        short_duration: { enabled: sv.shortOn, thresholdSeconds: Number(sv.shortSec) },
        provider_error: { enabled: sv.provOn, maxRetries: Number(sv.provMax), intervalMin: Number(sv.provInt) },
        internal_error: { enabled: sv.intOn, maxRetries: Number(sv.intMax), intervalMin: Number(sv.intInt) }
      }
    }
  };
}

function validateSv(sv) {
  if (sv.days.length === 0) return "Select at least one allowed day";
  if (!sv.startTime || !sv.endTime || sv.endTime <= sv.startTime) return "Calls-allowed end time must be after the start time";
  if (!(Number(sv.aps) >= 0.1 && Number(sv.aps) <= 500)) return "Attempts per second must be between 0.1 and 500";
  if (sv.startMode === "custom" && !sv.startAt) return "Pick a custom start date and time";
  if (sv.endMode === "custom" && !sv.endAt) return "Pick a custom end date and time";
  if (sv.startMode === "custom" && sv.endMode === "custom" && sv.endAt <= sv.startAt) return "End must be after start";
  return null;
}


// Stored (server-normalized) settings -> form state
function fromStored(st, mode) {
  if (!st) return DEFAULT_SV;
  const r = st.retry || {}, on = r.on || {};
  const ci = r.customIntervals && r.customIntervals.length ? r.customIntervals : null;
  return {
    startMode: st.start?.mode || "now", startAt: st.start?.at || "",
    endMode: st.end?.mode || "today", endAt: st.end?.at || "",
    aps: st.attemptsPerSecond ?? 0.5,
    days: st.allowedDays || DEFAULT_SV.days,
    startTime: st.startTime || "09:00", endTime: st.endTime || "18:00",
    retryEnabled: r.enabled !== false, maxRetries: r.maxRetries ?? 3, intervalMin: r.intervalMin ?? 30,
    customOn: !!ci, customIntervals: ci ? ci.join(", ") : "",
    busy: on.busy !== false, noAnswer: on.no_answer !== false, failed: on.failed !== false,
    shortOn: !!on.short_duration?.enabled, shortSec: on.short_duration?.thresholdSeconds ?? 30,
    provOn: on.provider_error?.enabled !== false, provMax: on.provider_error?.maxRetries ?? 3, provInt: on.provider_error?.intervalMin ?? 5,
    intOn: on.internal_error?.enabled !== false, intMax: on.internal_error?.maxRetries ?? 3, intInt: on.internal_error?.intervalMin ?? 5
  };
}

export default function EditCampaignModal({ campaign, onClose, onSaved }) {
  const { toast } = useToast();
  const [name, setName] = useState(campaign.name || "");
  const [sv, setSv] = useState(() => fromStored(campaign.sarvam_settings));
  const [saving, setSaving] = useState(false);
  const setSvField = (patch) => setSv(prev => ({ ...prev, ...patch }));
  const toggleDay = (d) => setSv(prev => ({ ...prev, days: prev.days.includes(d) ? prev.days.filter(x => x !== d) : DAYS.map(x => x[0]).filter(x => x === d || prev.days.includes(x)) }));

  const save = async () => {
    const err = validateSv(sv);
    if (err) return toast({ title: err, variant: "destructive" });
    setSaving(true);
    try {
      const r = await fetch(`/api/bulk-calling/${campaign.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sarvam_settings: toSarvamSettings(sv) })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not save");
      toast({ title: campaign.sarvam_campaign_id ? "Campaign updated in AuraAI and Sarvam" : "Campaign settings saved" });
      onSaved && onSaved();
      onClose();
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Edit campaign</h2>
            <p className="text-[11px] text-gray-500">{campaign.sarvam_campaign_id ? "Changes are also applied to the Sarvam campaign (it is paused for a moment while saving)." : "Applied when you press Start Calling."}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-auto space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Campaign Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-300 outline-none" />
          </div>
          {/* Campaign period */}
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Campaign period</div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-28 text-sm text-gray-600">Start date time</span>
                <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-bold">
                  {[["now", "Now"], ["custom", "Custom"]].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setSvField({ startMode: v })} className={`px-3 py-1.5 rounded-md ${sv.startMode === v ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>{l}</button>
                  ))}
                </div>
                {sv.startMode === "custom"
                  ? <input type="datetime-local" value={sv.startAt} onChange={e => setSvField({ startAt: e.target.value })} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-pink-300" />
                  : <span className="text-[11px] text-gray-500">Starts about 3 min after you press Start Calling</span>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-28 text-sm text-gray-600">End date time</span>
                <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-bold">
                  {[["today", "Today"], ["custom", "Custom"]].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setSvField({ endMode: v })} className={`px-3 py-1.5 rounded-md ${sv.endMode === v ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>{l}</button>
                  ))}
                </div>
                {sv.endMode === "custom"
                  ? <input type="datetime-local" value={sv.endAt} onChange={e => setSvField({ endAt: e.target.value })} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-pink-300" />
                  : <span className="text-[11px] text-gray-500">Ends today 11:59 PM IST</span>}
              </div>
            </div>
          </div>

          {/* Attempts per second */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Attempts per second</label>
            <input type="number" step="0.1" min="0.1" max="500" value={sv.aps} onChange={e => setSvField({ aps: e.target.value })}
              className="w-40 px-3 py-2 border border-gray-200 rounded-xl focus:ring-1 focus:ring-pink-300 outline-none" />
            <p className="text-[10px] text-gray-500 mt-1">How many new calls start each second. 0.5 = 30 calls a minute. Retries count too.</p>
          </div>

          {/* Allowed days + time window */}
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Allowed days</div>
            <div className="flex gap-2">
              {DAYS.map(([full, short]) => (
                <button key={full} type="button" title={full} onClick={() => toggleDay(full)}
                  className={`w-9 h-9 rounded-full text-xs font-bold border ${sv.days.includes(full) ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-400 border-gray-200"}`}>{short}</button>
              ))}
            </div>
            <div className="text-sm font-semibold text-gray-700 mt-4 mb-2">Calls allowed between (IST)</div>
            <div className="flex items-center gap-3">
              <input type="time" value={sv.startTime} onChange={e => setSvField({ startTime: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-pink-300" />
              <span className="text-gray-400">→</span>
              <input type="time" value={sv.endTime} onChange={e => setSvField({ endTime: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-pink-300" />
            </div>
          </div>

          {/* Retry configuration */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold text-gray-700">Retry configuration</span>
              <input type="checkbox" checked={sv.retryEnabled} onChange={e => setSvField({ retryEnabled: e.target.checked })} className="w-4 h-4 accent-pink-600" />
            </label>

            {sv.retryEnabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Max retries (0-20)</label>
                    <input type="number" min="0" max="20" value={sv.maxRetries} onChange={e => setSvField({ maxRetries: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-pink-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Retry interval (min)</label>
                    <input type="number" min="1" value={sv.intervalMin} disabled={sv.customOn} onChange={e => setSvField({ intervalMin: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-pink-300 disabled:bg-gray-50 disabled:text-gray-400" />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={sv.customOn} onChange={e => setSvField({ customOn: e.target.checked })} className="w-4 h-4 accent-pink-600" />
                  Customize interval per attempt
                </label>
                {sv.customOn && (
                  <div>
                    <input type="text" placeholder="e.g. 15, 30, 60 (minutes before retry 1, 2, 3)" value={sv.customIntervals} onChange={e => setSvField({ customIntervals: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-pink-300" />
                    <p className="text-[10px] text-gray-500 mt-1">Comma separated minutes, one per retry.</p>
                  </div>
                )}

                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-2">Retry on</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700">
                    {[["busy", "Busy"], ["noAnswer", "No Answer"], ["failed", "Failed"], ["shortOn", "Short Duration"], ["provOn", "Provider Error"], ["intOn", "Internal Error"]].map(([k, l]) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={sv[k]} onChange={e => setSvField({ [k]: e.target.checked })} className="w-4 h-4 accent-pink-600" /> {l}
                      </label>
                    ))}
                  </div>
                </div>

                {sv.shortOn && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Short duration: retry if the call is shorter than (seconds)</label>
                    <input type="number" min="1" value={sv.shortSec} onChange={e => setSvField({ shortSec: e.target.value })} className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none" />
                  </div>
                )}
                {sv.provOn && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-600 mb-2">Provider Error</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] text-gray-500 mb-1">Max retries</label><input type="number" min="1" max="20" value={sv.provMax} onChange={e => setSvField({ provMax: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none" /></div>
                      <div><label className="block text-[11px] text-gray-500 mb-1">Interval (min, at least 5)</label><input type="number" min="5" value={sv.provInt} onChange={e => setSvField({ provInt: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none" /></div>
                    </div>
                  </div>
                )}
                {sv.intOn && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-600 mb-2">Internal Error</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] text-gray-500 mb-1">Max retries</label><input type="number" min="1" max="20" value={sv.intMax} onChange={e => setSvField({ intMax: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none" /></div>
                      <div><label className="block text-[11px] text-gray-500 mb-1">Interval (min, at least 5)</label><input type="number" min="5" value={sv.intInt} onChange={e => setSvField({ intInt: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none" /></div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            {Number(sv.aps)} calls/sec · {sv.days.length} days · {sv.startTime}-{sv.endTime} IST ·{" "}
            {sv.retryEnabled ? `${Number(sv.maxRetries)} retries every ${sv.customOn && sv.customIntervals ? sv.customIntervals : sv.intervalMin + " min"}` : "no retries"} · phone rotation off
          </div>
          {campaign.sarvam_campaign_id && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Sarvam does not allow changing the start time of a campaign that already exists. Everything else (end time, days, calling window, speed, retries) is updated.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
          <button onClick={save} disabled={saving} className="px-6 py-2 bg-pink-600 text-white text-sm font-bold rounded-xl hover:bg-pink-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
