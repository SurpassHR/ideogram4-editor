import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { validateIdeogramJSONVerbose } from '../../services/llm-canvas-chat';
import { getAdapter } from '../../services/skill-adapters';
import { isSkillExtractionError } from '../../services/skill-adapters/types';
import { buildCanvasReplacement } from '../../services/skill-apply';
import {
  generateJsonScheme,
  parseJsonSchemeForPreview,
  type JsonScheme,
  type JsonSchemePreview,
  type JsonSchemeSnapshot,
} from '../../utils/json-schemes';

type ViewMode = 'json' | 'preview';

interface PreviewState {
  output: JsonSchemePreview | null;
  error: string | null;
}

/** 300ms 防抖自动同步：从 store 状态变更到 JSON 重新生成的冷却时间 */
const AUTO_SYNC_DEBOUNCE_MS = 300;

function currentSnapshot(): JsonSchemeSnapshot {
  const state = useEditorStore.getState();
  return {
    boxes: state.boxes,
    canvasW: state.canvasW,
    canvasH: state.canvasH,
    globalPalette: state.globalPalette,
    highLevelDescription: state.highLevelDescription,
    aesthetics: state.aesthetics,
    lighting: state.lighting,
    medium: state.medium,
    artStyle: state.artStyle,
    background: state.background,
    photoArtStyleMode: state.photoArtStyleMode,
    flux3Globals: state.flux3Globals,
    mossGlobals: state.mossGlobals,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializeScheme(scheme: JsonScheme): string {
  return JSON.stringify(generateJsonScheme(scheme, currentSnapshot()), null, 2);
}

export default function JsonToolbar() {
  const scheme = useEditorStore(s => s.activeJsonScheme);
  const [jsonText, setJsonText] = useState(() => serializeScheme(scheme));
  const [mode, setMode] = useState<ViewMode>('json');
  const [errorToast, setErrorToast] = useState<string | null>(null);
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
  const flux3Globals = useEditorStore(s => s.flux3Globals);
  const mossGlobals = useEditorStore(s => s.mossGlobals);

  // ── 标志位：用户正在手动编辑 textarea 时暂停自动同步 ─
  const isUserEditingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // scheme 在右栏顶部切换：立即重置文本框，忽略旧的编辑状态。
  useEffect(() => {
    isUserEditingRef.current = false;
    setJsonText(serializeScheme(scheme));
    setErrorToast(null);
  }, [scheme]);

  // ── 防抖自动同步 ─────────────────────────────────────
  useEffect(() => {
    if (isUserEditingRef.current) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setJsonText(serializeScheme(scheme));
    }, AUTO_SYNC_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [
    scheme, boxes, canvasW, canvasH, globalPalette,
    highLevelDescription, aesthetics, lighting,
    medium, artStyle, background, photoArtStyleMode, flux3Globals, mossGlobals,
  ]);

  const handleUserEditing = useCallback((editing: boolean) => {
    isUserEditingRef.current = editing;
  }, []);

  const handleGenerate = () => {
    isUserEditingRef.current = false;
    setJsonText(serializeScheme(scheme));
  };

  const handleLoad = () => {
    try {
      JSON.parse(jsonText);
      const state = useEditorStore.getState();

      if (scheme === 'ideogram4') {
        // Ideogram 的加载逻辑会同时恢复全局风格字段
        const result = validateIdeogramJSONVerbose(jsonText);
        if (!result.output) {
          setErrorToast(result.error || 'Unknown error');
          return;
        }
        state.loadFromJSON(result.output);
        return;
      }

      const adapter = getAdapter(scheme);
      const extraction = adapter.extract(jsonText, {
        canvasW: state.canvasW,
        canvasH: state.canvasH,
      });
      if (isSkillExtractionError(extraction)) {
        setErrorToast(extraction.error);
        return;
      }

      // MOSS 的 caption 变体没有 bbox：只更新场景描述，不清空画布
      if (scheme === 'moss-layout' && extraction.elements.length === 0) {
        const payload = extraction.payload;
        if (payload && typeof payload === 'object' && 'caption' in payload
          && typeof (payload as { caption?: unknown }).caption === 'string') {
          state.updateMossGlobals({ summaryCaption: (payload as { caption: string }).caption });
          return;
        }
        setErrorToast(t('json.noElements'));
        return;
      }
      if (extraction.elements.length === 0) {
        setErrorToast(t('json.noElements'));
        return;
      }

      const replacement = buildCanvasReplacement(extraction, {
        canvasW: state.canvasW,
        canvasH: state.canvasH,
      });
      if (!extraction.globals) {
        // Flux3/MOSS 的 JSON 只描述布局，保留当前画布的风格设置
        replacement.globalPalette = [...state.globalPalette];
        replacement.highLevelDescription = state.highLevelDescription;
        replacement.aesthetics = state.aesthetics;
        replacement.lighting = state.lighting;
        replacement.medium = state.medium;
        replacement.artStyle = state.artStyle;
        replacement.background = state.background;
        replacement.photoArtStyleMode = state.photoArtStyleMode;
      }
      state.applyCanvasReplacement(replacement);

      // MOSS 的 summary 属于 scheme global，不是 Ideogram 的扁平字段。
      if (scheme === 'moss-layout' && isRecord(extraction.payload)) {
        const summary = isRecord(extraction.payload.summary) ? extraction.payload.summary : null;
        if (summary) {
          state.updateMossGlobals({
            ...(typeof summary.caption === 'string' ? { summaryCaption: summary.caption } : {}),
            ...(Array.isArray(summary.meta)
              ? { meta: summary.meta.filter((entry): entry is string => typeof entry === 'string') }
              : {}),
            ...(summary.canvas === 'single' || summary.canvas === 'multi_panel' || summary.canvas === 'collage'
              ? { canvas: summary.canvas }
              : {}),
            ...(Array.isArray(summary.palette)
              ? { palette: summary.palette.filter((entry): entry is string => typeof entry === 'string') }
              : {}),
          });
        }
      }
    } catch (e) {
      setErrorToast(t('json.invalidJson', { error: (e as Error).message }));
    }
  };

  // Error toast auto-dismiss
  useEffect(() => {
    if (errorToast) {
      const t = setTimeout(() => setErrorToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [errorToast]);

  const getPreviewState = (): PreviewState => {
    const source = jsonText.trim() ? jsonText : serializeScheme(scheme);
    try {
      return {
        output: parseJsonSchemeForPreview(source, scheme, canvasW || 1, canvasH || 1),
        error: null,
      };
    } catch (e) {
      return { output: null, error: t('json.invalidJson', { error: (e as Error).message }) };
    }
  };

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
  const preview = isPreview ? getPreviewState() : { output: null, error: null };
  const previewSummary = preview.output?.summary.trim() ?? '';

  return (
    <div className="json-toolbar" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Row 1: action buttons */}
      <div className="panel-tab-toolbar">
        <div className="panel-tab-toolbar-actions">
          <button className="btn" onClick={handleGenerate}>{t('json.generatePrompt')}</button>
          <button className="btn" onClick={handleLoad}>{t('json.loadFromPasted')}</button>
        </div>
      </div>

      {/* 编辑器区域：header 行（标题 + 视图切换）+ 编辑区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} className="json-code-block">
        {/* Header 行：标题 + 切换 Tab 同行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexShrink: 0 }}>
          <span className="panel-tab-section-header-title">{t('json.panel')}</span>
          <div style={{ flex: 1 }} />
          <div className="json-view-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'json'}
              className={`json-view-tab ${mode === 'json' ? 'active' : ''}`}
              onClick={() => setMode('json')}
            >
              {t('json.jsonMode')}
            </button>
            <button
              role="tab"
              aria-selected={mode === 'preview'}
              className={`json-view-tab ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
            >
              {t('json.previewMode')}
            </button>
          </div>
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
                {previewSummary && (
                  <div className="json-preview-summary">{previewSummary}</div>
                )}
                <div
                  className="json-preview-canvas"
                  style={{ aspectRatio: `${preview.output.canvasW || 1} / ${preview.output.canvasH || 1}` }}
                >
                  {preview.output.elements.map((element, index) => {
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
