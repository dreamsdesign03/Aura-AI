import { useState } from "react";

const DEFAULT_CAL_URL = "https://cal.com/aura-laser-cosmetic-clinic/30min";

export default function CalEmbed({ url = DEFAULT_CAL_URL, height = 700 }) {
  const [loading, setLoading] = useState(true);

  // Format clean embed URL for Cal.com in light mode
  let embedUrl = url;
  if (!embedUrl.includes("embed=true")) {
    embedUrl += embedUrl.includes("?") ? "&embed=true" : "?embed=true";
  }
  if (!embedUrl.includes("theme=")) {
    embedUrl += "&theme=light";
  }

  return (
    <div className="w-full relative bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 z-10 py-20 text-gray-400">
          <div className="w-7 h-7 rounded-full border-2 border-gray-200 border-t-pink-600 animate-spin" />
          <span className="text-xs font-semibold text-gray-600">Loading scheduling calendar…</span>
        </div>
      )}
      <iframe
        src={embedUrl}
        width="100%"
        height={height}
        frameBorder="0"
        onLoad={() => setLoading(false)}
        className="w-full rounded-xl border-0 overflow-hidden bg-white"
        style={{ minHeight: `${height}px`, height: `${height}px`, background: "#ffffff" }}
        title="Booking Calendar"
      />
    </div>
  );
}
