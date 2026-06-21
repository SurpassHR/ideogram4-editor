import { useMemo, useState } from 'react';
import LlmConfigPanel from '../llm/LlmConfigPanel';
import PresetManagerPanel from '../chat/PresetManagerPanel';
import SystemPromptPanel from '../chat/SystemPromptPanel';
import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import WorkspacePanel from './WorkspacePanel';

type SettingsModuleId = 'llm' | 'presets' | 'sysprompt' | 'workspace';

export default function SettingsPage() {
  const { t } = useI18n();
  const presetCount = useEditorStore(s => s.chatPresets.length);
  const favoriteCount = useEditorStore(s => s.canvasFavorites.length);
  const gistId = useEditorStore(s => s.workspaceBackupSettings.gistId);
  const systemPrompts = useEditorStore(s => s.systemPrompts);
  const [activeModule, setActiveModule] = useState<SettingsModuleId>('llm');

  const sysPromptStatus = systemPrompts.length > 0
    ? `${systemPrompts.length} prompts`
    : t('chat.systemPrompt.default');

  const modules = useMemo(() => [
    {
      id: 'llm' as const,
      marker: 'LLM',
      title: t('settings.modules.llm.title'),
      description: t('settings.modules.llm.description'),
      status: t('settings.modules.llm.status'),
    },
    {
      id: 'presets' as const,
      marker: 'PR',
      title: t('settings.modules.presets.title'),
      description: t('settings.modules.presets.description'),
      status: t('settings.modules.presets.status', { count: presetCount }),
    },
    {
      id: 'sysprompt' as const,
      marker: 'SP',
      title: t('chat.systemPrompt.title'),
      description: t('chat.systemPrompt.moduleDesc'),
      status: sysPromptStatus,
    },
    {
      id: 'workspace' as const,
      marker: 'WS',
      title: t('settings.modules.workspace.title'),
      description: t('settings.modules.workspace.description'),
      status: gistId
        ? t('settings.modules.workspace.statusWithGist', { count: favoriteCount })
        : t('settings.modules.workspace.status', { count: favoriteCount }),
    },
  ], [favoriteCount, gistId, presetCount, sysPromptStatus, t]);

  const activeConfig = modules.find(module => module.id === activeModule) ?? modules[0];

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'presets':
        return <PresetManagerPanel embedded />;
      case 'sysprompt':
        return <SystemPromptPanel embedded />;
      case 'workspace':
        return <WorkspacePanel embedded />;
      case 'llm':
      default:
        return <LlmConfigPanel embedded />;
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <div>
          <p className="settings-page-eyebrow">{t('settings.activeModuleLabel')}</p>
          <h1>{t('settings.pageTitle')}</h1>
          <p>{t('settings.pageSubtitle')}</p>
        </div>
        <span className="settings-page-current">{activeConfig.title}</span>
      </header>

      <div className="settings-console">
        <nav className="settings-module-nav" aria-label={t('settings.moduleNavLabel')}>
          {modules.map(module => {
            const isActive = module.id === activeModule;

            return (
              <button
                aria-pressed={isActive}
                className={`settings-module-button ${isActive ? 'active' : ''}`}
                key={module.id}
                onClick={() => setActiveModule(module.id)}
                type="button"
              >
                <span className="settings-module-marker" aria-hidden="true">{module.marker}</span>
                <span className="settings-module-copy">
                  <span className="settings-module-title">{module.title}</span>
                  <span className="settings-module-description">{module.description}</span>
                  <span className="settings-module-status">{module.status}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="settings-module-stage" aria-labelledby="settings-module-stage-title">
          <div className="settings-module-stage-header">
            <div>
              <p className="settings-page-eyebrow">{t('settings.activeModuleLabel')}</p>
              <h2 id="settings-module-stage-title">{activeConfig.title}</h2>
              <p>{activeConfig.description}</p>
            </div>
            <span>{activeConfig.status}</span>
          </div>
          <div className="settings-module-content">
            {renderActiveModule()}
          </div>
        </section>
      </div>
    </div>
  );
}
