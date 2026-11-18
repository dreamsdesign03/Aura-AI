import React, { useState, useEffect, useMemo } from "react";
import { 
  Shield, 
  Search, 
  RefreshCw, 
  Download, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  CheckCircle2, 
  AlertTriangle, 
  MapPin, 
  ExternalLink, 
  Globe, 
  Sparkles, 
  Bot, 
  BarChart3, 
  Check, 
  X,
  Loader2
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
  "IV Glutathione": "bg-sky-50 text-sky-700 border-sky-200"
};

export default function ClinicVisibilityAudit() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [runningAudit, setRunningAudit] = useState(false);
  const [checkingKeywordId, setCheckingKeywordId] = useState(null);
  const [data, setData] = useState({
    summary: {
      networkVisibilityScore: 79,
      gmbCompletePct: 94,
      avgRank: "3.2",
      aiMentions: "11 of 20",
      top3Count: 0,
      top10Count: 0,
      totalKeywords: 0,
      branchScores: [],
      aiVisibility: [],
      openFixes: []
    },
    categories: {},
    keywords: []
  });

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedRankTier, setSelectedRankTier] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKw, setNewKw] = useState({ keyword: "", category: "Suggested Keywords", branch: "Alkapuri" });

  const loadData = async () => {
    try {
      const res = await fetch("/api/visibility-audit");
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Failed to load audit data",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Run full audit
  const handleRunAudit = async () => {
    setRunningAudit(true);
    toast({
      title: "Running Visibility Audit...",
      description: "Querying Google SERPs and calculating rank positions across all keywords."
    });

    try {
      const res = await fetch("/api/visibility-audit/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selectedCategory })
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: "Audit Complete!",
          description: json.message || "All Google rankings have been updated."
        });
        await loadData();
      } else {
        throw new Error(json.error || "Failed to run audit");
      }
    } catch (err) {
      toast({
        title: "Audit Error",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setRunningAudit(false);
    }
  };

  // Check single keyword live
  const handleCheckKeyword = async (id, keyword) => {
    setCheckingKeywordId(id);
    try {
      const res = await fetch("/api/visibility-audit/check-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: `Rank Checked: #${json.currentRank}`,
          description: `"${keyword}" is ranking at Position #${json.currentRank} on Google.`
        });
        await loadData();
      }
    } catch (err) {
      toast({
        title: "Check failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setCheckingKeywordId(null);
    }
  };

  // Add keyword
  const handleAddKeyword = async (e) => {
    e.preventDefault();
    if (!newKw.keyword.trim()) return;

    try {
      const res = await fetch("/api/visibility-audit/add-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newKw)
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: "Keyword Added",
          description: `"${newKw.keyword}" added and ranked at #${json.item.current_rank}`
        });
        setNewKw({ keyword: "", category: "Suggested Keywords", branch: "Alkapuri" });
        setShowAddModal(false);
        await loadData();
      }
    } catch (err) {
      toast({
        title: "Failed to add",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Toggle fix
  const handleToggleFix = async (fixId) => {
    try {
      const res = await fetch("/api/visibility-audit/toggle-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixId })
      });
      const json = await res.json();
      if (json.success) {
        setData(prev => ({
          ...prev,
          summary: { ...prev.summary, openFixes: json.fixes }
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ["Keyword", "Category", "Target City", "Branch", "Google Rank", "Previous Rank", "Movement", "Target URL"];
    const rows = filteredKeywords.map(k => [
      `"${k.keyword}"`,
      `"${k.category}"`,
      `"${k.target_city || 'Vadodara'}"`,
      `"${k.branch || 'Alkapuri'}"`,
      k.current_rank || "N/A",
      k.previous_rank || "N/A",
      k.rank_change > 0 ? `+${k.rank_change}` : k.rank_change,
      `"${k.ranked_url || 'https://auralaserclinic.com'}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Aura_Clinic_Keyword_Rankings_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtering
  const filteredKeywords = useMemo(() => {
    return (data.keywords || []).filter(k => {
      // Category filter
      if (selectedCategory !== "All" && k.category !== selectedCategory) return false;
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const kwMatch = (k.keyword || "").toLowerCase().includes(q);
        const brMatch = (k.branch || "").toLowerCase().includes(q);
        if (!kwMatch && !brMatch) return false;
      }
      // Rank tier filter
      if (selectedRankTier === "top3") return k.current_rank && k.current_rank <= 3;
      if (selectedRankTier === "top10") return k.current_rank && k.current_rank <= 10;
      if (selectedRankTier === "needsBoost") return !k.current_rank || k.current_rank > 10;

      return true;
    });
  }, [data.keywords, selectedCategory, searchQuery, selectedRankTier]);

  const categoryList = useMemo(() => {
    return ["All", ...Object.keys(data.categories || {})];
  }, [data.categories]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
          <p className="text-sm font-medium text-gray-600">Loading Visibility Audit & Keyword Rankings…</p>
        </div>
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto">
      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur-md px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-100 text-pink-700">
                <Shield className="h-4 w-4" />
              </span>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Visibility Audit & Keyword Rankings</h1>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Live Google Search & Maps rankings for <b>Aura Laser & Cosmetic Clinic</b> across Vadodara & Gujarat branches.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Keyword
            </button>

            <button
              onClick={handleRunAudit}
              disabled={runningAudit}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-pink-600 to-rose-600 text-xs font-bold text-white shadow-sm hover:from-pink-700 hover:to-rose-700 disabled:opacity-60 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${runningAudit ? "animate-spin" : ""}`} />
              {runningAudit ? "Auditing SERPs…" : "Run Audit Now"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* ── 4 KPI CARDS ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Network Visibility</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">{summary.networkVisibilityScore}</span>
              <span className="text-xs font-semibold text-gray-400">/ 100</span>
              <span className="ml-auto inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                <TrendingUp className="w-3 h-3" /> +3%
              </span>
            </div>
            <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-pink-500 to-rose-500 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${summary.networkVisibilityScore}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Top 3 Google Rankings</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-pink-600">{summary.top3Count}</span>
              <span className="text-xs font-medium text-gray-500">of {summary.totalKeywords} keywords</span>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Rank #1–#3 on Google Maps Local Pack
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Average Google Rank</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">{summary.avgRank}</span>
              <span className="text-xs font-semibold text-emerald-600">#1 Clinic In Vadodara</span>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Across all dermatology & laser searches
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Search Visibility</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-purple-700">{summary.aiMentions}</span>
              <span className="text-xs font-medium text-purple-600">Prompts Mention Aura</span>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              ChatGPT, Perplexity & Gemini Search
            </p>
          </div>
        </div>

        {/* ── BRANCH SCORECARD & AI SEARCH ENGINES ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Branch Scorecard (8 cols) */}
          <div className="lg:col-span-8 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Branch Visibility Scorecard</h2>
                <p className="text-xs text-gray-500">Google Business Profiles & local ranking strength</p>
              </div>
              <span className="text-xs font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full">6 Branches Active</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 font-semibold">
                    <th className="py-2.5 px-3">Branch</th>
                    <th className="py-2.5 px-3 w-44">Score</th>
                    <th className="py-2.5 px-3 text-center">Profile</th>
                    <th className="py-2.5 px-3 text-center">Rating</th>
                    <th className="py-2.5 px-3 text-center">Avg Rank</th>
                    <th className="py-2.5 px-3 text-center">AI Answers</th>
                    <th className="py-2.5 px-3 text-center">Fixes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(summary.branchScores || []).map((b, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-3 font-bold text-gray-900 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-pink-600" />
                        {b.branch}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-2 rounded-full ${b.score >= 80 ? 'bg-emerald-600' : 'bg-pink-600'}`} 
                              style={{ width: `${b.score}%` }} 
                            />
                          </div>
                          <span className="font-bold text-gray-900 w-6 text-right">{b.score}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-medium text-gray-600">{b.profile}%</td>
                      <td className="py-3 px-3 text-center font-bold text-amber-600">★ {b.rating}</td>
                      <td className="py-3 px-3 text-center font-bold text-gray-900">#{b.avgRank}</td>
                      <td className="py-3 px-3 text-center font-medium text-gray-600">{b.aiAnswers}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700">
                          {b.fixes} open
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Search Visibility & Open Fixes (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* AI Search Engines */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                AI Search Visibility
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">20 targeted patient queries sent to LLMs</p>
              
              <div className="space-y-3">
                {(summary.aiVisibility || []).map((ai, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-gray-700">{ai.engine}</span>
                      <span className="font-bold text-purple-700">{ai.score}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-purple-600 h-1.5 rounded-full" style={{ width: `${ai.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Open Actionable Fixes */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Actionable SEO Fixes
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">Resolve to improve your Google ranking</p>

              <div className="space-y-2">
                {(summary.openFixes || []).map((fix) => (
                  <div 
                    key={fix.id} 
                    onClick={() => handleToggleFix(fix.id)}
                    className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-all ${
                      fix.done ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-pink-50/40 border-pink-100 hover:bg-pink-50'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={fix.done} 
                      onChange={() => {}}
                      className="mt-0.5 h-3.5 w-3.5 rounded text-pink-600 cursor-pointer" 
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium text-gray-800 ${fix.done ? 'line-through text-gray-400' : ''}`}>
                        {fix.title}
                      </p>
                      <span className="text-[10px] text-gray-500 font-semibold">{fix.branch}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── KEYWORD RANKINGS EXPLORER (CORE USER REQUEST) ──────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-pink-600" />
                  Keyword Rankings Explorer ({filteredKeywords.length} of {data.keywords.length})
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Actual Google Search & Google Maps ranking positions in Vadodara for all services.
                </p>
              </div>

              {/* Search & Rank Tier Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search keywords or branch…"
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-pink-500 w-52"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={selectedRankTier}
                  onChange={(e) => setSelectedRankTier(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white font-medium text-gray-700 focus:outline-none"
                >
                  <option value="All">All Positions</option>
                  <option value="top3">Top 3 Only (🏆 Map Pack)</option>
                  <option value="top10">Top 10 (Page 1)</option>
                  <option value="needsBoost">Rank &gt; 10 (Needs Boost)</option>
                </select>
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categoryList.map((cat) => {
                const isSelected = selectedCategory === cat;
                const count = cat === "All" ? data.keywords.length : (data.categories[cat] || 0);
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-pink-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1 rounded-full ${isSelected ? "bg-pink-700 text-white" : "bg-gray-200 text-gray-600"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                  <th className="py-3 px-4">Search Keyword</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4 text-center">Google Position</th>
                  <th className="py-3 px-4 text-center">Movement</th>
                  <th className="py-3 px-4">SERP Features</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredKeywords.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-8 text-gray-500 font-medium">
                      No keywords matching the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredKeywords.map((item) => {
                    const badgeClass = CATEGORY_COLORS[item.category] || "bg-gray-50 text-gray-700 border-gray-200";
                    const isTop3 = item.current_rank && item.current_rank <= 3;
                    const isTop10 = item.current_rank && item.current_rank <= 10;
                    const isChecking = checkingKeywordId === item.id;

                    return (
                      <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-gray-900">
                          {item.keyword}
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badgeClass}`}>
                            {item.category}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-gray-600 font-medium">
                          {item.branch || "Alkapuri"}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full font-bold text-xs ${
                            isTop3 
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                              : isTop10 
                              ? "bg-pink-100 text-pink-800 border border-pink-200" 
                              : "bg-gray-100 text-gray-700"
                          }`}>
                            #{item.current_rank || "20+"}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          {item.rank_change > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold text-xs">
                              <TrendingUp className="w-3 h-3" /> Up {item.rank_change}
                            </span>
                          ) : item.rank_change < 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold text-xs">
                              <TrendingDown className="w-3 h-3" /> Down {Math.abs(item.rank_change)}
                            </span>
                          ) : (
                            <span className="text-gray-400 font-medium text-xs flex items-center justify-center gap-0.5">
                              <Minus className="w-3 h-3" /> No change
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-medium">
                              Maps Pack
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-medium">
                              Organic
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleCheckKeyword(item.id, item.keyword)}
                            disabled={isChecking}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-gray-200 hover:border-pink-300 hover:bg-pink-50 text-gray-700 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${isChecking ? "animate-spin text-pink-600" : ""}`} />
                            {isChecking ? "Checking…" : "Check Live"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── ADD KEYWORD MODAL ────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-base">Add Keyword for Tracking</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddKeyword} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Search Keyword
                </label>
                <input
                  type="text"
                  required
                  value={newKw.keyword}
                  onChange={(e) => setNewKw({ ...newKw, keyword: e.target.value })}
                  placeholder="e.g. Skin specialist in Vadodara near me"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-pink-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Category
                </label>
                <select
                  value={newKw.category}
                  onChange={(e) => setNewKw({ ...newKw, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  {Object.keys(CATEGORY_COLORS).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Target Branch
                </label>
                <select
                  value={newKw.branch}
                  onChange={(e) => setNewKw({ ...newKw, branch: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value="Alkapuri">Alkapuri</option>
                  <option value="Manjalpur">Manjalpur</option>
                  <option value="Waghodia Road">Waghodia Road</option>
                  <option value="Vasna Bhayli">Vasna Bhayli</option>
                  <option value="Surat">Surat</option>
                  <option value="Ranchi">Ranchi</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-pink-600 text-xs font-bold text-white hover:bg-pink-700 shadow-sm"
                >
                  Add &amp; Check Rank
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

