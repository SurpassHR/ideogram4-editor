import { useI18n } from '../../i18n/context';

interface Props {
  currentHash: string;
  onNavigate: (path: string) => void;
}

export default function Header({ currentHash, onNavigate }: Props) {
  const { lang, setLang, t } = useI18n();

  const isCanvas = currentHash !== '#/settings';

  return (
    <header className="app-header">
      <div className="app-header-logo" onClick={() => onNavigate('#/')} role="button" tabIndex={0}>
        🎨 Ideogram Editor
      </div>

      <div className="app-header-spacer" />

      <nav className="app-header-nav">
        <button
          className={`app-header-nav-btn ${isCanvas ? 'active' : ''}`}
          onClick={() => onNavigate('#/')}
        >
          {t('nav.canvas')}
        </button>
        <button
          className={`app-header-nav-btn ${!isCanvas ? 'active' : ''}`}
          onClick={() => onNavigate('#/settings')}
        >
          {t('nav.settings')}
        </button>
      </nav>

      <div className="app-header-spacer" />

      <div className="lang-switcher">
        <button
          className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
          onClick={() => setLang('en')}
        >
          EN
        </button>
        <button
          className={`lang-btn ${lang === 'zh' ? 'active' : ''}`}
          onClick={() => setLang('zh')}
        >
          中文
        </button>
      </div>
    </header>
  );
}