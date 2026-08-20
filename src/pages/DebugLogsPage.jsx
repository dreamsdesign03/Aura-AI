import React, { useState, useEffect } from "react";

export default function DebugLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function fetchLogs() {
    try {
      const res = await fetch("/api/debug-logs");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      console.error("Failed to fetch debug logs", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  async function clearLogs() {
    try {
      await fetch("/api/debug-logs/clear", { method: "POST" });
      setLogs([]);
    } catch (e) {
      console.error("Failed to clear logs", e);
    }
  }

  const getEventBadgeColor = (eventType) => {
    switch (eventType) {
      case "webhook_received":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "parsed_fields":
        return "bg-purple-100 text-purple-800 border-purple-300";
      case "lead_lookup":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "save_attempt":
      case "outbound_save_attempt":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "save_success":
      case "outbound_save_success":
        return "bg-green-100 text-green-800 border-green-300";
      case "save_error":
      case "outbound_save_error":
        return "bg-red-100 text-red-800 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400">⚡ Server Debug Logs</h1>
            <p className="text-xs text-gray-400 mt-1">Real-time database debug logs from PostgreSQL (`debug_logs` table)</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-700 text-emerald-500 focus:ring-0"
              />
              Auto-refresh (3s)
            </label>
            <button
              onClick={fetchLogs}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs rounded border border-gray-700 transition"
            >
              🔄 Refresh
            </button>
            <button
              onClick={clearLogs}
              className="px-3 py-1.5 bg-red-950/70 hover:bg-red-900 text-red-300 text-xs rounded border border-red-800 transition"
            >
              🗑️ Clear Logs
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">Loading debug logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-center text-gray-500 py-16 border border-dashed border-gray-800 rounded-xl">
            No debug logs captured yet. Send a WhatsApp message to populate logs.
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-bold">#{log.id}</span>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded border ${getEventBadgeColor(log.eventType)}`}>
                      {log.eventType}
                    </span>
                  </div>
                  <span className="text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <pre className="bg-gray-900/80 p-3 rounded text-xs text-emerald-300 overflow-x-auto border border-gray-800/60 leading-relaxed whitespace-pre-wrap break-words">
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
