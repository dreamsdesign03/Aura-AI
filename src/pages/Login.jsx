import { useState } from "react";
import { Eye, EyeOff, ArrowRight, Sparkles, Shield, Zap, Users } from "lucide-react";
const PINK = "#CB3273";
const PINK_LIGHT = "#E15C94";
const PINK_GRAD = `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`;
const PINK_SHADOW = "0 4px 18px rgba(203,50,115,0.32)";
export default function Login({ onSuccess }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST", headers: { "Content-Type": "application/json" },
                credentials: "include", body: JSON.stringify({ username: username.trim(), password }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error || "Invalid username or password");
            }
            else {
                onSuccess();
            }
        }
        catch {
            setError("Connection error — please try again");
        }
        finally {
            setLoading(false);
        }
    }
    const inputBase = "w-full px-4 py-3 rounded-xl text-[14px] outline-none transition-all border bg-white text-gray-900 placeholder-gray-400";
    function pinkBtnStyle(disabled) {
        return {
            fontSize: 14, fontWeight: 700, color: "white", border: "none",
            background: disabled ? "#9CA3AF" : PINK_GRAD,
            cursor: disabled ? "not-allowed" : "pointer",
            boxShadow: disabled ? "none" : PINK_SHADOW,
        };
    }
    const featureItems = [
        { icon: <Zap className="w-4 h-4"/>, label: "AI Agents", desc: "Autonomous follow-up & outreach" },
        { icon: <Users className="w-4 h-4"/>, label: "Smarter Sales", desc: "Lead scoring & pipeline insights" },
        { icon: <Shield className="w-4 h-4"/>, label: "Data Security", desc: "Enterprise-grade protection" },
        { icon: <Sparkles className="w-4 h-4"/>, label: "Complete Growth", desc: "All-in-one clinic growth OS" },
    ];
    return (<div className="min-h-screen flex flex-col lg:flex-row" style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#fff" }}>
      {/* ── Left panel — soft pink (desktop only) ── */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] flex-shrink-0 px-14 py-12 relative overflow-hidden" style={{ background: "linear-gradient(150deg, #FFF0F6 0%, #FCE7F3 35%, #FBE9F1 65%, #F9A8D4 100%)" }}>
        {/* subtle dot grid */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: `radial-gradient(circle, rgba(203,50,115,0.07) 1px, transparent 1px)`, backgroundSize: "28px 28px" }}/>
        {/* soft glow */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(ellipse 420px 340px at 80% 90%, rgba(236,72,153,0.12) 0%, transparent 65%)` }}/>

        {/* Logo */}
        <div className="relative z-10">
          <img src={`${import.meta.env.BASE_URL}logo-full.png`} alt="AuraAI — Laser & Cosmetic Clinic" style={{ height: 188, width: "auto", maxWidth: 480, objectFit: "contain", marginLeft: -42 }}/>
        </div>

        {/* Hero copy */}
        <div className="relative z-10">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: PINK, background: "rgba(203,50,115,0.08)", border: `1px solid rgba(203,50,115,0.18)`, padding: "5px 14px", borderRadius: 100, marginBottom: 24 }}>
            <Sparkles className="w-3 h-3"/> AI-Powered Clinic Management
          </div>

          <h2 style={{ fontSize: "clamp(30px,2.5vw,44px)", fontWeight: 900, color: "#111827", lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 16 }}>
            AI Agents.<br />
            Smarter Sales.<br />
            <span style={{ color: PINK }}>Complete Growth.</span>
          </h2>

          <p style={{ fontSize: 15, lineHeight: 1.7, color: "#6B7280", marginBottom: 40, maxWidth: 380 }}>
            Everything your clinic needs — from patient management and AI-powered bookings to automated outreach and growth analytics.
          </p>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-3">
            {featureItems.map(({ icon, label, desc }) => (<div key={label} className="rounded-2xl p-4 bg-white" style={{ border: "1px solid rgba(203,50,115,0.12)", boxShadow: "0 2px 12px rgba(203,50,115,0.06)" }}>
                <div className="flex items-center gap-2 mb-1.5" style={{ color: PINK }}>
                  {icon}
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{label}</span>
                </div>
                <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5, margin: 0 }}>{desc}</p>
              </div>))}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-8 mt-8">
            {[{ val: "98%", label: "Client satisfaction" }, { val: "3×", label: "Faster bookings" }, { val: "40%", label: "More retention" }].map(({ val, label }) => (<div key={label}>
                <div style={{ fontSize: 24, fontWeight: 900, color: PINK, letterSpacing: "-0.025em", lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 10, marginTop: 3, color: "#9CA3AF", fontWeight: 500 }}>{label}</div>
              </div>))}
          </div>
        </div>

        <p style={{ fontSize: 11, color: "#C4A8C4", position: "relative", zIndex: 10 }}>© {new Date().getFullYear()} AuraAI · Laser &amp; Cosmetic Clinic</p>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 lg:py-0" style={{ background: "#FAFAFA" }}>

        {/* Mobile logo */}
        <div className="flex lg:hidden mb-8">
          <img src={`${import.meta.env.BASE_URL}logo-full.png`} alt="AuraAI — Laser & Cosmetic Clinic" style={{ height: 56, width: "auto", maxWidth: 200, objectFit: "contain" }}/>
        </div>

        <div className="w-full max-w-[400px]">
          <div className="mb-7">
            <h1 style={{ fontSize: 30, fontWeight: 900, color: "#111827", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 6 }}>
              Welcome back 👋
            </h1>
            <p style={{ fontSize: 14, color: "#6B7280" }}>Sign in to your AuraAI account</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-7 space-y-4" style={{ borderColor: "#F3F4F6" }}>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 6, color: "#374151" }}>Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" placeholder="your username" className={inputBase} style={{ border: "1.5px solid #FBE9F1" }} onFocus={e => { e.currentTarget.style.borderColor = PINK; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(203,50,115,0.08)`; }} onBlur={e => { e.currentTarget.style.borderColor = "#FBE9F1"; e.currentTarget.style.boxShadow = "none"; }}/>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 6, color: "#374151" }}>Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" className={inputBase + " pr-10"} style={{ border: "1.5px solid #FBE9F1" }} onFocus={e => { e.currentTarget.style.borderColor = PINK; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(203,50,115,0.08)`; }} onBlur={e => { e.currentTarget.style.borderColor = "#FBE9F1"; e.currentTarget.style.boxShadow = "none"; }}/>
                  <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF", background: "none", border: "none", cursor: "pointer" }}>
                    {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
              </div>

              {error && (<div style={{ fontSize: 12, padding: "10px 14px", borderRadius: 12, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>{error}</div>)}

              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl transition-all" style={pinkBtnStyle(loading)} onMouseEnter={e => { if (!loading)
            e.currentTarget.style.boxShadow = "0 6px 24px rgba(203,50,115,0.42)"; }} onMouseLeave={e => { if (!loading)
            e.currentTarget.style.boxShadow = PINK_SHADOW; }}>
                {loading ? "Signing in…" : <><span>Sign in</span><ArrowRight className="w-4 h-4"/></>}
              </button>
            </form>
          </div>

          <p className="text-center mt-5" style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.7 }}>
            Authorized access only. By signing in, you agree to our{" "}
            <a href="#" style={{ color: "#9CA3AF", textDecoration: "underline" }}>Terms</a>
            {" & "}
            <a href="#" style={{ color: "#9CA3AF", textDecoration: "underline" }}>Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>);
}
