import { useI18n } from '../../i18n/context';
import { IconClose, IconBox } from '../ui/icons';
import type { RegionTarget } from '../../types/chat';

interface CanvasChatRegionBarProps {
  /** 当前生效的区域目标（null 表示整画布提问） */
  region: RegionTarget | null;
  /** 区域模式是否已被用户解除 */
  dismissed: boolean;
  /** 解除区域模式 */
  onDismiss: () => void;
  /** 重新启用区域模式 */
  onEnable: () => void;
}

/**
 * Canvas Chat 的区域上下文条。
 *
 * 画布上有选中的边界框时自动进入「针对该区域提问」模式（类似 Krea 的
 * “描述要出现在选中区域里的内容”）。用户可点 × 解除，回落到整画布提问。
 */
export default function CanvasChatRegionBar({
  region,
  dismissed,
  onDismiss,
  onEnable,
}: CanvasChatRegionBarProps) {
  const { t } = useI18n();

  if (dismissed) {
    return (
      <div className="canvas-chat-region-bar dismissed">
        <span className="canvas-chat-region-bar-text">{t('chat.regionTargetDismiss')}</span>
        <button
          type="button"
          className="canvas-chat-region-bar-action"
          onClick={onEnable}
          title={t('chat.regionTargetReenable')}
        >
          <IconBox size={12} /> {t('chat.regionTargetReenable')}
        </button>
      </div>
    );
  }

  if (!region) return null;

  return (
    <div className="canvas-chat-region-bar">
      <IconBox size={12} />
      <span className="canvas-chat-region-bar-text">
        {t('chat.regionTarget', { index: region.index, label: region.label })}
      </span>
      <button
        type="button"
        className="canvas-chat-region-bar-dismiss"
        onClick={onDismiss}
        aria-label={t('chat.regionTargetDismiss')}
        title={t('chat.regionTargetDismiss')}
      >
        <IconClose size={12} />
      </button>
    </div>
  );
}

