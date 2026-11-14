import { useEffect, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import SchemeSwitcher from '../panels/SchemeSwitcher';
import RightPanelContainer from '../panels/RightPanelContainer';

const RIGHT_PANEL_PIN_STORAGE_KEY = 'ideogram4-right-panel-pinned';

function loadPinnedState(): boolean {
  try {
    return localStorage.getItem(RIGHT_PANEL_PIN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 右侧浮层：鼠标靠近画布右边缘时滑入，离开后自动收起。 */
export default function RightPanelDock() {
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [isFocusInside, setIsFocusInside] = useState(false);
  const [isPinned, setIsPinned] = useState(loadPinnedState);
  const [isEdgePointerNear, setIsEdgePointerNear] = useState(false);
  const [isEdgeSticky, setIsEdgeSticky] = useState(false);
  const hintRef = useRef<HTMLSpanElement>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const isVisible = isPinned || isPointerInside || isFocusInside || isEdgePointerNear || isEdgeSticky;

  // DOM 热区在窗口最边缘可能被滚动条或窗口边界截断；用全局指针位置兜底。
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      const hint = hintRef.current?.getBoundingClientRect();
      if (!hint) return;
      const nearRightEdge = e.clientX >= window.innerWidth - 40;
      const nearHint = e.clientY >= hint.top - 28 && e.clientY <= hint.bottom + 28;
      setIsEdgePointerNear(nearRightEdge && nearHint);
      // 只有右边缘是安全区；移动到底部不应保持或触发右侧栏。
      if (!nearRightEdge) {
        setIsEdgeSticky(false);
      }
    };
    const handleLeave = () => {
      const pointer = lastPointerRef.current;
      const inSafeZone = pointer.x >= window.innerWidth - 40;
      setIsEdgePointerNear(false);
      setIsEdgeSticky(inSafeZone);
    };
    const handleWindowBlur = () => {
      setIsPointerInside(false);
      setIsEdgePointerNear(false);
      setIsEdgeSticky(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true, capture: true });
    window.addEventListener('pointerover', handlePointerMove, { passive: true, capture: true });
    document.documentElement.addEventListener('mouseleave', handleLeave);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerover', handlePointerMove, true);
      document.documentElement.removeEventListener('mouseleave', handleLeave);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  const handleTogglePin = () => {
    setIsPinned(current => {
      const next = !current;
      try {
        localStorage.setItem(RIGHT_PANEL_PIN_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // localStorage 不可用时仅保留当前会话状态
      }
      return next;
    });
  };

  const handleMouseLeave = (e: MouseEvent<HTMLDivElement>) => {
    const nextTarget = e.relatedTarget;
    if (!(nextTarget instanceof Node) || !e.currentTarget.contains(nextTarget)) {
      setIsPointerInside(false);
      const pointer = lastPointerRef.current;
      const inSafeZone = pointer.x >= window.innerWidth - 40;
      setIsEdgeSticky(inSafeZone);
    }
  };

  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    const nextTarget = e.relatedTarget;
    if (!(nextTarget instanceof Node) || !e.currentTarget.contains(nextTarget)) {
      setIsFocusInside(false);
    }
  };

  return (
    <div
      data-testid="right-panel-dock"
      className={`right-panel-dock${isVisible ? ' is-visible' : ''}`}
      onMouseEnter={() => {
        setIsPointerInside(true);
        setIsEdgeSticky(false);
      }}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={() => setIsFocusInside(true)}
      onBlurCapture={handleBlur}
    >
      <div className="right-panel-hover-zone" aria-hidden="true" />
      <span
        ref={hintRef}
        data-testid="right-panel-hint"
        className="right-panel-dock-hint"
        aria-hidden="true"
      />
      <div className="right-panel-float" data-testid="right-panel-float">
        <SchemeSwitcher />
        <RightPanelContainer isPinned={isPinned} onTogglePin={handleTogglePin} />
      </div>
    </div>
  );
}
