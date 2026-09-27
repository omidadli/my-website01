import { useEffect, useState } from 'react';

/**
 * useStaticMediaMode — "show the WebP still, never the MP4".
 *
 * True when the visitor prefers (or needs) static mascot media:
 *   • `prefers-reduced-motion: reduce`  — accessibility
 *   • `pointer: coarse`                 — touch device / mobile data
 *   • `navigator.connection.saveData`   — user asked for data saving
 *   • slow cellular (slow-2g / 2g)      — a 300 kB clip is not worth it
 *
 * Listens for media-query changes so plugging in a mouse or flipping the OS
 * reduced-motion switch updates every mascot surface live. Shared by
 * MascotAvatar, AssistantPanel, CinematicWelcomeModal, MascotWelcomeOverlay.
 */
export function useStaticMediaMode(): boolean {
  const compute = (): boolean => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const saveData = Boolean(conn?.saveData);
    const slowNet = conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g';
    return coarse || reduced || saveData || slowNet;
  };

  const [staticMode, setStaticMode] = useState(compute);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStaticMode(compute());
    coarse.addEventListener?.('change', update);
    reduced.addEventListener?.('change', update);
    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    conn?.addEventListener?.('change', update);
    return () => {
      coarse.removeEventListener?.('change', update);
      reduced.removeEventListener?.('change', update);
      conn?.removeEventListener?.('change', update);
    };
  }, []);

  return staticMode;
}
