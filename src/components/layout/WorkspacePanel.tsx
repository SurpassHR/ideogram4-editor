import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/context';
import type { Lang } from '../../i18n/translations';
import { useEditorStore } from '../../store';
import type { ChatThinkingLevel } from '../../types/chat';
import type {
  WorkspaceBackupPackageV1,
  WorkspaceRestoreModule,
  WorkspaceRestoreSelections,
} from '../../types/workspace';
import { getLlmProviders, replaceLlmProviders } from '../llm/api';
import {
  buildWorkspaceBackupPackage,
  createRestorePreview,
  parseWorkspaceBackupPackage,
} from '../../services/workspace-backup';
import { createBackupGist, findBackupGist, loadBackupGist, updateBackupGist } from '../../services/gist-backup';

const RESTORE_MODULES: WorkspaceRestoreModule[] = [
  'currentCanvas',
  'canvasChatSessions',
  'canvasFavorites',
  'chatPresets',
  'llmProviders',
  'uiPreferences',
];

function createEmptySelections(): WorkspaceRestoreSelections {
  return RESTORE_MODULES.reduce((acc, module) => {
    acc[module] = false;
    return acc;
  }, {} as WorkspaceRestoreSelections);
}

function isLang(value: string): value is Lang {
  return value === 'en' || value === 'zh';
}

function isThinkingLevel(value: string): value is ChatThinkingLevel {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high';
}

function formatDate(value: number | null, emptyLabel: string): string {
  if (!value) return emptyLabel;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface WorkspacePanelProps {
  /** 内嵌到 Settings 模块舞台时，隐藏重复标题并交给外层控制台承载层级。 */
  embedded?: boolean;
}

export default function WorkspacePanel({ embedded = false }: WorkspacePanelProps) {
  const { lang, setLang, t } = useI18n();
  const favorites = useEditorStore(s => s.canvasFavorites);
  const backupSettings = useEditorStore(s => s.workspaceBackupSettings);
  const renameCanvasFavorite = useEditorStore(s => s.renameCanvasFavorite);
  const deleteCanvasFavorite = useEditorStore(s => s.deleteCanvasFavorite);
  const restoreCanvasFavorite = useEditorStore(s => s.restoreCanvasFavorite);
  const applyCanvasSnapshot = useEditorStore(s => s.applyCanvasSnapshot);
  const replaceCanvasChatState = useEditorStore(s => s.replaceCanvasChatState);
  const replaceCanvasFavorites = useEditorStore(s => s.replaceCanvasFavorites);
  const replaceChatPresets = useEditorStore(s => s.replaceChatPresets);
  const setWorkspaceBackupSettings = useEditorStore(s => s.setWorkspaceBackupSettings);
  const setChatModel = useEditorStore(s => s.setChatModel);
  const setChatResponseLang = useEditorStore(s => s.setChatResponseLang);
  const setChatStreamEnabled = useEditorStore(s => s.setChatStreamEnabled);
  const setChatThinkingLevel = useEditorStore(s => s.setChatThinkingLevel);

  const [githubToken, setGithubToken] = useState(backupSettings.githubToken);
  const [gistId, setGistId] = useState(backupSettings.gistId ?? '');
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [restorePackage, setRestorePackage] = useState<WorkspaceBackupPackageV1 | null>(null);
  const [restoreSelections, setRestoreSelections] = useState<WorkspaceRestoreSelections>(createEmptySelections);

  useEffect(() => {
    setGithubToken(backupSettings.githubToken);
    setGistId(backupSettings.gistId ?? '');
  }, [backupSettings.githubToken, backupSettings.gistId]);

  const trimmedToken = githubToken.trim();
  const trimmedGistId = gistId.trim();
  const canBackup = trimmedToken.length > 0 && !isBusy;
  const canFindGist = trimmedToken.length > 0 && !isBusy;
  const canRestore = trimmedToken.length > 0 && trimmedGistId.length > 0 && !isBusy;

  const restorePreview = useMemo(
    () => restorePackage ? createRestorePreview(restorePackage) : [],
    [restorePackage],
  );

  const saveSettings = () => {
    setWorkspaceBackupSettings({
      githubToken: trimmedToken,
      gistId: trimmedGistId || null,
    });
    setStatus(t('settings.workspace.settingsSaved'));
  };

  const clearSettings = () => {
    setGithubToken('');
    setGistId('');
    setWorkspaceBackupSettings({
      githubToken: '',
      gistId: null,
      lastBackupAt: null,
      lastRestoreAt: null,
    });
    setRestorePackage(null);
    setStatus(t('settings.workspace.settingsCleared'));
  };

  const handleBackup = async () => {
    if (!trimmedToken) return;
    setIsBusy(true);
    setStatus(t('settings.workspace.backingUp'));
    try {
      const state = useEditorStore.getState();
      const llmProviders = await getLlmProviders();
      const backup = buildWorkspaceBackupPackage(state, {
        chatPresets: state.chatPresets,
        llmProviders,
        uiPreferences: {
          lang,
          chatModel: state.chatModel,
          chatResponseLang: state.chatResponseLang,
          chatStreamEnabled: state.chatStreamEnabled,
          chatThinkingLevel: state.chatThinkingLevel,
        },
      });
      const packageJson = JSON.stringify(backup, null, 2);
      const result = trimmedGistId
        ? await updateBackupGist(trimmedToken, trimmedGistId, packageJson)
        : await createBackupGist(trimmedToken, packageJson);

      if (!result.ok) {
        setStatus(result.error);
        return;
      }

      const now = Date.now();
      setGistId(result.gistId);
      setWorkspaceBackupSettings({
        githubToken: trimmedToken,
        gistId: result.gistId,
        lastBackupAt: now,
      });
      setStatus(t('settings.workspace.backupDone'));
    } catch (error) {
      setStatus(messageFromError(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleFindBackupGist = async () => {
    if (!trimmedToken) return;
    setIsBusy(true);
    setStatus(t('settings.workspace.findingBackup'));
    try {
      const result = await findBackupGist(trimmedToken);
      if (!result.ok) {
        setStatus(result.error);
        return;
      }
      setGistId(result.gistId);
      setWorkspaceBackupSettings({
        gistId: result.gistId,
      });
      setStatus(t('settings.workspace.backupFound'));
    } catch (error) {
      setStatus(messageFromError(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleLoadRestore = async () => {
    if (!trimmedToken || !trimmedGistId) return;
    setIsBusy(true);
    setStatus(t('settings.workspace.loadingRestore'));
    try {
      const loaded = await loadBackupGist(trimmedToken, trimmedGistId);
      if (!loaded.ok) {
        setStatus(loaded.error);
        return;
      }
      const parsed = parseWorkspaceBackupPackage(loaded.content);
      if (!parsed.ok) {
        setStatus(parsed.error);
        return;
      }
      /* 从备份包的 exportedAt 同步最后备份时间，跨客户端共享 Gist ID 时生效 */
      setWorkspaceBackupSettings({
        gistId: trimmedGistId,
        lastBackupAt: parsed.package.exportedAt,
      });
      const preview = createRestorePreview(parsed.package);
      const selections = createEmptySelections();
      preview.forEach(item => {
        selections[item.module] = item.defaultSelected;
      });
      setRestorePackage(parsed.package);
      setRestoreSelections(selections);
      setStatus(t('settings.workspace.restoreReady'));
    } catch (error) {
      setStatus(messageFromError(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restorePackage) return;
    setIsBusy(true);
    setStatus(t('settings.workspace.restoring'));
    try {
      const modules = restorePackage.modules;
      if (restoreSelections.currentCanvas) applyCanvasSnapshot(modules.currentCanvas);
      if (restoreSelections.canvasChatSessions) replaceCanvasChatState(modules.canvasChatSessions);
      if (restoreSelections.canvasFavorites) replaceCanvasFavorites(modules.canvasFavorites);
      if (restoreSelections.chatPresets) replaceChatPresets(modules.chatPresets);
      if (restoreSelections.llmProviders) await replaceLlmProviders(modules.llmProviders);
      if (restoreSelections.uiPreferences) {
        const prefs = modules.uiPreferences;
        if (isLang(prefs.lang)) setLang(prefs.lang);
        setChatModel(prefs.chatModel);
        setChatResponseLang(prefs.chatResponseLang);
        setChatStreamEnabled(prefs.chatStreamEnabled);
        if (isThinkingLevel(prefs.chatThinkingLevel)) setChatThinkingLevel(prefs.chatThinkingLevel);
      }

      setWorkspaceBackupSettings({
        githubToken: trimmedToken,
        gistId: trimmedGistId,
        lastRestoreAt: Date.now(),
      });
      setRestorePackage(null);
      setStatus(t('settings.workspace.restoreDone'));
    } catch (error) {
      setStatus(messageFromError(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRenameFavorite = (id: string, title: string) => {
    const nextTitle = window.prompt(t('settings.workspace.renameFavoritePrompt'), title);
    if (nextTitle) renameCanvasFavorite(id, nextTitle);
  };

  const handleRestoreFavorite = (id: string) => {
    if (!window.confirm(t('settings.workspace.restoreFavoriteConfirm'))) return;
    restoreCanvasFavorite(id);
    setStatus(t('settings.workspace.favoriteRestored'));
  };

  const handleDeleteFavorite = (id: string) => {
    if (!window.confirm(t('settings.workspace.deleteFavoriteConfirm'))) return;
    deleteCanvasFavorite(id);
    setStatus(t('settings.workspace.favoriteDeleted'));
  };

  return (
    <section className={`settings-page-workspace ${embedded ? 'workspace-panel-embedded' : ''}`}>
      {!embedded && <h2 className="settings-section-title">{t('settings.workspace.heading')}</h2>}

      <div className="workspace-panel-body">
        <div className="workspace-pane workspace-favorites-pane">
          <div className="workspace-pane-header">
            <h3 className="workspace-pane-title">{t('settings.workspace.favorites')}</h3>
            <span className="workspace-pane-meta">{t('settings.workspace.favoriteCount', { count: favorites.length })}</span>
          </div>

          {favorites.length === 0 ? (
            <p className="workspace-empty">{t('settings.workspace.noFavorites')}</p>
          ) : (
            <div className="workspace-favorite-list">
              {favorites.map(favorite => (
                <div className="workspace-favorite-row" key={favorite.id}>
                  <div className="workspace-favorite-main">
                    <strong>{favorite.title}</strong>
                    <span>
                      {favorite.snapshot.canvasW} x {favorite.snapshot.canvasH}
                      {' · '}
                      {t('settings.workspace.boxCount', { count: favorite.snapshot.boxes.length })}
                      {' · '}
                      {formatDate(favorite.updatedAt, t('settings.workspace.never'))}
                    </span>
                  </div>
                  <div className="workspace-row-actions">
                    <button className="btn btn-small" type="button" onClick={() => handleRestoreFavorite(favorite.id)}>
                      {t('settings.workspace.restore')}
                    </button>
                    <button className="btn btn-small" type="button" onClick={() => handleRenameFavorite(favorite.id, favorite.title)}>
                      {t('settings.workspace.rename')}
                    </button>
                    <button className="btn btn-danger btn-small" type="button" onClick={() => handleDeleteFavorite(favorite.id)}>
                      {t('settings.workspace.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="workspace-pane workspace-backup-pane">
          <div className="workspace-pane-header">
            <h3 className="workspace-pane-title">{t('settings.workspace.backup')}</h3>
            <span className="workspace-pane-meta">{t('settings.workspace.fixedGist')}</span>
          </div>

          <div className="workspace-backup-grid">
            <div className="input-group">
              <label htmlFor="workspace-github-token">{t('settings.workspace.githubToken')}</label>
              <input
                id="workspace-github-token"
                type="password"
                value={githubToken}
                onChange={event => setGithubToken(event.target.value)}
                placeholder={t('settings.workspace.githubTokenPlaceholder')}
              />
              <a
                className="input-group-helper"
                href="https://github.com/settings/tokens/new?scopes=gist&description=Ideogram4%20Editor%20Workspace%20Backup"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('settings.workspace.createToken')} ↗
              </a>
            </div>
            <div className="input-group">
              <label htmlFor="workspace-gist-id">{t('settings.workspace.gistId')}</label>
              <input
                id="workspace-gist-id"
                type="text"
                value={gistId}
                onChange={event => setGistId(event.target.value)}
                placeholder={t('settings.workspace.gistIdPlaceholder')}
              />
            </div>
          </div>

          <dl className="workspace-backup-meta">
            <div>
              <dt>{t('settings.workspace.lastBackup')}</dt>
              <dd>{formatDate(backupSettings.lastBackupAt, t('settings.workspace.never'))}</dd>
            </div>
            <div>
              <dt>{t('settings.workspace.lastRestore')}</dt>
              <dd>{formatDate(backupSettings.lastRestoreAt, t('settings.workspace.never'))}</dd>
            </div>
          </dl>

          <div className="workspace-actions">
            <button className="btn" type="button" onClick={saveSettings}>
              {t('settings.workspace.saveSettings')}
            </button>
            <button className="btn" type="button" onClick={handleBackup} disabled={!canBackup}>
              {t('settings.workspace.backUpNow')}
            </button>
            <button className="btn" type="button" onClick={handleFindBackupGist} disabled={!canFindGist}>
              {t('settings.workspace.findBackupGist')}
            </button>
            <button className="btn" type="button" onClick={handleLoadRestore} disabled={!canRestore}>
              {t('settings.workspace.restoreFromGist')}
            </button>
            <button className="btn btn-danger" type="button" onClick={clearSettings}>
              {t('settings.workspace.clearSettings')}
            </button>
          </div>

          <p className="workspace-security-note">{t('settings.workspace.securityNote')}</p>

          {status && <div className="workspace-status" role="status">{status}</div>}

          {restorePackage && (
            <div className="workspace-restore-preview">
              <div className="workspace-pane-header">
                <h3 className="workspace-pane-title">{t('settings.workspace.restorePreview')}</h3>
                <span className="workspace-pane-meta">{formatDate(restorePackage.exportedAt, t('settings.workspace.never'))}</span>
              </div>
              <div className="workspace-restore-list">
                {restorePreview.map(item => (
                  <label className="workspace-restore-row" key={item.module}>
                    <input
                      type="checkbox"
                      checked={restoreSelections[item.module]}
                      onChange={event => setRestoreSelections(prev => ({
                        ...prev,
                        [item.module]: event.target.checked,
                      }))}
                    />
                    <span>
                      <strong>{t(`settings.workspace.modules.${item.module}`)}</strong>
                      <small>{item.summary}</small>
                      {item.warning && <em>{t('settings.workspace.llmProviderWarning')}</em>}
                    </span>
                  </label>
                ))}
              </div>
              <div className="workspace-actions">
                <button className="btn btn-primary" type="button" onClick={handleConfirmRestore} disabled={isBusy}>
                  {t('settings.workspace.confirmRestore')}
                </button>
                <button className="btn" type="button" onClick={() => setRestorePackage(null)}>
                  {t('settings.workspace.cancelRestore')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
