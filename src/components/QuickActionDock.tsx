import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Page, Theme } from '../types';
import { Briefcase, Package, Home, GraduationCap, PhoneCall } from 'lucide-react';

interface QuickActionDockProps {
  theme: Theme;
  currentPage?: Page;
  onNavigate: (page: Page) => void;
}

export interface NavTabItem {
  page: Page;
  label: string;
  icon: React.FC<{ className?: string; strokeWidth?: number }>;
  dark: {
    orbGradient: string;
    orbShadow: string;
    ambientGlow: string;
    textColor: string;
  };
  light: {
    orbGradient: string;
    orbShadow: string;
    ambientGlow: string;
    textColor: string;
  };
}

/**
 * 5 Navigation items in strict Right-to-Left (RTL) order matching reference image:
 * Index 0: خدمات (Services) -> Briefcase icon (far right)
 * Index 1: نمونه‌کارها (Portfolio) -> Package icon (active in image)
 * Index 2: خانه (Home) -> Home icon (center)
 * Index 3: آموزش (Education) -> GraduationCap icon
 * Index 4: تماس (Contact) -> PhoneCall icon (far left)
 */
export const NAV_ITEMS: NavTabItem[] = [
  {
    page: 'services',
    label: 'خدمات',
    icon: Briefcase,
    dark: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #fb923c 0%, #ea580c 60%, #9a3412 100%)',
      orbShadow: '0 0 30px 6px rgba(251, 146, 60, 0.7), 0 10px 24px rgba(0, 0, 0, 0.65)',
      ambientGlow: 'rgba(251, 146, 60, 0.55)',
      textColor: '#fdba74',
    },
    light: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #ea580c 0%, #c2410c 70%, #7c2d12 100%)',
      orbShadow: '0 8px 24px rgba(234, 88, 12, 0.45), 0 2px 6px rgba(0, 0, 0, 0.1)',
      ambientGlow: 'rgba(234, 88, 12, 0.25)',
      textColor: '#c2410c',
    },
  },
  {
    page: 'portfolio',
    label: 'نمونه‌کارها',
    icon: Package,
    // Signature Emerald / Teal gradient matching reference screenshot
    dark: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #34d399 0%, #059669 55%, #064e3b 100%)',
      orbShadow: '0 0 34px 8px rgba(16, 185, 129, 0.8), 0 12px 28px rgba(0, 0, 0, 0.7)',
      ambientGlow: 'rgba(16, 185, 129, 0.65)',
      textColor: '#34d399',
    },
    light: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #10b981 0%, #059669 65%, #047857 100%)',
      orbShadow: '0 10px 26px rgba(5, 150, 105, 0.5), 0 2px 6px rgba(0, 0, 0, 0.1)',
      ambientGlow: 'rgba(16, 185, 129, 0.3)',
      textColor: '#047857',
    },
  },
  {
    page: 'home',
    label: 'خانه',
    icon: Home,
    dark: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #38bdf8 0%, #0284c7 60%, #0369a1 100%)',
      orbShadow: '0 0 30px 6px rgba(56, 189, 248, 0.7), 0 10px 24px rgba(0, 0, 0, 0.65)',
      ambientGlow: 'rgba(56, 189, 248, 0.55)',
      textColor: '#7dd3fc',
    },
    light: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #0284c7 0%, #0369a1 70%, #075985 100%)',
      orbShadow: '0 8px 24px rgba(2, 132, 199, 0.45), 0 2px 6px rgba(0, 0, 0, 0.1)',
      ambientGlow: 'rgba(2, 132, 199, 0.25)',
      textColor: '#0369a1',
    },
  },
  {
    page: 'blog',
    label: 'آموزش',
    icon: GraduationCap,
    dark: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #c084fc 0%, #9333ea 60%, #6b21a8 100%)',
      orbShadow: '0 0 30px 6px rgba(192, 132, 252, 0.7), 0 10px 24px rgba(0, 0, 0, 0.65)',
      ambientGlow: 'rgba(192, 132, 252, 0.55)',
      textColor: '#d8b4fe',
    },
    light: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #a855f7 0%, #7e22ce 70%, #581c87 100%)',
      orbShadow: '0 8px 24px rgba(126, 34, 206, 0.45), 0 2px 6px rgba(0, 0, 0, 0.1)',
      ambientGlow: 'rgba(126, 34, 206, 0.25)',
      textColor: '#6b21a8',
    },
  },
  {
    page: 'contact',
    label: 'تماس',
    icon: PhoneCall,
    dark: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #fb7185 0%, #e11d48 60%, #9f1239 100%)',
      orbShadow: '0 0 30px 6px rgba(251, 113, 133, 0.7), 0 10px 24px rgba(0, 0, 0, 0.65)',
      ambientGlow: 'rgba(251, 113, 133, 0.55)',
      textColor: '#fda4af',
    },
    light: {
      orbGradient: 'radial-gradient(circle at 50% 28%, #f43f5e 0%, #e11d48 70%, #be123c 100%)',
      orbShadow: '0 8px 24px rgba(225, 29, 72, 0.45), 0 2px 6px rgba(0, 0, 0, 0.1)',
      ambientGlow: 'rgba(225, 29, 72, 0.25)',
      textColor: '#be123c',
    },
  },
];

/**
 * Calculates the exact dynamic SVG path 'd' attribute for the navbar base,
 * placing the upward notch-curve cradle centered at `cx`.
 */
export function generateNavbarPath(W: number, cx: number, H = 96, Y = 34, r = 30): string {
  const spread = 56;
  const x0 = Math.max(r, cx - spread);
  const x4 = Math.min(W - r, cx + spread);

  return [
    `M ${r} ${Y}`,
    `L ${x0} ${Y}`,
    // Smooth upward curve towards the elevated orb
    `C ${cx - 44} ${Y}, ${cx - 36} 22, ${cx - 24} 12`,
    // Cradle top arc hugging the lower half of the 64px orb
    `C ${cx - 14} 6, ${cx - 6} 6, ${cx} 6`,
    `C ${cx + 6} 6, ${cx + 14} 6, ${cx + 24} 12`,
    // Smooth slope returning down to the straight navbar top edge
    `C ${cx + 36} 22, ${cx + 44} ${Y}, ${x4} ${Y}`,
    `L ${W - r} ${Y}`,
    // Right pill rounded cap
    `A ${r} ${r} 0 0 1 ${W} ${Y + r}`,
    `L ${W} ${H - r}`,
    `A ${r} ${r} 0 0 1 ${W - r} ${H}`,
    // Bottom straight baseline
    `L ${r} ${H}`,
    // Left pill rounded cap
    `A ${r} ${r} 0 0 1 0 ${H - r}`,
    `L 0 ${Y + r}`,
    `A ${r} ${r} 0 0 1 ${r} ${Y}`,
    `Z`,
  ].join(' ');
}

export const QuickActionDock: React.FC<QuickActionDockProps> = ({
  theme,
  currentPage = 'portfolio',
  onNavigate,
}) => {
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure dock width dynamically with comfortable larger default (560px)
  const [containerWidth, setContainerWidth] = useState<number>(560);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setContainerWidth(w);
    };

    updateWidth();

    const ro = new ResizeObserver(() => updateWidth());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Normalize page name (e.g. projects -> portfolio)
  const normalizedPage = currentPage === 'projects' ? 'portfolio' : currentPage;

  // Find active index in the RTL array (0: خدمات, 1: نمونه‌کارها, 2: خانه, 3: آموزش, 4: تماس)
  const activeIndex = Math.max(
    0,
    NAV_ITEMS.findIndex((item) => item.page === normalizedPage)
  );
  const activeTab = NAV_ITEMS[activeIndex] || NAV_ITEMS[1];
  const tabStyle = isDark ? activeTab.dark : activeTab.light;

  // Calculate target cx based on RTL ordering
  // Tab 0 (خدمات) is at rightmost slot (ltrIndex = 4)
  // Tab 4 (تماس) is at leftmost slot (ltrIndex = 0)
  const padding = 18;
  const availableWidth = Math.max(120, containerWidth - padding * 2);
  const tabWidth = availableWidth / 5;
  const ltrIndex = 4 - activeIndex;
  const activeCx = padding + (ltrIndex + 0.5) * tabWidth;

  // React state storing the SVG path 'd' attribute calculated based on active index
  const [svgPathD, setSvgPathD] = useState<string>(() =>
    generateNavbarPath(containerWidth, activeCx)
  );

  // Update the React state path whenever activeIndex or containerWidth changes
  useEffect(() => {
    setSvgPathD(generateNavbarPath(containerWidth, activeCx));
  }, [containerWidth, activeCx]);

  const ActiveIcon = activeTab.icon;

  // Framer Motion spring physics config for synchronized morphing & translation
  const springTransition = {
    type: 'spring' as const,
    stiffness: 340,
    damping: 28,
    mass: 0.85,
  };

  return (
    <nav
      aria-label="منوی ناوبری شناور"
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] inset-x-0 z-40 flex justify-center px-3 pointer-events-none select-none"
    >
      <div
        ref={containerRef}
        className="pointer-events-auto relative w-[560px] max-w-full h-[96px]"
      >
        {/* 
          1. Inline SVG Container Base
          Serves as the structural visual base of the dock with an animated SVG path
          morphing smoothly via Framer Motion when switching tabs.
        */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_20px_45px_rgba(0,0,0,0.55)]"
          viewBox={`0 0 ${containerWidth} 96`}
          fill="none"
        >
          <defs>
            <linearGradient id="dock-bg-dark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#150d36" />
              <stop offset="60%" stopColor="#0f0928" />
              <stop offset="100%" stopColor="#070414" />
            </linearGradient>
            <linearGradient id="dock-bg-light" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f8fafc" />
            </linearGradient>
          </defs>

          {/* Dynamic SVG Path animated with Framer Motion */}
          <motion.path
            d={svgPathD}
            animate={{ d: svgPathD }}
            transition={springTransition}
            fill={isDark ? 'url(#dock-bg-dark)' : 'url(#dock-bg-light)'}
            stroke={isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)'}
            strokeWidth="1.2"
          />
        </svg>

        {/* 
          2. Elevated Floating Active Orb Unit (Positioned ABOVE the navbar box)
          Synchronized to activeCx with Framer Motion spring physics
        */}
        <motion.div
          className="absolute top-0 pointer-events-none z-20"
          animate={{
            left: `${activeCx}px`,
          }}
          transition={springTransition}
          style={{
            transform: 'translateX(-50%)',
          }}
        >
          {/* Radiant Neon Bloom behind the Orb */}
          <div
            className="absolute -top-4 left-1/2 -translate-x-1/2 w-32 h-24 rounded-full blur-2xl pointer-events-none transition-colors duration-300"
            style={{ backgroundColor: tabStyle.ambientGlow }}
          />

          {/* Elevated Circular Glass Orb (64px) with Solid 2.5px White Border and Glass Sheen */}
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-[64px] h-[64px] rounded-full border-[2.5px] border-white flex items-center justify-center overflow-hidden z-25 transition-all duration-300"
            style={{
              background: tabStyle.orbGradient,
              boxShadow: tabStyle.orbShadow,
            }}
          >
            {/* Top Glass Sheen Reflection Highlight */}
            <div className="absolute top-1.5 inset-x-3 h-4 rounded-full bg-gradient-to-b from-white/90 via-white/25 to-transparent pointer-events-none" />

            {/* Active Icon elevated above the box */}
            <div
              key={activeTab.page}
              className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] animate-[iconRiseUp_0.35s_cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center"
            >
              <ActiveIcon className="w-7 h-7" strokeWidth={2.4} />
            </div>
          </div>
        </motion.div>

        {/* 
          3. 5 Interactive Navigation Tabs (Strict RTL Order: خدمات, نمونه‌کارها, خانه, آموزش, تماس)
          The icons for inactive items sit inside the box; when clicked, the icon rises up above the box into the orb!
        */}
        <div
          dir="rtl"
          className="relative z-30 grid grid-cols-5 h-[62px] mt-[34px] px-4"
        >
          {NAV_ITEMS.map((tab, idx) => {
            const isActive = activeIndex === idx;
            const Icon = tab.icon;

            return (
              <button
                key={tab.page}
                onClick={() => onNavigate(tab.page)}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex flex-col items-center justify-center h-full cursor-pointer group focus:outline-none"
              >
                {/* 
                  Inactive Item Icon:
                  Renders comfortably inside the box above the label.
                  When clicked (isActive), it lifts up into the elevated floating orb above the box!
                */}
                <span
                  className={`transition-all duration-300 flex items-center justify-center ${
                    isActive
                      ? 'opacity-0 -translate-y-4 scale-50 pointer-events-none'
                      : isDark
                      ? 'text-slate-400 group-hover:text-white group-hover:scale-110'
                      : 'text-slate-500 group-hover:text-slate-900 group-hover:scale-110'
                  }`}
                >
                  <Icon className="w-[22px] h-[22px]" strokeWidth={2.0} />
                </span>

                {/* Tab Label */}
                <span
                  className={`transition-all duration-200 mt-1 whitespace-nowrap ${
                    isActive
                      ? 'text-[12px] font-bold tracking-tight'
                      : isDark
                      ? 'text-[11.5px] font-medium text-slate-400 group-hover:text-slate-200'
                      : 'text-[11.5px] font-medium text-slate-500 group-hover:text-slate-900'
                  }`}
                  style={
                    isActive
                      ? {
                          color: tabStyle.textColor,
                          textShadow: isDark
                            ? `0 0 14px ${tabStyle.ambientGlow}`
                            : 'none',
                        }
                      : undefined
                  }
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
