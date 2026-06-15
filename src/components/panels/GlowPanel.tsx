import { useRef, useEffect, type ReactNode } from 'react';

interface GlowPanelProps {
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
  id?: string;
}

export default function GlowPanel({ className = '', children, style, id }: GlowPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--mouse-x', `${x}%`);
      el.style.setProperty('--mouse-y', `${y}%`);
    };

    const onMouseLeave = () => {
      el.style.setProperty('--mouse-x', '50%');
      el.style.setProperty('--mouse-y', '50%');
    };

    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mouseleave', onMouseLeave);

    return () => {
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return (
    <div ref={ref} className={`panel glow-panel ${className}`} style={style} id={id}>
      {children}
    </div>
  );
}