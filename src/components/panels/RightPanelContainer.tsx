import { useState } from 'react';
import GlobalSettingsPanel from './GlobalSettingsPanel';
import BoxPropertiesPanel from './BoxPropertiesPanel';
import LlmPanel from '../llm/LlmPanel';
import { useI18n } from '../../i18n/context';

type TabId = 'global' | 'box' | 'llm';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

export default function RightPanelContainer() {
  const [activeTab, setActiveTab] = useState<TabId>('global');
  const { t } = useI18n();

  const tabs: Tab[] = [
    { id: 'global', label: t('panels.globalSettings.title'), icon: '⚙' },
    { id: 'box', label: t('panels.boxProperties.title'), icon: '⊞' },
    { id: 'llm', label: t('llm.tools'), icon: '🤖' },
  ];

  return (
    <div className="right-panel-container">
      {/* Tab bar */}
      <div className="panel-tab-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`panel-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="panel-tab-icon">{tab.icon}</span>
            <span className="panel-tab-label">{tab.label}</span>
          </button>
        ))}
        <div className="panel-tab-indicator" style={{ '--tab-index': tabs.findIndex(t => t.id === activeTab) } as React.CSSProperties} />
      </div>

      {/* Content */}
      <div className="panel-tab-content">
        {activeTab === 'global' && <GlobalSettingsPanel />}
        {activeTab === 'box' && <BoxPropertiesPanel />}
        {activeTab === 'llm' && <LlmPanel />}
      </div>
    </div>
  );
}