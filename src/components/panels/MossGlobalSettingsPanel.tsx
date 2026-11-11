import { useEffect, useState } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { createMossGlobalsFromIdeogram } from '../../utils/json-schemes';
import type { MossCanvasKind } from '../../types/scheme';
import ColorPalette from './ColorPalette';
import GlowGrid from './GlowGrid';
import OptimizableInput from './OptimizableInput';

const CANVAS_KINDS: MossCanvasKind[] = ['single', 'multi_panel', 'collage'];

function normalizeMeta(text: string): string[] {
  return text.split('\n').map(line => line.trim()).filter(Boolean);
}

export default function MossGlobalSettingsPanel() {
  const mossGlobals = useEditorStore(s => s.mossGlobals);
  const updateMossGlobals = useEditorStore(s => s.updateMossGlobals);
  const addMossColor = useEditorStore(s => s.addMossColor);
  const removeMossColor = useEditorStore(s => s.removeMossColor);
  const { t } = useI18n();
  const [metaText, setMetaText] = useState(() => (mossGlobals?.meta ?? []).join('\n'));

  const globals = mossGlobals ?? createMossGlobalsFromIdeogram(useEditorStore.getState());

  useEffect(() => {
    const normalized = globals.meta.join('\n');
    setMetaText(prev => normalizeMeta(prev).join('\n') === normalized ? prev : normalized);
  }, [globals.meta]);

  return (
    <GlowGrid className="panel">
      <div className="scheme-global-hint">{t('panels.globalSettings.mossHint')}</div>

      <OptimizableInput
        label={t('panels.globalSettings.mossSummaryCaption')}
        fieldKey="mossSummaryCaption"
        value={globals.summaryCaption}
        onChange={v => updateMossGlobals({ summaryCaption: v })}
        multiline
        rows={5}
      />

      <div className="input-group">
        <label>{t('panels.globalSettings.mossMeta')}</label>
        <textarea
          value={metaText}
          onChange={e => {
            setMetaText(e.target.value);
            updateMossGlobals({ meta: normalizeMeta(e.target.value) });
          }}
          placeholder={t('panels.globalSettings.mossMetaHint')}
          style={{ minHeight: 70 }}
        />
      </div>

      <div className="input-group">
        <label>{t('panels.globalSettings.mossCanvas')}</label>
        <div className="pill-group">
          {CANVAS_KINDS.map(kind => (
            <label key={kind}>
              <input
                type="radio"
                name="moss_canvas_kind"
                checked={globals.canvas === kind}
                onChange={() => updateMossGlobals({ canvas: kind })}
              />
              <span className="pill-label">{t(`panels.globalSettings.mossCanvasKinds.${kind}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <ColorPalette
        label={t('panels.globalSettings.globalColorPalette')}
        colors={globals.palette}
        maxColors={16}
        onAdd={addMossColor}
        onRemove={removeMossColor}
      />
    </GlowGrid>
  );
}
