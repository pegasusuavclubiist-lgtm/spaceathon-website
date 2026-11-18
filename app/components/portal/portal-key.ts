/**
 * The member's personal portal key lives in sessionStorage only (cleared when
 * the tab closes) and is read through useSyncExternalStore. The emailed link
 * carries it in the URL fragment, which is never sent to the server; it is
 * moved into storage and removed from the address bar on first load.
 */

const STORE = "kosmodrome:portal-key";
const listeners = new Set<() => void>();

export function subscribeKey(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readKey(): string | null {
  try {
    return window.sessionStorage.getItem(STORE);
  } catch {
    return null;
  }
}

export function writeKey(key: string | null) {
  try {
    if (key) window.sessionStorage.setItem(STORE, key);
    else window.sessionStorage.removeItem(STORE);
  } catch {
    /* storage blocked: the key stays in memory for this render only */
  }
  listeners.forEach((listener) => listener());
}

export const KEY_PATTERN = /^kmp_[\w-]{20,80}$/;

/** Pull `#key=kmp_…` out of the address bar, store it, and clean the URL. */
export function captureKeyFromHash() {
  const match = /[#&]key=(kmp_[\w-]{20,80})/.exec(window.location.hash);
  if (!match) return;
  writeKey(match[1]);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
