import { useState, useEffect, useRef } from "react";
import { useGetBrandingSettings } from "@workspace/api-client-react";
import { User, Building2, Mail, MessageCircle, Link2, CheckCircle, XCircle, Loader2, Save, Palette, Upload, X, Send, Eye, EyeOff, Lock, Globe, Phone, Smartphone, AlertCircle, ExternalLink, Users, UserPlus, Shield, UserX, Trash2, MoreVertical, ChevronDown, ChevronLeft, Zap, Brain, Copy, ShieldCheck, Check } from "lucide-react";
import { RecaptchaVerifier, signInWithPhoneNumber, } from "firebase/auth";
import { getFirebaseAuth, firebaseConfigured } from "../lib/firebase";
import { useAuthUser, useUpdateUser, useRefreshUser } from "@/contexts/AuthContext";
const ALL_TABS = [
    { id: "profile", label: "Profile", icon: User },
    { id: "company", label: "Company", icon: Building2 },
    { id: "email", label: "Email", icon: Mail, adminOnly: true },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, adminOnly: true },
    { id: "ai", label: "AI Models", icon: Brain, ownerOnly: true },
];
const inputClass = "w-full text-sm rounded-lg border border-gray-200 bg-white text-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors";
const labelClass = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5";
function useExpiryCountdown(expiresAt) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        if (!expiresAt)
            return;
        const expiry = new Date(expiresAt);
        if (expiry <= new Date())
            return;
        const id = setInterval(() => {
            const current = new Date();
            setNow(current);
            if (current >= expiry)
                clearInterval(id);
        }, 30_000);
        return () => clearInterval(id);
    }, [expiresAt]);
    if (!expiresAt)
        return { expired: false, label: null };
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    if (diffMs <= 0)
        return { expired: true, label: null };
    const totalMinutes = Math.ceil(diffMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return { expired: false, label };
}
function SectionCard({ title, subtitle, icon: Icon, iconBg, iconColor, children }) {
    return (<div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon className="w-4 h-4" style={{ color: iconColor }}/>
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          {subtitle && <div className="text-[11px] text-gray-400">{subtitle}</div>}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>);
}
function SaveButton({ pending, success, label = "Save changes" }) {
    return (<button type="submit" disabled={pending} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-all hover:bg-[#A4285E]" style={{ background: success ? "#16a34a" : "#CB3273" }}>
      {pending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin"/>
            : success
                ? <CheckCircle className="w-3.5 h-3.5"/>
                : <Save className="w-3.5 h-3.5"/>}
      {success ? "Saved!" : label}
    </button>);
}
// ── Profile Name Form ──────────────────────────────────────────────────────────
function ProfileNameForm() {
    const authUser = useAuthUser();
    const updateUser = useUpdateUser();
    const refreshUser = useRefreshUser();
    const isPhoneUser = (authUser?.email ?? "").endsWith("@otp.mysa.internal");
    const [firstName, setFirstName] = useState(authUser?.firstName ?? "");
    const [lastName, setLastName] = useState(authUser?.lastName ?? "");
    const [newEmail, setNewEmail] = useState("");
    const [profileSave, setProfileSave] = useState(false);
    const [profileErr, setProfileErr] = useState("");
    const [profilePend, setProfilePend] = useState(false);
    const [emailSentNotice, setEmailSentNotice] = useState("");
    const [resendPend, setResendPend] = useState(false);
    const [resendMsg, setResendMsg] = useState("");
    const [resendErr, setResendErr] = useState("");
    const [resendCooldown, setResendCooldown] = useState(0);
    const resendTimerRef = useRef(null);
    const { expired: linkExpired, label: expiryLabel } = useExpiryCountdown(authUser?.pendingEmailTokenExpiresAt);
    const committedFirst = useRef(authUser?.firstName ?? "");
    const committedLast = useRef(authUser?.lastName ?? "");
    useEffect(() => {
        const newFirst = authUser?.firstName ?? "";
        const newLast = authUser?.lastName ?? "";
        if (firstName === committedFirst.current && newFirst !== committedFirst.current) {
            setFirstName(newFirst);
        }
        if (lastName === committedLast.current && newLast !== committedLast.current) {
            setLastName(newLast);
        }
        committedFirst.current = newFirst;
        committedLast.current = newLast;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authUser?.firstName, authUser?.lastName]);
    useEffect(() => {
        return () => {
            if (resendTimerRef.current)
                clearInterval(resendTimerRef.current);
        };
    }, []);
    function startResendCooldown(seconds) {
        setResendCooldown(seconds);
        if (resendTimerRef.current)
            clearInterval(resendTimerRef.current);
        resendTimerRef.current = setInterval(() => {
            setResendCooldown(s => {
                if (s <= 1) {
                    clearInterval(resendTimerRef.current);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
    }
    async function handleResendPendingEmail(e) {
        e.preventDefault();
        setResendErr("");
        setResendMsg("");
        setResendPend(true);
        try {
            const res = await fetch("/api/auth/resend-pending-email", {
                method: "POST",
                credentials: "include",
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setResendErr(d.error || "Failed to resend. Please try again.");
                if (res.status === 429 && d.secondsLeft)
                    startResendCooldown(d.secondsLeft);
            }
            else {
                setResendMsg("Verification email resent! Check your inbox.");
                startResendCooldown(60);
                await refreshUser();
            }
        }
        catch {
            setResendErr("Network error. Please try again.");
        }
        finally {
            setResendPend(false);
        }
    }
    async function handleProfileSave(e) {
        e.preventDefault();
        setProfileErr("");
        setProfileSave(false);
        setEmailSentNotice("");
        setProfilePend(true);
        const trimmedFirst = firstName.trim();
        const trimmedLast = lastName.trim();
        const trimmedEmail = newEmail.trim();
        const body = { firstName: trimmedFirst, lastName: trimmedLast };
        if (isPhoneUser && trimmedEmail)
            body.email = trimmedEmail;
        console.log("[Client - User Profile Settings] 💾 Saving profile details to PostgreSQL table 'users':", body);
        try {
            const res = await fetch("/api/users/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error("[Client - User Profile Settings] ❌ Error updating PostgreSQL table 'users':", d);
                setProfileErr(d.error || "Failed to save");
            }
            else {
                console.log("[Client - User Profile Settings] ✅ Successfully updated user details in PostgreSQL table 'users':", d);
                committedFirst.current = trimmedFirst;
                committedLast.current = trimmedLast;
                if (d.verificationEmailSent) {
                    setNewEmail("");
                    updateUser({ firstName: trimmedFirst, lastName: trimmedLast, pendingEmail: d.pendingEmail ?? trimmedEmail });
                    setEmailSentNotice(`Verification email sent to ${d.pendingEmail ?? trimmedEmail}. Check your inbox to confirm it.`);
                }
                else {
                    updateUser({ firstName: trimmedFirst, lastName: trimmedLast });
                    setProfileSave(true);
                    setTimeout(() => setProfileSave(false), 3000);
                }
            }
        }
        catch (err) {
            console.error("[Client - User Profile Settings] ❌ Network Error while updating table 'users':", err);
            setProfileErr("Network error");
        }
        finally {
            setProfilePend(false);
        }
    }
    const avatarInitials = ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase() || (authUser?.email?.[0]?.toUpperCase() ?? "?");
    return (<SectionCard title="Personal Information" subtitle="Update your name and profile details" icon={User} iconBg="#F0FDF4" iconColor="#1A7A45">
      <form onSubmit={handleProfileSave} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white flex-shrink-0" style={{ background: "linear-gradient(135deg, #CB3273, #E63980)" }}>
            {avatarInitials}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : authUser?.email}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5 capitalize">{authUser?.role ?? "member"}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>First name</label>
            <input type="text" className={inputClass} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane"/>
          </div>
          <div>
            <label className={labelClass}>Last name</label>
            <input type="text" className={inputClass} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith"/>
          </div>
        </div>

        {isPhoneUser ? (<div>
            <label className={labelClass}>Email address</label>
            {authUser?.pendingEmail ? (<div>
                <div className={`rounded-lg border px-3 py-2 mb-2 ${linkExpired ? "border-red-200 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
                      <div className={`flex items-start gap-2 text-xs ${linkExpired ? "text-red-700" : "text-amber-700"}`}>
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>
                        <div className="flex-1 min-w-0">
                          {linkExpired ? (<div>
                              <strong className="block">Verification link expired</strong>
                              <span className="text-[11px] opacity-80">{authUser.pendingEmail} — send a new link to confirm this address.</span>
                            </div>) : (<span>
                              <strong>{authUser.pendingEmail}</strong> — verification email sent. Check your inbox to confirm it.
                              {expiryLabel && (<span className="ml-1 text-[11px] opacity-70">(Link expires in {expiryLabel})</span>)}
                            </span>)}
                          <div className="mt-1.5">
                            {resendMsg ? (<span className="flex items-center gap-1 text-teal-700">
                                <CheckCircle className="w-3 h-3 flex-shrink-0"/> {resendMsg}
                              </span>) : resendErr ? (<span className="text-red-600">{resendErr}</span>) : null}
                            <button type="button" onClick={handleResendPendingEmail} disabled={resendPend || resendCooldown > 0} className={`mt-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2 disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed transition-colors ${linkExpired ? "text-red-800 hover:text-red-900" : "text-amber-800 hover:text-amber-900"}`}>
                              {resendPend
                    ? <><Loader2 className="w-3 h-3 animate-spin"/> Sending…</>
                    : resendCooldown > 0
                        ? linkExpired ? <>Send a new link in {resendCooldown}s</> : <>Resend link in {resendCooldown}s</>
                        : linkExpired
                            ? <><Send className="w-3 h-3"/> Send a new link</>
                            : <><Send className="w-3 h-3"/> Resend link</>}
                            </button>
                          </div>
                        </div>
                      </div>
                </div>
                <input type="email" className={inputClass} value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Change to a different address"/>
                <p className="mt-1 text-[10px] text-gray-400">
                  Enter a different address above to resend to that address instead.
                </p>
              </div>) : (<div>
                <input type="email" className={inputClass} value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="you@example.com"/>
                <p className="mt-1 text-[10px] text-gray-400">
                  Add your email to receive notifications and sign in without your phone.
                  We'll send a verification link to confirm it.
                </p>
              </div>)}
          </div>) : (<div>
            <label className={labelClass}>Email address</label>
            <input type="email" className={inputClass + " bg-gray-50 cursor-not-allowed opacity-70"} value={authUser?.email ?? ""} disabled readOnly/>
            <p className="mt-1 text-[10px] text-gray-400">Contact support to change your email address</p>
            {authUser?.pendingEmail && (<div className={`rounded-lg border px-3 py-2 mt-2 ${linkExpired ? "border-red-200 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
                  <div className={`flex items-start gap-2 text-xs ${linkExpired ? "text-red-700" : "text-amber-700"}`}>
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>
                    <div className="flex-1 min-w-0">
                      {linkExpired ? (<div>
                          <strong className="block">Verification link expired</strong>
                          <span className="text-[11px] opacity-80">{authUser.pendingEmail} — send a new link to confirm this address.</span>
                        </div>) : (<span>
                          <strong>{authUser.pendingEmail}</strong> — verification email sent. Check your inbox to confirm it.
                          {expiryLabel && (<span className="ml-1 text-[11px] opacity-70">(Link expires in {expiryLabel})</span>)}
                        </span>)}
                      <div className="mt-1.5">
                        {resendMsg ? (<span className="flex items-center gap-1 text-teal-700">
                            <CheckCircle className="w-3 h-3 flex-shrink-0"/> {resendMsg}
                          </span>) : resendErr ? (<span className="text-red-600">{resendErr}</span>) : null}
                        <button type="button" onClick={handleResendPendingEmail} disabled={resendPend || resendCooldown > 0} className={`mt-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2 disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed transition-colors ${linkExpired ? "text-red-800 hover:text-red-900" : "text-amber-800 hover:text-amber-900"}`}>
                          {resendPend
                    ? <><Loader2 className="w-3 h-3 animate-spin"/> Sending…</>
                    : resendCooldown > 0
                        ? linkExpired ? <>Send a new link in {resendCooldown}s</> : <>Resend link in {resendCooldown}s</>
                        : linkExpired
                            ? <><Send className="w-3 h-3"/> Send a new link</>
                            : <><Send className="w-3 h-3"/> Resend link</>}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>)}
          </div>)}

        {emailSentNotice && (<div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2 border border-teal-100">
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0"/> {emailSentNotice}
          </div>)}

        {profileErr && (<div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
            <XCircle className="w-3.5 h-3.5 flex-shrink-0"/> {profileErr}
          </div>)}
        <SaveButton pending={profilePend} success={profileSave}/>
      </form>
    </SectionCard>);
}
// ── Default Password Card ───────────────────────────────────────────────────────
function DefaultPasswordCard() {
    const authUser = useAuthUser();
    const [showPassword, setShowPassword] = useState(false);
    const [copied, setCopied] = useState(false);
    const defaultUsername = "auraadmin";
    const defaultPassword = "Vishnu@Krishna";

    const handleCopy = () => {
        navigator.clipboard.writeText(defaultPassword);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (<SectionCard title="Default Account Password" subtitle="Default sign-in credentials configured for your account" icon={Lock} iconBg="#FEF3C7" iconColor="#DE377C">
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2.5 border border-amber-200">
          <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600"/>
          <span>
            Default credentials configured for <strong>Aura AI</strong> team access. Use the username and default password below to log in.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Username</label>
            <div className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-gray-200 bg-gray-50 text-gray-900 flex items-center justify-between">
              <span className="truncate">{defaultUsername}</span>
            </div>
          </div>

          <div>
            <label className={labelClass}>Default Password</label>
            <div className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-200 bg-gray-50 text-gray-900 flex items-center justify-between gap-2">
              <span className="font-bold tracking-wider text-sm">
                {showPassword ? defaultPassword : "••••••••••••"}
              </span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200/60 rounded transition-colors" title={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                </button>
                <button type="button" onClick={handleCopy} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors">
                  {copied ? <Check className="w-3 h-3 text-teal-600"/> : <Copy className="w-3 h-3"/>}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>);
}
// ── Phone Number Form ──────────────────────────────────────────────────────────
const PHONE_COUNTRY_CODES = [
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
function PhoneNumberForm() {
    const authUser = useAuthUser();
    const refreshUser = useRefreshUser();
    const [otpEnabled, setOtpEnabled] = useState(false);
    const [step, setStep] = useState("idle");
    const [countryCode, setCountryCode] = useState("+91");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [resendSecs, setResendSecs] = useState(0);
    const confirmationRef = useRef(null);
    const recaptchaRef = useRef(null);
    const timerRef = useRef(null);
    useEffect(() => {
        if (firebaseConfigured) {
            fetch("/api/auth/otp/available", { credentials: "include" })
                .then(r => r.json())
                .then((d) => setOtpEnabled(d.enabled ?? false))
                .catch(() => setOtpEnabled(false));
        }
        return () => {
            if (timerRef.current)
                clearInterval(timerRef.current);
            recaptchaRef.current?.clear();
        };
    }, []);
    function startResendTimer() {
        setResendSecs(60);
        timerRef.current = setInterval(() => {
            setResendSecs(s => {
                if (s <= 1) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
    }
    async function sendOtp() {
        setError("");
        const digits = phoneNumber.replace(/\D/g, "");
        if (!digits || digits.length < 7) {
            setError("Enter a valid phone number.");
            return;
        }
        const fullPhone = `${countryCode}${digits}`;
        setLoading(true);
        try {
            const auth = getFirebaseAuth();
            if (!recaptchaRef.current) {
                recaptchaRef.current = new RecaptchaVerifier(auth, "phone-recaptcha-container", { size: "invisible" });
            }
            const confirmation = await signInWithPhoneNumber(auth, fullPhone, recaptchaRef.current);
            confirmationRef.current = confirmation;
            setStep("otp");
            startResendTimer();
        }
        catch (err) {
            const msg = err.message ?? "";
            if (msg.includes("invalid-phone-number")) {
                setError("Invalid phone number. Check the country code and digits.");
            }
            else if (msg.includes("too-many-requests")) {
                setError("Too many attempts. Please wait a few minutes and try again.");
            }
            else {
                setError("Failed to send OTP. Please try again.");
            }
            recaptchaRef.current?.clear();
            recaptchaRef.current = null;
        }
        finally {
            setLoading(false);
        }
    }
    function handleSendOtp(e) {
        e.preventDefault();
        void sendOtp();
    }
    async function handleVerifyOtp(e) {
        e.preventDefault();
        if (!confirmationRef.current)
            return;
        setError("");
        setLoading(true);
        try {
            const result = await confirmationRef.current.confirm(otpCode);
            const idToken = await result.user.getIdToken();
            const res = await fetch("/api/auth/otp/link-phone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ idToken }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? "Failed to link phone. Please try again.");
                return;
            }
            await refreshUser();
            setStep("idle");
            setPhoneNumber("");
            setOtpCode("");
            setSuccess("Phone number linked successfully!");
            setTimeout(() => setSuccess(""), 4000);
        }
        catch (err) {
            const msg = err.message ?? "";
            if (msg.includes("invalid-verification-code")) {
                setError("Wrong code. Please check and try again.");
            }
            else if (msg.includes("code-expired")) {
                setError("Code expired. Request a new one.");
            }
            else {
                setError("Verification failed. Please try again.");
            }
        }
        finally {
            setLoading(false);
        }
    }
    function resetFlow() {
        setStep("idle");
        setPhoneNumber("");
        setOtpCode("");
        setError("");
        setResendSecs(0);
        confirmationRef.current = null;
        if (timerRef.current)
            clearInterval(timerRef.current);
        recaptchaRef.current?.clear();
        recaptchaRef.current = null;
    }
    async function handleResend(e) {
        e.preventDefault();
        setStep("phone");
        await sendOtp();
    }
    const currentPhone = authUser?.phone;
    const isPhoneVerified = authUser?.phoneVerified;
    if (!otpEnabled)
        return null;
    return (<SectionCard title="Phone Number" subtitle="Link your phone to sign in via OTP" icon={Smartphone} iconBg="#F0F9FF" iconColor="#0369A1">
      <div id="phone-recaptcha-container"/>

      {currentPhone && step === "idle" && (<div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
          <Phone className="w-4 h-4 text-gray-400 flex-shrink-0"/>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900">{currentPhone}</div>
            <div className={`text-[11px] mt-0.5 ${isPhoneVerified ? "text-green-600" : "text-amber-500"}`}>
              {isPhoneVerified ? "Verified" : "Not verified"}
            </div>
          </div>
          <button type="button" onClick={() => { setStep("phone"); setError(""); }} className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 transition-colors">
            Change
          </button>
        </div>)}

      {success && step === "idle" && (<div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-100 mb-4">
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0"/> {success}
        </div>)}

      {step === "idle" && (<button type="button" onClick={() => { setStep("phone"); setError(""); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:bg-[#A4285E]" style={{ background: "#CB3273" }}>
          <Phone className="w-3.5 h-3.5"/>
          {currentPhone ? "Change phone number" : "Add phone number"}
        </button>)}

      {step === "phone" && (<form onSubmit={handleSendOtp} className="space-y-3">
          <div>
            <label className={labelClass}>Phone number</label>
            <div className="flex gap-2">
              <select className="text-sm rounded-lg border border-gray-200 bg-white text-gray-900 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                {PHONE_COUNTRY_CODES.map(c => (<option key={c.code} value={c.code}>{c.flag} {c.code}</option>))}
              </select>
              <input type="tel" className={inputClass} value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="9876543210" autoFocus/>
            </div>
          </div>
          {error && (<div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0"/> {error}
            </div>)}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-all hover:bg-[#A4285E]" style={{ background: "#CB3273" }}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Send className="w-3.5 h-3.5"/>}
              Send code
            </button>
            <button type="button" onClick={resetFlow} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-[#FBE9F1] hover:text-[#CB3273] transition-colors">
              <ChevronLeft className="w-3.5 h-3.5"/> Cancel
            </button>
          </div>
        </form>)}

      {step === "otp" && (<form onSubmit={handleVerifyOtp} className="space-y-3">
          <p className="text-xs text-gray-500">
            Enter the 6-digit code sent to <span className="font-semibold text-gray-700">{countryCode}{phoneNumber}</span>
          </p>
          <div>
            <label className={labelClass}>Verification code</label>
            <input type="text" inputMode="numeric" maxLength={6} className={inputClass} value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" autoFocus/>
          </div>
          {error && (<div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0"/> {error}
            </div>)}
          <div className="flex gap-2 items-center flex-wrap">
            <button type="submit" disabled={loading || otpCode.length < 6} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-all hover:bg-[#A4285E]" style={{ background: "#CB3273" }}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <CheckCircle className="w-3.5 h-3.5"/>}
              Verify
            </button>
            <button type="button" onClick={resetFlow} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5"/> Cancel
            </button>
            {resendSecs > 0 ? (<span className="text-[11px] text-gray-400">Resend in {resendSecs}s</span>) : (<button type="button" onClick={handleResend} className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold transition-colors">
                Resend code
              </button>)}
          </div>
        </form>)}
    </SectionCard>);
}
// ── Business WHY Form ──────────────────────────────────────────────────────────
function BusinessWhyForm() {
    const authUser = useAuthUser();
    const updateUser = useUpdateUser();
    const [why, setWhy] = useState(authUser?.businessWhy ?? "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [err, setErr] = useState("");
    useEffect(() => {
        if (authUser?.businessWhy) {
            console.log("[Client - Business WHY] Loaded Business WHY from PostgreSQL table 'users':", authUser.businessWhy);
            setWhy(authUser.businessWhy);
        }
    }, [authUser?.businessWhy]);

    async function handleSave(e) {
        e.preventDefault();
        setErr("");
        setSaved(false);
        setSaving(true);
        const userEmail = authUser?.email || "dreamsdesign.in03@gmail.com";
        console.log("[Client - Business WHY] 💾 Saving Business WHY to PostgreSQL table 'users':", { businessWhy: why, email: userEmail });
        try {
            const res = await fetch("/api/users/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ businessWhy: why, email: userEmail }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error("[Client - Business WHY] ❌ Error saving Business WHY to PostgreSQL table 'users':", d);
                setErr(d.error || "Failed to save");
            }
            else {
                console.log("[Client - Business WHY] ✅ Saved Business WHY successfully to PostgreSQL table 'users':", d);
                updateUser({ businessWhy: why });
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        }
        catch (err) {
            console.error("[Client - Business WHY] ❌ Network Error while saving to 'users':", err);
            setErr("Network error");
        }
        finally {
            setSaving(false);
        }
    }
    return (<SectionCard title="Your Business WHY" subtitle="Injected into every AI-generated email to make outreach feel human" icon={MessageCircle} iconBg="#FBE9F1" iconColor="#CB3273">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="rounded-lg px-3 py-2.5 text-[11px] italic border-l-2" style={{ background: "#FBE9F1", borderColor: "#CB3273", color: "#A4285E" }}>
          "We believe every B2B founder deserves a sales engine that works as hard as they do."
        </div>
        <div>
          <label className={labelClass}>Your Business WHY</label>
          <textarea className={inputClass} rows={4} maxLength={500} value={why} onChange={e => setWhy(e.target.value)} placeholder="Why did you start this business? What do you believe about your customers that others don't?" style={{ resize: "vertical" }}/>
          <div className="flex justify-between mt-1">
            <p className="text-[10px] text-gray-400">
              This is injected into every AI-generated email to make your outreach feel human and authentic.
            </p>
            <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{why.length}/500</span>
          </div>
        </div>
        {err && (<div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
            <XCircle className="w-3.5 h-3.5 flex-shrink-0"/> {err}
          </div>)}
        <SaveButton pending={saving} success={saved} label="Save Your WHY"/>
      </form>
    </SectionCard>);
}
// ── Profile Tab ────────────────────────────────────────────────────────────────
function ProfileTab() {
    return (<div className="space-y-6">
      <BusinessWhyForm />
      <ProfileNameForm />
      <PhoneNumberForm />
      <DefaultPasswordCard />
    </div>);
}
// ── Company Tab ─────────────────────────────────────────────────────────────
function CompanyTab() {
    const { data: brandingData, isLoading } = useGetBrandingSettings();
    const [companyName, setCompanyName] = useState("");
    const [website, setWebsite] = useState("");
    const [phone, setPhone] = useState("");
    const [tagline, setTagline] = useState("");
    const [contactInfo, setContactInfo] = useState("");
    const [brandColor, setBrandColor] = useState("#CB3273");
    const [logoBase64, setLogoBase64] = useState(null);
    const [brandSaveOk, setBrandSaveOk] = useState(false);
    const [brandSavePend, setBrandSavePend] = useState(false);
    const logoInputRef = useRef(null);

    useEffect(() => {
        if (brandingData) {
            console.log("[Client - Company Settings] Loaded company details from PostgreSQL table 'branding_settings':", brandingData);
            setCompanyName(brandingData.companyName ?? "");
            setWebsite(brandingData.website ?? "");
            setPhone(brandingData.phone ?? "");
            setTagline(brandingData.tagline ?? "");
            setContactInfo(brandingData.contactInfo ?? "");
            setBrandColor(brandingData.brandColor ?? "#CB3273");
            setLogoBase64(brandingData.logoBase64 ?? null);
        }
    }, [brandingData]);

    const handleLogoUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const maxDim = 300;
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);
                const compressedBase64 = canvas.toDataURL("image/webp", 0.85);
                setLogoBase64(compressedBase64);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    };

    async function handleBrandSave(e) {
        e.preventDefault();
        setBrandSaveOk(false);
        setBrandSavePend(true);
        console.log("[Client - Company Settings] Saving company details to database table 'branding_settings':", {
            companyName,
            website,
            phone,
            tagline,
            contactInfo,
            brandColor,
            logoUploaded: !!logoBase64
        });
        try {
            const res = await fetch("/api/settings/branding", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ companyName, tagline, contactInfo, website: website || null, phone: phone || null, brandColor, logoBase64: logoBase64 ?? null }),
            });

            if (res.ok) {
                const data = await res.json().catch(() => ({ ok: true }));
                console.log("[Client - Company Settings] ✅ Saved successfully to database table 'branding_settings':", data);
                setBrandSaveOk(true);
                setTimeout(() => setBrandSaveOk(false), 3000);
            } else {
                const errText = await res.text().catch(() => "Unknown server error");
                console.error(`[Client - Company Settings] ❌ Database save error (${res.status}):`, errText);
                alert(`Error saving company details (${res.status}): ${res.statusText}`);
            }
        }
        catch (err) {
            console.error("[Client - Company Settings] Network/Save error:", err);
        }
        finally {
            setBrandSavePend(false);
        }
    }

    if (isLoading) {
        return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400"/></div>;
    }

    return (<div className="space-y-6">
      <SectionCard title="Company & Brand Details" subtitle="Company info, website, address, and logo used by Google Gemini AI" icon={Building2} iconBg="#FBE9F1" iconColor="#CB3273">
        <form onSubmit={handleBrandSave} className="space-y-4">
          <div className="rounded-lg border border-pink-100 bg-[#FBE9F1]/60 px-3 py-2.5 text-[11px] text-[#CB3273] font-medium">
            These details train Aura AI to generate personalized leads, proposals, outreach emails, and BANT qualification scores tailored specifically to your company or clinic.
          </div>

          {/* Core company info */}
          <div>
            <label className={labelClass}>Company / Brand Name</label>
            <input type="text" className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Aura Laser & Cosmetic Clinic | Skinnonest"/>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}><Globe className="w-3 h-3 inline mr-1"/>Website</label>
              <input type="url" className={inputClass} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://auralaser.co.in"/>
            </div>
            <div>
              <label className={labelClass}><Phone className="w-3 h-3 inline mr-1"/>Phone</label>
              <input type="tel" className={inputClass} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98250 12345"/>
            </div>
          </div>
          <div>
            <label className={labelClass}>Tagline</label>
            <input type="text" className={inputClass} value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Laser & Cosmetic Dermatology Excellence"/>
          </div>
          <div>
            <label className={labelClass}>Contact Address & Locations</label>
            <input type="text" className={inputClass} value={contactInfo} onChange={e => setContactInfo(e.target.value)} placeholder="Alkapuri, Vadodara, Gujarat, India"/>
            <p className="mt-1 text-[10px] text-gray-400">Clinic / office address and locations used by AI in proposals and communications</p>
          </div>

          {/* Logo */}
          <div>
            <label className={labelClass}>Company Logo</label>
            <div className="flex items-center gap-3">
              {logoBase64 ? (<div className="relative flex-shrink-0">
                  <img src={logoBase64} alt="Logo preview" className="h-10 max-w-[120px] object-contain rounded border border-gray-200 bg-gray-50 p-1"/>
                  <button type="button" onClick={() => { setLogoBase64(null); if (logoInputRef.current)
            logoInputRef.current.value = ""; }} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
                    <X className="w-2.5 h-2.5"/>
                  </button>
                </div>) : (<div className="w-16 h-10 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-300">
                  <Upload className="w-4 h-4"/>
                </div>)}
              <div>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" id="logo-upload"/>
                <label htmlFor="logo-upload" className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-[#FBE9F1] hover:text-[#CB3273] transition-colors">
                  <Upload className="w-3.5 h-3.5"/>
                  {logoBase64 ? "Replace Logo" : "Upload Logo"}
                </label>
                <p className="mt-1 text-[10px] text-gray-400">PNG, JPG, or WebP. Appears in your company profile and generated proposals.</p>
              </div>
            </div>
          </div>

          {/* Brand Color */}
          <div>
            <label className={labelClass}>Brand Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} className="w-10 h-8 rounded border border-gray-200 cursor-pointer p-0.5 bg-white"/>
              <input type="text" className={inputClass + " w-32 font-mono"} value={brandColor} onChange={e => setBrandColor(e.target.value)} placeholder="#CB3273" maxLength={7}/>
              <div className="w-8 h-8 rounded-lg border border-gray-200 flex-shrink-0" style={{ background: brandColor }}/>
            </div>
          </div>

          {brandSaveOk && (<div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 flex items-center gap-2 text-xs text-green-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0"/> Company details saved successfully.
            </div>)}
          <SaveButton pending={brandSavePend} success={brandSaveOk} label="Save Company Details"/>
        </form>
      </SectionCard>
    </div>);
}
// ── Email Tab ──────────────────────────────────────────────────────────────────
function EmailTab() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveOk, setSaveOk] = useState(false);
    const [saveErr, setSaveErr] = useState("");
    const [host, setHost] = useState("");
    const [port, setPort] = useState("587");
    const [user, setUser] = useState("");
    const [password, setPassword] = useState("");
    const [fromAddress, setFromAddress] = useState("");
    const [secure, setSecure] = useState(false);
    const [testEmail, setTestEmail] = useState("");
    const [testResult, setTestResult] = useState(null);
    const [testPend, setTestPend] = useState(false);
    useEffect(() => {
        fetch("/api/settings/smtp", { credentials: "include" })
            .then(r => r.json())
            .then((d) => {
            setHost(d.host ?? "");
            setPort(String(d.port ?? 587));
            setUser(d.user ?? "");
            setFromAddress(d.fromAddress ?? "");
            setSecure(Boolean(d.secure));
            const prefill = d.fromAddress ?? d.user ?? "";
            if (prefill)
                setTestEmail(prefill);
        })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);
    async function handleSave(e) {
        e.preventDefault();
        setSaveErr("");
        setSaveOk(false);
        setSaving(true);
        try {
            const body = {
                host: host.trim() || null,
                port: Number(port) || 587,
                user: user.trim() || null,
                fromAddress: fromAddress.trim() || null,
                secure,
            };
            if (password)
                body.password = password;
            const res = await fetch("/api/settings/smtp", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setSaveErr(d.error || "Failed to save");
            }
            else {
                setPassword("");
                setSaveOk(true);
                setTimeout(() => setSaveOk(false), 3000);
            }
        }
        catch {
            setSaveErr("Network error");
        }
        finally {
            setSaving(false);
        }
    }
    async function handleTest() {
        if (!testEmail)
            return;
        setTestPend(true);
        setTestResult(null);
        try {
            const res = await fetch("/api/settings/smtp/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ toEmail: testEmail }),
            });
            setTestResult(await res.json());
        }
        catch {
            setTestResult({ success: false, message: "Network error — could not reach the server." });
        }
        finally {
            setTestPend(false);
        }
    }
    if (loading)
        return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400"/></div>;
    return (<div className="space-y-6">
      <SectionCard title="SMTP Configuration" subtitle="Configure your outgoing email server" icon={Mail} iconBg="#F0FDF4" iconColor="#1A7A45">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2.5 text-[11px] text-green-800 flex items-start gap-2">
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-green-600"/>
            <span>Platform emails (outreach, proposals, confirmations) are sent via <strong>Brevo</strong> from <strong>info@dreamsdesign.ca</strong>. Custom SMTP settings below are for additional mail flows.</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>SMTP Host</label>
              <input type="text" className={inputClass} value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.example.com"/>
            </div>
            <div>
              <label className={labelClass}>Port</label>
              <input type="number" className={inputClass} value={port} onChange={e => setPort(e.target.value)} placeholder="587" min={1} max={65535}/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Username</label>
              <input type="text" className={inputClass} value={user} onChange={e => setUser(e.target.value)} placeholder="user@example.com" autoComplete="off"/>
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input type="password" className={inputClass} value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep existing" autoComplete="new-password"/>
            </div>
          </div>

          <div>
            <label className={labelClass}>From Address</label>
            <input type="email" className={inputClass} value={fromAddress} onChange={e => setFromAddress(e.target.value)} placeholder="hello@example.com"/>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="smtp-secure" checked={secure} onChange={e => setSecure(e.target.checked)} className="rounded border-gray-300"/>
            <label htmlFor="smtp-secure" className="text-xs text-gray-700 cursor-pointer">Use TLS/SSL (port 465)</label>
          </div>

          {saveErr && (<div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0"/> {saveErr}
            </div>)}
          <SaveButton pending={saving} success={saveOk} label="Save SMTP Settings"/>
        </form>
      </SectionCard>

      <SectionCard title="Send Test Email" subtitle="Verify your email delivery is working" icon={Send} iconBg="#F0FDF4" iconColor="#1A7A45">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Recipient Email</label>
            <div className="flex gap-2">
              <input type="email" className={inputClass} value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="recipient@example.com"/>
              <button type="button" onClick={handleTest} disabled={testPend || !testEmail} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white whitespace-nowrap disabled:opacity-50 transition-colors" style={{ background: "#1A7A45" }}>
                {testPend ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Send className="w-3.5 h-3.5"/>}
                Send Test
              </button>
            </div>
          </div>

          {testResult && (<div className="rounded-lg border px-3 py-2.5 flex items-start gap-2 text-xs" style={{
                background: testResult.success ? "rgba(22,163,74,0.05)" : "rgba(239,68,68,0.05)",
                borderColor: testResult.success ? "#bbf7d0" : "#fecaca",
            }}>
              {testResult.success
                ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5"/>
                : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"/>}
              <span style={{ color: testResult.success ? "#15803d" : "#dc2626" }}>{testResult.message}</span>
            </div>)}
        </div>
      </SectionCard>
    </div>);
}
// ── WhatsApp Tab ───────────────────────────────────────────────────────────────
function WhatsAppTab() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveOk, setSaveOk] = useState(false);
    const [saveErr, setSaveErr] = useState("");
    const [hasAccessToken, setHasAccessToken] = useState(false);
    const [hasAppSecret, setHasAppSecret] = useState(false);
    const [accessToken, setAccessToken] = useState("");
    const [appSecret, setAppSecret] = useState("");
    const [phoneNumberId, setPhoneNumberId] = useState("");
    const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
    const [bookingUrl, setBookingUrl] = useState("");
    const [consultantName, setConsultantName] = useState("");
    const [portfolioUrl, setPortfolioUrl] = useState("");
    const [caseStudyUrl, setCaseStudyUrl] = useState("");
    const [companyProfileUrl, setCompanyProfileUrl] = useState("");
    const [hookTemplateName, setHookTemplateName] = useState("");
    const [hookTemplateLang, setHookTemplateLang] = useState("en_US");
    const [n8nWebhookUrl, setN8nWebhookUrl] = useState("");
    useEffect(() => {
        fetch("/api/settings/whatsapp", { credentials: "include" })
            .then(r => r.json())
            .then((d) => {
            setHasAccessToken(Boolean(d.hasAccessToken));
            setHasAppSecret(Boolean(d.hasAppSecret));
            setPhoneNumberId(d.phoneNumberId ?? "");
            setWebhookVerifyToken(d.webhookVerifyToken ?? "");
            setBookingUrl(d.bookingUrl ?? "");
            setConsultantName(d.consultantName ?? "");
            setPortfolioUrl(d.portfolioUrl ?? "");
            setCaseStudyUrl(d.caseStudyUrl ?? "");
            setCompanyProfileUrl(d.companyProfileUrl ?? "");
            setHookTemplateName(d.hookTemplateName ?? "");
            setHookTemplateLang(d.hookTemplateLang ?? "en_US");
            setN8nWebhookUrl(d.n8nWebhookUrl ?? "");
        })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);
    async function handleSave(e) {
        e.preventDefault();
        setSaveErr("");
        setSaveOk(false);
        setSaving(true);
        try {
            const body = {
                phoneNumberId, webhookVerifyToken, bookingUrl, consultantName,
                portfolioUrl, caseStudyUrl, companyProfileUrl, hookTemplateName, hookTemplateLang,
                n8nWebhookUrl: n8nWebhookUrl || null,
            };
            if (accessToken)
                body.accessToken = accessToken;
            if (appSecret)
                body.appSecret = appSecret;
            const res = await fetch("/api/settings/whatsapp", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setSaveErr(d.error || "Failed to save");
            }
            else {
                if (accessToken) {
                    setHasAccessToken(true);
                    setAccessToken("");
                }
                if (appSecret) {
                    setHasAppSecret(true);
                    setAppSecret("");
                }
                setSaveOk(true);
                setTimeout(() => setSaveOk(false), 3000);
            }
        }
        catch {
            setSaveErr("Network error");
        }
        finally {
            setSaving(false);
        }
    }
    if (loading)
        return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400"/></div>;
    return (<div className="space-y-6">
      <SectionCard title="WhatsApp Business API" subtitle="Configure your Meta WhatsApp integration" icon={Smartphone} iconBg="#F0FDF4" iconColor="#25D366">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2.5 text-[11px] text-green-800">
            Credentials from your <strong>Meta Business Manager</strong> / <strong>WhatsApp Business Platform</strong>.
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Access Token</label>
              <input type="password" className={inputClass + " font-mono"} value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder={hasAccessToken ? "••••••  (set — enter new value to change)" : "EAAx…"} autoComplete="off"/>
            </div>
            <div>
              <label className={labelClass}>App Secret</label>
              <input type="password" className={inputClass + " font-mono"} value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder={hasAppSecret ? "••••••  (set — enter new value to change)" : "a1b2c3…"} autoComplete="off"/>
            </div>
            <div>
              <label className={labelClass}>Phone Number ID</label>
              <input type="text" className={inputClass + " font-mono"} value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="123456789012345"/>
            </div>
            <div>
              <label className={labelClass}>Webhook Verify Token</label>
              <input type="text" className={inputClass + " font-mono"} value={webhookVerifyToken} onChange={e => setWebhookVerifyToken(e.target.value)} placeholder="my-verify-token"/>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Consultant Profile</div>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Consultant Name</label>
                <input type="text" className={inputClass} value={consultantName} onChange={e => setConsultantName(e.target.value)} placeholder="Jane Smith"/>
              </div>
              <div>
                <label className={labelClass}>Booking URL</label>
                <input type="url" className={inputClass} value={bookingUrl} onChange={e => setBookingUrl(e.target.value)} placeholder="https://calendly.com/jane"/>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Portfolio Links</div>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Portfolio URL</label>
                <input type="url" className={inputClass} value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)} placeholder="https://yoursite.com/portfolio"/>
              </div>
              <div>
                <label className={labelClass}>Case Study URL</label>
                <input type="url" className={inputClass} value={caseStudyUrl} onChange={e => setCaseStudyUrl(e.target.value)} placeholder="https://yoursite.com/case-study"/>
              </div>
              <div>
                <label className={labelClass}>Company Profile URL</label>
                <input type="url" className={inputClass} value={companyProfileUrl} onChange={e => setCompanyProfileUrl(e.target.value)} placeholder="https://yoursite.com/about"/>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Hook Template</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Template Name</label>
                <input type="text" className={inputClass} value={hookTemplateName} onChange={e => setHookTemplateName(e.target.value)} placeholder="sales_hook_v1"/>
              </div>
              <div>
                <label className={labelClass}>Template Language</label>
                <input type="text" className={inputClass} value={hookTemplateLang} onChange={e => setHookTemplateLang(e.target.value)} placeholder="en_US"/>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Automation (n8n)</div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-[11px] text-blue-800 mb-3">
              When set, every inbound WhatsApp message will be forwarded to this n8n webhook URL for automation processing.
            </div>
            <div>
              <label className={labelClass}>n8n Webhook URL</label>
              <input type="url" className={inputClass + " font-mono"} value={n8nWebhookUrl} onChange={e => setN8nWebhookUrl(e.target.value)} placeholder="https://n8n.example.com/webhook/..."/>
            </div>
          </div>

          {saveErr && (<div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0"/> {saveErr}
            </div>)}
          <SaveButton pending={saving} success={saveOk} label="Save WhatsApp Settings"/>
        </form>
      </SectionCard>
    </div>);
}
// ── Disconnect Button Component ───────────────────────────────────────────────
function DisconnectButton({ href, onDisconnected }) {
    const [pending, setPending] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [message, setMessage] = useState("");
    async function handleDisconnect() {
        setPending(true);
        try {
            const res = await fetch(href, { method: "DELETE", credentials: "include" });
            const data = await res.json();
            setMessage(data.message ?? (data.ok ? "Disconnected." : "Could not disconnect automatically."));
            setShowInfo(true);
            setTimeout(() => { setShowInfo(false); onDisconnected(); }, 5000);
        }
        catch {
            setMessage("Network error.");
            setShowInfo(true);
        }
        finally {
            setPending(false);
        }
    }
    return (<div className="relative">
      <button type="button" onClick={handleDisconnect} disabled={pending} className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50" style={{ color: "#DC2626", borderColor: "#FECACA", background: "#FEF2F2" }}>
        {pending ? <Loader2 className="w-3 h-3 animate-spin"/> : <XCircle className="w-3 h-3"/>}
        Disconnect
      </button>
      {showInfo && (<div className="absolute top-8 left-0 z-10 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-[11px] text-gray-600">
          {message}
        </div>)}
    </div>);
}
function ModelIntelligenceTab() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveOk, setSaveOk] = useState(false);
    const [saveErr, setSaveErr] = useState("");
    const [defaults, setDefaults] = useState({});
    const [overrides, setOverrides] = useState({});
    const [operationLabels, setOperationLabels] = useState({});
    useEffect(() => {
        fetch("/api/settings/model-routing", { credentials: "include" })
            .then(r => r.json())
            .then((d) => {
            setDefaults(d.defaults ?? {});
            setOverrides(d.overrides ?? {});
            setOperationLabels(d.operationLabels ?? {});
        })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);
    function getEffectiveTier(op) {
        return overrides[op] ?? defaults[op] ?? "FAST";
    }
    function toggleTier(op, tier) {
        setOverrides(prev => ({ ...prev, [op]: tier }));
    }
    function resetToDefault(op) {
        setOverrides(prev => {
            const next = { ...prev };
            delete next[op];
            return next;
        });
    }
    async function handleSave(e) {
        e.preventDefault();
        setSaveErr("");
        setSaveOk(false);
        setSaving(true);
        try {
            const res = await fetch("/api/settings/model-routing", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ overrides }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setSaveErr(d.error || "Failed to save");
            }
            else {
                setSaveOk(true);
                setTimeout(() => setSaveOk(false), 3000);
            }
        }
        catch {
            setSaveErr("Network error");
        }
        finally {
            setSaving(false);
        }
    }
    if (loading)
        return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400"/></div>;
    const ops = Object.keys(defaults);
    const hasOverrides = ops.some(op => overrides[op] !== undefined);
    return (<div className="space-y-6">
      <SectionCard title="Daily AI Spend Alert" subtitle="Get an email if your workspace crosses a daily AI cost threshold" icon={AlertCircle} iconBg="#FEF2F2" iconColor="#DC2626">
        <AiSpendThresholdSection />
      </SectionCard>

      <SectionCard title="Model Intelligence" subtitle="Override AI model tier per operation — Fast cuts cost, Smart boosts quality" icon={Brain} iconBg="#FBE9F1" iconColor="#8E1F54">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2.5 text-[11px] text-purple-800 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>
            <span>
              <strong>Fast</strong> uses <span className="font-mono">gemini-1.5-flash</span> for speed and lower cost.{" "}
              <strong>Smart</strong> uses <span className="font-mono">gemini-1.5-pro</span> for higher accuracy.
              Changes apply to all new AI calls for this workspace.
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {ops.map(op => {
            const effective = getEffectiveTier(op);
            const defaultTier = defaults[op] ?? "FAST";
            const isOverridden = overrides[op] !== undefined;
            const label = operationLabels[op] ?? op;
            const desc = OPERATION_DESCRIPTIONS[op] ?? "";
            return (<div key={op} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{label}</span>
                        {isOverridden ? (<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Overridden</span>) : (<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">Default</span>)}
                      </div>
                      {desc && <div className="text-[11px] text-gray-400 mt-0.5">{desc}</div>}
                      {isOverridden && (<button type="button" onClick={() => resetToDefault(op)} className="mt-1 text-[10px] text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors">
                          Reset to default ({defaultTier === "FAST" ? "Fast" : "Smart"})
                        </button>)}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <TierPill tier="FAST" active={effective === "FAST"} onClick={() => toggleTier(op, "FAST")}/>
                      <TierPill tier="SMART" active={effective === "SMART"} onClick={() => toggleTier(op, "SMART")}/>
                    </div>
                  </div>
                </div>);
        })}
          </div>

          {hasOverrides && (<div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0"/>
              {Object.keys(overrides).filter(op => overrides[op] !== undefined).length} operation{Object.keys(overrides).filter(op => overrides[op] !== undefined).length !== 1 ? "s" : ""} overriding the global default.
            </div>)}

          {saveErr && (<div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0"/> {saveErr}
            </div>)}
          <SaveButton pending={saving} success={saveOk} label="Save Model Settings"/>
        </form>
      </SectionCard>
    </div>);
}
// ── Main Settings Page ──────────────────────────────────────────────────────────
export default function Settings() {
    const authUser = useAuthUser();
    const isOwner = authUser?.role === "owner";
    const isPrivileged = authUser?.role === "owner" || authUser?.role === "admin";
    const TABS = ALL_TABS.filter(t => {
        if (t.ownerOnly)
            return isOwner;
        if (t.adminOnly)
            return isPrivileged;
        return true;
    });
    const initialTab = () => {
        const param = new URLSearchParams(window.location.search).get("tab");
        const allowed = TABS.some((t) => t.id === param);
        return (allowed ? param : "profile");
    };
    const [activeTab, setActiveTab] = useState(initialTab);
    const handleSetTab = (id) => {
        const allowed = TABS.some(t => t.id === id);
        setActiveTab(allowed ? id : "profile");
    };
    return (<div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Settings</h1>
        <p className="text-xs text-gray-400 mt-0.5">Manage your account, company branding, and integrations</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (<button key={id} onClick={() => handleSetTab(id)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0" style={activeTab === id
                ? { background: "#fff", color: "#111827", boxShadow: "0 1px 3px rgba(0,0,0,0.10)" }
                : { color: "#6B7280" }}>
            <Icon className="w-3.5 h-3.5"/>
            {label}
          </button>))}
      </div>

      <div className={activeTab === "profile" ? undefined : "hidden"}><ProfileTab /></div>
      <div className={activeTab === "company" ? undefined : "hidden"}><CompanyTab /></div>
      {isPrivileged && <div className={activeTab === "email" ? undefined : "hidden"}><EmailTab /></div>}
      {isPrivileged && <div className={activeTab === "whatsapp" ? undefined : "hidden"}><WhatsAppTab /></div>}
      {isOwner && <div className={activeTab === "ai" ? undefined : "hidden"}><ModelIntelligenceTab /></div>}
    </div>);
}
