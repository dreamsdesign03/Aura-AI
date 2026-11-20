import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Shield, Search, RefreshCw, Download, Plus, TrendingUp, TrendingDown, Minus,
  CheckCircle2, AlertTriangle, MapPin, ExternalLink, Globe, Sparkles, X, Check,
  Loader2, ChevronDown, ChevronRight, Bot, Square, PauseCircle, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_COLORS = {
  "Suggested Keywords": "bg-pink-50 text-pink-700 border-pink-200",
  "General Dermatology": "bg-blue-50 text-blue-700 border-blue-200",
  "Acne & Acne Scar": "bg-amber-50 text-amber-700 border-amber-200",
  "Hair Treatment": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Laser Hair Reduction": "bg-rose-50 text-rose-700 border-rose-200",
  "Dermatosurgery": "bg-purple-50 text-purple-700 border-purple-200",
  "Laser Glow": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Vitiligo": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Medifacials": "bg-teal-50 text-teal-700 border-teal-200",
  "Pigmentation": "bg-orange-50 text-orange-700 border-orange-200",
  "Bridal": "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  "Anti Aging": "bg-violet-50 text-violet-700 border-violet-200",
  "Cosmetic Gynecology": "bg-pink-50 text-pink-700 border-pink-200",
  "IV Glutathione": "bg-sky-50 text-sky-700 border-sky-200",
};

// Engine order for AI checks
const ENGINE_ORDER = ["chatgpt", "gemini", "google_ai"];
const ENGINE_SHORT = { chatgpt: "ChatGPT", gemini: "Gemini", google_ai: "AI Overview" };

// Free-tier RPM limits (requests per minute)
const ENGINE_RPM_LIMIT = {
  chatgpt: 30,      // OpenAI free tier ~30 RPM
  gemini: 5,        // Gemini 2.5 Flash free tier ~5 RPM
  google_ai: 10,    // Serper AI Overview ~10 RPM
};

// Regex to detect Aura mentions in AI Overview text
const mentionRe = /aura\s+(laser|skin|cosmetic|clinic)|dr\.?\s*aditya\s*shah|auralaserclinic|skinnonest/i;

const api = async (path, method = "GET", body) => {
  // Strip leading/trailing slashes for root request so it cleanly hits /api/visibility-audit (Vercel rewrite compatible)
  const cleanPath = (!path || path === "/" || path === "") ? "" : (path.startsWith("/") ? path : `/${path}`);
  const fullUrl = `/api/visibility-audit${cleanPath}`;

  console.log(`%c[VisibilityAudit API] 📡 ${method} ${fullUrl}`, "color: #ec4899; font-weight: bold;", body || "");

  try {
    const res = await fetch(fullUrl, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    console.log(`%c[VisibilityAudit API] 📥 Status: ${res.status} for ${fullUrl}`, res.ok ? "color: #10b981;" : "color: #ef4444; font-weight: bold;");

    let json = {};
    try { json = await res.json(); } catch (parseErr) {
      console.warn(`[VisibilityAudit API] ⚠️ Non-JSON response for ${fullUrl}:`, parseErr);
    }

    if (!res.ok || json.success === false) {
      const errMsg = json.error || `Request failed (${res.status})`;
      console.error(`%c[VisibilityAudit API Error] ❌ ${method} ${fullUrl} -> ${errMsg}`, "color: #dc2626; font-weight: bold;", json);
      const e = new Error(errMsg);
      e.code = json.code;
      e.status = res.status;
      throw e;
    }

    console.log(`%c[VisibilityAudit API Success] ✅ ${method} ${fullUrl}:`, "color: #059669;", json);
    return json;
  } catch (err) {
    console.error(`%c[VisibilityAudit Network Error] 💥 ${method} ${fullUrl}:`, "color: #b91c1c; font-weight: bold;", err);
    throw err;
  }
};

const timeAgo = (iso) => {
  if (!iso) return null;
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

const mapsLink = (k, branchLL) =>
  `https://www.google.com/maps/search/${encodeURIComponent(k.keyword)}/${branchLL || ""}`;
const googleLink = (k) =>
  `https://www.google.com/search?q=${encodeURIComponent(k.keyword)}&gl=in&hl=en`;

function RankBadge({ rank, scanned, label }) {
  if (!scanned) return <span className="text-[11px] text-gray-400 font-medium">Not scanned</span>;
  if (!rank) return <span className="text-[11px] text-gray-500 font-semibold" title={label}>Not in top results</span>;
  const cls =
    rank === 1 ? "bg-amber-100 text-amber-900 border-amber-300"
      : rank <= 3 ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : rank <= 10 ? "bg-pink-100 text-pink-800 border-pink-200"
          : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full font-bold text-xs border ${cls}`}>
      {rank === 1 ? "🏆 #1" : `#${rank}`}
    </span>
  );
}

function Movement({ k }) {
  if (!k.source || (k.source === "manual" && !k.previous_rank)) return <span className="text-gray-300">-</span>;
  if (!k.previous_rank) return <span className="text-[11px] font-semibold text-sky-600">New</span>;
  if (k.rank_change > 0) return <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold text-xs"><TrendingUp className="w-3 h-3" /> Up {k.rank_change}</span>;
  if (k.rank_change < 0) return <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold text-xs"><TrendingDown className="w-3 h-3" /> Down {Math.abs(k.rank_change)}</span>;
  return <span className="inline-flex items-center gap-0.5 text-gray-400 font-medium text-xs"><Minus className="w-3 h-3" /> No change</span>;
}

function AiEngineBanner({ engine, message, onDismiss }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">{ENGINE_SHORT[engine] || engine}:</span> {message}
      </div>
      <button onClick={onDismiss} className="p-1 rounded hover:bg-amber-100 text-amber-500 hover:text-amber-700 transition-colors flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ClinicVisibilityAudit() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  // Google scan state
  const [checkingId, setCheckingId] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [liveFeed, setLiveFeed] = useState([]);
  const stopRef = useRef(false);

  // AI scan state
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [aiProgress, setAiProgress] = useState(null);
  const stopAiRef = useRef(false);
  // Track engines that have hit quota/rate limits
  const [disabledEngines, setDisabledEngines] = useState(new Set());
  // Track per-engine banners
  const [engineWarnings, setEngineWarnings] = useState({});

  // UI state
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedBranch, setSelectedBranch] = useState("All");
  const [selectedTier, setSelectedTier] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingVal, setEditingVal] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKw, setNewKw] = useState({ keyword: "", category: "Suggested Keywords", branch: "Alkapuri" });
  const [showAiDetail, setShowAiDetail] = useState(false);
  const explorerRef = useRef(null);

  const loadData = async (silent = false) => {
    console.log("%c[VisibilityAudit] 🔄 Loading audit data from server...", "color: #8b5cf6; font-weight: bold;");
    try {
      const json = await api("");
      console.log("%c[VisibilityAudit] 📊 Audit data loaded successfully:", "color: #10b981; font-weight: bold;", {
        totalKeywords: json.keywords?.length,
        config: json.config,
        summary: json.summary,
        branches: json.branches
      });
      setData(json);
    } catch (err) {
      console.error("%c[VisibilityAudit] ❌ loadData failed:", "color: #ef4444; font-weight: bold;", err);
      if (!silent) toast({ title: "Failed to load audit data", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadData(); }, []);

  const branchLL = useMemo(() => ({
    Alkapuri: "@22.3103,73.1707,14z", Manjalpur: "@22.2677,73.1890,14z", "Waghodia Road": "@22.3086,73.2282,14z",
    "Vasna Bhayli": "@22.2760,73.1400,14z", Surat: "@21.1702,72.8311,13z", Ranchi: "@23.3441,85.3096,13z",
  }), []);

  const keywords = data?.keywords || [];
  const config = data?.config || { google: false, engines: {} };

  const kpi = useMemo(() => {
    const scanned = keywords.filter((k) => k.source);
    const ranked = scanned.filter((k) => k.current_rank);
    return {
      scanned: scanned.length,
      total: keywords.length,
      top3: ranked.filter((k) => k.current_rank <= 3).length,
      avg: ranked.length ? (ranked.reduce((s, k) => s + k.current_rank, 0) / ranked.length).toFixed(1) : null,
      notRanked: scanned.length - ranked.length,
    };
  }, [keywords]);

  const filteredKeywords = useMemo(() => keywords.filter((k) => {
    if (selectedCategory !== "All" && k.category !== selectedCategory) return false;
    if (selectedBranch !== "All" && k.branch !== selectedBranch) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!(k.keyword || "").toLowerCase().includes(q) && !(k.branch || "").toLowerCase().includes(q)) return false;
    }
    if (selectedTier === "top3") return k.current_rank && k.current_rank <= 3;
    if (selectedTier === "top10") return k.current_rank && k.current_rank <= 10;
    if (selectedTier === "needsBoost") return k.source && (!k.current_rank || k.current_rank > 10);
    if (selectedTier === "unscanned") return !k.source;
    return true;
  }), [keywords, selectedCategory, selectedBranch, searchQuery, selectedTier]);

  const categoryList = useMemo(() => ["All", ...Object.keys(data?.categories || {})], [data]);
  const branchList = useMemo(() => (data?.branches || []).map((b) => b.name), [data]);

  const patchKeyword = (row) =>
    setData((prev) => ({ ...prev, keywords: prev.keywords.map((k) => (k.id === row.id ? { ...k, ...row } : k)) }));

  // ── Single keyword LIVE check ──────────────────────────────────────────────
  const checkOne = async (item) => {
    console.log(`%c[VisibilityAudit] 🔍 Checking keyword live: "${item.keyword}" (${item.branch})`, "color: #3b82f6;");
    const json = await api("/check-keyword", "POST", { id: item.id });
    console.log(`%c[VisibilityAudit] 🎯 Check result for "${item.keyword}":`, "color: #10b981;", {
      maps_rank: json.keyword?.maps_rank,
      organic_rank: json.keyword?.organic_rank,
      rating: json.keyword?.rating,
      reviews: json.keyword?.reviews,
      matched_name: json.keyword?.matched_name
    });
    patchKeyword(json.keyword);
    setFlashId(item.id);
    setTimeout(() => setFlashId((f) => (f === item.id ? null : f)), 1800);
    setLiveFeed((f) => [{ ...json.keyword, at: Date.now() }, ...f.filter((x) => x.id !== item.id)].slice(0, 30));
    return json.keyword;
  };

  const handleCheckKeyword = async (item) => {
    console.log(`%c[VisibilityAudit] Clicked Check Live for: "${item.keyword}"`, "color: #6366f1; font-weight: bold;");
    setCheckingId(item.id);
    setExpandedId(item.id);
    try {
      const k = await checkOne(item);
      toast({
        title: k.maps_rank ? `Maps rank #${k.maps_rank}` : "Not in Google Maps results",
        description: `"${item.keyword}" · Google organic: ${k.organic_rank ? `#${k.organic_rank}` : `not in top ${config.serpDepth || 30}`}`,
      });
    } catch (err) {
      console.error(`%c[VisibilityAudit] Check failed for "${item.keyword}":`, "color: #ef4444;", err);
      toast({ title: err.code === "NOT_CONFIGURED" ? "Live check not configured" : "Check failed", description: err.message, variant: "destructive" });
    } finally {
      setCheckingId(null);
    }
  };

  // ── Scan all (sequential, row-by-row live) ─────────────────────────────────
  const handleScanAll = async () => {
    if (isScanning) {
      console.log("%c[VisibilityAudit] ⏸️ User paused live scan", "color: #f59e0b; font-weight: bold;");
      stopRef.current = true;
      return;
    }
    if (!config.google) {
      console.warn("[VisibilityAudit] ⚠️ Google scan attempted but SERPER_API_KEY is not configured.");
      toast({ title: "Live Google check is OFF", description: "Add SERPER_API_KEY in the server environment, then redeploy.", variant: "destructive" });
      return;
    }
    const list = filteredKeywords.length ? filteredKeywords : keywords;
    if (!list.length) return;
    console.log(`%c[VisibilityAudit] 🚀 Starting live scan for ${list.length} keywords...`, "color: #ec4899; font-weight: bold;");
    stopRef.current = false;
    setIsScanning(true);
    setLiveFeed([]);
    explorerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    let done = 0, failed = 0, consecutive = 0, fatal = null;
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) {
        console.log("%c[VisibilityAudit] Scan cancelled by user.", "color: #f59e0b;");
        break;
      }
      const item = list[i];
      console.log(`[VisibilityAudit] Progress [${i + 1}/${list.length}]: "${item.keyword}"`);
      setCheckingId(item.id);
      setScanProgress({ current: i + 1, total: list.length, keyword: item.keyword });
      try {
        await checkOne(item);
        done++; consecutive = 0;
      } catch (e) {
        console.error(`[VisibilityAudit] Scan error on "${item.keyword}":`, e);
        failed++; consecutive++;
        if (e.code === "NOT_CONFIGURED") { fatal = e.message; break; }
        if (e.code === "RATE_LIMITED") { fatal = "Serper rate limit hit. Please wait before retrying."; break; }
        if (consecutive >= 3) { fatal = `3 checks failed in a row - ${e.message}`; break; }
      }
      if ((i + 1) % 5 === 0) loadData(true);
    }
    setCheckingId(null); setIsScanning(false); setScanProgress(null);
    await loadData(true);
    console.log(`%c[VisibilityAudit] 🏁 Scan finished. Done: ${done}, Failed: ${failed}`, "color: #10b981; font-weight: bold;");
    toast({
      title: fatal ? "Scan stopped" : stopRef.current ? "Scan paused" : "Scan complete",
      description: fatal || `Checked ${done} of ${list.length} keywords live on Google${failed ? ` · ${failed} failed` : ""}.`,
      variant: fatal ? "destructive" : undefined,
    });
  };

  // ── AI visibility scan (sequential per engine, respects RPM limits) ─────────────────────────────────────
  const handleAiScan = async () => {
    if (isAiScanning) {
      console.log("%c[VisibilityAudit] ⏸️ User paused AI scan", "color: #f59e0b; font-weight: bold;");
      stopAiRef.current = true;
      return;
    }
    const availableEngines = ENGINE_ORDER.filter((e) => config.engines?.[e]?.configured && !disabledEngines.has(e));
    if (!availableEngines.length) {
      console.warn("[VisibilityAudit] ⚠️ AI scan attempted but no engine configured or all disabled.");
      toast({ title: "No AI engine available", description: "All configured engines have hit quota limits. Check back later or add credits.", variant: "destructive" });
      return;
    }
    const tasks = [];
    for (const q of data.aiQuestions) for (const e of availableEngines) tasks.push({ q, e });
    console.log(`%c[VisibilityAudit] 🤖 Starting AI scan for ${tasks.length} checks across [${availableEngines.join(", ")}]...`, "color: #8b5cf6; font-weight: bold;");
    stopAiRef.current = false;
    setIsAiScanning(true);
    setShowAiDetail(true);
    let idx = 0, done = 0, failed = 0;
    let lastRequestTime = 0;

    // Sequential worker - ONE at a time, with per-engine rate limiting
    const worker = async () => {
      while (!stopAiRef.current) {
        const i = idx++;
        if (i >= tasks.length) return;
        const { q, e } = tasks[i];
        console.log(`[VisibilityAudit AI] Querying ${ENGINE_SHORT[e]} for: "${q.question}"`);
        setAiProgress({ current: Math.min(done + failed + 1, tasks.length), total: tasks.length, text: `${ENGINE_SHORT[e]} · ${q.question}` });

        // Per-engine rate limiting
        const rpm = ENGINE_RPM_LIMIT[e] || 10;
        const minInterval = 60000 / rpm; // ms between requests
        const now = Date.now();
        const wait = Math.max(0, minInterval - (now - lastRequestTime));
        if (wait > 0) {
          console.log(`[VisibilityAudit AI] ⏳ Rate limiting ${ENGINE_SHORT[e]}: waiting ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
        }
        lastRequestTime = Date.now();

        try {
          const r = await api("/ai/check", "POST", { engine: e, questionId: q.id });
          console.log(`[VisibilityAudit AI Result] ${ENGINE_SHORT[e]}:`, { answered: r.answered, mentioned: r.mentioned, competitors: r.competitors });
          done++;
          setData((prev) => ({
            ...prev,
            aiQuestions: prev.aiQuestions.map((x) => x.id === q.id ? {
              ...x, results: { ...x.results, [e]: { answered: r.answered, mentioned: r.mentioned, position: r.position, snippet: r.snippet, competitors: r.competitors, checkedAt: new Date().toISOString() } },
            } : x),
          }));
        } catch (err) {
          console.error(`[VisibilityAudit AI Error] ${ENGINE_SHORT[e]} on "${q.question}":`, err);
          failed++;
          // If quota/credits exhausted, disable this engine for the rest of this scan
          if (err.code === 'INSUFFICIENT_CREDITS' || err.code === 'RATE_LIMITED') {
            console.warn(`[VisibilityAudit AI] 🚫 Disabling ${ENGINE_SHORT[e]} for this session: ${err.message}`);
            setDisabledEngines(prev => new Set([...prev, e]));
            setEngineWarnings(prev => ({
              ...prev,
              [e]: err.code === 'INSUFFICIENT_CREDITS'
                ? `${ENGINE_SHORT[e]}: daily quota / credits exhausted. Add billing credits or wait for reset.`
                : `${ENGINE_SHORT[e]}: rate limited. Please wait before retrying.`
            }));
            // Skip remaining tasks for this engine
            while (idx < tasks.length && tasks[idx].e === e) idx++;
          }
        }
      }
    };

    await worker();
    setIsAiScanning(false); setAiProgress(null);
    await loadData(true);
    console.log(`%c[VisibilityAudit] 🏁 AI scan completed. Answers checked: ${done}, Failed: ${failed}`, "color: #8b5cf6; font-weight: bold;");
    const msg = stopAiRef.current ? "AI scan paused" : failed ? `AI scan complete · ${done} checked, ${failed} failed` : `AI scan complete · ${done} answers checked`;
    toast({ title: stopAiRef.current ? "AI scan paused" : "AI scan complete", description: msg, variant: failed && !stopAiRef.current ? "destructive" : undefined });
  };

  const handleSaveRank = async (id) => {
    const n = parseInt(editingVal, 10);
    console.log(`%c[VisibilityAudit] ✏️ Setting manual rank for id ${id} -> #${n}`, "color: #f59e0b; font-weight: bold;");
    setEditingId(null);
    if (!n || n < 1 || n > 100) return;
    try {
      const json = await api("/update-rank", "POST", { id, currentRank: n });
      patchKeyword(json.keyword);
      toast({ title: "Rank set manually", description: `Marked as #${n} (manual). Use Scan now to get the live value.` });
    } catch (e) {
      console.error("[VisibilityAudit] Manual rank update failed:", e);
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  };

  const handleAddKeyword = async (e) => {
    e.preventDefault();
    if (!newKw.keyword.trim()) return;
    try {
      const json = await api("/add-keyword", "POST", newKw);
      toast({
        title: "Keyword added",
        description: json.live ? `Live result: ${json.item.maps_rank ? `Maps #${json.item.maps_rank}` : "not in Maps results"}` : (json.checkError || "Added - scan it to get a live rank."),
      });
      setNewKw({ keyword: "", category: "Suggested Keywords", branch: "Alkapuri" });
      setShowAddModal(false);
      await loadData(true);
    } catch (err) { toast({ title: "Failed to add", description: err.message, variant: "destructive" }); }
  };

  const handleToggleFix = async (fixId) => {
    try {
      const json = await api("/toggle-fix", "POST", { fixId });
      setData((prev) => ({ ...prev, summary: { ...prev.summary, openFixes: prev.summary.openFixes.map((f) => ({ ...f, done: json.done.includes(f.id) })) } }));
    } catch (e) { console.error(e); }
  };

  const handleExportCSV = () => {
    const head = ["Keyword", "Category", "Branch", "Maps Rank", "Organic Rank", "Previous Best", "Movement", "Rating", "Reviews", "Last Checked", "Source"];
    const rows = filteredKeywords.map((k) => [
      `"${k.keyword}"`, `"${k.category}"`, `"${k.branch}"`, k.maps_rank ?? (k.source ? "Not ranked" : "Not scanned"), k.organic_rank ?? (k.source ? "Not ranked" : "Not scanned"),
      k.previous_rank ?? "", k.rank_change ?? 0, k.rating ?? "", k.reviews ?? "", k.last_checked_at || "", k.source || "",
    ]);
    const csv = "data:text/csv;charset=utf-8," + [head.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const a = document.createElement("a");
    a.href = encodeURI(csv);
    a.download = `Aura_Visibility_Audit_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (loading || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
          <p className="text-sm font-medium text-gray-600">Loading Visibility Audit…</p>
        </div>
      </div>
    );
  }

  const { summary } = data;
  const activeBranchNames = new Set([
    ...(data.keywords || []).map((item) => item.branch).filter(Boolean),
    ...(data.aiQuestions || []).map((item) => item.branch).filter(Boolean),
  ]);
  const branchScores = (summary.branchScores || []).filter((branch) => activeBranchNames.has(branch.branch));
  const engines = (summary.aiVisibility || []).filter((e) => e.id !== "perplexity");
  const lastScan = timeAgo(summary.lastAuditAt);
  const unconfigured = [
    !config.google && "Google rank (SERPER_API_KEY)",
    !config.aiOverviewConfigured && "Google AI Overview ranking (SERPAPI_API_KEY)",
    ...ENGINE_ORDER.filter((e) => e !== "google_ai" && !config.engines?.[e]?.configured).map((e) => `${ENGINE_SHORT[e]} (${config.engines?.[e]?.env})`),
  ].filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto">
      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-[#F3D9E5] bg-white/95 backdrop-blur-md px-6 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-[#CB3273] border border-[#F3D9E5] shadow-xs"><Shield className="h-4 w-4" /></span>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Visibility Audit</h1>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              How patients find each branch on Google, Maps and AI search · {lastScan ? <>last live scan <b>{lastScan}</b></> : <b>no live scan yet - click Scan All Live</b>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleExportCSV} className="co-btn co-btn-sm">
              <Download className="w-3.5 h-3.5" /> Export Report
            </button>
            <button onClick={() => setShowAddModal(true)} className="co-btn co-btn-sm">
              <Plus className="w-3.5 h-3.5" /> Add Keyword
            </button>
            <button onClick={handleAiScan} className={`co-btn co-btn-sm ${isAiScanning ? "animate-pulse" : ""}`} style={{ color: '#7C3AED', borderColor: '#DDD6FE', background: '#F5F3FF' }}>
              {isAiScanning ? <Square className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              {isAiScanning ? `AI scan ${aiProgress?.current || 0}/${aiProgress?.total || 0} (Stop)` : "Scan AI Visibility"}
            </button>
            <button onClick={handleScanAll} className={`co-btn co-btn-primary co-btn-sm ${isScanning ? "animate-pulse" : ""}`}>
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
              {isScanning ? `Scanning ${scanProgress?.current || 0}/${scanProgress?.total || 0} (Pause)` : "⚡ Scan All Live (One by One)"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 w-full">
        {/* ── CONFIG WARNING ─────────────────────────────────────────────── */}
        {unconfigured.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900">
              <b>Not connected yet:</b> {unconfigured.join(" · ")}. Rankings are never guessed - these stay “Not scanned” until the API key is added on the server.
            </div>
          </div>
        )}

        {/* ── ENGINE QUOTA WARNINGS ───────────────────────────────────────── */}
        {Object.keys(engineWarnings).length > 0 && (
          <div className="space-y-2">
            {Object.entries(engineWarnings).map(([engine, message]) => (
              <AiEngineBanner key={engine} engine={engine} message={message} onDismiss={() => setEngineWarnings(prev => { const n = {...prev}; delete n[engine]; return n; })} />
            ))}
          </div>
        )}

        {/* ── LIVE SCAN RESULTS ──────────────────────────────────────────── */}
        {(isScanning || liveFeed.length > 0) && (
          <div className="bg-white rounded-xl border border-pink-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-pink-50 to-rose-50 border-b border-pink-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
                  {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">
                    {isScanning ? <>Live checking on Google: <span className="text-pink-600">“{scanProgress?.keyword}”</span></> : `Last scan: ${liveFeed.length} keyword results`}
                  </p>
                  {isScanning && scanProgress && (
                    <div className="w-64 bg-pink-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div className="bg-pink-600 h-1.5 rounded-full transition-all" style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }} />
                    </div>
                  )}
                </div>
              </div>
              {isScanning && <button onClick={handleScanAll} className="px-3 py-1.5 rounded-lg border border-pink-300 bg-white text-xs font-bold text-pink-700 hover:bg-pink-100">Pause</button>}
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
              {liveFeed.map((k) => (
                <div key={`${k.id}-${k.at}`} className="px-5 py-2 flex items-center gap-3 text-xs">
                  <span className="font-semibold text-gray-900 flex-1 min-w-0 truncate">{k.keyword}</span>
                  <span className="text-gray-500 w-28 truncate">{k.branch}</span>
                  <span className="flex items-center gap-1 w-28"><span className="text-[10px] text-gray-400">Maps</span><RankBadge rank={k.maps_rank} scanned /></span>
                  <span className="flex items-center gap-1 w-32"><span className="text-[10px] text-gray-400">Organic</span><RankBadge rank={k.organic_rank} scanned /></span>
                  <span className="w-20 text-right"><Movement k={k} /></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── KPI CARDS ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 border border-[#F3D9E5] shadow-xs hover:shadow-md transition-all">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Network visibility score</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">{summary.networkVisibilityScore ?? "-"}</span>
              {summary.networkVisibilityScore !== null && <span className="text-xs font-semibold text-gray-400">/ 100</span>}
            </div>
            <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-[#A4285E] to-[#CB3273] h-1.5 rounded-full transition-all" style={{ width: `${summary.networkVisibilityScore || 0}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-gray-400">60% Maps rank · 25% AI mentions · 15% rating</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-[#F3D9E5] shadow-xs hover:shadow-md transition-all">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Top 3 on Google Maps</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#CB3273]">{kpi.scanned ? kpi.top3 : "-"}</span>
              <span className="text-xs font-medium text-gray-500">of {kpi.scanned} scanned</span>
            </div>
            <p className="mt-3 text-xs text-gray-500">{kpi.notRanked ? `${kpi.notRanked} scanned keyword(s) not in Maps results` : "Live Local Pack / Maps position"}</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-[#F3D9E5] shadow-xs hover:shadow-md transition-all">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Average rank, scanned searches</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">{kpi.avg ?? "-"}</span>
            </div>
            <p className="mt-3 text-xs text-gray-500">Only keywords where Aura actually ranks</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-[#F3D9E5] shadow-xs hover:shadow-md transition-all">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI answers that mention Aura</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-purple-700">{summary.aiMentions ?? "-"}</span>
            </div>
            <p className="mt-3 text-xs text-gray-500">{summary.aiAnswered ? "Based on completed AI engine answers" : "No completed AI scans yet"}</p>
          </div>
        </div>

        {/* ── BRANCH SCORECARD + AI + FIXES ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white rounded-xl border border-[#F3D9E5] p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Branch scorecard</h2>
                <p className="text-xs text-gray-500">Computed from live scans only · click a branch to filter keywords</p>
              </div>
              <span className="text-xs font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full">{branchScores.length} branches</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 font-semibold">
                    <th className="py-2.5 px-3">Branch</th>
                    <th className="py-2.5 px-3 w-40">Score</th>
                    <th className="py-2.5 px-3 text-center">Rating</th>
                    <th className="py-2.5 px-3 text-center">Avg rank</th>
                    <th className="py-2.5 px-3 text-center">Top 3</th>
                    <th className="py-2.5 px-3 text-center">AI answers</th>
                    <th className="py-2.5 px-3 text-center">Scanned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {branchScores.map((b) => (
                    <tr key={b.branch} onClick={() => { setSelectedBranch(b.branch); explorerRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="hover:bg-gray-50/70 cursor-pointer">
                      <td className="py-3 px-3 font-bold text-gray-900"><span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-pink-600" />{b.branch}</span></td>
                      <td className="py-3 px-3">
                        {b.score === null ? <span className="text-gray-400">Not scanned</span> : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden"><div className={`h-2 rounded-full ${b.score >= 75 ? "bg-emerald-600" : b.score >= 50 ? "bg-pink-600" : "bg-rose-500"}`} style={{ width: `${b.score}%` }} /></div>
                            <span className="font-bold text-gray-900 w-6 text-right">{b.score}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-amber-600">{b.rating ? <>★ {b.rating}<span className="text-[10px] font-medium text-gray-400"> ({b.reviews})</span></> : <span className="text-gray-300 font-normal">-</span>}</td>
                      <td className="py-3 px-3 text-center font-bold text-gray-900">{b.avgRank ? `#${b.avgRank}` : <span className="text-gray-300 font-normal">-</span>}</td>
                      <td className="py-3 px-3 text-center text-gray-700">{b.scanned ? b.top3 : "-"}</td>
                      <td className="py-3 px-3 text-center text-gray-700">{b.aiAnswers || "-"}</td>
                      <td className="py-3 px-3 text-center text-gray-500">{b.scanned}/{b.keywords}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Fix list</h2>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">Generated from your latest scan results</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {summary.openFixes.length === 0 && <p className="text-xs text-gray-400">Nothing to fix yet - run a scan.</p>}
                {summary.openFixes.map((fix) => (
                  <div key={fix.id} onClick={() => handleToggleFix(fix.id)} className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer ${fix.done ? "bg-gray-50 border-gray-200 opacity-60" : "bg-pink-50/40 border-pink-100 hover:bg-pink-50"}`}>
                    <input type="checkbox" checked={fix.done} onChange={() => { }} className="mt-0.5 h-3.5 w-3.5 rounded text-pink-600" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium text-gray-800 ${fix.done ? "line-through text-gray-400" : ""}`}>{fix.title}</p>
                      <span className={`text-[10px] font-semibold ${fix.impact === "High" ? "text-rose-600" : "text-amber-600"}`}>{fix.impact}</span>
                      <span className="text-[10px] text-gray-400"> · {fix.branch}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── AI ANSWERS BY QUESTION ─────────────────────────────────────── */}
        {showAiDetail && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Bot className="w-4 h-4 text-purple-600" /> AI answers by question</h2>
                <p className="text-xs text-gray-500">✓ = Aura mentioned (#n = position in the AI's list) · ✗ = not mentioned · - = not asked yet</p>
              </div>
              {isAiScanning && aiProgress && <span className="text-xs text-purple-700 font-semibold truncate max-w-xs">Asking: {aiProgress.text}</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                    <th className="py-2.5 px-4">Patient question</th>
                    <th className="py-2.5 px-4">Branch</th>
                    {ENGINE_ORDER.map((e) => <th key={e} className="py-2.5 px-3 text-center">{ENGINE_SHORT[e]}</th>)}
                    <th className="py-2.5 px-4">Who the AI recommended instead</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.aiQuestions.map((q) => {
                    const others = [...new Set(ENGINE_ORDER.flatMap((e) => q.results?.[e]?.competitors || []))].slice(0, 4);
                    return (
                      <tr key={q.id} className="hover:bg-gray-50/70">
                        <td className="py-2.5 px-4 font-medium text-gray-900">{q.question}</td>
                        <td className="py-2.5 px-4 text-gray-500">{q.branch || "All"}</td>
                        {ENGINE_ORDER.map((e) => {
                          const r = q.results?.[e];
                          const disabled = disabledEngines.has(e);
                          return (
                            <td key={e} className="py-2.5 px-3 text-center" title={r?.snippet || ""}>
                              {disabled ? (
                                <span className="text-[10px] text-amber-600 font-semibold" title="Quota/rate limit reached">⛔</span>
                              ) : !r ? (
                                <span className="text-gray-300">-</span>
                              ) : !r.answered ? (
                                <span className="text-[10px] text-gray-400">no overview</span>
                              ) : r.mentioned ? (
                                <span className="font-bold text-emerald-600">✓{r.position ? ` #${r.position}` : ""}</span>
                              ) : (
                                <span className="font-bold text-rose-500">✗</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-4 text-gray-500">{others.join(", ") || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── KEYWORD RANKINGS EXPLORER ──────────────────────────────────── */}
        <div ref={explorerRef} className="bg-white rounded-xl border border-[#F3D9E5] shadow-xs overflow-hidden scroll-mt-24">
          <div className="p-5 border-b border-[#F3D9E5]">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#CB3273]" /> Local search rankings ({filteredKeywords.length} of {keywords.length})
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Google Maps position is checked from each branch's area · Organic is the normal Google result in that city. Click a row for the full result.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#CB3273]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search keywords…"
                    className="pl-8 pr-3 py-1.5 text-xs rounded-10px border border-[#F3D9E5] focus:outline-none focus:ring-2 focus:ring-[#CB3273]/20 focus:border-[#CB3273] w-48 transition-all"
                  />
                  {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-2 text-gray-400"><X className="w-3 h-3" /></button>}
                </div>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-10px border border-[#F3D9E5] bg-white font-semibold text-gray-700 outline-none focus:border-[#CB3273]"
                >
                  <option value="All">All branches</option>
                  {branchList.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-10px border border-[#F3D9E5] bg-white font-semibold text-gray-700 outline-none focus:border-[#CB3273]"
                >
                  <option value="All">All positions</option>
                  <option value="top3">Top 3 (Map Pack)</option>
                  <option value="top10">Top 10</option>
                  <option value="needsBoost">Needs boost (&gt;10 / not ranking)</option>
                  <option value="unscanned">Not scanned yet</option>
                </select>
                <button
                  onClick={handleScanAll}
                  className={`co-btn co-btn-sm ${isScanning ? "animate-pulse" : ""}`}
                  style={{ color: '#A4285E', borderColor: '#F3D9E5', background: '#FDF2F8' }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
                  {isScanning ? "Pause scan" : `Scan ${filteredKeywords.length === keywords.length ? "all" : `these ${filteredKeywords.length}`} live`}
                </button>
              </div>
            </div>

            {/* Consistent Aura Pill Tabs for Categories */}
            <div className="mt-4 co-pill-tabs">
              {categoryList.map((cat) => {
                const sel = selectedCategory === cat;
                const count = cat === "All" ? keywords.length : data.categories[cat] || 0;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`co-pill-tab ${sel ? "active" : ""}`}
                  >
                    <span>{cat}</span>
                    <span className="co-pill-badge">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                  <th className="py-3 px-4">Search keyword</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4 text-center">Google Maps</th>
                  <th className="py-3 px-4 text-center">Google organic</th>
                  <th className="py-3 px-4 text-center">AI Overview</th>
                  <th className="py-3 px-4 text-center">Since last scan</th>
                  <th className="py-3 px-4">Checked</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredKeywords.length === 0 && <tr><td colSpan="7" className="text-center py-8 text-gray-500 font-medium">No keywords match the current filters.</td></tr>}
                {filteredKeywords.map((item) => {
                  const isChecking = checkingId === item.id;
                  const open = expandedId === item.id;
                  const scanned = !!item.source;
                  return (
                    <React.Fragment key={item.id}>
                      <tr onClick={() => setExpandedId(open ? null : item.id)} className={`cursor-pointer transition-colors ${flashId === item.id ? "bg-emerald-50" : "hover:bg-gray-50/70"} ${isChecking ? "bg-pink-50/60" : ""}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-semibold text-gray-900">
                            {open ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                            {item.keyword}
                          </div>
                          <span className={`ml-4 mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${CATEGORY_COLORS[item.category] || "bg-gray-50 text-gray-700 border-gray-200"}`}>{item.category}</span>
                        </td>
                        <td className="py-3 px-4 text-gray-600 font-medium">{item.branch}</td>
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          {isChecking ? <Loader2 className="w-4 h-4 animate-spin text-pink-600 inline" /> : editingId === item.id ? (
                            <div className="inline-flex items-center gap-1">
                              <input type="number" min="1" max="100" autoFocus value={editingVal} onChange={(e) => setEditingVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSaveRank(item.id); if (e.key === "Escape") setEditingId(null); }} className="w-12 px-1 py-0.5 text-center text-xs font-bold border border-pink-400 rounded" />
                              <button onClick={() => handleSaveRank(item.id)} className="p-1 text-emerald-700"><Check className="w-3 h-3" /></button>
                              <button onClick={() => setEditingId(null)} className="p-1 text-rose-700"><X className="w-3 h-3" /></button>
                            </div>
                          ) : (
                            <span onDoubleClick={() => { setEditingId(item.id); setEditingVal(item.maps_rank || ""); }} title="Double-click to set manually">
                              <RankBadge rank={item.maps_rank ?? (item.source === "manual" ? item.current_rank : null)} scanned={scanned} label="Aura not found in Google Maps results" />
                              {item.source === "manual" && <span className="ml-1 text-[9px] font-bold text-gray-400 uppercase">manual</span>}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">{isChecking ? <Loader2 className="w-4 h-4 animate-spin text-pink-600 inline" /> : <RankBadge rank={item.organic_rank} scanned={item.source === "serper"} label={`Not in Google top ${config.serpDepth || 30}`} />}</td>
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          {isChecking ? (
                            <Loader2 className="w-4 h-4 animate-spin text-purple-600 inline" />
                          ) : (() => {
                            const ai = item.ai_overview_data;
                            if (!config.aiOverviewConfigured) return <span title="Add SERPAPI_API_KEY to the server environment and redeploy" className="text-[10px] text-amber-600">Not configured</span>;
                            if (!ai) return <span className="text-[10px] text-gray-400">-</span>;
                            if (!ai.present) return <span className="text-[10px] text-gray-400">No AI Overview</span>;
                            if (ai.rank) return <span title={ai.rankType === "citation_position" ? "Position in Google AI Overview citations" : "Position in Google AI Overview answer"} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">#{ai.rank}</span>;
                            if (ai.mentioned) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">Mentioned</span>;
                            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-300">Not mentioned</span>;
                          })()}
                        </td>
                        <td className="py-3 px-4 text-center"><Movement k={item} /></td>
                        <td className="py-3 px-4 text-gray-500">
                          {item.last_error ? <span className="text-rose-600 font-medium" title={item.last_error}>failed</span> : timeAgo(item.last_checked_at) || "-"}
                        </td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5">
                            <a href={mapsLink(item, branchLL[item.branch])} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 hover:bg-blue-50 text-blue-700 font-medium" title="Verify on Google Maps"><MapPin className="w-3 h-3" />Maps</a>
                            <a href={googleLink(item)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 hover:bg-blue-50 text-blue-700 font-medium" title="Verify on Google Search"><ExternalLink className="w-3 h-3" />Google</a>
                            <button onClick={() => handleCheckKeyword(item)} disabled={isChecking || isScanning} className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-pink-200 bg-pink-50 hover:bg-pink-100 text-pink-700 font-semibold disabled:opacity-50">
                              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin" : ""}`} />{isChecking ? "Checking…" : "Scan now"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50/60">
                          <td colSpan="8" className="px-6 py-4">
                            {!scanned ? (
                              <p className="text-xs text-gray-500">Not scanned yet. Click <b>Scan now</b> to fetch the live Google Maps and organic position.</p>
                            ) : (
                              <div className="grid md:grid-cols-4 gap-4 text-xs">
                                <div>
                                  <p className="font-bold text-gray-700 mb-1.5">Top Google Maps results (from {item.branch})</p>
                                  {(item.top_results || []).length === 0 && <p className="text-gray-400">No data</p>}
                                  {(item.top_results || []).map((r) => (
                                    <div key={r.position} className={`flex items-center gap-2 py-1 ${r.aura ? "font-bold text-pink-700" : "text-gray-600"}`}>
                                      <span className="w-5 text-gray-400">#{r.position}</span><span className="flex-1 truncate">{r.title}</span>
                                      {r.rating && <span className="text-amber-600">★{r.rating}</span>}
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-700 mb-1.5">Aura listing found</p>
                                  {item.matched_name ? (
                                    <>
                                      <p className="text-gray-800 font-medium">{item.matched_name}</p>
                                      <p className="text-gray-500">{item.matched_address}</p>
                                      <p className="text-amber-600 font-semibold mt-1">{item.rating ? `★ ${item.rating}` : ""} {item.reviews ? <span className="text-gray-400 font-normal">({item.reviews} reviews)</span> : null}</p>
                                      {item.branch_exact === false && <p className="mt-1 text-amber-700 font-medium">Showing another Aura branch - {item.branch} listing not in results.</p>}
                                    </>
                                  ) : <p className="text-gray-500">Aura did not appear in the Google Maps results for this search.</p>}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-700 mb-1.5">Organic result</p>
                                  {item.ranked_url ? (
                                    <>
                                      <p className="text-gray-800 truncate">{item.ranked_url}</p>
                                      <p className="text-gray-500">Rank #{item.organic_rank}</p>
                                    </>
                                  ) : <p className="text-gray-500">No organic result in top {config.serpDepth || 30}.</p>}
                                  {item.localPackRank && (
                                    <p className="mt-1 text-pink-600 font-semibold">Also in Local Pack at #${item.localPackRank}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><Bot className="w-3.5 h-3.5 text-purple-600" /> AI Overview</p>
                                  {(() => {
                                    const ai = item.ai_overview_data;
                                    if (!ai) return <p className="text-gray-500">Run a live scan to fetch AI Overview data.</p>;
                                    if (!ai.present) return <p className="text-gray-500">No AI Overview shown for this search.</p>;
                                    return (
                                      <>
                                        {ai.rank && <p className="mb-1.5 inline-flex items-center gap-1.5"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Ranked #{ai.rank}</span></p>}
                                        {!ai.rank && ai.mentioned && <p className="mb-1.5 inline-flex items-center gap-1.5"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">Mentioned</span></p>}
                                        {!ai.rank && !ai.mentioned && <p className="mb-1.5 inline-flex items-center gap-1.5"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-300">Not mentioned</span></p>}
                                        {ai.snippet && <p className="text-gray-600 mb-2 line-clamp-3">{ai.snippet}</p>}
                                        {ai.items.length > 0 && (
                                          <div className="space-y-1 max-h-40 overflow-y-auto">
                                            <p className="text-[10px] font-semibold text-gray-500 mb-1">Clinics listed:</p>
                                            {ai.items.map((entry, idx) => (
                                              <div key={idx} className={`flex items-center gap-2 py-1 px-2 rounded text-[10px] ${entry.title && mentionRe.test(entry.title) ? "bg-emerald-50 border border-emerald-200 font-bold text-emerald-800" : "text-gray-600"}`}>
                                                <span className="w-4 text-gray-400">#{idx + 1}</span>
                                                <span className="flex-1 truncate">{entry.title || entry.snippet || 'Unnamed'}</span>
                                                {entry.link && <a href={entry.link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-purple-600 hover:underline" title={entry.link}><ExternalLink className="w-3 h-3" /></a>}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {Array.isArray(ai.references) && ai.references.length > 0 && (
                                          <div className="mt-2 space-y-1">
                                            <p className="text-[10px] font-semibold text-gray-500 mb-1">Sources:</p>
                                            {ai.references.slice(0, 5).map((ref, idx) => {
                                              const sourceUrl = typeof ref === "string" ? ref : (ref?.url || ref?.link || "");
                                              const sourceTitle = typeof ref === "string" ? ref : (ref?.title || ref?.snippet || sourceUrl);
                                              if (!sourceUrl) return null;
                                              return (
                                                <a key={sourceUrl || idx} href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-600 hover:underline truncate block" title={sourceTitle}>
                                                  {sourceTitle || sourceUrl}
                                                  {ref && typeof ref === "object" && Number.isFinite(Number(ref.position)) && <span className="ml-1 text-gray-400">· Citation #{Number(ref.position)}</span>}
                                                </a>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── ADD KEYWORD MODAL ──────────────────────────────────────────── */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAddModal(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Add Keyword</h3>
              <form onSubmit={handleAddKeyword} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Keyword *</label>
                  <input type="text" value={newKw.keyword} onChange={(e) => setNewKw({...newKw, keyword: e.target.value})} placeholder="e.g. best dermatologist in Vadodara" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Category</label>
                    <select value={newKw.category} onChange={(e) => setNewKw({...newKw, category: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500">
                      {Object.keys(CATEGORY_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Branch</label>
                    <select value={newKw.branch} onChange={(e) => setNewKw({...newKw, branch: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500">
                      {branchList.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                  <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-pink-600 rounded-lg hover:bg-pink-700">Add & Scan</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
