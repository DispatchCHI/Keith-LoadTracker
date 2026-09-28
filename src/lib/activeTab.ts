import type { TabId } from "../types";

/**
 * App-routing signal for which main tab is showing. Providers sit above Shell,
 * so they read this module instead of a React context under the tab UI.
 */
let activeTab: TabId = "today";
const listeners = new Set<() => void>();

export function getActiveTab(): TabId {
  return activeTab;
}

export function setActiveTab(tab: TabId): void {
  if (activeTab === tab) return;
  activeTab = tab;
  for (const listener of [...listeners]) listener();
}

export function subscribeActiveTab(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isActiveTabOneOf(tabs: readonly TabId[]): boolean {
  return tabs.includes(activeTab);
}

/** Test helper — not for app code. */
export function _resetActiveTabForTests(tab: TabId = "today"): void {
  activeTab = tab;
  listeners.clear();
}
