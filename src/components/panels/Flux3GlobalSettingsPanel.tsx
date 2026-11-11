import { useEffect, useState } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { createFlux3GlobalsFromIdeogram } from '../../utils/json-schemes';
import { IconCopy } from '../ui/icons';
import ColorPalette from './ColorPalette';
import GlowGrid from './GlowGrid';
import OptimizableInput from './OptimizableInput';

export default function Flux3GlobalSettingsPanel() {
  const flux3Globals = useEditorStore(s => s.flux3Globals);
  const updateFlux3Globals = useEditorStore(s => s.updateFlux3Globals);
  const addFlux3Color = useEditorStore(s => s.addFlux3Color);
  const removeFlux3Color = useEditorStore(s => s.removeFlux3Color);
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const globals = flux3Globals ?? createFlux3GlobalsFromIdeogram(useEditorStore.getState());

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    if (!globals.fullScenePrompt.trim()) return;
    try {
      await navigator.clipboard?.writeText(globals.fullScenePrompt);
      setCopied(true);
    } catch {
      // Clipboard 权限不可用时保持静默，文本仍可手动复制。
    }
  };

  return (
    <GlowGrid className="panel">
      <div className="scheme-global-hint">{t('panels.globalSettings.flux3Hint')}</div>

      <OptimizableInput
        label={t('panels.globalSettings.fullScenePrompt')}
        fieldKey="flux3FullScenePrompt"
        value={globals.fullScenePrompt}
        onChange={v => updateFlux3Globals({ fullScenePrompt: v })}
        multiline
        rows={5}
      />

      <div className="scheme-global-actions">
        <button
          type="button"
          className="btn btn-small"
          onClick={() => { void handleCopy(); }}
          disabled={!globals.fullScenePrompt.trim()}
        >
          <IconCopy size={12} />
          {copied ? t('panels.globalSettings.copied') : t('panels.globalSettings.copyFullScenePrompt')}
        </button>
      </div>

      <ColorPalette
        label={t('panels.globalSettings.globalColorPalette')}
        colors={globals.palette}
        maxColors={16}
        onAdd={addFlux3Color}
        onRemove={removeFlux3Color}
      />
    </GlowGrid>
  );
}
