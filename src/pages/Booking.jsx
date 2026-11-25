import { useState } from "react";
import { Clock, Video, Calendar, User, Copy, Check, Handshake } from "lucide-react";
import CalendlyEmbed from "@/components/CalendlyEmbed";
export default function Booking() {
    const [copied, setCopied] = useState(false);
    const [bookingTab, setBookingTab] = useState("ria"); // "ria" | "misha"
    const bookingUrl = typeof window !== "undefined"
        ? window.location.href.split("?")[0]
        : "";
    function copyLink() {
        navigator.clipboard.writeText(bookingUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }
    return (<div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #2A0A18 0%, #3A0C20 100%)" }}>
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#8E1F54,#CB3273)" }}>
            <Calendar className="w-5 h-5 text-white"/>
          </div>
          <div>
            <div className="text-white font-bold text-[15px] leading-tight">
              {bookingTab === "ria" ? "Aura Laser & Cosmetic Clinic" : "Skinnonest Cosmeceutical Skincare"}
            </div>
            <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>aurai.clinic · Skinnonest</div>
          </div>
        </div>
        <button onClick={copyLink} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
          {copied ? <Check className="w-3.5 h-3.5"/> : <Copy className="w-3.5 h-3.5"/>}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 py-4 md:py-6 gap-4">
        {/* Dual Calendar Switcher */}
        <div className="w-full max-w-5xl flex items-center justify-center p-1.5 rounded-2xl border" style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" }}>
          <div className="grid grid-cols-2 gap-2 w-full">
            <button
              type="button"
              onClick={() => setBookingTab("ria")}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs md:text-sm font-bold transition-all ${
                bookingTab === "ria"
                  ? "bg-pink-600 text-white shadow-lg"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              <User className="w-4 h-4" />
              <span>1. Appointment with Ria (Aura Clinic Consultation)</span>
            </button>
            <button
              type="button"
              onClick={() => setBookingTab("misha")}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs md:text-sm font-bold transition-all ${
                bookingTab === "misha"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              <Handshake className="w-4 h-4" />
              <span>2. Makeup Artist Partnership · Skinnonest Vishw</span>
            </button>
          </div>
        </div>

        {/* Card */}
        <div className="w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl" style={{ background: "#fff" }}>
          <div className="flex flex-col md:flex-row">

            {/* Left panel */}
            {bookingTab === "ria" ? (
              <div className="md:w-72 flex-shrink-0 p-8" style={{ background: "linear-gradient(160deg, #A4285E 0%, #2A0A18 100%)" }}>
                <div className="w-12 h-12 rounded-xl mb-5 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }}>
                  <User className="w-6 h-6 text-white"/>
                </div>
                <div className="text-white font-bold text-[18px] leading-snug mb-1">Dr. Aditya Shah</div>
                <div className="text-[13px] mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>Founder · Aura Laser &amp; Cosmetic Clinic</div>
                <div className="text-[13px] mb-4 font-semibold" style={{ color: "#CB3273" }}>Dermatologist-backed · Skinnonest</div>

                <div className="text-[13px] mb-6 leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Book a free 30-minute consultation with Dr. Aditya Shah to discuss your skin, hair &amp; laser treatment needs — personalised care, visible results.
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 flex-shrink-0" style={{ color: "#CB3273" }}/>
                    <span className="text-[13px] text-white">30 minutes</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Video className="w-4 h-4 flex-shrink-0" style={{ color: "#CB3273" }}/>
                    <span className="text-[13px] text-white">Google Meet / In-person (Vadodara)</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: "#CB3273" }}/>
                    <span className="text-[13px] text-white">Instant Online Booking</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="md:w-72 flex-shrink-0 p-8" style={{ background: "linear-gradient(160deg, #6B21A8 0%, #1E1B4B 100%)" }}>
                <div className="w-12 h-12 rounded-xl mb-5 flex items-center justify-center font-bold text-white text-lg" style={{ background: "rgba(255,255,255,0.12)" }}>
                  SK
                </div>
                <div className="text-white font-bold text-[18px] leading-snug mb-1">Vishw</div>
                <div className="text-[13px] mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>Skinnonest Brand Representative</div>
                <div className="text-[13px] mb-4 font-semibold text-purple-300">Derma &amp; Cosmeceutical Skincare</div>

                <div className="text-[13px] mb-6 leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Skinnonest derma and cosmeceutical partnership meeting for makeup artists, salons &amp; skin clinics. Review product ranges, free trial samples &amp; partnership terms.
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 flex-shrink-0 text-purple-300"/>
                    <span className="text-[13px] text-white">30 minutes</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Video className="w-4 h-4 flex-shrink-0 text-purple-300"/>
                    <span className="text-[13px] text-white">Google Meet Online Meeting</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 flex-shrink-0 text-purple-300"/>
                    <span className="text-[13px] text-white">Instant Online Booking</span>
                  </div>
                </div>
              </div>
            )}

            {/* Right panel — Calendly embed */}
            <div className="flex-1 p-6 md:p-8 flex flex-col min-w-0">
              <div className="mb-4">
                <div className="text-[17px] font-bold" style={{ color: "#111827" }}>
                  {bookingTab === "ria" ? "Schedule Clinic Consultation (with Ria)" : "Schedule Makeup & Salon Partnership (with Misha)"}
                </div>
                <div className="text-[13px] mt-0.5" style={{ color: "#6B7280" }}>
                  Pick a time that works for you — confirmation &amp; calendar invite are sent automatically.
                </div>
              </div>
              <CalendlyEmbed
                url={bookingTab === "ria"
                  ? "https://cal.com/aura-laser-cosmetic-clinic/30min"
                  : "https://cal.com/aura-laser-cosmetic-clinic/skinnonest"}
                height={750}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-4 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        Powered by Aura AI · Aura Laser &amp; Cosmetic Clinic · Skinnonest · auriai.clinic
      </div>
    </div>);
}
