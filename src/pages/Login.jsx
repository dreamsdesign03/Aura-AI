import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, ArrowRight, Phone, ChevronLeft, Sparkles, Shield, Zap, Users } from "lucide-react";
import { RecaptchaVerifier, signInWithPhoneNumber, } from "firebase/auth";
import { getFirebaseAuth, firebaseConfigured } from "../lib/firebase";
const COUNTRY_CODES = [
    { code: "+91", flag: "🇮🇳", name: "India" },
    { code: "+1", flag: "🇺🇸", name: "USA / Canada" },
    { code: "+44", flag: "🇬🇧", name: "UK" },
    { code: "+61", flag: "🇦🇺", name: "Australia" },
    { code: "+971", flag: "🇦🇪", name: "UAE" },
    { code: "+65", flag: "🇸🇬", name: "Singapore" },
    { code: "+60", flag: "🇲🇾", name: "Malaysia" },
    { code: "+49", flag: "🇩🇪", name: "Germany" },
    { code: "+33", flag: "🇫🇷", name: "France" },
    { code: "+81", flag: "🇯🇵", name: "Japan" },
];
const TEAM_SIZES = ["Just me", "2–5", "6–10", "11–25", "26–50", "51–100", "100+"];
const PINK = "#CB3273";
const PINK_LIGHT = "#E15C94";
const PINK_GRAD = `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`;
const PINK_SHADOW = "0 4px 18px rgba(203,50,115,0.32)";
export default function Login({ onSuccess, onRegisterClick }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [phoneStep, setPhoneStep] = useState("idle");
    const [countryCode, setCountryCode] = useState("+91");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [phoneLoading, setPhoneLoading] = useState(false);
    const [phoneError, setPhoneError] = useState("");
    const [resendSecs, setResendSecs] = useState(0);
    const [otpEnabled, setOtpEnabled] = useState(false);
    const [verifiedPhone, setVerifiedPhone] = useState("");
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [profFirstName, setProfFirstName] = useState("");
    const [profLastName, setProfLastName] = useState("");
    const [profEmail, setProfEmail] = useState("");
    const [profCity, setProfCity] = useState("");
    const [profCompany, setProfCompany] = useState("");
    const [profDesignation, setProfDesignation] = useState("");
    const [profTeamSize, setProfTeamSize] = useState("");
    const [profLoading, setProfLoading] = useState(false);
    const [profError, setProfError] = useState("");
    const [profEmailSent, setProfEmailSent] = useState(false);
    const confirmationRef = useRef(null);
    const recaptchaRef = useRef(null);
    const timerRef = useRef(null);
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get("error");
        if (oauthError) {
            const messages = {
                oauth_denied: "Sign-in was cancelled. Please try again.",
                state_mismatch: "Sign-in session expired. Please try again.",
                no_code: "Google didn't return an auth code. Please try again.",
                token_exchange_failed: "Couldn't complete Google sign-in. Please try again.",
                no_email: "Your Google account didn't share an email address.",
                server_error: "A server error occurred during sign-in. Please try again.",
                oauth_not_configured: "Google sign-in is not configured yet.",
                redirect_uri_mismatch: "Google OAuth redirect URI mismatch — check Google Cloud Console settings.",
            };
            setError(messages[oauthError] ?? `Sign-in error: ${oauthError}`);
            window.history.replaceState({}, "", window.location.pathname);
        }
        if (firebaseConfigured) {
            fetch("/api/auth/otp/available", { credentials: "include" })
                .then(r => r.json())
                .then((d) => setOtpEnabled(d.enabled ?? false))
                .catch(() => setOtpEnabled(false));
        }
    }, []);
    useEffect(() => {
        return () => {
            if (timerRef.current)
                clearInterval(timerRef.current);
            recaptchaRef.current?.clear();
        };
    }, []);
    function startResendTimer() {
        setResendSecs(60);
        timerRef.current = setInterval(() => {
            setResendSecs(s => { if (s <= 1) {
                clearInterval(timerRef.current);
                return 0;
            } return s - 1; });
        }, 1000);
    }
    async function handleSendOtp(e) {
        e?.preventDefault();
        setPhoneError("");
        const digits = phoneNumber.replace(/\D/g, "");
        if (!digits || digits.length < 7) {
            setPhoneError("Enter a valid phone number.");
            return;
        }
        const fullPhone = `${countryCode}${digits}`;
        setPhoneLoading(true);
        try {
            const auth = getFirebaseAuth();
            if (!recaptchaRef.current) {
                recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
            }
            const confirmation = await signInWithPhoneNumber(auth, fullPhone, recaptchaRef.current);
            confirmationRef.current = confirmation;
            setPhoneStep("otp");
            startResendTimer();
        }
        catch (err) {
            const code = err.code ?? "";
            const msg = err.message ?? "";
            if (code === "auth/invalid-phone-number" || msg.includes("invalid-phone-number"))
                setPhoneError("Invalid phone number. Check the country code and digits.");
            else if (code === "auth/too-many-requests" || msg.includes("too-many-requests"))
                setPhoneError("Too many attempts. Please wait a few minutes and try again.");
            else if (code === "auth/unauthorized-domain" || msg.includes("unauthorized-domain"))
                setPhoneError("This domain is not authorised for phone sign-in.");
            else if (code === "auth/operation-not-allowed" || msg.includes("operation-not-allowed"))
                setPhoneError("Phone sign-in is not enabled. Please use another method.");
            else if (code === "auth/captcha-check-failed" || msg.includes("captcha-check-failed"))
                setPhoneError("reCAPTCHA check failed. Please refresh the page and try again.");
            else
                setPhoneError("Failed to send OTP. Please try again.");
            recaptchaRef.current?.clear();
            recaptchaRef.current = null;
        }
        finally {
            setPhoneLoading(false);
        }
    }
    async function handleVerifyOtp(e) {
        e.preventDefault();
        if (!confirmationRef.current)
            return;
        setPhoneError("");
        setPhoneLoading(true);
        try {
            const result = await confirmationRef.current.confirm(otpCode);
            const idToken = await result.user.getIdToken();
            const res = await fetch("/api/auth/otp/firebase-verify", {
                method: "POST", headers: { "Content-Type": "application/json" },
                credentials: "include", body: JSON.stringify({ idToken }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setPhoneError(body.error ?? "Verification failed. Please try again.");
                return;
            }
            const body = await res.json().catch(() => ({}));
            setVerifiedPhone(`${countryCode}${phoneNumber.replace(/\D/g, "")}`);
            if (body.isNewUser) {
                setShowProfileModal(true);
            }
            else {
                onSuccess();
            }
        }
        catch (err) {
            const msg = err.message ?? "";
            if (msg.includes("invalid-verification-code"))
                setPhoneError("Wrong code. Please check and try again.");
            else if (msg.includes("code-expired"))
                setPhoneError("Code expired. Request a new one.");
            else
                setPhoneError("Verification failed. Please try again.");
        }
        finally {
            setPhoneLoading(false);
        }
    }
    async function handleProfileSave(e) {
        e.preventDefault();
        setProfError("");
        if (!profFirstName.trim()) {
            setProfError("First name is required.");
            return;
        }
        if (!profEmail.trim()) {
            setProfError("Email address is required.");
            return;
        }
        setProfLoading(true);
        try {
            const body = { firstName: profFirstName.trim(), email: profEmail.trim() };
            if (profLastName.trim())
                body.lastName = profLastName.trim();
            if (profCity.trim())
                body.city = profCity.trim();
            if (profCompany.trim())
                body.companyName = profCompany.trim();
            if (profDesignation.trim())
                body.designation = profDesignation.trim();
            if (profTeamSize)
                body.teamSize = profTeamSize;
            const res = await fetch("/api/users/me", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                credentials: "include", body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setProfError(data.error ?? "Couldn't save your profile. Please try again.");
                return;
            }
            const data = await res.json().catch(() => ({}));
            if (data.verificationEmailSent) {
                setProfEmailSent(true);
            }
            else {
                onSuccess();
            }
        }
        catch {
            setProfError("Connection error. Please try again.");
        }
        finally {
            setProfLoading(false);
        }
    }
    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST", headers: { "Content-Type": "application/json" },
                credentials: "include", body: JSON.stringify({ email: email.trim(), password }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error || "Invalid email or password");
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
    function resetPhoneFlow() {
        setPhoneStep("idle");
        setPhoneNumber("");
        setOtpCode("");
        setPhoneError("");
        setResendSecs(0);
        confirmationRef.current = null;
        if (timerRef.current)
            clearInterval(timerRef.current);
        recaptchaRef.current?.clear();
        recaptchaRef.current = null;
    }
    const inputBase = "w-full px-4 py-3 rounded-xl text-[14px] outline-none transition-all border bg-white text-gray-900 placeholder-gray-400";
    const inputSm = "w-full px-3 py-2.5 rounded-xl text-[13px] outline-none transition-all border bg-white text-gray-900 placeholder-gray-400";
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

          {/* ── Phone OTP flow ── */}
          {phoneStep !== "idle" ? (<div className="bg-white rounded-2xl shadow-sm border p-8" style={{ borderColor: "#F3F4F6" }}>
              <button type="button" onClick={resetPhoneFlow} className="flex items-center gap-1.5 mb-6" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 13, fontWeight: 500, padding: 0 }}>
                <ChevronLeft className="w-4 h-4"/> Back
              </button>

              {phoneStep === "phone" && (<>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", marginBottom: 5 }}>Enter your phone</h2>
                  <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 22 }}>We'll send a 6-digit SMS code to verify your number.</p>
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 6, color: "#374151" }}>Phone number</label>
                      <div className="flex gap-2">
                        <select value={countryCode} onChange={e => setCountryCode(e.target.value)} style={{ border: `1.5px solid #FBE9F1`, borderRadius: 12, padding: "12px 10px", fontSize: 13, fontWeight: 600, color: "#374151", background: "white", outline: "none", cursor: "pointer", flexShrink: 0 }}>
                          {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                        </select>
                        <input type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="9876543210" autoFocus className={inputBase} style={{ border: "1.5px solid #FBE9F1" }}/>
                      </div>
                    </div>
                    {phoneError && <div style={{ fontSize: 12, padding: "10px 14px", borderRadius: 12, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>{phoneError}</div>}
                    <button type="submit" disabled={phoneLoading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all" style={pinkBtnStyle(phoneLoading)}>
                      {phoneLoading ? "Sending…" : <><span>Send OTP</span><ArrowRight className="w-4 h-4"/></>}
                    </button>
                  </form>
                </>)}

              {phoneStep === "otp" && (<>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", marginBottom: 5 }}>Enter your code</h2>
                  <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 22 }}>Sent to <strong>{countryCode}{phoneNumber}</strong>.</p>
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" autoFocus className={inputBase} style={{ border: "1.5px solid #FBE9F1", letterSpacing: "0.4em", textAlign: "center", fontSize: 24, fontWeight: 800 }}/>
                    {phoneError && <div style={{ fontSize: 12, padding: "10px 14px", borderRadius: 12, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>{phoneError}</div>}
                    <button type="submit" disabled={phoneLoading || otpCode.length !== 6} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all" style={pinkBtnStyle(phoneLoading || otpCode.length !== 6)}>
                      {phoneLoading ? "Verifying…" : <><span>Verify &amp; sign in</span><ArrowRight className="w-4 h-4"/></>}
                    </button>
                    <div style={{ textAlign: "center", fontSize: 13, color: "#6B7280" }}>
                      {resendSecs > 0 ? <span>Resend in {resendSecs}s</span> : (<button type="button" onClick={() => { setPhoneStep("phone"); setOtpCode(""); setPhoneError(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: PINK, fontWeight: 600, fontSize: 13 }}>Resend code</button>)}
                    </div>
                  </form>
                </>)}

              <div id="recaptcha-container"/>
            </div>) : (
        /* ── Idle: email/password form ── */
        <>
              <div className="mb-7">
                <h1 style={{ fontSize: 30, fontWeight: 900, color: "#111827", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 6 }}>
                  Welcome back 👋
                </h1>
                <p style={{ fontSize: 14, color: "#6B7280" }}>Sign in to your AuraAI account</p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border p-7 space-y-4" style={{ borderColor: "#F3F4F6" }}>

                {/* Google OAuth */}
                <a href="/api/auth/google" className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border-2 transition-all font-semibold text-[14px]" style={{ borderColor: "#E5E7EB", color: "#374151", background: "#fff", textDecoration: "none" }} onMouseEnter={e => { e.currentTarget.style.borderColor = PINK_LIGHT; e.currentTarget.style.background = "#FFF0F6"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </a>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: "#F3F4F6" }}/>
                  <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>or sign in with email</span>
                  <div className="flex-1 h-px" style={{ background: "#F3F4F6" }}/>
                </div>

                {/* Email + password */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 6, color: "#374151" }}>Email address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@clinic.com" className={inputBase} style={{ border: "1.5px solid #FBE9F1" }} onFocus={e => { e.currentTarget.style.borderColor = PINK; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(203,50,115,0.08)`; }} onBlur={e => { e.currentTarget.style.borderColor = "#FBE9F1"; e.currentTarget.style.boxShadow = "none"; }}/>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>Password</label>
                      <button type="button" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: PINK, fontWeight: 600, padding: 0 }}>
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" className={inputBase + " pr-10"} style={{ border: "1.5px solid #FBE9F1" }} onFocus={e => { e.currentTarget.style.borderColor = PINK; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(203,50,115,0.08)`; }} onBlur={e => { e.currentTarget.style.borderColor = "#FBE9F1"; e.currentTarget.style.boxShadow = "none"; }}/>
                      <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF", background: "none", border: "none", cursor: "pointer" }}>
                        {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                      </button>
                    </div>
                  </div>

                  {/* Remember me */}
                  <div className="flex items-center gap-2.5">
                    <button type="button" onClick={() => setRememberMe(v => !v)} className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all" style={{
                borderColor: rememberMe ? PINK : "#D1D5DB",
                background: rememberMe ? PINK : "#fff",
            }}>
                      {rememberMe && (<svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>)}
                    </button>
                    <span style={{ fontSize: 13, color: "#6B7280", userSelect: "none", cursor: "pointer" }} onClick={() => setRememberMe(v => !v)}>
                      Remember me
                    </span>
                  </div>

                  {error && (<div style={{ fontSize: 12, padding: "10px 14px", borderRadius: 12, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>{error}</div>)}

                  <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl transition-all" style={pinkBtnStyle(loading)} onMouseEnter={e => { if (!loading)
            e.currentTarget.style.boxShadow = "0 6px 24px rgba(203,50,115,0.42)"; }} onMouseLeave={e => { if (!loading)
            e.currentTarget.style.boxShadow = PINK_SHADOW; }}>
                    {loading ? "Signing in…" : <><span>Sign in</span><ArrowRight className="w-4 h-4"/></>}
                  </button>
                </form>

                {/* Phone OTP option */}
                {otpEnabled && (<button type="button" onClick={() => { setPhoneStep("phone"); setPhoneError(""); setOtpCode(""); }} className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border-2 transition-all text-[13px] font-semibold" style={{ borderColor: "#FBE9F1", color: PINK, background: "#FFF0F6" }} onMouseEnter={e => { e.currentTarget.style.background = "#FCE7F3"; }} onMouseLeave={e => { e.currentTarget.style.background = "#FFF0F6"; }}>
                    <Phone className="w-4 h-4"/> Continue with Mobile OTP
                  </button>)}
              </div>

              {/* Sign up + terms */}
              <p className="text-center mt-5" style={{ fontSize: 13, color: "#6B7280" }}>
                Don't have an account?{" "}
                <button type="button" onClick={onRegisterClick} style={{ background: "none", border: "none", cursor: "pointer", color: PINK, fontWeight: 700, fontSize: 13, padding: 0 }} onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>Sign up for free</button>
              </p>
              <p className="text-center mt-2" style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.7 }}>
                By signing in, you agree to our{" "}
                <a href="#" style={{ color: "#9CA3AF", textDecoration: "underline" }}>Terms</a>
                {" & "}
                <a href="#" style={{ color: "#9CA3AF", textDecoration: "underline" }}>Privacy Policy</a>
              </p>

              <div id="recaptcha-container"/>
            </>)}
        </div>
      </div>

      {/* ── Complete your profile modal ── */}
      {showProfileModal && (<div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
          <div style={{ background: "white", borderRadius: 24, padding: "32px 28px", width: "100%", maxWidth: 480, margin: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.28)" }}>
            {!profEmailSent ? (<>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ width: 54, height: 54, borderRadius: 15, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: PINK_GRAD }}>
                    <span style={{ fontSize: 26 }}>👤</span>
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", margin: 0 }}>Complete your profile</h2>
                  <p style={{ fontSize: 13, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>
                    We need a few details to personalise your account.
                  </p>
                </div>

                <form onSubmit={handleProfileSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5, color: "#374151" }}>First name <span style={{ color: PINK }}>*</span></label>
                      <input type="text" value={profFirstName} onChange={e => setProfFirstName(e.target.value)} placeholder="Alex" autoFocus required className={inputSm} style={{ border: "1.5px solid #FBE9F1" }}/>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5, color: "#374151" }}>Last name</label>
                      <input type="text" value={profLastName} onChange={e => setProfLastName(e.target.value)} placeholder="Smith" className={inputSm} style={{ border: "1.5px solid #FBE9F1" }}/>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5, color: "#374151" }}>
                        Work email <span style={{ color: PINK }}>*</span>
                      </label>
                      <input type="email" value={profEmail} onChange={e => setProfEmail(e.target.value)} placeholder="you@company.com" required className={inputSm} style={{ border: "1.5px solid #FBE9F1" }}/>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5, color: "#374151" }}>Phone no</label>
                      <input type="text" value={verifiedPhone} readOnly className={inputSm} style={{ border: "1.5px solid #FBE9F1", background: "#FFF0F6", color: "#6B7280", cursor: "default" }}/>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5, color: "#374151" }}>City</label>
                      <input type="text" value={profCity} onChange={e => setProfCity(e.target.value)} placeholder="Mumbai" className={inputSm} style={{ border: "1.5px solid #FBE9F1" }}/>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5, color: "#374151" }}>Clinic name</label>
                      <input type="text" value={profCompany} onChange={e => setProfCompany(e.target.value)} placeholder="Aura Clinic" className={inputSm} style={{ border: "1.5px solid #FBE9F1" }}/>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5, color: "#374151" }}>Role</label>
                      <input type="text" value={profDesignation} onChange={e => setProfDesignation(e.target.value)} placeholder="Clinic Manager" className={inputSm} style={{ border: "1.5px solid #FBE9F1" }}/>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5, color: "#374151" }}>Team size</label>
                      <select value={profTeamSize} onChange={e => setProfTeamSize(e.target.value)} className={inputSm} style={{ border: "1.5px solid #FBE9F1", cursor: "pointer", appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 30 }}>
                        <option value="">Select…</option>
                        {TEAM_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: -4 }}>
                    A verification link will be sent to your email address.
                  </p>

                  {profError && <div style={{ fontSize: 12, padding: "10px 14px", borderRadius: 12, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>{profError}</div>}

                  <button type="submit" disabled={profLoading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all" style={{ ...pinkBtnStyle(profLoading), marginTop: 4 }}>
                    {profLoading ? "Saving…" : <><span>Get started</span><ArrowRight className="w-4 h-4"/></>}
                  </button>
                </form>
              </>) : (<div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ width: 54, height: 54, borderRadius: 15, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", background: PINK_GRAD }}>
                  <span style={{ fontSize: 26 }}>✉️</span>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 8 }}>Verify your email</h2>
                <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6, marginBottom: 20 }}>
                  We sent a verification link to <strong style={{ color: PINK }}>{profEmail}</strong>.<br />
                  Click it to confirm your email, then you're all set.
                </p>
                <button type="button" onClick={onSuccess} className="w-full py-3 rounded-xl transition-all" style={{ ...pinkBtnStyle(false), display: "block" }}>
                  Go to dashboard
                </button>
              </div>)}
          </div>
        </div>)}
    </div>);
}
