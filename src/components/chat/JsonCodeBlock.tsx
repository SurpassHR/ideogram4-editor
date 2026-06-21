import { useState, useCallback, useMemo } from 'react';
import { useI18n } from '../../i18n/context';
import { highlightJson } from '../../utils/json-highlight';

interface JsonCodeBlockProps {
  /** 原始 JSON 文本，直接展示在 <pre> 中 */
  json: string;
  /** Data URL 画布截图 */
  snapshotUrl: string;
}

/**
 * JSON 代码块右上角「json / 预览」iOS 滑块切换组件。
 *
 * - 默认显示 json 视图（即纯文本代码块）
 * - 拨到预览显示画布截图
 * - 图片加载失败时回退占位文字
 * - 阻止滚轮冒泡到画布缩放
 */
export default function JsonCodeBlock({ json, snapshotUrl }: JsonCodeBlockProps) {
  const { t } = useI18n();
  const [view, setView] = useState<'json' | 'preview'>('json');
  const [imgError, setImgError] = useState(false);

  const handleToggle = useCallback(() => {
    setView(v => (v === 'json' ? 'preview' : 'json'));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle],
  );

  const handleWheelCapture = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
  }, []);

  const isPreview = view === 'preview';

  const highlightedHtml = useMemo(() => highlightJson(json), [json]);

  return (
    <div className="json-code-block" onWheelCapture={handleWheelCapture}>
      <label
        className="json-code-block-toggle"
        role="switch"
        aria-checked={isPreview}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <span data-active={!isPreview}>{t('chat.jsonView')}</span>
        <span className="json-code-block-toggle-track">
          <input
            type="checkbox"
            checked={isPreview}
            onChange={handleToggle}
            aria-hidden="true"
          />
        </span>
        <span data-active={isPreview}>{t('chat.previewView')}</span>
      </label>

      {isPreview ? (
        <div className="json-code-block-preview">
          {imgError ? (
            <span className="json-code-block-preview-fallback">
              {t('chat.previewUnavailable')}
            </span>
          ) : (
            <img
              src={snapshotUrl}
              alt={t('chat.previewAlt')}
              onError={() => setImgError(true)}
            />
          )}
        </div>
      ) : (
        <pre className="json-code-block-code">
          <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        </pre>
      )}
    </div>
  );
}
