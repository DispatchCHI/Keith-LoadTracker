/**
 * Print a standalone HTML page without the app around it. Uses a hidden
 * iframe + print() (works in browsers and the Tauri 2 WebView2 desktop app).
 * If that throws, open the page in a new window so it can be printed there.
 */
export function printHtmlDocument(html: string): void {
  try {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument ?? frame.contentWindow?.document;
    if (!doc || !frame.contentWindow) throw new Error("no print frame");
    doc.open();
    doc.write(html);
    doc.close();
    const win = frame.contentWindow;
    const cleanup = () => window.setTimeout(() => frame.remove(), 1000);
    win.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        frame.remove();
        openPrintableWindow(html);
        return;
      }
      // Some WebViews never fire afterprint; drop the frame eventually.
      window.setTimeout(() => frame.remove(), 60_000);
    }, 50);
  } catch {
    openPrintableWindow(html);
  }
}

function openPrintableWindow(html: string): void {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("load", () => {
      try {
        win.print();
      } catch {
        /* user prints from the opened page */
      }
    });
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}