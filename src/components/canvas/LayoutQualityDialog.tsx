import { useI18n } from '../../i18n/context';
import type { LayoutQualityReport } from '../../services/layout-validator';

interface LayoutQualityDialogProps {
  report: LayoutQualityReport | null;
  onAccept: () => void;
  onRegenerate: () => void;
}

export default function LayoutQualityDialog({ report, onAccept, onRegenerate }: LayoutQualityDialogProps) {
  const { t } = useI18n();

  if (!report || report.overallPass) return null;

  const failedMetrics = report.metrics.filter(m => !m.passed);

  return (
    <div className="layout-quality-dialog">
      <div className="layout-quality-dialog-content">
        <h3>{t('layoutQuality.title')}</h3>
        <div className="layout-quality-dialog-body">
          {failedMetrics.map(m => (
            <div key={m.field} className="layout-quality-metric">
              <span className="metric-label">{t(`layoutQuality.metric.${m.field}`)}</span>
              <span className="metric-value">{m.message}</span>
            </div>
          ))}
        </div>
        <div className="layout-quality-dialog-actions">
          <button className="btn btn-primary" onClick={onAccept}>
            {t('layoutQuality.accept')}
          </button>
          <button className="btn" onClick={onRegenerate}>
            {t('layoutQuality.regenerate')}
          </button>
        </div>
      </div>
    </div>
  );
}
