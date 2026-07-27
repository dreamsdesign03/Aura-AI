import { ChatWidget } from "@/chatbot/ChatWidget";
export default function ChatbotPreview() {
    return (<div style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #0A0818 0%, #1A0D2E 50%, #0F0D1E 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}>
      <div style={{ textAlign: "center", color: "rgba(255,255,255,0.55)", maxWidth: 420, padding: "0 24px" }}>
        <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "linear-gradient(135deg, #4F35A8, #7C3AED)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 0 40px rgba(79,53,168,0.5)",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
        </div>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Dreamsdesign AI Qualifier
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          This is the live chatbot widget that qualifies visitors on your website.<br />
          Click the purple bubble in the bottom-right corner to start a conversation.
        </p>
        <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)",
            borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#C9A84C",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#25D366" }}/>
          Widget active · AI-powered BANT qualification
        </div>
      </div>

      <ChatWidget />
    </div>);
}
