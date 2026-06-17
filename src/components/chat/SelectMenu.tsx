import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectMenuProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  buttonClassName?: string;
}

export default function SelectMenu({
  value,
  onChange,
  options,
  className = '',
  placeholder,
  buttonClassName = '',
}: SelectMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder ?? '';

  // 计算 dropdown 位置
  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: `${rect.bottom + 2}px`,
      left: `${rect.left}px`,
      minWidth: `${Math.max(rect.width, 100)}px`,
    });
  }, []);

  const handleOpen = useCallback(() => {
    updatePosition();
    setIsOpen(true);
  }, [updatePosition]);

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setIsOpen(false);
    },
    [onChange],
  );

  // 点击 dropdown 外部关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };
    // 使用 mousedown 而非 click，避免与 button 的 click 竞争
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // 打开时跟随滚动/resize 更新位置
  useEffect(() => {
    if (!isOpen) return;
    const handleUpdate = () => updatePosition();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isOpen, updatePosition]);

  // Escape 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const dropdown = isOpen && (
    <div
      ref={dropdownRef}
      className="select-menu-dropdown"
      style={dropdownStyle}
    >
      {options.length === 0 ? (
        <div className="select-menu-empty">—</div>
      ) : (
        options.map(opt => (
          <div
            key={opt.value}
            className={`select-menu-option${opt.value === value ? ' selected' : ''}`}
            onClick={() => handleSelect(opt.value)}
          >
            {opt.label}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className={`select-menu-wrapper ${className}`}>
      <button
        ref={buttonRef}
        className={`select-menu-trigger ${buttonClassName}`}
        onClick={handleOpen}
        type="button"
      >
        <span className="select-menu-label">{selectedLabel}</span>
        <span className="select-menu-arrow">▾</span>
      </button>
      {createPortal(dropdown, document.body)}
    </div>
  );
}