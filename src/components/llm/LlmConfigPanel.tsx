import { useState, useEffect, useCallback } from 'react';
import type { LlmProvider, ProviderKind } from './types';
import { KIND_LABELS, DEFAULT_BASE_URLS, createEmptyProvider } from './types';
import { getLlmProviders, saveLlmProvider, deleteLlmProvider, fetchModels } from './api';
import { useI18n } from '../../i18n/context';

interface Props {
  onClose?: () => void;
  /** 内嵌模式：不渲染模态框遮罩，直接展示内容 */
  embedded?: boolean;
}

export default function LlmConfigPanel({ onClose, embedded }: Props) {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LlmProvider>(createEmptyProvider());
  const [isNew, setIsNew] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { t } = useI18n();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    getLlmProviders().then(p => {
      setProviders(p);
      setLoading(false);
    });
  }, []);

  const selectedProvider = providers.find(p => p.id === selectedId);
  const hasChanges = isNew
    || (selectedProvider != null && JSON.stringify(selectedProvider) !== JSON.stringify(editing));

  const isKeyMasked = (key: string) => key.includes('***') || /^\*+$/.test(key);

  const startNew = useCallback(() => {
    setSelectedId(null);
    setEditing(createEmptyProvider());
    setIsNew(true);
    setShowApiKey(false);
  }, []);

  const selectProvider = useCallback((id: string) => {
    const p = providers.find(pr => pr.id === id);
    if (p) {
      setEditing(JSON.parse(JSON.stringify(p)));
      setSelectedId(id);
      setIsNew(false);
      setShowApiKey(false);
    }
  }, [providers]);

  const update = useCallback(<K extends keyof LlmProvider>(key: K, value: LlmProvider[K]) => {
    setEditing(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async () => {
    if (!editing.id.trim() || !editing.name.trim()) {
      showToast(t('llmConfig.toast.idNameRequired'));
      return;
    }
    setSaving(true);
    try {
      await saveLlmProvider(editing);
      const updated = await getLlmProviders();
      setProviders(updated);
      setSelectedId(editing.id);
      setIsNew(false);
      showToast(t('llmConfig.toast.saved'));
    } catch (e) {
      showToast(t('llmConfig.toast.saveFailed', { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('llmConfig.toast.confirmDelete'))) return;
    try {
      await deleteLlmProvider(id);
      if (selectedId === id) {
        setSelectedId(null);
        setEditing(createEmptyProvider());
        setIsNew(false);
      }
      const updated = await getLlmProviders();
      setProviders(updated);
      showToast(t('llmConfig.toast.deleted'));
    } catch (e) {
      showToast(t('llmConfig.toast.deleteFailed', { error: (e as Error).message }));
    }
  };

  const handleFetchModels = async () => {
    const baseUrl = editing.base_url || DEFAULT_BASE_URLS[editing.kind];
    const apiKey = editing.api_key;

    if (!baseUrl) {
      showToast(t('llmConfig.toast.fillBaseUrl'));
      return;
    }
    if (!apiKey || isKeyMasked(apiKey)) {
      showToast(t('llmConfig.toast.fillApiKey'));
      return;
    }

    setFetchingModels(true);
    try {
      const models = await fetchModels(editing.kind, baseUrl, apiKey);
      const merged = [...new Set([...editing.models, ...models])].sort();
      setEditing(prev => ({ ...prev, models: merged }));
      showToast(t('llmConfig.toast.fetchedModels', { count: models.length }));
    } catch (e) {
      showToast(t('llmConfig.toast.fetchFailed', { error: (e as Error).message }));
    } finally {
      setFetchingModels(false);
    }
  };

  const toggleModel = (model: string) => {
    setEditing(prev => ({
      ...prev,
      models: prev.models.includes(model)
        ? prev.models.filter(m => m !== model)
        : [...prev.models, model],
    }));
  };

  if (loading) {
    const loadingContent = (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: embedded ? 200 : 400 }}>
        <p style={{ color: 'var(--text-secondary)' }}>{t('llmConfig.loading')}</p>
      </div>
    );
    if (embedded) return <div className="llm-config-embedded">{loadingContent}</div>;
    return (
      <div className="llm-overlay">
        <div className="llm-modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          {loadingContent}
        </div>
      </div>
    );
  }

  const bodyContent = (
    <>
      {/* Header */}
      <div className="llm-header">
        {!embedded && (
          <button className="btn llm-back-btn" onClick={onClose}>
            {t('llmConfig.back')}
          </button>
        )}
        <span className="llm-header-title">{t('llmConfig.title')}</span>
        <div style={{ width: embedded ? 0 : 60 }} />
      </div>

        {/* Body */}
        <div className="llm-body">
          {/* Sidebar */}
          <div className="llm-sidebar">
            <div className="llm-sidebar-header">
              <span className="llm-sidebar-header-label">{t('llmConfig.providers')}</span>
              <button className="btn btn-small" onClick={startNew} style={{ padding: '3px 10px', fontSize: 11 }}>{t('llmConfig.addProvider')}</button>
            </div>
            <div className="llm-sidebar-list">
              {providers.length === 0 ? (
                <div className="llm-sidebar-empty">
                  {t('llmConfig.noProviders')}
                </div>
              ) : (
                providers.map(p => (
                  <div
                    key={p.id}
                    className={`llm-provider-item ${selectedId === p.id ? 'active' : ''}`}
                    onClick={() => selectProvider(p.id)}
                    onMouseEnter={() => setDeleteTarget(p.id)}
                    onMouseLeave={() => setDeleteTarget(null)}
                  >
                    <div className="llm-provider-info">
                      <span className={`llm-dot ${p.models.length > 0 ? 'active' : ''}`} />
                      <div className="llm-provider-name-wrap">
                        <div className="llm-provider-name">
                          {p.name || p.id}
                        </div>
                        <div className="llm-provider-meta">
                          {KIND_LABELS[p.kind]} · {t('llm.models', { count: p.models.length })}
                        </div>
                      </div>
                    </div>
                    {deleteTarget === p.id && (
                      <button
                        className="btn btn-danger llm-provider-delete-btn"
                        onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Main */}
          <div className="llm-detail">
            {!selectedId && !isNew ? (
              <div className="llm-detail-empty">
                <div className="llm-detail-empty-icon">⚙️</div>
                <p className="llm-detail-empty-text">{t('llmConfig.selectOrCreate')}</p>
                <button className="btn" onClick={startNew} style={{ padding: '6px 16px' }}>{t('llmConfig.newProviderButton')}</button>
              </div>
            ) : (
              <>
                <div className="llm-detail-form">
                  {/* ID */}
                  <div className="input-group">
                    <label>{t('llmConfig.id')}</label>
                    {isNew ? (
                      <>
                        <input
                          type="text"
                          value={editing.id}
                          onChange={e => update('id', e.target.value)}
                          placeholder={t('llmConfig.idPlaceholder')}
                          style={{ fontFamily: 'JetBrains Mono, monospace' }}
                        />
                        <div className="llm-id-immutable-hint">{t('llmConfig.idImmutable')}</div>
                      </>
                    ) : (
                      <div className="llm-id-display">
                        {editing.id}
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <div className="input-group">
                    <label>{t('llmConfig.name')}</label>
                    <input
                      type="text"
                      value={editing.name}
                      onChange={e => update('name', e.target.value)}
                      placeholder={t('llmConfig.namePlaceholder')}
                    />
                  </div>

                  {/* Kind */}
                  <div className="input-group">
                    <label>{t('llmConfig.protocolType')}</label>
                    <div className="llm-kind-buttons">
                      {(Object.keys(KIND_LABELS) as ProviderKind[]).map(kind => (
                        <button
                          key={kind}
                          className="btn"
                          onClick={() => {
                            update('kind', kind);
                            if (kind !== 'openai_compat') update('base_url', '');
                          }}
                          style={{
                            padding: '5px 12px',
                            fontSize: 12,
                            background: editing.kind === kind ? 'var(--primary)' : 'var(--surface-raised)',
                            color: editing.kind === kind ? 'white' : 'var(--text-secondary)',
                            border: editing.kind === kind ? 'none' : '1px solid var(--border)',
                          }}
                        >
                          {KIND_LABELS[kind]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Base URL */}
                  {editing.kind === 'openai_compat' && (
                    <div className="input-group">
                      <label>{t('llmConfig.baseUrl')}</label>
                      <input
                        type="text"
                        value={editing.base_url}
                        onChange={e => update('base_url', e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      />
                    </div>
                  )}

                  {/* API Key */}
                  <div className="input-group">
                    <label>{t('llmConfig.apiKey')}</label>
                    <div className="llm-api-key-wrapper">
                      <input
                        className="llm-api-key-input"
                        type={showApiKey ? 'text' : 'password'}
                        value={editing.api_key}
                        onChange={e => update('api_key', e.target.value)}
                        placeholder="sk-..."
                      />
                      <button
                        type="button"
                        className="llm-api-key-toggle"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? t('llmConfig.hide') : t('llmConfig.show')}
                      </button>
                    </div>
                    {isKeyMasked(editing.api_key) && (
                      <div className="llm-key-masked-hint">{t('llmConfig.keyMasked')}</div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="llm-form-divider" />

                  {/* Models */}
                  <div className="llm-model-header">
                    <label className="llm-model-header-label">
                      {t('llmConfig.modelList')}
                    </label>
                    <button
                      className="btn"
                      onClick={handleFetchModels}
                      disabled={fetchingModels}
                      style={{ padding: '4px 12px', fontSize: 11 }}
                    >
                      {fetchingModels ? t('llmConfig.fetching') : t('llmConfig.fetchModels')}
                    </button>
                  </div>

                  {editing.models.length === 0 ? (
                    <div className="llm-model-empty-hint">
                      {(() => {
                        if (editing.kind === 'openai_compat' && !editing.base_url) return t('llmConfig.fillBaseUrlFirst');
                        if (!editing.api_key || isKeyMasked(editing.api_key)) return t('llmConfig.fillApiKeyFirst');
                        return t('llmConfig.clickFetchHint');
                      })()}
                    </div>
                  ) : (
                    <>
                      <div className="llm-model-grid">
                        {editing.models.map(model => (
                          <label
                            key={model}
                            className="llm-model-checkbox-label"
                          >
                            <input
                              type="checkbox"
                              checked={true}
                              onChange={() => toggleModel(model)}
                              style={{ accentColor: 'var(--primary)' }}
                            />
                            <span>{model}</span>
                          </label>
                        ))}
                      </div>
                      <div className="llm-model-hint">{t('llmConfig.uncheckToRemove')}</div>
                    </>
                  )}
                </div>

                {/* Bottom Action Bar */}
                <div className="llm-action-bar">
                  <span className="llm-action-bar-status">
                    {isNew ? t('llmConfig.newProvider') : hasChanges ? t('llmConfig.unsavedChanges') : t('llmConfig.upToDate')}
                  </span>
                  <div className="llm-action-bar-actions">
                    {!isNew && (
                      <button className="btn btn-danger" onClick={() => handleDelete(editing.id)}>{t('llmConfig.delete')}</button>
                    )}
                    <button
                      className="btn"
                      onClick={handleSave}
                      disabled={saving || (!isNew && !hasChanges)}
                    >
                      {saving ? t('llmConfig.saving') : t('llmConfig.saveConfig')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="llm-toast">
            {toast}
          </div>
        )}
      </>
  );

  if (embedded) {
    return <div className="llm-config-embedded">{bodyContent}</div>;
  }
  return (
    <div className="llm-overlay" onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="llm-modal">
        {bodyContent}
      </div>
    </div>
  );
}
