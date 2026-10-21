import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installDesktopExternalLinks } from "./lib/desktopLinks";
import { hydrateLoadStorage } from "./lib/loadsDb";
import { applyAppTheme, readAppTheme } from "./lib/theme";
import "./index.css";
import "./theme-light.css";
import "./theme-halloween.css";

applyAppTheme(readAppTheme());
installDesktopExternalLinks();

const root = document.getElementById("root");
if (!root) {
  document.body.textContent = "Missing root element";
} else {
  // Load list lives in IndexedDB (1.1.42); hydrate before first render.
  void hydrateLoadStorage().finally(() => createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  ));
}
