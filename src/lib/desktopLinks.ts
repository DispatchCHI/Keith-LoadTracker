import { isTauriRuntime } from "./layout";

/**
 * In the Windows desktop app (Tauri), links to the outside world must be
 * handed to the OS so tel:/callto: reach Teams or RingCentral and http(s)
 * opens in the default browser instead of navigating the app window away.
 * No-op on the web build.
 */
const EXTERNAL = /^(https?:|tel:|callto:|mailto:|sms:|msteams:|rcmobile:|rcapp:)/i;

async function openExternal(url: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("plugin:opener|open_url", { url });
}

function isExternal(href: string, appOrigin: string): boolean {
  return EXTERNAL.test(href) && !href.startsWith(appOrigin);
}

export function installDesktopExternalLinks(): void {
  if (!isTauriRuntime()) return;
  const appOrigin = window.location.origin;

  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !isExternal(anchor.href, appOrigin)) return;
      event.preventDefault();
      void openExternal(anchor.href).catch((err) =>
        console.error("Could not open external link", anchor.href, err),
      );
    },
    true,
  );

  const nativeOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url ? String(url) : "";
    if (isExternal(href, appOrigin)) {
      void openExternal(href).catch((err) =>
        console.error("Could not open external link", href, err),
      );
      return null;
    }
    return nativeOpen(url, target, features);
  }) as typeof window.open;
}