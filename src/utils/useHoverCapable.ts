import { useEffect, useState } from 'react';

/**
 * useHoverCapable — true only on devices with a real hovering pointer
 * (mouse/trackpad). Touch screens (`pointer: coarse`, `hover: none`) get NO
 * hover-driven effects: no tilt cards, no magnetic buttons, no 3D badge
 * lift — tapping there otherwise leaves "stuck hover" states that never clear.
 */
export function useHoverCapable(): boolean {
  const query = '(hover: hover) and (pointer: fine)';
  const [capable, setCapable] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setCapable(mq.matches);
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  return capable;
}
