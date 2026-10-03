import React from 'react';
import { motion } from 'motion/react';

interface PageLoaderProps {
  message?: string;
  className?: string;
}

/**
 * Stylish route-chunk loader shown by <Suspense> while a lazy page bundle loads.
 * Features a self-drawing OA logo (target + arrow + A) followed by a "در حال بارگذاری…"
 * label. Designed to feel like a brand moment rather than a spinner.
 */
export const PageLoader: React.FC<PageLoaderProps> = ({
  message = 'در حال بارگذاری صفحه…',
  className = '',
}) => {
  // Draw paths in sequence, then fade in the label while a gentle pulse breathes.
  const drawDuration = 0.7;
  const stagger = 0.14;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className={`mx-auto my-20 flex min-h-[55vh] flex-col items-center justify-center gap-6 ${className}`}
    >
      <div className="relative flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32">
        {/* Soft glow halo */}
        <motion.div
          initial={{ opacity: 0.0, scale: 0.8 }}
          animate={{ opacity: [0.15, 0.35, 0.15], scale: [0.85, 1.05, 0.85] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full bg-[color:var(--nd-accent)] blur-2xl"
          aria-hidden
        />

        <motion.svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative w-full h-full drop-shadow-[0_0_18px_rgba(92,225,230,0.45)]"
          initial="hidden"
          animate="visible"
        >
          <defs>
            <linearGradient id="oaGradLoader" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5ce1e6" />
              <stop offset="50%" stopColor="#4c8dff" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>

          <g stroke="url(#oaGradLoader)" strokeLinecap="round" strokeLinejoin="round">
            {/* Outer circle */}
            <motion.circle
              cx="36" cy="64" r="26" strokeWidth="5" fill="none"
              variants={drawCircle(26)}
              transition={{ duration: drawDuration, ease: 'easeOut' }}
            />
            {/* Middle circle */}
            <motion.circle
              cx="36" cy="64" r="15" strokeWidth="4.5" fill="none"
              variants={drawCircle(15)}
              initial="hidden"
              animate="visible"
              transition={{ duration: drawDuration * 0.85, ease: 'easeOut', delay: stagger }}
            />
            {/* Arrow shaft */}
            <motion.line
              x1="36" y1="64" x2="70" y2="30" strokeWidth="5"
              variants={drawLine()}
              transition={{ duration: drawDuration * 0.6, ease: 'easeOut', delay: stagger * 2 }}
            />
            {/* Arrow head */}
            <motion.polygon
              points="90,10 66,22 78,34" fill="url(#oaGradLoader)" stroke="none"
              variants={{ hidden: { opacity: 0, scale: 0.4 }, visible: { opacity: 1, scale: 1 } }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: stagger * 3 }}
            />
            {/* Letter A: left leg */}
            <motion.line
              x1="74" y1="40" x2="58" y2="90" strokeWidth="5.5"
              variants={drawLine()}
              transition={{ duration: drawDuration * 0.7, ease: 'easeOut', delay: stagger * 2.5 }}
            />
            {/* Letter A: right leg */}
            <motion.line
              x1="74" y1="40" x2="90" y2="90" strokeWidth="5.5"
              variants={drawLine()}
              transition={{ duration: drawDuration * 0.7, ease: 'easeOut', delay: stagger * 2.9 }}
            />
            {/* Letter A: crossbar */}
            <motion.line
              x1="63" y1="74" x2="85" y2="74" strokeWidth="5.5"
              variants={drawLine()}
              transition={{ duration: drawDuration * 0.4, ease: 'easeOut', delay: stagger * 3.4 }}
            />
            {/* Center solid dot — pops last */}
            <motion.circle
              cx="36" cy="64" r="5" fill="url(#oaGradLoader)" stroke="none"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: stagger * 3.9 }}
            />
          </g>
        </motion.svg>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: stagger * 4.4 }}
        className="flex flex-col items-center gap-3"
      >
        <p className="text-xs sm:text-sm font-extrabold tracking-tight text-[color:var(--nd-ink-2)]">
          {message}
        </p>
        <motion.div
          className="h-[3px] w-28 sm:w-32 rounded-full bg-[color:var(--nd-line)] overflow-hidden"
          aria-hidden
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, #5ce1e6 0%, #4c8dff 50%, #2563eb 100%)',
            }}
            initial={{ width: '0%', x: '-100%' }}
            animate={{ width: '100%', x: ['-100%', '0%', '100%'] }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: stagger * 4.6,
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
};

// Helpers to produce path-draw variants for circles and lines.
function drawCircle(r: number) {
  const circumference = 2 * Math.PI * r;
  return {
    hidden: { strokeDasharray: circumference, strokeDashoffset: circumference },
    visible: { strokeDashoffset: 0 },
  } as const;
}

function drawLine() {
  return {
    hidden: { pathLength: 0 },
    visible: { pathLength: 1 },
  } as const;
}

export default PageLoader;
