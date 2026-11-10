import { useRef, useState } from 'react';
import { useI18n } from '../../i18n/context';
import {
  exportDesktopWorkspace,
  importDesktopWorkspace,
  isDesktopRuntime,
} from '../../services/desktop-api';
import {
  applyImportedLocalStorage,
  buildWebMigrationArchive,
  downloadWebMigrationArchive,
} from '../../services/desktop-migration';

export default function DesktopWorkspaceActions() {
  const { t } = useI18n();
  const desktop = isDesktopRuntime();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const exportWorkspace = async () => {
    setBusy(true);
    setStatus('');
    try {
      if (desktop) {
        const blob = await exportDesktopWorkspace();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `ideogram4-workspace-${new Date().toISOString().slice(0, 10)}.zip`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus(t('desktop.backupDone'));
      } else {
        downloadWebMigrationArchive(await buildWebMigrationArchive());
        setStatus(t('desktop.webMigrationHint'));
      }
    } catch (error) {
      setStatus(`${t('desktop.backupFailed')}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const importWorkspace = async (file: File) => {
    setBusy(true);
    setStatus('');
    try {
      const manifest = await importDesktopWorkspace(file);
      applyImportedLocalStorage(manifest);
      window.alert(t('desktop.restoreDone'));
      window.location.reload();
    } catch (error) {
      setStatus(`${t('desktop.backupFailed')}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="desktop-workspace-actions">
      <div className="desktop-workspace-actions-copy">
        <strong>{t('desktop.localBackupTitle')}</strong>
        <span>{desktop ? t('desktop.restoreDone') : t('desktop.webMigrationHint')}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          if (file) void importWorkspace(file);
        }}
      />
      <div className="desktop-workspace-action-buttons">
        <button className="btn" type="button" disabled={busy} onClick={exportWorkspace}>
          {desktop ? t('desktop.exportWorkspace') : t('desktop.exportWebMigration')}
        </button>
        {desktop && (
          <button className="btn" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {t('desktop.importWorkspace')}
          </button>
        )}
      </div>
      {status && <div className="desktop-workspace-status" role="status">{status}</div>}
    </div>
  );
}
