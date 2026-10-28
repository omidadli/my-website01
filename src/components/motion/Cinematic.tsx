import React, { useRef } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';

/* ------------------------------------------------------------------ */
/*  MaskLines — cinematic line-by-line reveal (overflow mask)          */
/* ------------------------------------------------------------------ */
export const MaskLines: React.FC<{
  lines: React.ReactNode[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  step?: number;
}> = ({ lines, className = '', lineClassName = '', delay = 0, step = 0.12 }) => (
  <span className={`block ${className}`}>
    {lines.map((line, i) => (
      <span key={i} className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
        <motion.span
          initial={{ y: '115%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          transition={{ duration: 0.85, delay: delay + i * step, ease: [0.22, 1, 0.36, 1] }}
          className={`block ${lineClassName}`}
        >
          {line}
        </motion.span>
      </span>
    ))}
  </span>
);

/* ------------------------------------------------------------------ */
/*  Magnetic — button/element leans toward the cursor (subtle)         */
/* ------------------------------------------------------------------ */
export const Magnetic: React.FC<{
  children: React.ReactNode;
  className?: string;
  strength?: number;
}> = ({ children, className = '', strength = 0.25 }) => {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'translate3d(0,0,0)';
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  ScrollProgress — hairline reading progress at the very top         */
/* ------------------------------------------------------------------ */
export const ScrollProgress: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed top-0 inset-x-0 z-[60] h-[3px] origin-right"
    >
      <div className="h-full w-full" style={{ background: 'linear-gradient(90deg, #4f46e5, #38bdf8, #4f46e5)' }} />
    </motion.div>
  );
};

/* ------------------------------------------------------------------ */
/*  Grain — filmic noise overlay (very low opacity, never clickable)   */
/* ------------------------------------------------------------------ */
export const Grain: React.FC = () => (
  <div className="nd-grain fixed inset-0 z-[55] pointer-events-none" aria-hidden />
);
