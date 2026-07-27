import { useEffect, useState } from "react";
import { Sparkles, Brain, Zap } from "lucide-react";
// ── Shared keyframes injected once ───────────────────────────────────────────
const CSS = `
@keyframes ai-pulse-ring {
  0%   { transform: scale(0.9); opacity: 0.7; }
  50%  { transform: scale(1.15); opacity: 0.2; }
  100% { transform: scale(0.9); opacity: 0.7; }
}
@keyframes ai-sweep {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes ai-slide-up {
  from { transform: translateY(12px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes ai-dot-bounce {
  0%, 80%, 100% { transform: translateY(0);     opacity: 1; }
  40%           { transform: translateY(-6px);  opacity: 0.6; }
}
@keyframes ai-spin-slow {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes ai-glow-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
  50%       { box-shadow: 0 0 0 8px rgba(124,58,237,0); }
}
.ai-sweep-bg {
  background: linear-gradient(270deg, #7C3AED, #6D28D9, #4C1D95, #7C3AED);
  background-size: 300% 300%;
  animation: ai-sweep 3s ease infinite;
}
.ai-dot { animation: ai-dot-bounce 1.2s ease-in-out infinite; }
.ai-dot-1 { animation-delay: 0s; }
.ai-dot-2 { animation-delay: 0.15s; }
.ai-dot-3 { animation-delay: 0.3s; }
.ai-ring  { animation: ai-pulse-ring 1.8s ease-in-out infinite; }
.ai-spin-slow { animation: ai-spin-slow 2.5s linear infinite; }
.ai-slide-up { animation: ai-slide-up 0.25s ease-out both; }
.ai-glow { animation: ai-glow-pulse 1.8s ease-in-out infinite; }
`;
let cssInjected = false;
function injectCss() {
    if (cssInjected || typeof document === "undefined")
        return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    cssInjected = true;
}
// ── Cycling messages helper ───────────────────────────────────────────────────
function useCyclingMessage(messages, intervalMs = 2200) {
    const [idx, setIdx] = useState(0);
    useEffect(() => {
        if (messages.length <= 1)
            return;
        const t = setInterval(() => setIdx(i => (i + 1) % messages.length), intervalMs);
        return () => clearInterval(t);
    }, [messages, intervalMs]);
    return messages[idx] ?? messages[0] ?? "";
}
export function AiBanner({ message, subMessages = [], icon = "sparkles" }) {
    injectCss();
    const sub = useCyclingMessage(subMessages);
    const Icon = icon === "brain" ? Brain : icon === "zap" ? Zap : Sparkles;
    return (<div className="ai-slide-up fixed bottom-5 left-1/2 z-[9999]" style={{ transform: "translateX(-50%)" }}>
      <div className="ai-sweep-bg ai-glow flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl" style={{ minWidth: 280, maxWidth: 480 }}>
        {/* Spinning ring around icon */}
        <div className="relative flex-shrink-0 w-8 h-8 flex items-center justify-center">
          <div className="ai-ring absolute inset-0 rounded-full border-2 border-white/30"/>
          <div className="ai-spin-slow absolute inset-0 rounded-full border-t-2 border-white/70"/>
          <Icon className="w-4 h-4 text-white relative z-10"/>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-white leading-tight">{message}</div>
          {sub && (<div className="text-[11px] text-white/70 truncate mt-0.5 ai-slide-up">{sub}</div>)}
        </div>

        {/* Bouncing dots */}
        <div className="flex gap-1 flex-shrink-0">
          {[1, 2, 3].map(n => (<div key={n} className={`ai-dot ai-dot-${n} w-1.5 h-1.5 rounded-full bg-white/80`}/>))}
        </div>
      </div>
    </div>);
}
export function AiPanelOverlay({ message, subMessages = [], icon = "sparkles" }) {
    injectCss();
    const sub = useCyclingMessage(subMessages);
    const Icon = icon === "brain" ? Brain : icon === "zap" ? Zap : Sparkles;
    return (<div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-lg ai-slide-up" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}>
      {/* Glow orb */}
      <div className="relative flex items-center justify-center w-16 h-16 mb-4">
        <div className="ai-ring absolute inset-0 rounded-full" style={{ border: "2px solid rgba(167,139,250,0.5)" }}/>
        <div className="ai-ring absolute inset-2 rounded-full" style={{ border: "2px solid rgba(124,58,237,0.6)", animationDelay: "0.6s" }}/>
        <div className="ai-spin-slow absolute inset-0 rounded-full" style={{ borderTop: "2px solid #A78BFA", borderRight: "2px solid transparent", borderBottom: "2px solid transparent", borderLeft: "2px solid transparent" }}/>
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7C3AED, #4C1D95)" }}>
          <Icon className="w-5 h-5 text-white"/>
        </div>
      </div>

      <div className="text-[14px] font-bold text-white mb-1">{message}</div>
      {sub && <div className="text-[12px] text-white/60 ai-slide-up">{sub}</div>}

      {/* Dots */}
      <div className="flex gap-1.5 mt-3">
        {[1, 2, 3].map(n => (<div key={n} className={`ai-dot ai-dot-${n} w-2 h-2 rounded-full`} style={{ background: "#A78BFA" }}/>))}
      </div>
    </div>);
}
const DEFAULT_THINKING = [
    "Thinking…",
    "Searching your data…",
    "Analysing leads…",
    "Crafting a response…",
];
export function AiThinkingBubble({ messages = DEFAULT_THINKING }) {
    injectCss();
    const text = useCyclingMessage(messages, 1800);
    return (<div className="flex justify-start mb-3 ai-slide-up">
      {/* Avatar */}
      <div className="w-6 h-6 rounded-full flex-shrink-0 mr-2 flex items-center justify-center mt-0.5 ai-glow" style={{ background: "linear-gradient(135deg,#7C3AED,#4F35A8)" }}>
        <Sparkles className="w-3 h-3 text-white"/>
      </div>

      {/* Bubble */}
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-3" style={{
            background: "linear-gradient(135deg,#1E1A30,#161225)",
            border: "1px solid rgba(124,58,237,0.35)",
            boxShadow: "0 0 14px rgba(124,58,237,0.18)",
            minWidth: 170,
        }}>
        {/* Animated dots */}
        <div className="flex gap-1">
          {[1, 2, 3].map(n => (<div key={n} className={`ai-dot ai-dot-${n} w-2 h-2 rounded-full`} style={{ background: "#A78BFA" }}/>))}
        </div>
        <span className="text-[12px] font-medium ai-slide-up" key={text} style={{ color: "#A78BFA" }}>
          {text}
        </span>
      </div>
    </div>);
}
