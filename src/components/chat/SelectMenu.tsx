import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Option {
  value: string;
  label: string;
}

interface SelectMenuProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** 可选的特殊选项列表（如打开管理器），渲染在列表顶部并用分隔线隔开 */
  specialOptions?: { value: string; label: string }[];
  onSpecialSelect?: (value: string) => void;
}

/** 紧凑型自定义下拉菜单 — createPortal 渲染 dropdown 以逃逸 overflow: hidden 裁剪 */
export default function SelectMenu({
  options,
  value,
  onChange,
  placeholder,
  className = '',
  specialOptions,
  onSpecialSelect,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const currentLabel =
    options.find(o => o.value === value)?.label ||
    placeholder ||
    '';

  // 计算 dropdown 相对于触发按钮的屏幕坐标
  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const viewportPadding = 8;
    const preferredMaxHeight = 220;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const shouldOpenUp = availableBelow < 160 && availableAbove > availableBelow;
    const maxHeight = Math.max(
      96,
      Math.min(preferredMaxHeight, shouldOpenUp ? availableAbove : availableBelow),
    );

    const baseStyle: React.CSSProperties = {
      position: 'fixed',
      left: `${rect.left}px`,
      minWidth: `${Math.max(rect.width, 100)}px`,
      maxHeight: `${maxHeight}px`,
    };

    setDropdownStyle(shouldOpenUp
      ? {
          ...baseStyle,
          top: 'auto',
          bottom: `${window.innerHeight - rect.top + 2}px`,
        }
      : {
          ...baseStyle,
          top: `${rect.bottom + 2}px`,
          bottom: 'auto',
        });
  }, []);

  const handleToggle = useCallback(() => {
    if (!open) updatePosition();
    setOpen(v => !v);
  }, [open, updatePosition]);

  // 点击外部关闭（捕获阶段避免 stopPropagation 冲突）
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [open]);

  // 打开时跟随滚动 / resize 更新位置
  useEffect(() => {
    if (!open) return;
    const handleUpdate = () => updatePosition();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [open, updatePosition]);

  // Escape 关闭
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleSelect = useCallback((v: string) => {
    if (specialOptions?.find(s => s.value === v) && onSpecialSelect) {
      onSpecialSelect(v);
    } else {
      onChange(v);
    }
    setOpen(false);
  }, [onChange, specialOptions, onSpecialSelect]);

  const dropdown = open && (
    <div
      ref={dropdownRef}
      className="select-menu-dropdown"
      style={dropdownStyle}
    >
      {specialOptions?.map(opt => (
        <div
          key={opt.value}
          className="select-menu-option special"
          onClick={() => handleSelect(opt.value)}
        >
          {opt.label}
        </div>
      ))}
      {specialOptions && specialOptions.length > 0 && options.length > 0 && (
        <div className="select-menu-divider" />
      )}
      {options.map(opt => (
        <div
          key={opt.value}
          className={`select-menu-option${opt.value === value ? ' selected' : ''}`}
          onClick={() => handleSelect(opt.value)}
        >
          {opt.label}
        </div>
      ))}
      {options.length === 0 && (!specialOptions || specialOptions.length === 0) && (
        <div className="select-menu-empty">—</div>
      )}
    </div>
  );

  return (
    <div className={`select-menu-wrapper select-menu${open ? ' open' : ''} ${className}`}>
      <button
        ref={buttonRef}
        className="select-menu-trigger"
        onClick={handleToggle}
        type="button"
      >
        <span className="select-menu-label">{currentLabel}</span>
        <span className="select-menu-arrow">▾</span>
      </button>
      {createPortal(dropdown, document.body)}
    </div>
  );
}
