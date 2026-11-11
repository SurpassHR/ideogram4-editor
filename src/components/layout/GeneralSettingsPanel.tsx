import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';

export default function GeneralSettingsPanel() {
  const showDeveloperTools = useEditorStore(s => s.showDeveloperTools);
  const mockTestMode = useEditorStore(s => s.mockTestMode);
  const setMockTestMode = useEditorStore(s => s.setMockTestMode);
  const setShowDeveloperTools = useEditorStore(s => s.setShowDeveloperTools);
  const { t } = useI18n();
  const desktop = window.desktop;

  return (
    <section className="settings-page-general">
      {desktop && (
        <div className="settings-general-item settings-desktop-info">
          <div className="settings-general-info">
            <span className="settings-general-label">Desktop</span>
            <span className="settings-general-desc">
              v{desktop.appVersion} · {desktop.platform}
              <br />
              <code>{desktop.dataDir}</code>
            </span>
          </div>
          <div className="desktop-workspace-action-buttons">
            <button className="btn btn-small" type="button" onClick={() => void desktop.openDataDir?.()}>
              Data Folder
            </button>
            <button className="btn btn-small" type="button" onClick={() => void desktop.openLogs?.()}>
              Logs
            </button>
          </div>
        </div>
      )}
      <div className="settings-general-item">
        <div className="settings-general-info">
          <span className="settings-general-label">测试打桩模式 (Mock Test Mode)</span>
          <span className="settings-general-desc">启用内置 Mock Provider 与模拟流式返回（包含思考链与完整 JSON 布局），无需配置真实 API Key 即可全功能调试。</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={mockTestMode}
            onChange={e => setMockTestMode(e.currentTarget.checked)}
          />
          <span className="toggle-switch-track" aria-hidden="true" />
        </label>
      </div>
      <div className="settings-general-item">
        <div className="settings-general-info">
          <span className="settings-general-label">{t('settings.general.showDeveloperTools')}</span>
          <span className="settings-general-desc">{t('settings.general.showDeveloperToolsDesc')}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={showDeveloperTools}
            onChange={e => setShowDeveloperTools(e.currentTarget.checked)}
          />
          <span className="toggle-switch-track" aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}

