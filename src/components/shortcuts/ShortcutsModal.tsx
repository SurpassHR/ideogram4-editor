import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { IconClose } from '../ui/icons';
import { SHORTCUT_GROUPS } from './shortcuts-data';

export default function ShortcutsModal() {
  const isOpen = useEditorStore(s => s.isShortcutsModalOpen);
  const setShortcutsModalOpen = useEditorStore(s => s.setShortcutsModalOpen);
  const { t } = useI18n();

  // 弹窗打开时监听 Escape 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShortcutsModalOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setShortcutsModalOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="shortcuts-overlay"
      onClick={e => { if (e.target === e.currentTarget) setShortcutsModalOpen(false); }}
    >
      <div className="shortcuts-modal" role="dialog" aria-modal="true" aria-label={t('shortcuts.title')}>
        <div className="shortcuts-header">
          <span className="shortcuts-title">{t('shortcuts.title')}</span>
          <button
            className="shortcuts-close-btn"
            onClick={() => setShortcutsModalOpen(false)}
            aria-label={t('shortcuts.close')}
          >
            <IconClose size={14} />
          </button>
        </div>
        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map(group => (
            <div className="shortcuts-group" key={group.groupKey}>
              <div className="shortcuts-group-title">{t(group.groupKey)}</div>
              <ul className="shortcuts-list">
                {group.items.map(item => (
                  <li className="shortcuts-item" key={item.descKey}>
                    <kbd className="shortcuts-kbd">{t(item.keyLabel)}</kbd>
                    <span className="shortcuts-desc">{t(item.descKey)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
