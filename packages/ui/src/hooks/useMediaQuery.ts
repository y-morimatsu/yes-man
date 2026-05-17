/**
 * useMediaQuery — CSS media query にマッチするか (NFR Design §7).
 *
 * ultrathink NFR Req AVAIL-U7b-02: SSR safe (window 不在で initial false、useEffect で client side update).
 */
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
