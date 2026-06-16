import { useI18n } from '../../i18n/context';

interface SuggestionBarProps {
  original: string;
  suggested: string;
  status: 'loading' | 'ready' | 'adopted' | 'dismissed';
  onAdopt: () => void;
  onDismiss: () => void;
}

export default function SuggestionBar({
  original,
  suggested,
  status,
  onAdopt,
  onDismiss,
}: SuggestionBarProps) {
  const { t } = useI18n();

  if (status === 'adopted' || status === 'dismissed') return null;

  if (status === 'loading') {
    return (
      <div className="suggestion-bar">
        <div className="suggestion-loading">
          <span className="suggestion-spinner" />
          <span>{t('optimize.optimizing')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="suggestion-bar">
      <div className="suggestion-header">
        <span className="suggestion-icon">✨</span>
        <span className="suggestion-label">{t('optimize.aiSuggestion')}</span>
      </div>
      <div className="suggestion-content">{suggested}</div>
      <div className="suggestion-actions">
        <button className="suggestion-btn adopt" onClick={onAdopt}>
          {t('optimize.adopt')}
        </button>
        <button className="suggestion-btn dismiss" onClick={onDismiss}>
          {t('optimize.dismiss')}
        </button>
      </div>
    </div>
  );
}
