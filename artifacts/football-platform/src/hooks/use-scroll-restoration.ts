import { useEffect, useRef } from "react";

const STORAGE_PREFIX = "scroll_pos:";

/**
 * Saves and restores window scroll position for a named page.
 *
 * Pass `ready = true` once the page's primary data has loaded so
 * the scroll can be restored after the list has fully rendered.
 * Pass nothing (or omit) to restore immediately on mount.
 *
 * Usage:
 *   useScrollRestoration("pre-match", !isLoading && fixtures.length > 0);
 */
export function useScrollRestoration(key: string, ready = true) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const restored = useRef(false);

  // Restore when `ready` flips to true (data has loaded and list is painted)
  useEffect(() => {
    if (!ready || restored.current) return;
    const saved = sessionStorage.getItem(storageKey);
    if (saved != null) {
      const y = parseInt(saved, 10);
      if (!isNaN(y) && y > 0) {
        // Two rAFs: first lets React flush, second lets the browser paint
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: y, behavior: "instant" });
            restored.current = true;
          });
        });
      } else {
        restored.current = true;
      }
    } else {
      restored.current = true;
    }
  }, [ready, storageKey]);

  // Save position on unmount so we can restore next visit
  useEffect(() => {
    return () => {
      sessionStorage.setItem(storageKey, String(window.scrollY));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
