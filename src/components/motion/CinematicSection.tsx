import React from 'react';
import { motion, Variants } from 'motion/react';

export type CinematicVariant = 'fade-up' | 'fade-in' | 'slide-left' | 'slide-right' | 'scale-up' | 'cinematic-zoom';

interface CinematicSectionProps {
  children: React.ReactNode;
  variant?: CinematicVariant;
  delay?: number;
  duration?: number;
  className?: string;
  id?: string;
  showGlowBeam?: boolean;
  glowColor?: 'purple' | 'cyan' | 'blue' | 'emerald' | 'amber';
  viewportMargin?: string;
}

const variantsMap: Record<CinematicVariant, Variants> = {
  'fade-up': {
    hidden: { 
      opacity: 0, 
      y: 40, 
      scale: 0.97,
      filter: 'blur(8px)' 
    },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      filter: 'blur(0px)',
      transition: {
        duration: 0.85,
        ease: [0.22, 1, 0.36, 1],
      }
    }
  },
  'fade-in': {
    hidden: { 
      opacity: 0, 
      filter: 'blur(10px)' 
    },
    visible: { 
      opacity: 1, 
      filter: 'blur(0px)',
      transition: {
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1],
      }
    }
  },
  'slide-left': {
    hidden: { 
      opacity: 0, 
      x: 50, 
      filter: 'blur(6px)' 
    },
    visible: { 
      opacity: 1, 
      x: 0, 
      filter: 'blur(0px)',
      transition: {
        duration: 0.85,
        ease: [0.22, 1, 0.36, 1],
      }
    }
  },
  'slide-right': {
    hidden: { 
      opacity: 0, 
      x: -50, 
      filter: 'blur(6px)' 
    },
    visible: { 
      opacity: 1, 
      x: 0, 
      filter: 'blur(0px)',
      transition: {
        duration: 0.85,
        ease: [0.22, 1, 0.36, 1],
      }
    }
  },
  'scale-up': {
    hidden: { 
      opacity: 0, 
      scale: 0.92, 
      filter: 'blur(8px)' 
    },
    visible: { 
      opacity: 1, 
      scale: 1, 
      filter: 'blur(0px)',
      transition: {
        duration: 0.9,
        ease: [0.22, 1, 0.36, 1],
      }
    }
  },
  'cinematic-zoom': {
    hidden: { 
      opacity: 0, 
      scale: 1.05, 
      y: 20,
      filter: 'blur(12px)' 
    },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      filter: 'blur(0px)',
      transition: {
        duration: 1.0,
        ease: [0.16, 1, 0.3, 1],
      }
    }
  }
};

const glowGradients: Record<string, string> = {
  purple: 'from-transparent via-purple-500/40 to-transparent',
  cyan: 'from-transparent via-cyan-400/40 to-transparent',
  blue: 'from-transparent via-blue-500/40 to-transparent',
  emerald: 'from-transparent via-emerald-400/40 to-transparent',
  amber: 'from-transparent via-amber-400/40 to-transparent',
};

export const CinematicSection: React.FC<CinematicSectionProps> = ({
  children,
  variant = 'fade-up',
  delay = 0,
  className = '',
  id,
  showGlowBeam = false,
  glowColor = 'purple',
  viewportMargin = '-40px'
}) => {
  const selectedVariant = variantsMap[variant];

  return (
    <motion.div
      id={id}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: viewportMargin }}
      variants={{
        hidden: selectedVariant.hidden,
        visible: {
          ...selectedVariant.visible,
          transition: {
            ...((selectedVariant.visible as any)?.transition || {}),
            delay
          }
        }
      }}
      className={`relative ${className}`}
    >
      {showGlowBeam && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          whileInView={{ opacity: 1, scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: delay + 0.1, ease: 'easeOut' }}
          className={`absolute -top-4 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r ${glowGradients[glowColor]} pointer-events-none blur-[0.5px]`}
        />
      )}
      {children}
    </motion.div>
  );
};

// Stagger Container for Grids and Lists
interface CinematicStaggerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
  delayChildren?: number;
  id?: string;
}

export const CinematicStagger: React.FC<CinematicStaggerProps> = ({
  children,
  className = '',
  staggerDelay = 0.09,
  delayChildren = 0.1,
  id
}) => {
  return (
    <motion.div
      id={id}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: delayChildren
          }
        }
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Individual Stagger Item
interface CinematicItemProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  yOffset?: number;
}

export const CinematicItem: React.FC<CinematicItemProps> = ({
  children,
  className = '',
  onClick,
  yOffset = 30
}) => {
  return (
    <motion.div
      variants={{
        hidden: { 
          opacity: 0, 
          y: yOffset, 
          scale: 0.96,
          filter: 'blur(6px)'
        },
        visible: { 
          opacity: 1, 
          y: 0, 
          scale: 1,
          filter: 'blur(0px)',
          transition: {
            duration: 0.75,
            ease: [0.22, 1, 0.36, 1]
          }
        }
      }}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.div>
  );
};
