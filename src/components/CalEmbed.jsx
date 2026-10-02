import { useState } from "react";

const CAL_URL = "https://cal.com/aura-laser-cosmetic-clinic/30min";

export default function CalEmbed({ url = CAL_URL, height = 750 }) {
  const [loading, setLoading] = useState(true);

  // Format embed URL for Cal.com
  const embedUrl = url.includes("embed=true") 
    ? url 
    : (url.includes("?") ? `${url}&embed=true` : `${url}?embed=true`);

  return (
    <div className="w-full relative">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 z-10 py-20 text-gray-400">
          <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-pink-600 animate-spin" />
          <span className="text-xs font-medium">Loading Cal.com calendar…</span>
        </div>
      )}
      <iframe
        src={embedUrl}
        width="100%"
        height={height}
        frameBorder="0"
        onLoad={() => setLoading(false)}
        className="w-full rounded-xl border-0 overflow-hidden"
        style={{ minHeight: `${height}px`, height: `${height}px` }}
        title="Cal.com Booking Calendar"
      />
    </div>
  );
}
