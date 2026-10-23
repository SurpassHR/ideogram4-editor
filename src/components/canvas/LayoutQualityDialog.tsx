import { useI18n } from '../../i18n/context';
import type { LayoutQualityReport } from '../../services/layout-validator';
import { useEditorStore } from '../../store';

interface LayoutQualityDialogProps {
  report: LayoutQualityReport | null;
  onAccept: () => void;
  onRegenerate: () => void;
}

export default function LayoutQualityDialog({ report, onAccept, onRegenerate }: LayoutQualityDialogProps) {
  const { t } = useI18n();
  const showDeveloperTools = useEditorStore(s => s.showDeveloperTools);

  if (!report) return null;

  const failedMetrics = Array.isArray(report.metrics) ? report.metrics.filter(m => !m.passed) : [];
  // 兼容旧版 localStorage 中没有 issues 字段的缓存数据
  const issues = Array.isArray(report.issues)
    ? report.issues
    : failedMetrics.map(m => ({
        field: m.field,
        severity: 'error' as const,
        message: m.message,
        detail: m.detail,
      }));

  return (
    <div className={`layout-quality-dialog${showDeveloperTools ? ' tech-visible' : ''}`}>
      <div className="layout-quality-dialog-content">
        <h3>{report.overallPass ? t('layoutQuality.passedTitle') : t('layoutQuality.title')}</h3>
        <p className="layout-quality-dialog-summary">
          {report.overallPass ? t('layoutQuality.pass') : t('layoutQuality.fail')}
        </p>

        {/* 人话问题清单：把技术指标翻译成用户能懂的描述 */}
        {!report.overallPass && issues.length > 0 && (
          <div className="layout-quality-issue-list">
            {issues.map(issue => (
              <div key={issue.field} className="layout-quality-issue">
                <span className="layout-quality-issue-dot" />
                <span>
                  {t(`layoutQuality.issue.${issue.field}`)}
                  {showDeveloperTools && issue.detail && (
                    <span className="layout-quality-issue-detail">
                      {' '}({issue.detail})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 技术明细：仅开发者模式可见（关闭时完全不渲染） */}
        {showDeveloperTools && (
          <div className="layout-quality-dialog-body">
            {failedMetrics.map(m => (
              <div key={m.field} className="layout-quality-metric">
                <span className="metric-label">{t(`layoutQuality.metric.${m.field}`)}</span>
                <span className="metric-value">{m.message}</span>
              </div>
            ))}
          </div>
        )}
        <div className="layout-quality-dialog-actions">
          <button className="btn btn-primary" onClick={onAccept}>
            {t('layoutQuality.accept')}
          </button>
          {!report.overallPass && (
            <button className="btn" onClick={onRegenerate}>
              {t('layoutQuality.regenerate')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
