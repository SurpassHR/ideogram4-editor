import { useState, useEffect, useCallback } from 'react';
import type { LlmProvider, ProviderKind } from './types';
import { KIND_LABELS, DEFAULT_BASE_URLS, createEmptyProvider } from './types';
import { getLlmProviders, saveLlmProvider, deleteLlmProvider, fetchModels } from './api';
import { useI18n } from '../../i18n/context';

interface Props {
  onClose: () => void;
}

export default function LlmConfigPanel({ onClose }: Props) {
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
    return (
      <div className="llm-overlay">
        <div className="llm-modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <p style={{ color: 'var(--text-secondary)' }}>{t('llmConfig.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="llm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="llm-modal">
        {/* Header */}
        <div className="llm-header">
          <button className="btn" onClick={onClose} style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '4px 8px' }}>
            {t('llmConfig.back')}
          </button>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{t('llmConfig.title')}</span>
          <div style={{ width: 60 }} />
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Sidebar */}
          <div className="llm-sidebar">
            <div className="llm-sidebar-header">
              <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('llmConfig.providers')}</span>
              <button className="btn" onClick={startNew} style={{ padding: '3px 10px', fontSize: 11 }}>{t('llmConfig.addProvider')}</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {providers.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`llm-dot ${p.models.length > 0 ? 'active' : ''}`} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name || p.id}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {KIND_LABELS[p.kind]} · {t('llm.models', { count: p.models.length })}
                        </div>
                      </div>
                    </div>
                    {deleteTarget === p.id && (
                      <button
                        className="btn btn-danger"
                        onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                        style={{ padding: '2px 6px', fontSize: 11, lineHeight: 1.4 }}
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!selectedId && !isNew ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 12 }}>
                <div style={{ fontSize: 32 }}>⚙️</div>
                <p style={{ fontSize: 13, margin: 0 }}>{t('llmConfig.selectOrCreate')}</p>
                <button className="btn" onClick={startNew} style={{ padding: '6px 16px' }}>{t('llmConfig.newProviderButton')}</button>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
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
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{t('llmConfig.idImmutable')}</div>
                      </>
                    ) : (
                      <div style={{ padding: '8px 10px', background: 'var(--surface-raised)', borderRadius: 6, fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
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
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={editing.api_key}
                        onChange={e => update('api_key', e.target.value)}
                        placeholder="sk-..."
                        style={{ fontFamily: 'JetBrains Mono, monospace', paddingRight: 40 }}
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        style={{
                          position: 'absolute',
                          right: 4,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: 12,
                          padding: '4px 8px',
                        }}
                      >
                        {showApiKey ? t('llmConfig.hide') : t('llmConfig.show')}
                      </button>
                    </div>
                    {isKeyMasked(editing.api_key) && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{t('llmConfig.keyMasked')}</div>
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

                  {/* Models */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', margin: 0 }}>
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
                    <div style={{
                      border: '1px dashed var(--border)',
                      borderRadius: 6,
                      padding: 16,
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                    }}>
                      {(() => {
                        if (editing.kind === 'openai_compat' && !editing.base_url) return t('llmConfig.fillBaseUrlFirst');
                        if (!editing.api_key || isKeyMasked(editing.api_key)) return t('llmConfig.fillApiKeyFirst');
                        return t('llmConfig.clickFetchHint');
                      })()}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 200, overflow: 'auto' }}>
                        {editing.models.map(model => (
                          <label
                            key={model}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '5px 8px',
                              background: 'var(--surface-raised)',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontSize: 11,
                              fontFamily: 'JetBrains Mono, monospace',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={true}
                              onChange={() => toggleModel(model)}
                              style={{ accentColor: 'var(--primary)' }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model}</span>
                          </label>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{t('llmConfig.uncheckToRemove')}</div>
                    </>
                  )}
                </div>

                {/* Bottom Action Bar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 24px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {isNew ? t('llmConfig.newProvider') : hasChanges ? t('llmConfig.unsavedChanges') : t('llmConfig.upToDate')}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
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
          <div style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--primary)',
            color: 'white',
            padding: '8px 20px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}