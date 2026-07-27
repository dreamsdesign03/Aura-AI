import { createRoot } from "react-dom/client";
import { ChatWidget } from "./ChatWidget";
// Capture the script's own origin BEFORE any async code runs.
// When pasted on an external site (e.g. WordPress), this is the only
// reliable way to know the MysaAI API domain — relative URLs would
// resolve against the host page, not the server that served this file.
const scriptEl = document.currentScript;
const scriptSrc = scriptEl?.src ?? "";
const apiBase = scriptSrc ? new URL(scriptSrc).origin : "";
function mountChatbot() {
    let container = document.getElementById("mysa-chatbot");
    if (!container) {
        container = document.createElement("div");
        container.id = "mysa-chatbot";
        document.body.appendChild(container);
    }
    const root = createRoot(container);
    root.render(<ChatWidget apiBase={apiBase}/>);
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountChatbot);
}
else {
    mountChatbot();
}
