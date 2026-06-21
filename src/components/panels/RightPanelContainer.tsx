import { useState } from 'react';
import GlobalSettingsPanel from './GlobalSettingsPanel';
import BoxPropertiesPanel from './BoxPropertiesPanel';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import { useI18n } from '../../i18n/context';
import { IconGear, IconBox, IconFile, IconZap } from '../ui/icons';

type TabId = 'global' | 'box' | 'json' | 'generate';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

export default function RightPanelContainer() {
  const [activeTab, setActiveTab] = useState<TabId>('global');
  const { t } = useI18n();

  const tabs: Tab[] = [
    { id: 'global', label: t('panels.globalSettings.title'), icon: <IconGear size={14} /> },
    { id: 'box', label: t('panels.boxProperties.title'), icon: <IconBox size={14} /> },
    { id: 'json', label: t('json.panel'), icon: <IconFile size={14} /> },
    { id: 'generate', label: t('comfyui.generation'), icon: <IconZap size={14} /> },
  ];

  const sectionTitle = (): string => {
    switch (activeTab) {
      case 'global': return t('panels.globalSettings.title');
      case 'box': return t('panels.boxProperties.title');
      case 'json': return t('json.panel');
      case 'generate': return t('comfyui.generation');
    }
  };

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
        {/* Section header — JSON tab 有自己的 header 在 json-code-block 内部 */}
        {activeTab !== 'json' && (
          <>
            <div className="panel-tab-section-header">
              <span className="panel-tab-section-header-title">{sectionTitle()}</span>
            </div>
            <div className="panel-tab-section-divider" />
          </>
        )}

        {activeTab === 'global' && <GlobalSettingsPanel />}
        {activeTab === 'box' && <BoxPropertiesPanel />}
        {activeTab === 'json' && (
          <div className="panel-tab-json">
            <JsonToolbar />
          </div>
        )}
        {activeTab === 'generate' && (
          <div className="panel-tab-generate">
            <ComfyUIControls />
            <ImagePreview />
          </div>
        )}
      </div>
    </div>
  );
}
