import { useRef, useState } from 'react';
import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import {
  bootstrapDesktop,
  importDesktopWorkspace,
  saveDesktopSettings,
} from '../../services/desktop-api';
import { applyImportedLocalStorage } from '../../services/desktop-migration';

export default function DesktopWelcome() {
  const { t } = useI18n();
  const firstRun = useEditorStore(state => state.desktopFirstRun);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!firstRun) return null;

  const finishOnboarding = async (settings = { onboardingCompleted: true }) => {
    const saved = await saveDesktopSettings(settings);
    useEditorStore.getState().setDesktopSettings(saved);
    useEditorStore.setState({ desktopFirstRun: false });
  };

  const startFresh = async () => {
    setBusy(true);
    setError(null);
    try {
      await finishOnboarding();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const importArchive = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const manifest = await importDesktopWorkspace(file);
      applyImportedLocalStorage(manifest);
      const bootstrap = await bootstrapDesktop();
      useEditorStore.getState().hydrateDesktop(bootstrap);
      await finishOnboarding();
      window.alert(t('desktop.providerKeysNotice'));
    } catch (cause) {
      setError(`${t('desktop.importFailed')}: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="desktop-welcome-overlay">
      <section className="desktop-welcome-card" role="dialog" aria-modal="true">
        <h1>{t('desktop.welcomeTitle')}</h1>
        <p>{t('desktop.welcomeBody')}</p>
        {error && <div className="desktop-welcome-error" role="alert">{error}</div>}
        <div className="desktop-welcome-actions">
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              if (file) void importArchive(file);
            }}
          />
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? t('desktop.importing') : t('desktop.importMigration')}
          </button>
          <button className="btn" type="button" disabled={busy} onClick={startFresh}>
            {t('desktop.startFresh')}
          </button>
        </div>
      </section>
    </div>
  );
}
