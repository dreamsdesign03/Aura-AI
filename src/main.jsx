import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import "./clinic/clinic.css";

// Auto-reload when Vite fails to fetch a stale chunk after a new deployment
window.addEventListener("vite:preloadError", (event) => {
  console.warn("[Vite] Dynamic import preload error detected. Reloading for newest deployment...", event);
  const lastReload = sessionStorage.getItem("vite_preload_error_reload");
  const now = Date.now();
  if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
    sessionStorage.setItem("vite_preload_error_reload", String(now));
    window.location.reload();
  }
});

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
