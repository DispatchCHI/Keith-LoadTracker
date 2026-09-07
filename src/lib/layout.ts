import { useEffect, useState } from "react";

const QUERY = "(min-width: 960px)";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useDesktopLayout(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = () => {
      setDesktop(mq.matches);
      document.documentElement.dataset.layout = mq.matches ? "desktop" : "phone";
      document.documentElement.dataset.shell = isTauriRuntime() ? "tauri" : "web";
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return desktop;
}
