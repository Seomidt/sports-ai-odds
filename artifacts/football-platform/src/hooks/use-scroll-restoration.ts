import { useEffect } from "react";

const STORAGE_PREFIX = "scroll_pos:";

/**
 * Saves and restores window scroll position for a named page.
 * When the user navigates away the position is written to sessionStorage.
 * When the component mounts it reads that value and scrolls back to it.
 *
 * Usage: call once at the top of a list page component.
 *   useScrollRestoration("pre-match");
 */
export function useScrollRestoration(key: string) {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  // Restore on mount — requestAnimationFrame lets the list paint first
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved != null) {
      const y = parseInt(saved, 10);
      if (!isNaN(y) && y > 0) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: "instant" });
        });
      }
    }
    // Save on unmount (when the user navigates away from this page)
    return () => {
      sessionStorage.setItem(storageKey, String(window.scrollY));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
