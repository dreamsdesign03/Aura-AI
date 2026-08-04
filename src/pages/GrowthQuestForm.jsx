import { useState, useEffect, useRef, useCallback } from "react";
const BLANK = {
    name: "", contact: { email: "", phone: "", city: "" },
    company: { name: "", industry: "", website: "" },
    role: "", goal: "", services: [], stage: "",
    budget: "", timeline: "", tried: "", decider: "", extra: "",
};
const INDUSTRIES = [
    "Healthcare & Wellness", "E-Commerce & Retail", "Education & EdTech",
    "Real Estate & Construction", "Finance & Insurance", "Hospitality & Travel",
    "Technology & SaaS", "Food & Beverage", "Manufacturing",
    "Professional Services", "Non-Profit / NGO", "Other",
];
const SVCS = [
    { i: "📱", l: "Social Media Marketing" }, { i: "🔍", l: "SEO / Search Marketing" },
    { i: "💻", l: "Website Design & Dev" }, { i: "🎨", l: "Branding & Identity" },
    { i: "📣", l: "Paid Ads (Google/Meta)" }, { i: "🤖", l: "AI & Automation" },
    { i: "🎬", l: "Video Production" }, { i: "📧", l: "Email & WhatsApp Mktg" },
    { i: "🏥", l: "Healthcare Marketing" }, { i: "📦", l: "Product Packaging Design" },
    { i: "✍️", l: "Content Marketing" }, { i: "📍", l: "Local SEO / GMB" },
];
const STEPS = [
    { id: "name", type: "name", ql: "QUEST 01 — THE HERO", reward: 50, title: "What shall we call you, <g>Hero?</g>", hint: "Every legendary brand story begins with a name. What is yours?" },
    { id: "contact", type: "contact", ql: "QUEST 02 — YOUR SIGNAL", reward: 80, title: "How do we <g>reach you?</g>", hint: "Your coordinates — our growth squad will connect with you personally within 24 hours." },
    { id: "company", type: "company", ql: "QUEST 03 — YOUR KINGDOM", reward: 80, title: "Tell us about your <g>business.</g>", hint: "Your company name, industry, and website if you have one." },
    { id: "role", type: "single", ql: "QUEST 04 — YOUR POWER", reward: 80, title: "What is your <g>role?</g>", hint: "Who are you within your organisation?",
        opts: [{ i: "👑", l: "Founder / Co-Founder" }, { i: "💼", l: "CEO / MD / Director" }, { i: "📊", l: "Marketing Head" }, { i: "🧑‍💻", l: "Operations / Manager" }, { i: "🛒", l: "Sales / Business Dev" }, { i: "🎓", l: "Student / Fresher" }] },
    { id: "goal", type: "single", ql: "QUEST 05 — THE MISSION", reward: 80, title: "What is your <g>#1 goal?</g>", hint: "What challenge are you here to conquer with digital marketing?",
        opts: [{ i: "🚀", l: "Launch a brand online" }, { i: "📈", l: "Generate more leads" }, { i: "🌍", l: "Grow brand awareness" }, { i: "🛍️", l: "Boost online sales" }, { i: "🏥", l: "Healthcare brand growth" }, { i: "⚙️", l: "Automate marketing & ops" }] },
    { id: "services", type: "services", ql: "QUEST 06 — YOUR ARSENAL", reward: 100, title: "Which services are you <g>exploring?</g>", hint: "Pick all that apply — build your perfect Dreamsdesign growth arsenal." },
    { id: "stage", type: "single", ql: "QUEST 07 — BATTLE STAGE", reward: 80, title: "Where is your business <g>right now?</g>", hint: "Every great brand has a current chapter. Identify yours.",
        opts: [{ i: "💡", l: "Idea / Pre-Launch" }, { i: "🌱", l: "Early Stage (0–1 yr)" }, { i: "📦", l: "Growing (1–3 yrs)" }, { i: "⚡", l: "Scaling (3–7 yrs)" }, { i: "🏰", l: "Established (7+ yrs)" }] },
    { id: "budget", type: "single", ql: "QUEST 08 — THE TREASURY", reward: 100, title: "What is your monthly <g>marketing budget?</g>", hint: "This helps us build the perfect strategy for your brand. No judgment here.",
        opts: [{ i: "🌿", l: "Under ₹25,000" }, { i: "🔥", l: "₹25,000 – ₹75,000" }, { i: "💎", l: "₹75,000 – ₹2 Lakhs" }, { i: "👑", l: "₹2 Lakhs – ₹5 Lakhs" }, { i: "🚀", l: "₹5 Lakhs+" }] },
    { id: "timeline", type: "single", ql: "QUEST 09 — LAUNCH CLOCK", reward: 80, title: "When do you want to <g>start?</g>", hint: "Knowing your timeline helps us prioritise your mission at Dreamsdesign.",
        opts: [{ i: "⚡", l: "ASAP — This week" }, { i: "📅", l: "This month" }, { i: "🗓️", l: "Next 1–3 months" }, { i: "🔭", l: "Just exploring for now" }] },
    { id: "tried", type: "single", ql: "QUEST 10 — PAST BATTLES", reward: 80, title: "Have you worked with an <g>agency before?</g>", hint: "Tell us about your history with marketing partners.",
        opts: [{ i: "🚫", l: "No — this is my first time" }, { i: "😕", l: "Yes, but results were poor" }, { i: "😐", l: "Yes, average experience" }, { i: "✅", l: "Yes, ready for serious growth" }] },
    { id: "decider", type: "single", ql: "QUEST 11 — DECISION POWER", reward: 100, title: "Are you the <g>decision maker?</g>", hint: "This helps us tailor our proposal to the right stakeholders.",
        opts: [{ i: "✅", l: "Yes, I decide alone" }, { i: "🤝", l: "Yes, with a business partner" }, { i: "👥", l: "I influence, team decides" }, { i: "📨", l: "I am referring someone" }] },
    { id: "extra", type: "textarea", ql: "QUEST 12 — FINAL SCROLL", reward: 90, title: "Any message for our <g>team?</g>", hint: "Your vision, your challenge, or anything else. Our founders personally read every single word." },
];
const TOTAL = STEPS.length;
const REWARDS = STEPS.map(s => s.reward);
function scoreLead(a) {
    const budget = { "Under ₹25,000": 5, "₹25,000 – ₹75,000": 15, "₹75,000 – ₹2 Lakhs": 30, "₹2 Lakhs – ₹5 Lakhs": 45, "₹5 Lakhs+": 55 };
    const timeline = { "ASAP — This week": 25, "This month": 15, "Next 1–3 months": 8, "Just exploring for now": 2 };
    const decider = { "Yes, I decide alone": 20, "Yes, with a business partner": 15, "I influence, team decides": 8, "I am referring someone": 2 };
    const raw = (budget[a.budget] ?? 5) + (timeline[a.timeline] ?? 5) + (decider[a.decider] ?? 5);
    const tier = raw >= 75 ? "HOT" : raw >= 45 ? "WARM" : raw >= 20 ? "COOL" : "COLD";
    return { leadScore: raw, tier };
}
function genCode(name) {
    const n = name.replace(/\s+/g, "").substring(0, 4).toUpperCase() || "HERO";
    const y = new Date().getFullYear().toString().slice(-2);
    return `DD${y}-${n}-${Math.floor(1000 + Math.random() * 9000)}`;
}
/* ── Inline title renderer ───────────────────────────────────────────── */
function Title({ raw }) {
    const parts = raw.split(/<g>|<\/g>/);
    return (<h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: "clamp(22px,4vw,30px)", lineHeight: 1.22, color: "#fff", marginBottom: 10 }}>
      {parts.map((p, i) => i % 2 === 1
            ? <span key={i} style={{ background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{p}</span>
            : p)}
    </h2>);
}
/* ── Main component ──────────────────────────────────────────────────── */
export default function GrowthQuestForm() {
    const [step, setStep] = useState(0);
    const [coins, setCoins] = useState(0);
    const [answers, setAnswers] = useState(BLANK);
    const [floatCoins, setFloatCoins] = useState([]);
    const [toasts, setToasts] = useState([]);
    const [isComplete, setIsComplete] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [redemptionCode, setRedemptionCode] = useState("");
    const coinIdRef = useRef(0);
    const toastIdRef = useRef(0);
    useEffect(() => { setRedemptionCode(genCode(answers.name)); }, []);
    /* ── Coin spawner ── */
    const spawnCoins = useCallback((n = 5) => {
        const batch = Array.from({ length: n }, () => ({
            id: ++coinIdRef.current,
            x: 10 + Math.random() * 80,
            y: 15 + Math.random() * 50,
        }));
        setFloatCoins(p => [...p, ...batch]);
        setTimeout(() => {
            const ids = new Set(batch.map(c => c.id));
            setFloatCoins(p => p.filter(c => !ids.has(c.id)));
        }, 1500);
    }, []);
    const showToast = useCallback((msg) => {
        const id = ++toastIdRef.current;
        setToasts(p => [...p, { id, msg }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2200);
    }, []);
    /* ── Advance step ── */
    function advance() {
        const reward = REWARDS[step];
        spawnCoins(5);
        showToast(`+${reward} Gold Coins added to your vault!`);
        setCoins(c => c + reward);
        if (step + 1 >= TOTAL) {
            setRedemptionCode(genCode(answers.name));
            setTimeout(() => setIsComplete(true), 300);
        }
        else {
            setStep(s => s + 1);
        }
    }
    /* ── Submit to API ── */
    async function submitLead() {
        setSubmitting(true);
        const { leadScore, tier } = scoreLead(answers);
        const code = redemptionCode;
        try {
            const res = await fetch("/api/chatbot/finalize-lead", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transcript: [],
                    contactInfo: {
                        name: answers.name,
                        email: answers.contact.email,
                        phone: answers.contact.phone,
                        location: answers.contact.city,
                        company: answers.company.name,
                        industry: answers.company.industry,
                        website: answers.company.website,
                        designation: answers.role,
                        goals: [answers.goal, ...answers.services].filter(Boolean),
                        budget: answers.budget,
                        isDecisionMaker: answers.decider,
                        timeline: answers.timeline,
                        biggestChallenge: answers.tried,
                        businessDescription: answers.extra || answers.stage,
                        leadScore,
                        tier,
                        source: "Growth Quest Form - Dreamsdesign",
                        successVision: `Stage: ${answers.stage}. Code: ${code}`,
                    },
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `Server error ${res.status}`);
            }
            setSubmitted(true);
            spawnCoins(15);
            showToast("Welcome to the Dreamsdesign family! 🎉");
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "Submission failed. Please try again.";
            showToast(`⚠️ ${msg}`);
        }
        finally {
            setSubmitting(false);
        }
    }
    function sendWhatsApp() {
        const svc = answers.services.slice(0, 4).join(", ") || "Digital Marketing";
        const msg = encodeURIComponent(`Hi Dreamsdesign! 🙏\n\nI just completed your Growth Quest.\n\n` +
            `👤 Name: ${answers.name}\n🏢 Company: ${answers.company.name || "—"}\n` +
            `🎯 Services: ${svc}\n💰 Budget: ${answers.budget || "—"}\n` +
            `⏰ Timeline: ${answers.timeline || "—"}\n🪙 Code: ${redemptionCode}\n\n` +
            `Looking forward to building something amazing together! 🚀`);
        window.open(`https://wa.me/919377756660?text=${msg}`, "_blank");
    }
    const pct = isComplete ? 100 : Math.round(step / TOTAL * 100);
    return (<>
      {/* ── Keyframe CSS ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=DM+Sans:wght@400;500;600&display=swap');
        .gq-body{font-family:'DM Sans',sans-serif;background:#0A0A0F;color:#F0EFFF;min-height:100vh;overflow-x:hidden;margin:0}
        @keyframes orbDrift{0%{transform:translate(0,0) scale(1)}100%{transform:translate(40px,50px) scale(1.1)}}
        @keyframes geoSpin{to{transform:rotate(360deg)}}
        @keyframes cardSlide{from{opacity:0;transform:translateY(22px) scale(0.985)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes fadeScale{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
        @keyframes coinFly{0%{opacity:1;transform:translate(0,0) scale(1) rotate(0deg)}80%{opacity:.6}100%{opacity:0;transform:translate(-20px,-140px) scale(1.8) rotate(25deg)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(18px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes toastOut{to{opacity:0;transform:translateX(-50%) translateY(12px)}}
        @keyframes trophyPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,107,53,0)}50%{box-shadow:0 0 0 18px rgba(255,107,53,0.08),0 0 0 36px rgba(255,107,53,0.03)}}
        @keyframes ringRotate{to{transform:rotate(360deg)}}
        .gq-card{animation:cardSlide 0.4s cubic-bezier(.4,0,.2,1)}
        .gq-final{animation:cardSlide 0.5s ease}
        .gq-opt:hover{border-color:rgba(255,107,53,.38)!important;color:#fff!important;transform:translateY(-2px);box-shadow:0 8px 30px rgba(255,107,53,.1)}
        .gq-opt.sel{border-color:rgba(255,107,53,.65)!important;color:#fff!important;background:rgba(255,107,53,.1)!important;box-shadow:0 4px 22px rgba(255,107,53,.15)}
        .gq-svc:hover{border-color:rgba(255,107,53,.38)!important;color:#fff!important;transform:translateY(-2px)}
        .gq-svc.sel{border-color:#FF6B35!important;background:rgba(255,107,53,.12)!important;color:#fff!important}
        .gq-fi{width:100%;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:15px 18px;font-size:15px;font-family:'DM Sans',sans-serif;color:#fff;outline:none;transition:border-color .2s,background .2s,box-shadow .2s;margin-bottom:12px;box-sizing:border-box}
        .gq-fi::placeholder{color:rgba(255,255,255,.22)}
        .gq-fi:focus{border-color:rgba(255,107,53,.55);background:rgba(255,107,53,.04);box-shadow:0 0 0 3px rgba(255,107,53,.07)}
        .gq-cta{width:100%;padding:18px;border-radius:16px;border:none;background:linear-gradient(135deg,#FF6B35,#CB3273,#E15C94);color:#fff;font-family:'Sora',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .25s;box-shadow:0 8px 36px rgba(255,107,53,.32);position:relative;overflow:hidden}
        .gq-cta:hover:not(:disabled){transform:translateY(-3px);box-shadow:0 14px 44px rgba(255,107,53,.48)}
        .gq-cta:disabled{opacity:.3;cursor:not-allowed;transform:none!important}
        .gq-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#14141E;border:1px solid rgba(255,107,53,.38);border-radius:50px;padding:13px 26px;font-family:'Sora',sans-serif;font-weight:600;font-size:13px;color:#FF6B35;z-index:9998;display:flex;align-items:center;gap:10px;white-space:nowrap;box-shadow:0 10px 40px rgba(0,0,0,.6);animation:toastIn .3s ease}
        select.gq-fi{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='%23FF6B35' opacity='0.7' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:calc(100% - 16px) center;padding-right:44px}
        select.gq-fi option{background:#14141E;color:#fff}
        @media(max-width:600px){.gq-opts-grid{grid-template-columns:1fr 1fr!important}.gq-svcs-grid{grid-template-columns:repeat(3,1fr)!important}.gq-row{grid-template-columns:1fr!important}}
      `}</style>

      <div className="gq-body">
        {/* ── Background ── */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          {[
            { size: 700, color: "#FF6B35", top: "-250px", right: "-150px", delay: "0s" },
            { size: 600, color: "#7B2FF7", bottom: "-200px", left: "-150px", delay: "-4s" },
            { size: 400, color: "#E15C94", top: "35%", left: "45%", delay: "-7s" },
            { size: 300, color: "#CB3273", top: "60%", right: "10%", delay: "-2s" },
        ].map((o, i) => (<div key={i} style={{
                position: "absolute", borderRadius: "50%", filter: "blur(100px)", opacity: 0.13,
                width: o.size, height: o.size,
                background: `radial-gradient(circle,${o.color},transparent 70%)`,
                animation: `orbDrift 10s ease-in-out infinite alternate`,
                animationDelay: o.delay,
                ...(o.top ? { top: o.top } : {}), ...(o.bottom ? { bottom: o.bottom } : {}),
                ...(o.left ? { left: o.left } : {}), ...(o.right ? { right: o.right } : {}),
            }}/>))}
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,107,53,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,53,.03) 1px,transparent 1px)", backgroundSize: "64px 64px" }}/>
        </div>

        {/* ── Floating coins ── */}
        {floatCoins.map(c => (<div key={c.id} style={{ position: "fixed", right: `${c.x}%`, top: `${c.y}%`, fontSize: 26, zIndex: 9999, animation: "coinFly 1.3s ease-out forwards", pointerEvents: "none" }}>🪙</div>))}

        {/* ── Toasts ── */}
        {toasts.slice(-1).map(t => (<div key={t.id} className="gq-toast">🪙 {t.msg}</div>))}

        <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: "0 16px 100px" }}>
          {/* ── Nav ── */}
          <nav style={{ maxWidth: 780, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0 18px" }}>
            <a href="https://dreamsdesign.in" target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, color: "#fff" }}>DD</div>
              <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 17, color: "#fff" }}>
                Dreams<span style={{ background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>design</span>
              </span>
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,107,53,.08)", border: "1px solid rgba(255,107,53,.3)", borderRadius: 50, padding: "9px 18px" }}>
              <span style={{ fontSize: 17 }}>🪙</span>
              <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 17, background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{coins}</span>
              <span style={{ fontSize: 11, color: "rgba(240,239,255,.45)", fontFamily: "'Sora',sans-serif" }}>/ 1000 coins</span>
            </div>
          </nav>

          {/* ── Progress bar ── */}
          <div style={{ maxWidth: 780, margin: "0 auto 28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 2, color: "rgba(255,107,53,.55)", textTransform: "uppercase" }}>
                {isComplete ? "QUEST COMPLETE ✦" : `QUEST ${step + 1} OF ${TOTAL}`}
              </span>
              <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 700, color: "rgba(240,239,255,.45)" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,.07)", borderRadius: 2, position: "relative" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)", transition: "width .6s cubic-bezier(.4,0,.2,1)", position: "relative" }}>
                <div style={{ position: "absolute", right: -7, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, borderRadius: "50%", background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)", boxShadow: "0 0 16px rgba(255,107,53,.9),0 0 32px rgba(255,107,53,.4)" }}/>
              </div>
            </div>
          </div>

          {/* ── Content area ── */}
          {isComplete
            ? <FinalScreen answers={answers} code={redemptionCode} coins={coins} submitted={submitted} submitting={submitting} onSubmit={submitLead} onWhatsApp={sendWhatsApp}/>
            : <QuestionCard step={step} answers={answers} setAnswers={setAnswers} onAdvance={advance}/>}

          {/* ── Footer ── */}
          <footer style={{ maxWidth: 780, margin: "40px auto 0", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.18)", fontFamily: "'Sora',sans-serif" }}>
            <p>© 2025 Dreamsdesign · <a href="https://dreamsdesign.in" target="_blank" rel="noreferrer" style={{ color: "rgba(255,107,53,.45)", textDecoration: "none" }}>dreamsdesign.in</a> · <a href="mailto:krishna@dreamsdesign.in" style={{ color: "rgba(255,107,53,.45)", textDecoration: "none" }}>krishna@dreamsdesign.in</a> · <a href="tel:+919377756660" style={{ color: "rgba(255,107,53,.45)", textDecoration: "none" }}>+91 9377756660</a></p>
            <p style={{ marginTop: 6 }}>608 Sterling Center, RC Dutt Rd, Alkapuri, Vadodara, Gujarat 390020</p>
          </footer>
        </div>
      </div>
    </>);
}
/* ── Question Card ─────────────────────────────────────────────────── */
function QuestionCard({ step, answers, setAnswers, onAdvance }) {
    const s = STEPS[step];
    const canAdvance = checkCanAdvance(s.id, s.type, answers);
    function update(patch) { setAnswers({ ...answers, ...patch }); }
    const card = (<div className="gq-card" style={{ maxWidth: 780, margin: "0 auto", background: "#14141E", border: "1px solid rgba(255,107,53,.2)", borderRadius: 26, padding: "clamp(24px,5vw,44px) clamp(20px,5vw,40px)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)" }}/>

      {/* Header */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,107,53,.1)", border: "1px solid rgba(255,107,53,.28)", borderRadius: 50, padding: "5px 15px", fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: "#FF6B35", letterSpacing: 1, textTransform: "uppercase", marginBottom: 20 }}>
        🪙 +{s.reward} gold coins this round
      </div>
      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: "10.5px", fontWeight: 700, letterSpacing: "2.5px", color: "rgba(255,107,53,.45)", textTransform: "uppercase", marginBottom: 10 }}>{s.ql}</div>
      <Title raw={s.title}/>
      <p style={{ fontSize: 14, color: "rgba(240,239,255,.45)", lineHeight: 1.65, marginBottom: 30, maxWidth: 560 }}>{s.hint}</p>

      {/* Step-specific content */}
      {s.type === "name" && <NameStep answers={answers} update={update} onAdvance={onAdvance}/>}
      {s.type === "contact" && <ContactStep answers={answers} update={update} onAdvance={onAdvance}/>}
      {s.type === "company" && <CompanyStep answers={answers} update={update} onAdvance={onAdvance}/>}
      {s.type === "single" && <SingleStep stepId={s.id} opts={s.opts} answers={answers} update={update} onAdvance={onAdvance}/>}
      {s.type === "services" && <ServicesStep answers={answers} update={update} onAdvance={onAdvance}/>}
      {s.type === "textarea" && <TextareaStep answers={answers} update={update} onAdvance={onAdvance}/>}

      {/* CTA (for non-input steps that need it) */}
      {(s.type !== "name" && s.type !== "contact" && s.type !== "company" && s.type !== "textarea") && (<button className="gq-cta" disabled={!canAdvance} onClick={onAdvance}>
          Confirm & Continue →
        </button>)}
    </div>);
    return card;
}
function checkCanAdvance(id, type, a) {
    if (type === "name")
        return !!a.name.trim();
    if (type === "contact")
        return !!(a.contact.email || a.contact.phone);
    if (type === "company")
        return !!a.company.name.trim();
    if (type === "services")
        return a.services.length > 0;
    if (type === "textarea")
        return true;
    return !!a[id];
}
function NameStep({ answers, update, onAdvance }) {
    return (<>
      {answers.name && (<div style={{ background: "rgba(255,107,53,.06)", border: "1px solid rgba(255,107,53,.22)", borderRadius: 14, padding: "14px 18px", marginBottom: 16, animation: "fadeScale .35s ease" }}>
          <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,.8)" }}>
            The Hero's name is{" "}
            <span style={{ background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 19 }}>{answers.name}</span>
            {" "}— ready to build something legendary 🔥
          </span>
        </div>)}
      <input className="gq-fi" type="text" placeholder="Enter your full name..." value={answers.name} onChange={e => update({ name: e.target.value })} onKeyDown={e => e.key === "Enter" && answers.name.trim() && onAdvance()} autoFocus/>
      <button className="gq-cta" disabled={!answers.name.trim()} onClick={onAdvance}>
        Begin the Quest →
      </button>
    </>);
}
function ContactStep({ answers, update, onAdvance }) {
    function upC(patch) { update({ contact: { ...answers.contact, ...patch } }); }
    const canGo = !!(answers.contact.email || answers.contact.phone);
    return (<>
      <div className="gq-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 0 }}>
        <input className="gq-fi" style={{ marginBottom: 0 }} type="email" placeholder="Email address" value={answers.contact.email} onChange={e => upC({ email: e.target.value })}/>
        <input className="gq-fi" style={{ marginBottom: 0 }} type="tel" placeholder="Phone / WhatsApp" value={answers.contact.phone} onChange={e => upC({ phone: e.target.value })}/>
      </div>
      <input className="gq-fi" style={{ marginTop: 12 }} type="text" placeholder="Your city / location" value={answers.contact.city} onChange={e => upC({ city: e.target.value })}/>
      <button className="gq-cta" disabled={!canGo} onClick={onAdvance} style={{ marginTop: 4 }}>
        Lock In Coordinates →
      </button>
    </>);
}
function CompanyStep({ answers, update, onAdvance }) {
    function upC(patch) { update({ company: { ...answers.company, ...patch } }); }
    return (<>
      <input className="gq-fi" type="text" placeholder="Company / Brand name..." value={answers.company.name} onChange={e => upC({ name: e.target.value })}/>
      <select className="gq-fi" value={answers.company.industry} onChange={e => upC({ industry: e.target.value })}>
        <option value="">Select your industry...</option>
        {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
      </select>
      <input className="gq-fi" type="url" placeholder="Website URL (optional — e.g. yoursite.com)" value={answers.company.website} onChange={e => upC({ website: e.target.value })}/>
      <button className="gq-cta" disabled={!answers.company.name.trim()} onClick={onAdvance} style={{ marginTop: 8 }}>
        Claim Your Kingdom →
      </button>
    </>);
}
function SingleStep({ stepId, opts, answers, update, onAdvance }) {
    const sel = answers[stepId] ?? "";
    return (<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10, marginBottom: 24 }} className="gq-opts-grid">
      {opts.map(o => (<button key={o.l} className={`gq-opt${sel === o.l ? " sel" : ""}`} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "15px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left", color: "rgba(255,255,255,.6)", fontSize: 13.5, fontWeight: 500, fontFamily: "'DM Sans',sans-serif", transition: "all .22s", position: "relative", overflow: "hidden" }} onClick={() => { update({ [stepId]: o.l }); setTimeout(onAdvance, 250); }}>
          <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{o.i}</span>
          <span style={{ flex: 1, lineHeight: 1.35 }}>{o.l}</span>
          <span style={{ width: 19, height: 19, borderRadius: "50%", flexShrink: 0, border: `1.5px solid ${sel === o.l ? "transparent" : "rgba(255,255,255,.18)"}`, display: "flex", alignItems: "center", justifyContent: "center", background: sel === o.l ? "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)" : "transparent", transition: "all .2s" }}>
            {sel === o.l && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "block" }}/>}
          </span>
        </button>))}
    </div>);
}
function ServicesStep({ answers, update, onAdvance }) {
    function toggleSvc(label) {
        const cur = answers.services;
        const next = cur.includes(label) ? cur.filter(s => s !== label) : [...cur, label];
        update({ services: next });
    }
    return (<>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "1.5px", color: "rgba(255,255,255,.25)", textTransform: "uppercase", marginBottom: 10, fontFamily: "'Sora',sans-serif" }}>
        Select all that apply — {answers.services.length} service{answers.services.length !== 1 ? "s" : ""} selected
      </div>
      <div className="gq-svcs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 9, marginBottom: 28 }}>
        {SVCS.map(sv => (<button key={sv.l} className={`gq-svc${answers.services.includes(sv.l) ? " sel" : ""}`} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 13, padding: "14px 10px", cursor: "pointer", textAlign: "center", color: "rgba(255,255,255,.55)", fontSize: 12.5, fontWeight: 500, fontFamily: "'DM Sans',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, transition: "all .2s", lineHeight: 1.3 }} onClick={() => toggleSvc(sv.l)}>
            <span style={{ fontSize: 24, lineHeight: 1 }}>{sv.i}</span>
            <span>{sv.l}</span>
          </button>))}
      </div>
      <button className="gq-cta" disabled={answers.services.length === 0} onClick={onAdvance}>
        Forge the Arsenal →
      </button>
    </>);
}
function TextareaStep({ answers, update, onAdvance }) {
    return (<>
      <textarea className="gq-fi" rows={5} placeholder="Your vision, goals, challenges, or anything you want our founders to know..." value={answers.extra} onChange={e => update({ extra: e.target.value })} style={{ resize: "vertical", minHeight: 108 }}/>
      <button className="gq-cta" onClick={onAdvance}>Complete the Quest 🏆</button>
      <p onClick={onAdvance} style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "rgba(255,255,255,.2)", cursor: "pointer", textDecoration: "underline" }}>Skip — I'm all set</p>
    </>);
}
/* ── Final Screen ──────────────────────────────────────────────────── */
function FinalScreen({ answers, code, submitted, submitting, onSubmit, onWhatsApp }) {
    const hero = answers.name || "Champion";
    const svcList = answers.services.slice(0, 4).join(", ") || "Digital Marketing";
    const pills = [answers.role, answers.goal, answers.stage, answers.budget, answers.timeline, answers.decider].filter(Boolean);
    return (<div className="gq-final" style={{ maxWidth: 780, margin: "0 auto", background: "#14141E", border: "1px solid rgba(255,107,53,.2)", borderRadius: 26, padding: "clamp(32px,6vw,52px) clamp(22px,5vw,44px)", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)" }}/>

      {/* Trophy */}
      <div style={{ width: 136, height: 136, margin: "0 auto 28px", borderRadius: "50%", background: "#14141E", border: "2px solid rgba(255,107,53,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, position: "relative", animation: "trophyPulse 2.5s ease-in-out infinite" }}>
        <div style={{ position: "absolute", inset: -5, borderRadius: "50%", background: "conic-gradient(#FF6B35 0%,#CB3273 25%,#E15C94 50%,#7B2FF7 75%,#FF6B35 100%)", zIndex: -1, animation: "ringRotate 3.5s linear infinite", WebkitMask: "radial-gradient(farthest-side,transparent calc(100% - 5px),#fff 0)", mask: "radial-gradient(farthest-side,transparent calc(100% - 5px),#fff 0)" }}/>
        🏆
      </div>

      <div style={{ display: "inline-block", background: "rgba(255,107,53,.1)", border: "1px solid rgba(255,107,53,.28)", borderRadius: 50, padding: "6px 22px", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#FF6B35", textTransform: "uppercase", fontFamily: "'Sora',sans-serif", marginBottom: 16 }}>
        Quest Complete — You Did It!
      </div>

      <h1 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: "clamp(24px,5vw,34px)", color: "#fff", lineHeight: 1.2, marginBottom: 14 }}>
        You've earned{" "}
        <span style={{ background: "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>1000 Gold Coins,</span>
        <br />{hero}!
      </h1>

      <p style={{ fontSize: 15, color: "rgba(240,239,255,.45)", lineHeight: 1.72, marginBottom: 30, maxWidth: 530, marginLeft: "auto", marginRight: "auto" }}>
        Thank you for investing your time and sharing your vision with us. Dreamsdesign gifts you 1000 Gold Coins — redeemable on your first engagement. Our founders personally review every submission and will reach out within 24 hours.
      </p>

      {/* Coins big display */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 28 }}>
        <span style={{ fontSize: 36 }}>🪙</span>
        <div>
          <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 44, background: "linear-gradient(135deg,#FFD200,#FF8C00,#FF6B35)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 }}>1,000</div>
          <div style={{ fontSize: 13, color: "rgba(240,239,255,.45)", fontFamily: "'Sora',sans-serif", textAlign: "left", lineHeight: 1.4 }}>Gold Coins in your vault</div>
        </div>
      </div>

      {/* Summary pills */}
      {pills.length > 0 && (<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 26, justifyContent: "center" }}>
          {pills.map(p => (<span key={p} style={{ background: "rgba(255,107,53,.07)", border: "1px solid rgba(255,107,53,.18)", borderRadius: 50, padding: "5px 15px", fontSize: 12, color: "rgba(255,255,255,.55)", fontFamily: "'Sora',sans-serif" }}>{p}</span>))}
        </div>)}

      {/* Coupon */}
      <div style={{ background: "rgba(255,107,53,.05)", border: "1.5px dashed rgba(255,107,53,.38)", borderRadius: 22, padding: "28px 26px", marginBottom: 28, position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 10, letterSpacing: "2.5px", color: "rgba(255,107,53,.55)", textTransform: "uppercase", fontFamily: "'Sora',sans-serif", marginBottom: 12 }}>Your Exclusive Redemption Code</div>
        <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: "clamp(24px,6vw,38px)", background: "linear-gradient(135deg,#FFD200,#FF8C00,#FF6B35,#E15C94)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 6 }}>{code}</div>
        <p style={{ fontSize: 12.5, color: "rgba(240,239,255,.45)", marginTop: 12, lineHeight: 1.6 }}>
          Redeem this code with Dreamsdesign on your first campaign. Valid for 30 days.<br />
          Call or WhatsApp: <strong style={{ color: "rgba(255,107,53,.85)" }}>+91 9377756660</strong> &nbsp;|&nbsp; Email: <strong style={{ color: "rgba(255,107,53,.85)" }}>krishna@dreamsdesign.in</strong>
        </p>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button style={{ width: "100%", padding: 19, borderRadius: 16, border: "none", background: submitted ? "rgba(255,107,53,.2)" : "linear-gradient(135deg,#FF6B35,#CB3273,#E15C94)", color: submitted ? "#FF6B35" : "#fff", fontFamily: "'Sora',sans-serif", fontSize: 15, fontWeight: 700, cursor: submitted ? "default" : "pointer", boxShadow: submitted ? "none" : "0 8px 36px rgba(255,107,53,.32)", transition: "all .2s", opacity: submitting ? 0.6 : 1 }} onClick={() => !submitted && !submitting && onSubmit()} disabled={submitting}>
          {submitted ? "✅ Submitted! Our team will reach out within 24 hrs." : submitting ? "Submitting…" : `🚀 Submit My Quest & Claim 1000 Coins · ${svcList.substring(0, 40)}`}
        </button>
        <button style={{ width: "100%", padding: 17, borderRadius: 16, border: "1px solid rgba(37,211,102,.28)", background: "rgba(37,211,102,.06)", color: "#25D366", fontFamily: "'Sora',sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all .2s" }} onClick={onWhatsApp}>
          💬 Connect Instantly on WhatsApp
        </button>
      </div>

      {/* Contact strip */}
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", fontSize: 12.5, color: "rgba(240,239,255,.45)" }}>
        <span>📍 608 Sterling Center, Alkapuri, Vadodara</span>
        <a href="tel:+919377756660" style={{ color: "rgba(255,107,53,.8)", textDecoration: "none" }}>📞 +91 9377756660</a>
        <a href="mailto:krishna@dreamsdesign.in" style={{ color: "rgba(255,107,53,.8)", textDecoration: "none" }}>✉️ krishna@dreamsdesign.in</a>
        <a href="https://dreamsdesign.in" target="_blank" rel="noreferrer" style={{ color: "rgba(255,107,53,.8)", textDecoration: "none" }}>🌐 dreamsdesign.in</a>
      </div>
    </div>);
}
