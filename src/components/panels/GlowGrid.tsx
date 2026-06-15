import { useRef, useCallback, type CSSProperties, type ReactNode } from 'react';

interface GlowGridProps {
  id?: string;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
  gridSize?: number;
  dotSize?: number;
  glowColor?: string;
  glowRadius?: number;
  baseDotColor?: string;
}

export default function GlowGrid({
  id,
  className = '',
  children,
  style,
  gridSize = 24,
  dotSize = 1.5,
  glowColor = '#7c5cfc',
  glowRadius = 140,
  baseDotColor = 'rgba(255, 255, 255, 0.06)',
}: GlowGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    const layer = layerRef.current;
    if (!container || !layer) return;

    const rect = container.getBoundingClientRect();
    layer.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    layer.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  }, []);

  const cssVars: CSSProperties = {
    '--grid-size': `${gridSize}px`,
    '--dot-size': `${dotSize}px`,
    '--glow-color': glowColor,
    '--glow-radius': `${glowRadius}px`,
    '--base-dot-color': baseDotColor,
    ...style,
  } as CSSProperties;

  return (
    <div
      id={id}
      ref={containerRef}
      className={`glow-grid-container ${className}`}
      style={cssVars}
      onMouseMove={handleMouseMove}
    >
      <div ref={layerRef} className="glow-grid-layer" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}