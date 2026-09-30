import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { bindAppLayout } from "./lib/layout";
import { applyAppTheme, readAppTheme } from "./lib/theme";
import "./index.css";
import "./theme-light.css";
import "./theme-halloween.css";

bindAppLayout();
applyAppTheme(readAppTheme());

const root = document.getElementById("root");
if (!root) {
  document.body.textContent = "Missing root element";
} else {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
