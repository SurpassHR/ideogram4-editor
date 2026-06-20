import { useState } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import type { IdeogramOutput } from '../../types';

export default function JsonToolbar() {
  const [jsonText, setJsonText] = useState('');
  const [mode, setMode] = useState<'json' | 'preview'>('json');
  const generateJSON = useEditorStore(s => s.generateJSON);
  const loadFromJSON = useEditorStore(s => s.loadFromJSON);
  const { t } = useI18n();

  const handleGenerate = () => {
    const output = generateJSON();
    setJsonText(JSON.stringify(output, null, 2));
  };

  const handleLoad = () => {
    try {
      const json = JSON.parse(jsonText);
      loadFromJSON(json);
    } catch (e) {
      alert(t('json.invalidJson', { error: (e as Error).message }));
    }
  };

  const getPreviewState = (): { output: IdeogramOutput | null; error: string | null } => {
    if (!jsonText.trim()) {
      return { output: generateJSON(), error: null };
    }
    try {
      return { output: JSON.parse(jsonText) as IdeogramOutput, error: null };
    } catch (e) {
      return { output: null, error: t('json.invalidJson', { error: (e as Error).message }) };
    }
  };

  const preview = mode === 'preview' ? getPreviewState() : { output: null, error: null };

  return (
    <div className="json-toolbar">
      <div className="json-toolbar-header">
        <div className="json-toolbar-actions">
          <button className="btn" onClick={handleGenerate}>{t('json.generatePrompt')}</button>
          <button className="btn" onClick={handleLoad}>{t('json.loadFromPasted')}</button>
        </div>
        <div className="json-view-toggle" aria-label="JSON view mode">
          <button
            type="button"
            className={mode === 'json' ? 'active' : ''}
            onClick={() => setMode('json')}
          >
            {t('json.jsonMode')}
          </button>
          <button
            type="button"
            className={mode === 'preview' ? 'active' : ''}
            onClick={() => setMode('preview')}
          >
            {t('json.previewMode')}
          </button>
        </div>
      </div>
      {mode === 'json' ? (
        <textarea
          className="json-textarea"
          value={jsonText}
          onChange={e => setJsonText(e.target.value)}
          placeholder={t('json.placeholder')}
        />
      ) : (
        <div className="json-preview-panel">
          {preview.error && <div className="json-preview-error">{preview.error}</div>}
          {!preview.error && preview.output && (
            <>
              <div className="json-preview-summary">
                {preview.output.high_level_description || t('json.previewEmpty')}
              </div>
              <div
                className="json-preview-canvas"
                style={{ aspectRatio: `${preview.output.canvasW || 1} / ${preview.output.canvasH || 1}` }}
              >
                {preview.output.compositional_deconstruction.elements.length === 0 && (
                  <div className="json-preview-empty">{t('json.previewEmpty')}</div>
                )}
                {preview.output.compositional_deconstruction.elements.map((element, index) => {
                  const [y1, x1, y2, x2] = element.bbox;
                  return (
                    <div
                      key={`${element.desc}-${index}`}
                      className={`json-preview-box ${element.type}`}
                      style={{
                        left: `${x1 / 10}%`,
                        top: `${y1 / 10}%`,
                        width: `${Math.max(1, (x2 - x1) / 10)}%`,
                        height: `${Math.max(1, (y2 - y1) / 10)}%`,
                      }}
                    >
                      <span className="json-preview-box-label">
                        {element.text || element.desc || element.type}
                      </span>
                      {element.color_palette && element.color_palette.length > 0 && (
                        <span className="json-preview-colors">
                          {element.color_palette.slice(0, 4).map(color => (
                            <span key={color} style={{ background: color }} />
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
