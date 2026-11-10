import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import { JSON_SCHEMES } from '../../utils/json-schemes';

/** 右侧栏顶部的全局 JSON scheme 切换条。 */
export default function SchemeSwitcher() {
  const activeJsonScheme = useEditorStore(s => s.activeJsonScheme);
  const setActiveJsonScheme = useEditorStore(s => s.setActiveJsonScheme);
  const { t } = useI18n();

  const activeScheme = JSON_SCHEMES.find(item => item.id === activeJsonScheme) ?? JSON_SCHEMES[0];

  return (
    <div className="scheme-switcher">
      <div className="json-scheme-row">
        <span className="json-scheme-label">{t('json.scheme')}</span>
        <div className="json-view-tabs" role="radiogroup" aria-label={t('json.scheme')}>
          {JSON_SCHEMES.map(item => (
            <button
              key={item.id}
              type="button"
              role="radio"
              className={`json-view-tab ${activeJsonScheme === item.id ? 'active' : ''}`}
              aria-checked={activeJsonScheme === item.id}
              onClick={() => setActiveJsonScheme(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="json-scheme-hint">
        {t(`json.schemeHints.${activeScheme.hintKey}`)}
      </div>
    </div>
  );
}
