import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/context';
import { IconClose } from '../ui/icons';

interface ImageLightboxProps {
  /** 图片 Data URL */
  src: string;
  /** 关闭回调 */
  onClose: () => void;
  /** 无障碍标签 / 标题 */
  alt?: string;
}

/**
 * 图片大图查看器（createPortal → body）。
 *
 * - 点击遮罩或按 Esc 关闭
 * - 阻止滚轮冒泡，避免触发画布缩放
 */
export default function ImageLightbox({ src, onClose, alt }: ImageLightboxProps) {
  const { t } = useI18n();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="image-lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={alt || t('chat.previewAlt')}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onWheelCapture={e => e.stopPropagation()}
    >
      <button
        type="button"
        className="image-lightbox-close"
        onClick={onClose}
        aria-label={t('chat.previewClose')}
        title={t('chat.previewClose')}
      >
        <IconClose size={16} />
      </button>
      <img className="image-lightbox-image" src={src} alt={alt || t('chat.previewAlt')} />
    </div>,
    document.body,
  );
}

