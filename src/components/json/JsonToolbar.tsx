import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { validateIdeogramJSONVerbose } from '../../services/llm-canvas-chat';
import type { IdeogramOutput } from '../../types';

/** 300ms 防抖自动同步：从 store 状态变更到 JSON 重新生成的冷却时间 */
const AUTO_SYNC_DEBOUNCE_MS = 300;

export default function JsonToolbar() {
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(useEditorStore.getState().generateJSON(), null, 2),
  );
  const [mode, setMode] = useState<'json' | 'preview'>('json');
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const generateJSON = useEditorStore(s => s.generateJSON);
  const loadFromJSON = useEditorStore(s => s.loadFromJSON);
  const { t } = useI18n();

  // ── 订阅所有影响 JSON 输出的 store 字段 ──────────────
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

  // ── 标志位：用户正在手动编辑 textarea 时暂停自动同步 ─
  const isUserEditingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── 防抖自动同步 ─────────────────────────────────────
  useEffect(() => {
    if (isUserEditingRef.current) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const output = generateJSON();
      setJsonText(JSON.stringify(output, null, 2));
    }, AUTO_SYNC_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [
    boxes, canvasW, canvasH, globalPalette,
    highLevelDescription, aesthetics, lighting,
    medium, artStyle, background, photoArtStyleMode,
    generateJSON,
  ]);

  const handleUserEditing = useCallback((editing: boolean) => {
    isUserEditingRef.current = editing;
  }, []);

  const handleGenerate = () => {
    const output = generateJSON();
    setJsonText(JSON.stringify(output, null, 2));
  };

  const handleLoad = () => {
    try {
      const json = JSON.parse(jsonText);
      // 用 verbose 验证提前检查结构
      const result = validateIdeogramJSONVerbose(jsonText);
      if (!result.output) {
        setErrorToast(result.error || '未知错误');
        return;
      }
      loadFromJSON(json);
    } catch (e) {
      if (e instanceof SyntaxError) {
        setErrorToast(`JSON 语法错误: ${(e as Error).message}`);
      } else {
        setErrorToast(t('json.invalidJson', { error: (e as Error).message }));
      }
    }
  };

  // Error toast auto-dismiss
  useEffect(() => {
    if (errorToast) {
      const t = setTimeout(() => setErrorToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [errorToast]);

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

  const handleToggleView = useCallback(() => {
    setMode(v => v === 'json' ? 'preview' : 'json');
  }, []);

  const handleViewKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggleView();
    }
  }, [handleToggleView]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta && mode === 'json') {
      ta.style.height = 'auto';
      ta.style.height = Math.max(60, ta.scrollHeight) + 'px';
    }
  }, [jsonText, mode]);

  const isPreview = mode === 'preview';
  const preview = mode === 'preview' ? getPreviewState() : { output: null, error: null };

  return (
    <div className="json-toolbar" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Row 1: action buttons */}
      <div className="panel-tab-toolbar">
        <div className="panel-tab-toolbar-actions">
          <button className="btn" onClick={handleGenerate}>{t('json.generatePrompt')}</button>
          <button className="btn" onClick={handleLoad}>{t('json.loadFromPasted')}</button>
        </div>
      </div>

      {/* 编辑器区域：header 行（标题 + toggle）+ 编辑区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} className="json-code-block">
        {/* Header 行：标题 + toggle 同行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexShrink: 0 }}>
          <span className="panel-tab-section-header-title">{t('json.panel')}</span>
          <div style={{ flex: 1 }} />
          <label
            className="json-code-block-toggle"
            role="switch"
            aria-checked={mode === 'preview'}
            tabIndex={0}
            onKeyDown={handleViewKeyDown}
          >
            <span data-active={mode === 'json'}>{t('json.jsonMode')}</span>
            <span className="json-code-block-toggle-track">
              <input
                type="checkbox"
                checked={mode === 'preview'}
                onChange={handleToggleView}
                aria-hidden="true"
              />
            </span>
            <span data-active={mode === 'preview'}>{t('json.previewMode')}</span>
          </label>
        </div>

        {mode === 'json' ? (
          <textarea
            ref={textareaRef}
            className="json-textarea"
            value={jsonText}
            onChange={e => {
              setJsonText(e.target.value);
              const ta = e.target;
              ta.style.height = 'auto';
              ta.style.height = Math.max(60, ta.scrollHeight) + 'px';
            }}
            placeholder={t('json.placeholder')}
            onFocus={() => handleUserEditing(true)}
            onBlur={() => {
              handleUserEditing(false);
            }}
          />
        ) : (
          <div className="json-preview-panel">
          {preview.error && <div className="json-preview-error">{preview.error}</div>}
          {!preview.error && preview.output && (
            <>
              {preview.output.high_level_description && (
              <div className="json-preview-summary">{preview.output.high_level_description}</div>
            )}
              <div
                className="json-preview-canvas"
                style={{ aspectRatio: `${canvasW || 1} / ${canvasH || 1}` }}
              >
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
      {/* Error toast */}
      {errorToast && (
        <div className="json-toolbar-toast-error">{errorToast}</div>
      )}
    </div>
  );
}
