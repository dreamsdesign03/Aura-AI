import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import "./clinic/clinic.css";
createRoot(document.getElementById("root")).render(<ErrorBoundary>
    <App />
  </ErrorBoundary>);
