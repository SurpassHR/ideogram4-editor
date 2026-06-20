import LlmConfigPanel from '../llm/LlmConfigPanel';
import PresetManagerPanel from '../chat/PresetManagerPanel';
import { useI18n } from '../../i18n/context';
import WorkspacePanel from './WorkspacePanel';

export default function SettingsPage() {
  const { t } = useI18n();

  return (
    <div className="settings-page">
      <div className="settings-page-left">
        <h2 className="settings-section-title">{t('settings.llmProviders')}</h2>
        <LlmConfigPanel embedded />
      </div>
      <div className="settings-page-right">
        <h2 className="settings-section-title">{t('settings.promptPresets')}</h2>
        <PresetManagerPanel embedded />
      </div>
      <WorkspacePanel />
    </div>
  );
}
