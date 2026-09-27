import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
// contentCore (not data/content) so re-enabling the splash can never pull the
// generated article batches into the critical path. The splash is currently
// NOT mounted by App.tsx — zero impact on LCP by construction.
import { PERSONAL_INFO } from '../data/contentCore';

interface SplashScreenProps {
  onComplete?: () => void;
  autoDismissTime?: number; // ms, default 1400ms
}

/**
 * Refined brand splash — light canvas, monogram mark, single progress hairline.
 * Fast by design: never makes the visitor wait.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({
  onComplete,
  autoDismissTime = 1400,
}) => {
  const [progress, setProgress] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const finish = () => {
    setIsDismissing(true);
    setTimeout(() => onCompleteRef.current?.(), 420);
  };

  useEffect(() => {
    const start = Date.now();
    const duration = Math.max(600, autoDismissTime - 350);
    const interval = setInterval(() => {
      const p = Math.min(100, Math.floor(((Date.now() - start) / duration) * 100));
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(finish, 120);
      }
    }, 30);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {(
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: isDismissing ? 0 : 1, scale: isDismissing ? 1.03 : 1 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] grid place-items-center"
          style={{ background: 'var(--nd-bg)' }}
          onClick={finish}
        >
          <div className="flex flex-col items-center gap-6 select-none">
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-4"
            >
              <span
                className="w-16 h-16 rounded-[var(--nd-radius-card)] grid place-items-center text-white text-2xl font-black shadow-[var(--nd-shadow-md)]"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #7c6cf0)' }}
              >
                ع
              </span>
              <span className="text-center leading-tight">
                <span className="block text-lg font-black text-[color:var(--nd-ink)]">{PERSONAL_INFO.name}</span>
                <span className="block text-[11px] font-bold text-[color:var(--nd-faint)] mt-1 dir-ltr">
                  Performance Marketing · CRO
                </span>
              </span>
            </motion.div>

            <div className="w-40 h-[3px] rounded-full bg-black/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-100"
                style={{ width: `${progress}%`, background: 'var(--nd-accent)' }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
