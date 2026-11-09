import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';

/** 流式中断后必须二选一：保留部分布局，或恢复生成前画布。 */
export default function StreamingLayoutRecoveryDialog() {
  const recovery = useEditorStore(s => s.layoutStreamRecovery);
  const resolveRecovery = useEditorStore(s => s.resolveStreamingLayoutRecovery);
  const { t } = useI18n();

  if (!recovery) return null;

  return createPortal(
    <div className="modal-overlay streaming-layout-recovery-overlay">
      <div
        className="streaming-layout-recovery-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="streaming-layout-recovery-title"
        aria-describedby="streaming-layout-recovery-description"
      >
        <h3 id="streaming-layout-recovery-title">{t('chat.layoutRecovery.title')}</h3>
        <p id="streaming-layout-recovery-description">
          {t('chat.layoutRecovery.description', { count: recovery.boxCount })}
        </p>
        <p className="streaming-layout-recovery-reason">
          {t('chat.layoutRecovery.reason', { reason: recovery.reason })}
        </p>
        <div className="streaming-layout-recovery-actions">
          <button
            type="button"
            className="btn"
            onClick={() => resolveRecovery('discard')}
          >
            {t('chat.layoutRecovery.discard')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => resolveRecovery('keep')}
            autoFocus
          >
            {t('chat.layoutRecovery.keep')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
