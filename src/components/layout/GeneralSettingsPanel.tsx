import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';

export default function GeneralSettingsPanel() {
  const canvasChatAutoMaximize = useEditorStore(s => s.canvasChatAutoMaximize);
  const setCanvasChatAutoMaximize = useEditorStore(s => s.setCanvasChatAutoMaximize);
  const { t } = useI18n();

  return (
    <section className="settings-page-general">
      <div className="settings-general-item">
        <div className="settings-general-info">
          <span className="settings-general-label">{t('settings.general.canvasChatAutoMaximize')}</span>
          <span className="settings-general-desc">{t('settings.general.canvasChatAutoMaximizeDesc')}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={canvasChatAutoMaximize}
            onChange={e => setCanvasChatAutoMaximize(e.currentTarget.checked)}
          />
          <span className="toggle-switch-track" aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}
