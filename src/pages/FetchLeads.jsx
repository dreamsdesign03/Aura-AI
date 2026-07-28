import { useState, useEffect, useRef } from "react";
import { useListIcps } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Zap, MapPin, Database, CheckCircle2, Loader2, AlertCircle, ToggleLeft, ToggleRight, Clock, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
const SOURCES = [
    {
        id: "google_maps",
        label: "Google Maps",
        desc: "Real businesses via Apify Google Places crawler",
        badge: "Live",
        color: "text-green-700 border-green-200 bg-green-50",
        icon: <MapPin className="w-4 h-4"/>,
    },
    {
        id: "apollo",
        label: "Apollo",
        desc: "Real company data from Apollo.io + AI contacts",
        badge: "Live",
        color: "text-purple-700 border-purple-200 bg-purple-50",
        icon: <Database className="w-4 h-4"/>,
    },
];
const COUNTS = [10, 50, 100];
export default function FetchLeads({ onClose = () => window.history.back() }) {
    const qc = useQueryClient();
    const { data: icps = [] } = useListIcps();
    const [selectedSources, setSelectedSources] = useState(["google_maps"]);
    const [icpId, setIcpId] = useState(null);
    const [dailyCount, setDailyCount] = useState(10);
    const [autopilot, setAutopilot] = useState(false);
    const [config, setConfig] = useState(null);
    const [streaming, setStreaming] = useState(false);
    const [streamedLeads, setStreamedLeads] = useState([]);
    const [statusMsg, setStatusMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [done, setDone] = useState(false);
    const [skipped, setSkipped] = useState(0);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState(null);
    const abortRef = useRef(null);
    const feedRef = useRef(null);
    const base = "/api";
    useEffect(() => {
        fetch(`${base}/leads/fetch-config`)
            .then((r) => r.ok ? r.json() : null)
            .then((cfg) => {
            if (cfg) {
                setConfig(cfg);
                if (cfg.sources?.length)
                    setSelectedSources(cfg.sources);
                if (cfg.icpId)
                    setIcpId(cfg.icpId);
                if (cfg.dailyCount && [10, 50, 100].includes(cfg.dailyCount))
                    setDailyCount(cfg.dailyCount);
                setAutopilot(cfg.enabled ?? false);
            }
        })
            .catch(() => { });
    }, [base]);
    useEffect(() => {
        if (feedRef.current)
            feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }, [streamedLeads, statusMsg]);
    const toggleSource = (s) => {
        const srcDef = SOURCES.find(src => src.id === s);
        setSelectedSources((prev) => {
            if (prev.includes(s)) {
                return prev.length > 1 ? prev.filter((x) => x !== s) : prev;
            }
            // mysa_leads is exclusive — deselect others; selecting a non-exclusive source deselects mysa_leads
            if (srcDef?.exclusive)
                return [s];
            return [...prev.filter(x => !SOURCES.find(src => src.id === x)?.exclusive), s];
        });
    };
    const isMysaLeadsMode = selectedSources.includes("mysa_leads");
    const saveConfig = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
            const body = { icpId, sources: selectedSources, dailyCount, enabled: autopilot };
            const r = await fetch(`${base}/leads/fetch-config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (r.ok) {
                setConfig(await r.json());
                setSaveMsg("saved");
            }
            else {
                setSaveMsg("error");
            }
        }
        catch {
            setSaveMsg("error");
        }
        finally {
            setSaving(false);
            setTimeout(() => setSaveMsg(null), 2500);
        }
    };
    const fetchNow = async () => {
        if (streaming) return;
        setStreaming(true);
        setStreamedLeads([]);
        setErrorMsg("");
        setDone(false);
        setSkipped(0);
        setStatusMsg("Starting fetch…");
        try {
            const email = sessionStorage.getItem("aura_user_email");
            // Step 1: Start Apify runs
            const startRes = await fetch(`${base}/leads/fetch-now`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ icpId, sources: selectedSources, count: dailyCount, email }),
            });
            if (!startRes.ok) throw new Error("Failed to start fetch");
            const { runs } = await startRes.json();
            if (!runs || runs.length === 0) throw new Error("No fetch runs started");

            // Check for immediate errors
            const errors = runs.filter(r => r.error);
            if (errors.length > 0 && runs.length === errors.length) {
                throw new Error(errors.map(e => e.error).join("; "));
            }
            if (errors.length > 0) {
                setErrorMsg(errors.map(e => `${e.source}: ${e.error}`).join("; "));
            }

            // Step 2: Poll until all runs complete
            let allDone = false;
            let pollCount = 0;
            const maxPolls = 60; // max 60 polls × 3s = 180s

            while (!allDone && pollCount < maxPolls) {
                await new Promise(r => setTimeout(r, 3000));
                pollCount++;

                const pollRes = await fetch(`${base}/leads/fetch-poll`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ runs, icpId, count: dailyCount, email }),
                });
                if (!pollRes.ok) throw new Error("Poll failed");
                const pollData = await pollRes.json();

                // Update leads display
                if (pollData.leads?.length > 0) {
                    setStreamedLeads(prev => {
                        const existing = new Set(prev.map(l => l.email));
                        const newLeads = pollData.leads
                            .filter(l => !existing.has(l.email))
                            .map(l => ({
                                name: `${l.firstName} ${l.lastName}`,
                                company: l.company,
                                email: l.email,
                                industry: l.industry,
                                country: l.country,
                            }));
                        return [...prev, ...newLeads];
                    });
                }

                setSkipped(pollData.totalSkipped || 0);

                // Check if all runs are done
                const running = (pollData.completed || []).filter(c => c.status === 'running');
                if (running.length === 0) {
                    allDone = true;
                    setDone(true);
                    setStatusMsg(`Done — ${pollData.totalImported || 0} leads imported`);
                    qc.invalidateQueries({ queryKey: ["useListLeads"] });
                } else {
                    setStatusMsg(`Scanning… ${pollData.totalImported || 0} found so far`);
                }

                // Report errors
                if (pollData.errors?.length > 0) {
                    setErrorMsg(pollData.errors.map(e => `${e.source}: ${e.error}`).join("; "));
                }
            }

            if (!allDone) {
                setStatusMsg(`Timeout — ${streamedLeads.length} leads imported so far`);
            }
        } catch (err) {
            setErrorMsg(String(err));
        } finally {
            setStreaming(false);
        }
    };
    const formatDate = (d) => d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
    return (<div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40" onClick={onClose}>
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#1A3D2B" }}>
              <Zap className="w-3.5 h-3.5 text-white"/>
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">AI Lead Fetcher</h2>
              <p className="text-[11px] text-gray-400">Generate leads automatically from multiple sources</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Sources */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">
              Data Sources
            </label>
            <div className="space-y-2">
              {SOURCES.map((src) => {
            const active = selectedSources.includes(src.id);
            return (<button key={src.id} type="button" onClick={() => toggleSource(src.id)} className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all", active
                    ? `${src.color} border-current shadow-sm`
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300")}>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", active ? "bg-white/60" : "bg-gray-100")}>
                      {src.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold">{src.label}</span>
                        {src.badge && (<span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-600 text-white">
                            {src.badge}
                          </span>)}
                      </div>
                      <div className="text-[11px] opacity-70">{src.desc}</div>
                    </div>
                    <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0", active ? "border-current bg-current" : "border-gray-300")}>
                      {active && <CheckCircle2 className="w-3 h-3 text-white"/>}
                    </div>
                  </button>);
        })}
            </div>
          </div>

          {/* ICP */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              Target ICP
            </label>
            <select value={icpId ?? ""} onChange={(e) => setIcpId(e.target.value ? Number(e.target.value) : null)} className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-300">
              <option value="">— No specific ICP (all industries) —</option>
              {icps.map((icp) => (<option key={icp.id} value={icp.id}>
                  {icp.name} {icp.industries?.length ? `(${icp.industries.slice(0, 2).join(", ")})` : ""}
                </option>))}
            </select>
          </div>

          {/* Daily count */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">
              Leads per Run
            </label>
            <div className="flex gap-2">
              {COUNTS.map((c) => (<button key={c} type="button" onClick={() => setDailyCount(c)} className={cn("flex-1 py-3 rounded-xl text-sm font-bold border transition-all", dailyCount === c
                ? "text-white border-transparent shadow-sm"
                : "border-gray-200 text-gray-500 bg-white hover:border-gray-300")} style={dailyCount === c ? { background: "#1A3D2B" } : {}}>
                  {c}
                  <span className="block text-[10px] font-normal opacity-70">leads</span>
                </button>))}
            </div>
          </div>

          {/* Mysa Leads info banner */}
          {isMysaLeadsMode && (<div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Database className="w-4 h-4 text-teal-700 flex-shrink-0"/>
                <span className="text-xs font-bold text-teal-900">Fetching from Mysa Lead Bank</span>
              </div>
              <p className="text-[11px] text-teal-700 leading-relaxed">
                Leads will be pulled from your private Lead Bank based on the selected ICP. Already-imported leads are automatically skipped to prevent duplicates. Fetched leads will NOT be written back to the Lead Bank.
              </p>
            </div>)}


          {/* Autopilot — hidden in Mysa Leads mode */}
          {!isMysaLeadsMode && <div className={cn("rounded-xl border p-4 transition-all", autopilot ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className={cn("w-4 h-4", autopilot ? "text-green-700" : "text-gray-400")}/>
                <div>
                  <div className="text-xs font-semibold text-gray-900">Daily Automation</div>
                  <div className="text-[11px] text-gray-500">Runs automatically every day at 9:00 AM</div>
                </div>
              </div>
              <button type="button" onClick={() => setAutopilot((p) => !p)} className="text-gray-400">
                {autopilot
                ? <ToggleRight className="w-8 h-8 text-green-600"/>
                : <ToggleLeft className="w-8 h-8 text-gray-400"/>}
              </button>
            </div>
            {config && (<div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3"/>
                  <span>Last run: <span className="text-gray-700 font-medium">{formatDate(config.lastRunAt)}</span></span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3"/>
                  <span>Next run: <span className="text-gray-700 font-medium">{autopilot ? formatDate(config.nextRunAt) : "Off"}</span></span>
                </div>
              </div>)}
          </div>}

          {/* Live feed */}
          {(streaming || streamedLeads.length > 0 || done || errorMsg) && (<div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                {streaming && <Loader2 className="w-3.5 h-3.5 text-green-600 animate-spin"/>}
                {done && <CheckCircle2 className="w-3.5 h-3.5 text-green-600"/>}
                {errorMsg && <AlertCircle className="w-3.5 h-3.5 text-red-500"/>}
                <span className="text-[11px] text-gray-600 font-medium">
                  {statusMsg || (streaming ? "Generating…" : "")}
                </span>
                <span className="ml-auto text-[11px] text-green-700 font-bold">
                  {streamedLeads.length} added
                  {skipped > 0 && <span className="text-gray-400 font-normal"> · {skipped} skipped</span>}
                </span>
              </div>
              <div ref={feedRef} className="max-h-52 overflow-y-auto divide-y divide-gray-50" style={{ scrollbarWidth: "thin" }}>
                {streamedLeads.map((l, i) => (<div key={i} className="flex items-center gap-3 px-4 py-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ background: "#1A3D2B" }}>
                      {l.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-gray-900 truncate">{l.name} · {l.company}</div>
                      <div className="text-[10px] text-gray-400 truncate">{l.email}</div>
                    </div>
                    <div className="text-[10px] text-gray-400 text-right flex-shrink-0">
                      <div>{l.industry}</div>
                      <div>{l.country}</div>
                    </div>
                  </div>))}
                {streaming && streamedLeads.length === 0 && (<div className="px-4 py-6 text-center text-[11px] text-gray-400 flex flex-col items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-green-500"/>
                    Scanning sources…
                  </div>)}
              </div>
              {errorMsg && (<div className="px-4 py-2 bg-red-50 border-t border-red-100 text-[11px] text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3"/> {errorMsg}
                </div>)}
            </div>)}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          {!isMysaLeadsMode && (<button type="button" onClick={saveConfig} disabled={saving || streaming} className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${saveMsg === "saved"
                ? "border-teal-300 bg-teal-50 text-teal-700"
                : saveMsg === "error"
                    ? "border-red-200 bg-red-50 text-red-600"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"} disabled:opacity-50 disabled:cursor-not-allowed`}>
              {saving ? "Saving…" : saveMsg === "saved" ? "✓ Saved!" : saveMsg === "error" ? "✕ Save failed" : autopilot ? "Save & Schedule" : "Save Settings"}
            </button>)}
          <button type="button" onClick={fetchNow} disabled={selectedSources.length === 0} className="flex-1 py-2 text-xs font-bold rounded-lg text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-40" style={{ background: streaming ? "#B91C1C" : isMysaLeadsMode ? "#0F766E" : "#1A3D2B" }}>
            {streaming ? (<><Loader2 className="w-3.5 h-3.5 animate-spin"/> Stop</>) : isMysaLeadsMode ? (<><Database className="w-3.5 h-3.5"/> Import from Bank</>) : (<><Zap className="w-3.5 h-3.5"/> Fetch Now</>)}
          </button>
        </div>
      </div>
    </div>);
}
