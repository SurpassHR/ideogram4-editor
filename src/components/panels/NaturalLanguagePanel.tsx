import { useMemo, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { jsonToNaturalLanguage } from '../../utils/json-serializer';
import { IconSparkle } from '../ui/icons';

export default function NaturalLanguagePanel() {
  const { t } = useI18n();

  const boxes = useEditorStore(s => s.boxes);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const globalPalette = useEditorStore(s => s.globalPalette);
  const highLevelDescription = useEditorStore(s => s.highLevelDescription);
  const aesthetics = useEditorStore(s => s.aesthetics);
  const lighting = useEditorStore(s => s.lighting);
  const medium = useEditorStore(s => s.medium);
  const artStyle = useEditorStore(s => s.artStyle);
  const background = useEditorStore(s => s.background);
  const photoArtStyleMode = useEditorStore(s => s.photoArtStyleMode);
  const generateJSON = useEditorStore(s => s.generateJSON);

  const naturalText = useMemo(() => {
    try {
      const output = generateJSON();
      return jsonToNaturalLanguage(output, t);
    } catch {
      return '';
    }
  }, [
    boxes, canvasW, canvasH, globalPalette,
    highLevelDescription, aesthetics, lighting,
    medium, artStyle, background, photoArtStyleMode,
    generateJSON, t,
  ]);

  const hasContent = boxes.length > 0 || highLevelDescription ||
    aesthetics || lighting || medium || artStyle || background ||
    globalPalette.length > 0;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // auto-grow
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.max(60, ta.scrollHeight) + 'px';
    }
  }, [naturalText]);

  return (
    <div className="natural-language-panel">
      {!hasContent ? (
        <div className="natural-language-empty">
          <IconSparkle size={32} />
          <p>{t('json.nlEmpty')}</p>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="natural-language-textarea"
          value={naturalText}
          readOnly
        />
      )}
    </div>
  );
}
