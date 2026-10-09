import { useState, useEffect } from "react";
import { PhoneOutgoing, Plus, Loader2, RefreshCw, Play, Pause, XCircle, Search, Download, ChevronRight, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BulkCallModal from "@/components/BulkCallModal";
import { format } from "date-fns";
import * as XLSX from "xlsx-js-style";

export default function BulkCalling() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const loadCampaigns = async () => {
    try {
      const res = await fetch("/api/bulk-calling");
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
    const id = setInterval(loadCampaigns, 10000);
    return () => clearInterval(id);
  }, []);

  if (selectedId) {
    return <BulkCallDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-shrink-0 px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <PhoneOutgoing className="w-5 h-5 text-pink-600" />
            Bulk AI Calling
          </h1>
          <p className="text-xs text-gray-500 mt-1">Manage and track Omnidim AI voice campaigns</p>
        </div>
        <button 
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl shadow-sm transition-all"
          style={{ background: "#CB3273" }}
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-16 text-center">
              <PhoneOutgoing className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <h3 className="text-gray-900 font-bold mb-1">No campaigns yet</h3>
              <p className="text-xs text-gray-500 mb-4">Click New Campaign to upload a list.</p>
              <button onClick={() => setShowNew(true)} className="text-sm font-medium text-pink-600 hover:text-pink-700">
                Create Campaign →
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
                <tr>
                  <th className="px-5 py-3">Campaign Name</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Total Calls</th>
                  <th className="px-5 py-3">Booked</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.map(c => (
                  <tr key={c.id} onClick={() => setSelectedId(c.id)} className="hover:bg-gray-50 cursor-pointer transition-colors group">
                    <td className="px-5 py-3 font-bold text-gray-900 group-hover:text-pink-700">{c.name}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {format(new Date(c.created_at), "MMM d, yyyy h:mm a")}
                    </td>
                    <td className="px-5 py-3 font-semibold text-gray-700">{c.total}</td>
                    <td className="px-5 py-3 font-bold text-green-600">{c.booked_count || 0}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                        c.status === 'running' ? 'bg-green-100 text-green-700' :
                        c.status === 'paused_hours' ? 'bg-amber-100 text-amber-700' :
                        c.status === 'waiting' ? 'bg-blue-100 text-blue-700' :
                        c.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                        c.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {c.enabled ? (c.status === 'draft' || c.status === 'stopped' ? 'starting' : c.status) : (c.status === 'running' ? 'stopped' : c.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                       <div className="flex items-center gap-3">
                           {c.enabled ? <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> : <div className="w-2 h-2 rounded-full bg-gray-300" />}
                           <div className="text-xs font-semibold text-gray-500">{c.enabled ? 'ON' : 'OFF'}</div>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      <BulkCallModal isOpen={showNew} onClose={() => setShowNew(false)} onComplete={loadCampaigns} />
    </div>
  );
}

function BulkCallDetail({ id, onBack }) {
  const { toast } = useToast();
  const [campaign, setCampaign] = useState(null);
  const [stats, setStats] = useState({});
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  
  const [drawerContact, setDrawerContact] = useState(null);
  const [attempts, setAttempts] = useState([]);
  
  const [showConfirm, setShowConfirm] = useState(false);

  const loadDetail = async () => {
    try {
      const [cRes, contRes] = await Promise.all([
        fetch(`/api/bulk-calling/${id}`),
        fetch(`/api/bulk-calling/${id}/contacts`)
      ]);
      if (cRes.ok) {
        const data = await cRes.json();
        setCampaign(data.campaign);
        setStats(data.stats || {});
      }
      if (contRes.ok) {
        setContacts(await contRes.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
    const i = setInterval(loadDetail, 5000);
    return () => clearInterval(i);
  }, [id]);

  useEffect(() => {
    if (drawerContact) {
      fetch(`/api/bulk-calling/${campaign.id}/contacts/${drawerContact.id}/attempts`)
        .then(r => r.json())
        .then(setAttempts)
        .catch(console.error);
    }
  }, [drawerContact, campaign?.id]);
  
  // Tick endpoint - let frontend poll tick while it's ON just in case cron doesn't run locally
  useEffect(() => {
      let interval;
      if (campaign && campaign.enabled && campaign.status !== 'completed') {
          interval = setInterval(() => {
              fetch(`/api/bulk-calling/tick`, { method: "POST" }).catch(()=>null);
          }, 8000);
      }
      return () => clearInterval(interval);
  }, [campaign?.enabled, campaign?.status]);

  const toggleCampaign = async (enabled) => {
    if (enabled) {
       setShowConfirm(true);
       return;
    }
    
    // Disable
    try {
      const res = await fetch(`/api/bulk-calling/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false })
      });
      if (!res.ok) throw new Error("Toggle failed");
      toast({ title: `Campaign Paused` });
      loadDetail();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };
  
  const confirmStart = async () => {
      setShowConfirm(false);
      try {
        const res = await fetch(`/api/bulk-calling/${id}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true })
        });
        if (!res.ok) throw new Error("Toggle failed");
        toast({ title: `Campaign Started!` });
        // Kick off first tick
        fetch(`/api/bulk-calling/tick`, { method: "POST" }).catch(()=>null);
        loadDetail();
      } catch (err) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
  };

  const exportCsv = () => {
    const ws = XLSX.utils.json_to_sheet(contacts.map(c => ({
      ID: c.id,
      Name: c.name,
      Company: c.company,
      Phone: c.phone10,
      Email: c.email,
      Status: c.status,
      Attempts: c.attempts,
      "Last Summary": c.last_summary,
      "Last Sentiment": c.last_sentiment,
      "Booked At": c.booked_datetime_text,
      "Recording": c.recording_url
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, `${campaign.name.replace(/\\s/g,'_')}_Results.xlsx`);
  };

  if (loading) return <div className="p-12 flex justify-center h-full items-center"><Loader2 className="w-8 h-8 animate-spin text-pink-600" /></div>;
  if (!campaign) return <div className="p-12 text-center text-red-500">Not found</div>;

  const total = campaign.total;
  const pending = stats.pending || 0;
  const called = total - pending;
  
  const progressPct = total > 0 ? (called / total) * 100 : 0;
  
  const filteredContacts = contacts.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (search && !(c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone10?.includes(search) || c.company?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {campaign.name}
              {campaign.enabled && <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse ml-2" />}
            </h1>
            <p className="text-[11px] text-gray-500 flex items-center gap-2">
              {format(new Date(campaign.created_at), "PP p")} 
              <span>•</span>
              <span className="font-semibold text-pink-700">{campaign.enabled ? 'AI CALLING ON' : 'AI CALLING OFF'}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="text-xs font-bold text-gray-500">
            {campaign.status === 'running' && campaign.enabled ? 'Calling in progress...' : 
             campaign.status === 'paused_hours' ? 'Paused (Outside calling hours)' :
             campaign.status === 'completed' ? 'Campaign Completed!' :
             campaign.status === 'waiting' ? 'Waiting for retry...' :
             campaign.error_message ? <span className="text-red-500">Error: {campaign.error_message}</span> :
             'Stopped'}
          </div>
          
          <button 
             onClick={() => toggleCampaign(!campaign.enabled)}
             disabled={campaign.status === 'completed'}
             className={`px-6 py-2.5 rounded-xl font-bold shadow-sm transition-all ${
                 campaign.status === 'completed' ? 'bg-gray-200 text-gray-500 cursor-not-allowed' :
                 campaign.enabled ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 
                 'bg-pink-600 text-white hover:bg-pink-700'
             }`}
          >
             {campaign.enabled ? 'Pause Calling' : 'Start Calling'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        
        {/* Conf modal */}
        {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Start Campaign?</h3>
                    <p className="text-sm text-gray-600 mb-6">
                        {pending} contacts will be called one by one by Riya (AI).<br/><br/>
                        Calling hours: 10:00 AM - 7:30 PM IST.
                    </p>
                    <div className="flex gap-3">
                        <button onClick={()=>setShowConfirm(false)} className="flex-1 py-2 font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                        <button onClick={confirmStart} className="flex-1 py-2 font-bold bg-pink-600 text-white hover:bg-pink-700 rounded-lg shadow-sm">Start Calling</button>
                    </div>
                </div>
            </div>
        )}

        {/* Progress */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
           <div className="flex items-center justify-between mb-4">
               <h3 className="font-bold text-gray-800">Overall Progress</h3>
               <div className="text-sm font-semibold text-pink-600">{called} / {total} Called ({Math.round(progressPct)}%)</div>
           </div>
           <div className="w-full bg-pink-100 rounded-full h-3 overflow-hidden">
               <div className="bg-pink-600 h-full rounded-full transition-all duration-1000" style={{ width: `${progressPct}%` }} />
           </div>
           
           <div className="grid grid-cols-6 gap-4 mt-8">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <div className="text-xs font-semibold text-blue-600 uppercase mb-1">Pending</div>
                  <div className="text-2xl font-bold text-blue-900">{pending}</div>
              </div>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <div className="text-xs font-semibold text-amber-600 uppercase mb-1">Calling Now</div>
                  <div className="text-2xl font-bold text-amber-900">{stats.calling || 0}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                  <div className="text-xs font-semibold text-green-600 uppercase mb-1">Booked!</div>
                  <div className="text-2xl font-bold text-green-900">{stats.booked || 0}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Not Booked</div>
                  <div className="text-2xl font-bold text-gray-800">{stats.not_booked || 0}</div>
              </div>
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                  <div className="text-xs font-semibold text-orange-600 uppercase mb-1">No Answer</div>
                  <div className="text-2xl font-bold text-orange-900">{stats.no_answer || 0}</div>
              </div>
              <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                  <div className="text-xs font-semibold text-red-600 uppercase mb-1">Failed/Invalid</div>
                  <div className="text-2xl font-bold text-red-900">{(stats.failed || 0) + (stats.invalid || 0)}</div>
              </div>
           </div>
        </div>

        {/* Contacts Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[500px]">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-4">
             <div className="flex gap-2">
                 {['all', 'pending', 'calling', 'booked', 'not_booked', 'no_answer', 'failed'].map(s => (
                     <button key={s} onClick={()=>setFilterStatus(s)} className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase transition-colors ${filterStatus === s ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
                         {s}
                     </button>
                 ))}
             </div>
             <div className="flex gap-3 items-center">
                <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                       type="text" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
                       className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-1 focus:ring-pink-400 outline-none w-64"
                    />
                </div>
                <button onClick={exportCsv} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600" title="Export CSV">
                    <Download className="w-4 h-4" />
                </button>
             </div>
          </div>
          
          <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white text-xs uppercase tracking-wider text-gray-500 font-semibold border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-5 py-3">Contact</th>
                    <th className="px-5 py-3">Phone</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Attempts</th>
                    <th className="px-5 py-3">Last Result</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {filteredContacts.map((c, i) => (
                    <tr key={i} onClick={()=>setDrawerContact(c)} className="hover:bg-blue-50/50 cursor-pointer transition-colors">
                      <td className="px-5 py-3">
                          <div className="font-bold text-gray-900">{c.name || 'Unknown'}</div>
                          {c.company && <div className="text-gray-500 text-[10px]">{c.company}</div>}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-600">{c.phone10}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          c.status === 'booked' ? 'bg-green-100 text-green-700' :
                          c.status === 'calling' ? 'bg-amber-100 text-amber-700 animate-pulse' :
                          c.status === 'no_answer' ? 'bg-orange-100 text-orange-700' :
                          c.status === 'failed' || c.status === 'invalid' ? 'bg-red-100 text-red-700' :
                          c.status === 'not_booked' ? 'bg-gray-200 text-gray-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {c.status}
                        </span>
                        {c.status === 'no_answer' && c.next_attempt_at && (
                           <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                               <Clock className="w-3 h-3" /> Retry at {format(new Date(c.next_attempt_at), "HH:mm")}
                           </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500 font-semibold text-center">{c.attempts} / {campaign.max_attempts}</td>
                      <td className="px-5 py-3">
                          <div className="max-w-[200px] truncate text-gray-600" title={c.last_summary}>{c.last_summary || '-'}</div>
                          {c.booked_datetime_text && <div className="text-green-600 font-bold mt-1 text-[10px]">Booked: {c.booked_datetime_text}</div>}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-400">
                          <ChevronRight className="w-4 h-4 ml-auto" />
                      </td>
                    </tr>
                  ))}
                  {filteredContacts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-gray-400 font-medium">No contacts match your filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
          </div>
        </div>
      </div>
      
      {/* DRAWER */}
      {drawerContact && (
         <div className="absolute top-0 right-0 bottom-0 w-96 bg-white shadow-2xl border-l border-gray-200 z-40 flex flex-col animate-in slide-in-from-right duration-200">
             <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                 <div>
                     <h3 className="font-bold text-gray-900">{drawerContact.name}</h3>
                     <p className="text-xs text-gray-500">{drawerContact.phone10}</p>
                 </div>
                 <button onClick={()=>setDrawerContact(null)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500"><XCircle className="w-5 h-5" /></button>
             </div>
             
             <div className="flex-1 overflow-auto p-5 space-y-6 bg-gray-50/30">
                 <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Attempt History</h4>
                 {attempts.length === 0 ? (
                     <div className="text-sm text-gray-400 text-center py-8">No calls placed yet.</div>
                 ) : (
                     <div className="space-y-4">
                         {attempts.map(a => (
                             <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative">
                                 <div className="absolute -left-2 -top-2 w-5 h-5 bg-pink-100 text-pink-700 rounded-full flex items-center justify-center text-[10px] font-bold">
                                     {a.attempt_no}
                                 </div>
                                 <div className="flex justify-between items-start mb-2">
                                     <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${a.call_status==='completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                         {a.call_status}
                                     </span>
                                     <span className="text-[10px] text-gray-400">{format(new Date(a.started_at), "MMM d, HH:mm")}</span>
                                 </div>
                                 <div className="text-xs font-bold text-gray-800 mb-1">Outcome: <span className="text-pink-600">{a.outcome}</span></div>
                                 <div className="text-[11px] text-gray-600 italic border-l-2 border-gray-200 pl-2 my-2">{a.summary || 'No summary provided.'}</div>
                                 {a.recording_url && (
                                     <div className="mt-3">
                                         <a href={a.recording_url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-pink-600 flex items-center gap-1 hover:underline">
                                             <Play className="w-3 h-3" /> Listen to Call
                                         </a>
                                     </div>
                                 )}
                             </div>
                         ))}
                     </div>
                 )}
             </div>
         </div>
      )}
      
    </div>
  );
}
