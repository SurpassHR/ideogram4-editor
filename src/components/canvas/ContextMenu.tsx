import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: (ContextMenuItem | 'divider')[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 边界检测：调整菜单位置避免溢出视口
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > vw) adjustedX = vw - rect.width - 8;
    if (y + rect.height > vh) adjustedY = vh - rect.height - 8;
    if (adjustedX < 0) adjustedX = 8;
    if (adjustedY < 0) adjustedY = 8;

    menuRef.current.style.left = `${adjustedX}px`;
    menuRef.current.style.top = `${adjustedY}px`;
  }, [x, y]);

  // 左键点击任意位置关闭菜单（右键由父组件控制，不在此关闭）
  useEffect(() => {
    const handleClick = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 使用 setTimeout 避免触发菜单打开的同一次点击立即关闭菜单
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item === 'divider') {
          return <div key={i} className="context-menu-divider" />;
        }
        return (
          <button
            key={i}
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            <span className="context-menu-item-label">{item.label}</span>
            {item.shortcut && (
              <span className="context-menu-item-shortcut">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}