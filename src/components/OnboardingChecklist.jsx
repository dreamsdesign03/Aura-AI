import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X, Sparkles } from "lucide-react";
import { useAuthUser, useUpdateUser } from "@/contexts/AuthContext";
const STEPS = [
    {
        key: "audit",
        label: "Run your first Brand Audit",
        description: "Analyse a prospect's website for quick wins",
        href: "/audit",
        emoji: "🔍",
    },
    {
        key: "lead",
        label: "Add your first Lead",
        description: "Drop a contact into your pipeline",
        href: "/leads",
        emoji: "👤",
    },
    {
        key: "outreach",
        label: "Generate an Outreach email",
        description: "Let AI write a personalised cold email",
        href: "/outreach",
        emoji: "✉️",
    },
];
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
async function patchStep(step, done) {
    await fetch("/api/onboarding/steps", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ step, done }),
    });
}
export default function OnboardingChecklist() {
    const user = useAuthUser();
    const updateUser = useUpdateUser();
    const [collapsed, setCollapsed] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    if (!user)
        return null;
    const steps = user.onboardingSteps ?? {};
    const createdAt = user.createdAt ? new Date(user.createdAt) : null;
    const withinWindow = createdAt ? Date.now() - createdAt.getTime() < SEVEN_DAYS_MS : true;
    const allDone = STEPS.every(s => steps[s.key]);
    if (dismissed)
        return null;
    if (!withinWindow)
        return null;
    if (allDone)
        return null;
    const doneCount = STEPS.filter(s => steps[s.key]).length;
    const pct = Math.round((doneCount / STEPS.length) * 100);
    async function handleTick(key) {
        if (steps[key])
            return;
        const next = { ...steps, [key]: true };
        updateUser({ onboardingSteps: next });
        await patchStep(key, true);
    }
    function handleDismiss() {
        setDismissed(true);
    }
    return (<div className="rounded-xl overflow-hidden" style={{ border: "1px solid #F3C9DB", background: "#FFF7FB" }}>
      <button onClick={() => setCollapsed(c => !c)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left" style={{ background: "linear-gradient(135deg, #FBE9F1 0%, #FBE9F1 100%)" }}>
        <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#CB3273" }}/>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold" style={{ color: "#A4285E" }}>
            Getting started
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#F3C9DB" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#CB3273,#A855F7)" }}/>
            </div>
            <span className="text-[9px] font-bold flex-shrink-0" style={{ color: "#CB3273" }}>
              {doneCount}/{STEPS.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {collapsed
            ? <ChevronDown className="w-3 h-3" style={{ color: "#CB3273" }}/>
            : <ChevronUp className="w-3 h-3" style={{ color: "#CB3273" }}/>}
          <button onClick={e => { e.stopPropagation(); handleDismiss(); }} className="w-4 h-4 flex items-center justify-center rounded-full transition-colors" style={{ background: "rgba(203,50,115,0.12)" }} title="Dismiss">
            <X className="w-2.5 h-2.5" style={{ color: "#CB3273" }}/>
          </button>
        </div>
      </button>

      {!collapsed && (<div className="px-2 py-2 space-y-1">
          {STEPS.map(step => {
                const done = !!steps[step.key];
                return (<div key={step.key} className="flex items-center gap-2">
                <button onClick={() => handleTick(step.key)} className="flex-shrink-0 transition-all" title={done ? "Completed" : "Mark as done"}>
                  {done
                        ? <CheckCircle2 className="w-4 h-4" style={{ color: "#CB3273" }}/>
                        : <Circle className="w-4 h-4" style={{ color: "#F3C9DB" }}/>}
                </button>
                <Link href={step.href} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer" onMouseEnter={e => { e.currentTarget.style.background = "#FBE9F1"; }} onMouseLeave={e => { e.currentTarget.style.background = ""; }}>
                    <span className="text-[12px] flex-shrink-0">{step.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold truncate" style={{ color: done ? "#E58BB5" : "#3B1FA8", textDecoration: done ? "line-through" : "none" }}>
                        {step.label}
                      </div>
                      <div className="text-[10px] truncate" style={{ color: "#9CA3AF" }}>
                        {step.description}
                      </div>
                    </div>
                  </div>
                </Link>
              </div>);
            })}
        </div>)}
    </div>);
}
