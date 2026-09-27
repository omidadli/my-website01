import React, { useState, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { useHoverCapable } from '../../utils/useHoverCapable';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  maxTilt?: number;
}

/**
 * TiltCard — 3D mouse-follow tilt + glare. Gated like CustomCursor:
 *   • touch (`pointer: coarse` / no hover) → completely inert (a tap would
 *     otherwise fire one mouseenter and leave the card stuck mid-tilt);
 *   • prefers-reduced-motion → no transform motion (content still renders).
 */
export const TiltCard: React.FC<TiltCardProps> = ({
  children,
  className = '',
  glowColor = 'rgba(92, 225, 230, 0.15)',
  maxTilt = 10,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, glareX: 50, glareY: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const hoverCapable = useHoverCapable();
  const reducedMotion = useReducedMotion();
  const tiltEnabled = hoverCapable && !reducedMotion;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tiltEnabled || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -maxTilt;
    const rotateY = ((x - centerX) / centerX) * maxTilt;

    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;

    setTilt({ x: rotateX, y: rotateY, glareX, glareY });
  };

  const handleMouseEnter = () => {
    if (tiltEnabled) setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0, glareX: 50, glareY: 50 });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative transition-transform duration-200 ease-out preserve-3d cursor-pointer ${className}`}
      style={{
        transform:
          tiltEnabled && isHovered
            ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(12px)`
            : 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Glare Light Overlay */}
      {tiltEnabled && isHovered && (
        <div
          className="absolute inset-0 rounded-[inherit] pointer-events-none z-20 transition-opacity duration-300"
          style={{
            background: `radial-gradient( circle 300px at ${tilt.glareX}% ${tilt.glareY}%, ${glowColor}, transparent 80% )`,
          }}
        />
      )}
      {children}
    </div>
  );
};
