import { useEffect, useRef } from "react";

const STORAGE_PREFIX = "scroll_pos:";
const RETRY_DELAYS_MS = [0, 80, 200, 400, 800];

/**
 * Saves and restores window scroll position for a named page.
 *
 * Pass `ready = true` once the page's primary data has loaded so
 * the scroll can be restored after the list has fully rendered.
 *
 * Uses a retry strategy: after `ready` flips true, it checks every
 * few milliseconds whether the document is tall enough to reach the
 * saved position. This handles images / lazy-loaded content that
 * shifts layout after the initial paint.
 *
 * Usage:
 *   useScrollRestoration("pre-match", !isLoading && fixtures.length > 0);
 */
export function useScrollRestoration(key: string, ready = true) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const restored = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Save position continuously while on the page
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        sessionStorage.setItem(storageKey, String(window.scrollY));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [storageKey]);

  // Restore when `ready` flips true
  useEffect(() => {
    if (!ready || restored.current) return;

    const saved = sessionStorage.getItem(storageKey);
    if (!saved) { restored.current = true; return; }
    const targetY = parseInt(saved, 10);
    if (isNaN(targetY) || targetY <= 0) { restored.current = true; return; }

    const clearAll = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };

    const tryScroll = () => {
      if (restored.current) return;
      const needed = targetY + window.innerHeight;
      const available = document.documentElement.scrollHeight;
      if (available >= needed) {
        window.scrollTo({ top: targetY, behavior: "instant" });
        restored.current = true;
        clearAll();
      }
    };

    clearAll();
    RETRY_DELAYS_MS.forEach(delay => {
      const t = setTimeout(tryScroll, delay);
      timers.current.push(t);
    });

    return () => clearAll();
  }, [ready, storageKey]);
}
