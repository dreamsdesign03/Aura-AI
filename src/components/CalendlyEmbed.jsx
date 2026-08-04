import { useEffect, useRef, useState } from "react";

const CALENDLY_URL = "https://calendly.com/dreamsdesign-in03/aura-meeting";

let widgetPromise = null;
function loadCalendlyWidget() {
    if (window.Calendly) return Promise.resolve(window.Calendly);
    if (widgetPromise) return widgetPromise;
    widgetPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://assets.calendly.com/assets/external/widget.js";
        script.async = true;
        script.onload = () => resolve(window.Calendly);
        script.onerror = reject;
        document.head.appendChild(script);
    });
    return widgetPromise;
}

export default function CalendlyEmbed({ url = CALENDLY_URL, height = 750, prefill = null }) {
    const containerRef = useRef(null);
    const [status, setStatus] = useState("loading");

    useEffect(() => {
        let cancelled = false;
        loadCalendlyWidget()
            .then((Calendly) => {
                if (cancelled || !containerRef.current) return;
                const embedUrl = new URL(url);
                embedUrl.searchParams.set("hide_gdpr_banner", "1");
                if (prefill) {
                    Object.entries(prefill).forEach(([k, v]) => {
                        if (v) embedUrl.searchParams.set(k, v);
                    });
                }
                containerRef.current.innerHTML = "";
                Calendly.initInlineWidget({
                    url: embedUrl.toString(),
                    parentElement: containerRef.current,
                    prefill: prefill || undefined,
                });
                setStatus("ready");
            })
            .catch(() => {
                if (!cancelled) {
                    setStatus("error");
                    containerRef.current.innerHTML = `<div style="padding:40px;text-align:center;font-family:inherit;">
                <p style="font-size:14px;color:#374151;margin-bottom:12px;">Could not load the booking calendar.</p>
                <a href="${CALENDLY_URL}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#A4285E;color:#fff;font-size:13px;font-weight:600;text-decoration:none;">Book on Calendly →</a>
              </div>`;
                }
            });
        return () => { cancelled = true; };
    }, [url, JSON.stringify(prefill)]);

    return (<div className="w-full">
      <style>{`
        .calendly-embed-wrapper .calendly-inline-widget,
        .calendly-embed-wrapper iframe {
          width: 100% !important;
          height: 100% !important;
          min-height: ${height}px !important;
          border: none !important;
          overflow: hidden !important;
        }
      `}</style>
      {status === "loading" && (<div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
          <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-green-700 animate-spin"/>
          <span className="text-xs font-medium">Loading booking calendar…</span>
        </div>)}
      <div ref={containerRef} className="calendly-embed-wrapper" style={{ minHeight: height, height: height, width: "100%", overflow: "hidden" }}/>
    </div>);
}
