import { useState, useRef, useCallback, useEffect } from "react";
// Ã¢â€â‚¬Ã¢â€â‚¬ Config Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const PRIMARY = "#5B2FC9";
const CALENDLY = "https://calendly.com/dreamsdesign-in/consulting";
const INTENT_OPTS = ["Grow my business Ã°Å¸Å¡â‚¬", "Looking for a job Ã°Å¸â€™Â¼", "Just browsing Ã°Å¸â€˜â‚¬", "Something else Ã°Å¸â€™Â¬"];
const BUDGET_OPTS = ["Under Ã¢â€šÂ¹50k", "Ã¢â€šÂ¹50k Ã¢â‚¬â€œ Ã¢â€šÂ¹1L", "Ã¢â€šÂ¹1L Ã¢â‚¬â€œ Ã¢â€šÂ¹2L", "Ã¢â€šÂ¹2L Ã¢â‚¬â€œ Ã¢â€šÂ¹5L", "Ã¢â€šÂ¹5L+"];
const DM_OPTS = ["Yes, I decide", "I'm part of the decision", "Need to consult others"];
const TIMELINE_OPTS = ["Right away", "Within a month", "Next 3 months", "Just exploring"];
// Ã¢â€â‚¬Ã¢â€â‚¬ Scoring Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function scoreLead(l) {
    let s = 0;
    if (l.budget === "Ã¢â€šÂ¹5L+")
        s += 30;
    else if (l.budget === "Ã¢â€šÂ¹2L Ã¢â‚¬â€œ Ã¢â€šÂ¹5L")
        s += 20;
    else if (l.budget === "Ã¢â€šÂ¹1L Ã¢â‚¬â€œ Ã¢â€šÂ¹2L")
        s += 10;
    else if (l.budget === "Ã¢â€šÂ¹50k Ã¢â‚¬â€œ Ã¢â€šÂ¹1L")
        s += 5;
    if (l.timeline === "Right away")
        s += 25;
    else if (l.timeline === "Within a month")
        s += 15;
    else if (l.timeline === "Next 3 months")
        s += 5;
    if (l.decisionMaker === "Yes, I decide")
        s += 20;
    else if (l.decisionMaker === "I'm part of the decision")
        s += 10;
    const tier = s >= 60 ? "HOT" : s >= 40 ? "WARM" : s >= 20 ? "COOL" : "COLD";
    return { score: s, tier };
}
// Ã¢â€â‚¬Ã¢â€â‚¬ Typing dots Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function TypingDots() {
    return (<span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map(i => (<span key={i} style={{
                width: 7, height: 7, borderRadius: "50%", background: "#9CA3AF",
                display: "inline-block", animation: `kdot 1s ${i * 0.18}s infinite`,
            }}/>))}
    </span>);
}
// Ã¢â€â‚¬Ã¢â€â‚¬ Arrow send button Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function SendBtn({ active, onClick }) {
    return (<button onClick={onClick} disabled={!active} style={{
            width: 34, height: 34, borderRadius: "50%", border: "none",
            background: active ? PRIMARY : "#E5E7EB",
            cursor: active ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "background .2s",
        }}>
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14M12 5l7 7-7 7" stroke="white" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>);
}
export function ChatWidget({ apiBase = "" }) {
    const [open, setOpen] = useState(false);
    const [teaserOff, setTeaserOff] = useState(false);
    const [phase, setPhase] = useState("form");
    // Contact form
    const [fv, setFv] = useState({ name: "", designation: "", company: "", email: "", phone: "" });
    const [fErr, setFErr] = useState("");
    // Chat
    const [msgs, setMsgs] = useState([]);
    const [chatStep, setChatStep] = useState(0);
    const chatStepRef = useRef(0);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [textVal, setTextVal] = useState("");
    const [showCalendly, setShowCalendly] = useState(false);
    const leadRef = useRef({});
    const inputRef = useRef(null);
    const bottomRef = useRef(null);
    const msgIdRef = useRef(0);
    // Scroll to bottom whenever messages change
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [msgs]);
    // Keep input focused after step changes (text-input steps only)
    useEffect(() => {
        if (phase === "chat" && chatStep < 3) {
            setTimeout(() => inputRef.current?.focus(), 120);
        }
    }, [chatStep, phase]);
    // Ã¢â€â‚¬Ã¢â€â‚¬ Add Krish message with realistic "typing" delay Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const krishSay = useCallback((text) => {
        return new Promise(resolve => {
            const id = ++msgIdRef.current;
            setMsgs(prev => [...prev, { id, role: "krish", text: "", typing: true }]);
            const ms = Math.min(400 + text.length * 16, 2000);
            setTimeout(() => {
                setMsgs(prev => prev.map(m => m.id === id ? { ...m, text, typing: false } : m));
                resolve();
            }, ms);
        });
    }, []);
    // Ã¢â€â‚¬Ã¢â€â‚¬ Submit lead to API Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const submitLead = useCallback(async () => {
        const l = leadRef.current;
        const { score, tier } = scoreLead(l);
        const firstName = (l.name ?? "").split(" ")[0] || (l.name ?? "there");
        const cmp = l.company || "your business";
        // Save lead
        try {
            await fetch(`${apiBase}/api/chatbot/finalize-lead`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transcript: [],
                    contactInfo: {
                        name: l.name, designation: l.designation,
                        company: l.company, email: l.email, phone: l.phone,
                        website: l.website, industry: l.industry, location: l.location,
                        budget: l.budget, isDecisionMaker: l.decisionMaker, timeline: l.timeline,
                        goals: [], companySize: "", biggestChallenge: l.industry,
                        bantScore: score, tier,
                        bantBreakdown: { budget: l.budget, timeline: l.timeline, decisionMaker: l.decisionMaker },
                    },
                }),
            });
        }
        catch (_) { /* non-fatal */ }
        // Get AI-generated opportunities (fallback to smart defaults)
        let opps = ["Lead Generation & Digital Acquisition", "Sales Automation with AI", "Brand & Website Conversion"];
        try {
            const r = await fetch(`${apiBase}/api/chatbot/insight`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "opportunities", name: firstName, industry: l.industry, companySize: "", goals: [], biggestChallenge: l.industry }),
            });
            const d = await r.json();
            if (Array.isArray(d.opportunities) && d.opportunities.length >= 2)
                opps = d.opportunities.slice(0, 3);
        }
        catch (_) { /* use defaults */ }
        // Consultant verdict Ã¢â‚¬â€ with Ã¢Å“â€¦ opportunities
        const verdictText = `Thanks ${firstName}! Ã°Å¸â„¢Â\n\nBased on what you've shared about ${cmp}...\n\nI believe there are 3 key areas where we can make a real difference:`;
        const verdictId = ++msgIdRef.current;
        setMsgs(prev => [...prev, { id: verdictId, role: "krish", text: "", typing: true }]);
        await new Promise(r => setTimeout(r, 1200));
        setMsgs(prev => prev.map(m => m.id === verdictId ? { ...m, text: verdictText, typing: false, opps } : m));
        // Short pause then ask about booking
        await new Promise(r => setTimeout(r, 900));
        await krishSay(`I'd love to prepare a personalised Growth Strategy for ${cmp}. Would you like to book a free 30-min call with our expert?`);
        setShowCalendly(true);
        setBusy(false);
        busyRef.current = false;
        setPhase("done");
    }, [apiBase, krishSay]);
    // Ã¢â€â‚¬Ã¢â€â‚¬ Handle a single answer (text or button) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const handleAnswer = useCallback(async (val) => {
        const v = val.trim();
        if (!v || busyRef.current)
            return;
        busyRef.current = true;
        setBusy(true);
        const step = chatStepRef.current;
        const id = ++msgIdRef.current;
        setMsgs(prev => [...prev, { id, role: "user", text: v }]);
        setTextVal("");
        // Ã¢â€â‚¬Ã¢â€â‚¬ Intent step (step -1) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if (step === -1) {
            const l = leadRef.current;
            const cmp = l.company || "your company";
            const isGrowth = v.includes("Grow");
            if (isGrowth) {
                await krishSay(`Great! Let's see how we can help grow ${cmp}. Quick question first Ã¢â‚¬â€ what's your website URL?`);
                chatStepRef.current = 0;
                setChatStep(0);
                busyRef.current = false;
                setBusy(false);
                setTimeout(() => inputRef.current?.focus(), 120);
            }
            else if (v.includes("job")) {
                await krishSay(`Thanks for letting me know! Ã°Å¸ËœÅ  For career opportunities at Dreamsdesign, please send your resume to careers@dreamsdesign.in Ã¢â‚¬â€ we'd love to hear from you!`);
                busyRef.current = false;
                setBusy(false);
                setPhase("done");
            }
            else if (v.includes("browsing")) {
                await krishSay(`No problem at all! Ã°Å¸ËœÅ  Feel free to explore. If you ever want to know how we can help grow your business, just say the word Ã¢â‚¬â€ I'm right here.`);
                busyRef.current = false;
                setBusy(false);
                setPhase("done");
            }
            else {
                await krishSay(`Of course! For anything specific, feel free to reach out at hello@dreamsdesign.in Ã¢â‚¬â€ we'd be happy to help. Ã°Å¸ËœÅ `);
                busyRef.current = false;
                setBusy(false);
                setPhase("done");
            }
            return;
        }
        // Save field
        const fields = ["website", "industry", "location", "budget", "decisionMaker", "timeline"];
        leadRef.current = { ...leadRef.current, [fields[step]]: v };
        const nextStep = step + 1;
        if (nextStep > 5) {
            // All 6 chat fields collected Ã¢â‚¬â€ submit
            await submitLead();
        }
        else {
            const cmp = leadRef.current.company || "your company";
            const transitions = {
                0: `Nice! What does ${cmp} do? Just a quick line.`,
                1: `Interesting! Which city and country are you based in?`,
                2: `Got it. What investment range are you considering?`,
                3: `Makes sense. Are you the one who makes the final call on this?`,
                4: `Understood. How soon are you looking to get started?`,
            };
            await krishSay(transitions[step]);
            chatStepRef.current = nextStep;
            setChatStep(nextStep);
            busyRef.current = false;
            setBusy(false);
        }
    }, [krishSay, submitLead]);
    // Ã¢â€â‚¬Ã¢â€â‚¬ Start chat after form submit Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const startChat = useCallback(async (lead) => {
        setPhase("chat");
        chatStepRef.current = -1;
        setChatStep(-1);
        const firstName = (lead.name ?? "").split(" ")[0] || (lead.name ?? "");
        await krishSay(`Hey ${firstName}! Ã°Å¸â€˜â€¹ I'm Krish. What brings you here today?`);
    }, [krishSay]);
    // Ã¢â€â‚¬Ã¢â€â‚¬ Handle form submit Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const handleFormSubmit = useCallback(async () => {
        if (busyRef.current)
            return;
        const { name, email, phone } = fv;
        if (!name.trim() || !email.trim() || !phone.trim()) {
            setFErr("Please fill in Name, Email and Phone.");
            return;
        }
        if (!email.includes("@")) {
            setFErr("Enter a valid email address.");
            return;
        }
        setFErr("");
        leadRef.current = { ...fv };
        await startChat(fv);
    }, [fv, startChat]);
    // Ã¢â€â‚¬Ã¢â€â‚¬ Render Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const isButtonStep = phase === "chat" && (chatStep === -1 || chatStep >= 3);
    const isTextStep = phase === "chat" && chatStep >= 0 && chatStep < 3;
    const buttonOpts = chatStep === -1 ? INTENT_OPTS :
        chatStep === 3 ? BUDGET_OPTS :
            chatStep === 4 ? DM_OPTS : TIMELINE_OPTS;
    const inputPlaceholder = chatStep === 0 ? "e.g. dreamsdesign.in" :
        chatStep === 1 ? "e.g. We build websites for D2C brands" :
            "e.g. Mumbai, India";
    return (<>
      <style>{`
        @keyframes kdot { 0%,80%,100%{transform:translateY(0);opacity:.45} 40%{transform:translateY(-5px);opacity:1} }
        @keyframes kup  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .kw-input:focus { border-color: ${PRIMARY} !important; box-shadow: 0 0 0 3px rgba(91,47,201,.12); }
      `}</style>

      {/* Teaser Ã¢â‚¬â€ always in DOM, hidden when open or dismissed */}
      <div style={{
            display: (!open && !teaserOff) ? "block" : "none",
            position: "fixed", bottom: 92, right: 24, zIndex: 9998,
        }}>
        <div onClick={() => setOpen(true)} style={{
            background: "#fff", borderRadius: 14,
            boxShadow: "0 4px 24px rgba(0,0,0,.13)",
            padding: "13px 38px 13px 16px",
            maxWidth: 220, cursor: "pointer", animation: "kup .3s ease",
            position: "relative",
        }}>
          <button onClick={e => { e.stopPropagation(); setTeaserOff(true); }} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 20, lineHeight: 1, padding: 0 }}>Ãƒâ€”</button>
          <p style={{ margin: 0, fontSize: 13, color: "#111827", lineHeight: 1.5 }}>Got any questions? I'm happy to help. Ã°Å¸ËœÅ </p>
        </div>
        {/* Tail */}
        <div style={{ width: 12, height: 12, background: "#fff", transform: "rotate(45deg)", marginLeft: "auto", marginRight: 30, marginTop: -6, boxShadow: "2px 2px 4px rgba(0,0,0,.06)" }}/>
      </div>

      {/* Bubble button */}
      <button onClick={() => setOpen(o => !o)} aria-label="Chat with Krish" style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 9999,
            width: 58, height: 58, borderRadius: "50%",
            background: `linear-gradient(135deg, ${PRIMARY}, #CB3273)`,
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 18px rgba(91,47,201,.45)",
        }}>
        {open
            ? <svg width={19} height={19} viewBox="0 0 24 24" stroke="white" strokeWidth={2.3} strokeLinecap="round" fill="none"><path d="M18 6L6 18M6 6l12 12"/></svg>
            : <svg width={22} height={22} viewBox="0 0 24 24" stroke="white" strokeWidth={1.9} strokeLinecap="round" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>}
      </button>

      {/* Panel Ã¢â‚¬â€ ALWAYS mounted; hidden via display:none to preserve state */}
      <div style={{
            display: open ? "flex" : "none",
            position: "fixed", bottom: 92, right: 24, zIndex: 9998,
            width: 360, maxHeight: 580,
            background: "#fff", borderRadius: 18,
            boxShadow: "0 8px 48px rgba(0,0,0,.17)",
            flexDirection: "column", overflow: "hidden",
            fontFamily: "'Inter', system-ui, sans-serif",
            animation: "kup .22s ease",
        }}>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Header Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div style={{
            background: `linear-gradient(135deg, ${PRIMARY}, #CB3273)`,
            padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 20 }}>Ã°Å¸Â§â€˜Ã¢â‚¬ÂÃ°Å¸â€™Â¼</span>
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Krish</div>
            <div style={{ color: "rgba(255,255,255,.75)", fontSize: 11 }}>Business Growth Consultant Ã‚Â· 25+ yrs</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ADE80" }}/>
            <span style={{ color: "rgba(255,255,255,.75)", fontSize: 11 }}>Online</span>
          </div>
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Body Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

          {/* Contact form */}
          {phase === "form" && (<div style={{ padding: 18 }}>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "#374151", textAlign: "center" }}>
                Hi! Quick details before we start Ã°Å¸â€˜â€¡
              </p>
              {[
                { k: "name", label: "Full Name *", ph: "Your full name", type: "text" },
                { k: "email", label: "Email ID *", ph: "you@company.com", type: "email" },
                { k: "phone", label: "Phone No *", ph: "+91 98765 43210", type: "tel" },
                { k: "designation", label: "Designation", ph: "Founder / CEO / GM (optional)", type: "text" },
                { k: "company", label: "Company", ph: "Company name (optional)", type: "text" },
            ].map(f => (<div key={f.k} style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 3 }}>{f.label}</label>
                  <input className="kw-input" type={f.type} value={fv[f.k]} onChange={e => setFv(p => ({ ...p, [f.k]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter")
                void handleFormSubmit(); }} placeholder={f.ph} style={{
                    width: "100%", boxSizing: "border-box",
                    border: "1.5px solid #E5E7EB", borderRadius: 9,
                    padding: "9px 11px", fontSize: 13, color: "#111827", outline: "none",
                    transition: "border-color .15s, box-shadow .15s",
                }}/>
                </div>))}
              {fErr && <p style={{ fontSize: 12, color: "#EF4444", margin: "4px 0 8px" }}>{fErr}</p>}
              <button onClick={() => void handleFormSubmit()} style={{
                width: "100%", marginTop: 4,
                background: `linear-gradient(135deg, ${PRIMARY}, #CB3273)`,
                color: "#fff", border: "none", borderRadius: 10,
                padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>Let's Talk Ã¢â€ â€™</button>
              <p style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center", marginTop: 8, marginBottom: 0 }}>
                Ã°Å¸â€â€™ We never share your info.
              </p>
            </div>)}

          {/* Chat messages */}
          {phase !== "form" && (<div style={{ padding: "12px 12px 4px" }}>
              {msgs.map(m => (<div key={m.id} style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                    alignItems: "flex-start",
                    marginBottom: 10,
                    animation: "kup .18s ease",
                }}>
                  {m.role === "krish" && (<div style={{
                        width: 26, height: 26, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${PRIMARY}, #CB3273)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, marginRight: 7, marginTop: 2,
                    }}>
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>K</span>
                    </div>)}
                  <div style={{
                    maxWidth: "78%",
                    background: m.role === "user" ? "#FBE9F1" : "#F3F4F6",
                    color: m.role === "user" ? "#A4285E" : "#111827",
                    borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    padding: "10px 14px",
                    fontSize: 13, lineHeight: 1.6,
                    fontWeight: m.role === "user" ? 500 : 400,
                    wordBreak: "break-word", whiteSpace: "pre-wrap",
                }}>
                    {m.typing ? <TypingDots /> : (<>
                        {m.text}
                        {m.opps && m.opps.length > 0 && (<div style={{ marginTop: 10 }}>
                            {m.opps.map((o, i) => (<div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 5 }}>
                                <span style={{ color: "#16A34A", fontSize: 14, lineHeight: 1.4 }}>Ã¢Å“â€¦</span>
                                <span style={{ fontWeight: 600 }}>{o}</span>
                              </div>))}
                          </div>)}
                      </>)}
                  </div>
                </div>))}

              {/* Calendly CTA after done */}
              {phase === "done" && showCalendly && (<div style={{ textAlign: "center", paddingBottom: 8, animation: "kup .25s ease" }}>
                  <a href={CALENDLY} target="_blank" rel="noopener noreferrer" style={{
                    display: "inline-block", marginTop: 6,
                    background: `linear-gradient(135deg, ${PRIMARY}, #CB3273)`,
                    color: "#fff", borderRadius: 10, padding: "11px 22px",
                    fontSize: 13, fontWeight: 700, textDecoration: "none",
                }}>
                    Book My Free Strategy Call Ã¢â€ â€™
                  </a>
                </div>)}
            </div>)}

          <div ref={bottomRef}/>
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Text input bar (steps 0-2) Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {isTextStep && !busy && (<div style={{ padding: "8px 12px 12px", borderTop: "1px solid #F3F4F6", flexShrink: 0 }}>
            <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#F9FAFB", borderRadius: 26,
                padding: "8px 10px 8px 16px",
                border: "1.5px solid #E5E7EB",
            }}>
              <input ref={inputRef} value={textVal} onChange={e => setTextVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleAnswer(textVal);
        } }} placeholder={inputPlaceholder} style={{
                flex: 1, border: "none", outline: "none",
                background: "transparent", fontSize: 13, color: "#111827", minWidth: 0,
            }}/>
              <SendBtn active={!!textVal.trim()} onClick={() => void handleAnswer(textVal)}/>
            </div>
          </div>)}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Button options (steps 3-5) Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {isButtonStep && !busy && (<div style={{
                padding: "8px 12px 12px", borderTop: "1px solid #F3F4F6",
                display: "flex", flexWrap: "wrap", gap: 7, flexShrink: 0,
            }}>
            {buttonOpts.map(opt => (<button key={opt} onClick={() => void handleAnswer(opt)} style={{
                    padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                    background: "#F3F4F6", border: "1.5px solid #E5E7EB",
                    color: "#374151", cursor: "pointer",
                    transition: "border-color .15s, background .15s",
                }} onMouseOver={e => { e.currentTarget.style.borderColor = PRIMARY; e.currentTarget.style.background = "#FBE9F1"; }} onMouseOut={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#F3F4F6"; }}>
                {opt}
              </button>))}
          </div>)}
      </div>
    </>);
}
export default ChatWidget;
