import { useState, useEffect } from "react";
import { PhoneOutgoing, Plus, Loader2, RefreshCw, Play, Pause, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BulkCallModal from "@/components/BulkCallModal";
import { format } from "date-fns";

export default function BulkCalling() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const loadCampaigns = async () => {
    try {
      const res = await fetch("/api/omnidim/bulk-call");
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
              <p className="text-xs text-gray-500 mb-4">Select leads from the Contacts page to start a bulk call.</p>
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
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.map(c => (
                  <tr key={c.id} onClick={() => setSelectedId(c.id)} className="hover:bg-gray-50 cursor-pointer transition-colors group">
                    <td className="px-5 py-3 font-medium text-gray-900 group-hover:text-pink-700">{c.name}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {format(new Date(c.created_at), "MMM d, yyyy h:mm a")}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{c.total} leads</td>
                    <td className="px-5 py-3">
                      <span className={\`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider \${
                        c.status === 'running' ? 'bg-green-100 text-green-700' :
                        c.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                        c.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                        c.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }\`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      <BulkCallModal isOpen={showNew} onClose={() => setShowNew(false)} selectedLeads={[]} onComplete={loadCampaigns} />
    </div>
  );
}

function BulkCallDetail({ id, onBack }) {
  const { toast } = useToast();
  const [campaign, setCampaign] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDetail = async () => {
    try {
      const [cRes, rRes] = await Promise.all([
        fetch(\`/api/omnidim/bulk-call/\${id}\`),
        fetch(\`/api/omnidim/bulk-call/\${id}/results\`)
      ]);
      if (cRes.ok) setCampaign(await cRes.json());
      if (rRes.ok) setResults(await rRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
    const i = setInterval(loadDetail, 10000);
    return () => clearInterval(i);
  }, [id]);

  const doAction = async (action) => {
    try {
      const res = await fetch(\`/api/omnidim/bulk-call/\${id}/action\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (!res.ok) throw new Error("Action failed");
      toast({ title: \`Campaign \${action}ed\` });
      loadDetail();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-pink-600" /></div>;
  if (!campaign) return <div className="p-12 text-center text-red-500">Not found</div>;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{campaign.name}</h1>
            <p className="text-[11px] text-gray-500">{format(new Date(campaign.created_at), "PP p")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {campaign.status === 'running' && (
            <button onClick={() => doAction('pause')} className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button onClick={() => doAction('resume')} className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">
              <Play className="w-3.5 h-3.5" /> Resume
            </button>
          )}
          {(campaign.status === 'running' || campaign.status === 'paused' || campaign.status === 'scheduled') && (
            <button onClick={() => doAction('cancel')} className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="text-xs text-gray-500 font-medium mb-1">Status</div>
            <div className="font-bold uppercase tracking-wide text-gray-800">{campaign.status}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="text-xs text-gray-500 font-medium mb-1">Total Leads</div>
            <div className="text-xl font-bold text-gray-800">{campaign.total}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">Call Results</h3>
            <button onClick={loadDetail} className="text-gray-400 hover:text-gray-600"><RefreshCw className="w-4 h-4" /></button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold border-b border-gray-100">
              <tr>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Recording</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {(results?.data || []).map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-900 font-medium">{r.to_number}</td>
                  <td className="px-4 py-2.5">
                    <span className={\`px-2 py-0.5 rounded text-[10px] font-bold uppercase \${
                      r.status === 'completed' ? 'bg-green-100 text-green-700' :
                      r.status === 'no_answer' ? 'bg-amber-100 text-amber-700' :
                      r.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }\`}>
                      {r.status || 'queued'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{r.duration || '-'}</td>
                  <td className="px-4 py-2.5">
                    {r.recording_url ? (
                      <a href={r.recording_url} target="_blank" rel="noreferrer" className="text-pink-600 hover:underline">Listen</a>
                    ) : '-'}
                  </td>
                </tr>
              ))}
              {(!results?.data || results.data.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">No results yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
