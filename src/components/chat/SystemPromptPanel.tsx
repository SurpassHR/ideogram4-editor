import { useState, useMemo } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { CANVAS_CHAT_SYSTEM_PROMPT } from '../../services/llm-canvas-chat';
import { BOX_CHAT_SYSTEM_PROMPT } from '../../services/llm-chat';
import { IconClose, IconTrash, IconCopy } from '../ui/icons';
import type { SystemPromptEntry } from '../../types/chat';

interface Props {
  embedded?: boolean;
  onClose?: () => void;
}

const EMPTY_FORM = { name: '', content: '', scope: 'box' as SystemPromptEntry['scope'] };

export default function SystemPromptPanel({ embedded, onClose }: Props) {
  const systemPrompts = useEditorStore(s => s.systemPrompts);
  const addSystemPrompt = useEditorStore(s => s.addSystemPrompt);
  const updateSystemPrompt = useEditorStore(s => s.updateSystemPrompt);
  const deleteSystemPrompt = useEditorStore(s => s.deleteSystemPrompt);
  const activeCanvasChatSystemPromptId = useEditorStore(s => s.activeCanvasChatSystemPromptId);
  const activeBoxChatSystemPromptId = useEditorStore(s => s.activeBoxChatSystemPromptId);
  const setActiveCanvasChatSystemPrompt = useEditorStore(s => s.setActiveCanvasChatSystemPrompt);
  const setActiveBoxChatSystemPrompt = useEditorStore(s => s.setActiveBoxChatSystemPrompt);
  const { t } = useI18n();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; content: string; scope: SystemPromptEntry['scope'] }>(EMPTY_FORM);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const isEditing = editingId !== null;
  const isNew = editingId === '__new__';

  const startNew = () => {
    setEditingId('__new__');
    setForm({ ...EMPTY_FORM });
    setExpandedId('__new__');
  };

  const startEdit = (entry: SystemPromptEntry) => {
    setEditingId(entry.id);
    setForm({ name: entry.name, content: entry.content, scope: entry.scope });
    setExpandedId(entry.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setExpandedId(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      showToast('Name is required');
      return;
    }
    if (!form.content.trim()) {
      showToast('Content is required');
      return;
    }
    if (isNew) {
      addSystemPrompt({
        name: form.name.trim(),
        content: form.content,
        scope: form.scope,
      });
      showToast('System prompt created');
    } else if (editingId) {
      updateSystemPrompt(editingId, {
        name: form.name.trim(),
        content: form.content,
        scope: form.scope,
      });
      showToast('System prompt updated');
    }
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setExpandedId(null);
  };

  const handleDuplicate = (entry: SystemPromptEntry) => {
    addSystemPrompt({
      name: `${entry.name} (Copy)`,
      content: entry.content,
      scope: entry.scope,
    });
    showToast('Duplicated');
  };

  const handleDelete = (id: string) => {
    deleteSystemPrompt(id);
    if (editingId === id) {
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
    }
    showToast('Deleted');
  };

  const scopeLabel = (s: SystemPromptEntry['scope']): string => {
    switch (s) {
      case 'canvas': return 'Canvas';
      case 'box': return 'Box';
      case 'both': return 'Canvas + Box';
    }
  };

  const content = (
    <>
      <div className="modal-header">
        <h3>{t('chat.systemPrompt.title')}</h3>
        {!embedded && onClose && (
          <button className="modal-close-btn" onClick={onClose}><IconClose size={14} /></button>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="sysprompt-info">
        {t('chat.systemPrompt.info')}
      </div>

      <div className="sysprompt-toolbar">
        <button className="btn btn-primary" onClick={startNew}>
          + {t('chat.systemPrompt.addPrompt')}
        </button>
      </div>

      <div className="sysprompt-list">
        {/* 内置默认提示词 — 始终显示 */}
        <div className="sp-card builtin">
          <div className="sp-card-main">
            <span className="sp-card-name">{t('chat.systemPrompt.defaultBuiltin')}</span>
            <span className="sp-card-scope">{t('chat.systemPrompt.scopeBoth')}</span>
          </div>
          <span className="sp-card-badge">{t('chat.systemPrompt.default')}</span>
        </div>

        {systemPrompts.length === 0 && !isNew && (
          <div className="sp-empty">{t('chat.systemPrompt.noPrompts')}</div>
        )}

        {systemPrompts.map(entry => (
          <div key={entry.id} className="sp-card">
            <button className="sp-card-expand" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
              <span className="sp-card-main">
                <span className="sp-card-name">{entry.name}</span>
                <span className="sp-card-scope">{scopeLabel(entry.scope)}</span>
              </span>
              <span className="sp-card-arrow">{expandedId === entry.id ? '▲' : '▼'}</span>
            </button>
            <div className="sp-card-actions">
              <button className="btn btn-small" onClick={() => startEdit(entry)}>{t('chat.presets.edit')}</button>
              <button className="btn btn-small" onClick={() => handleDuplicate(entry)} title={t('chat.presets.duplicate')}>
                <IconCopy size={12} />
              </button>
              <button className="btn btn-small btn-danger" onClick={() => handleDelete(entry.id)} title={t('chat.presets.delete')}>
                <IconTrash size={12} />
              </button>
            </div>
            {expandedId === entry.id && editingId !== entry.id && (
              <pre className="sp-card-preview">{entry.content.slice(0, 500)}{entry.content.length > 500 ? '...' : ''}</pre>
            )}
            {editingId === entry.id && (
              <div className="sp-editor">
                <div className="input-group">
                  <label>{t('chat.presets.name')}</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label>{t('chat.systemPrompt.scope')}</label>
                  <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as SystemPromptEntry['scope'] }))}>
                    <option value="box">Box Chat</option>
                    <option value="canvas">Canvas Chat</option>
                    <option value="both">Canvas + Box</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{t('chat.presets.template')}</label>
                  <textarea
                    className="preset-template-input"
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    rows={6}
                    spellCheck={false}
                  />
                </div>
                <div className="sp-editor-actions">
                  <button className="btn btn-primary" onClick={handleSave}>{t('chat.presets.save')}</button>
                  <button className="btn" onClick={cancelEdit}>{t('chat.presets.cancel')}</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {isNew && (
          <div className="sp-card new">
            <div className="sp-editor">
              <div className="input-group">
                <label>{t('chat.presets.name')}</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="input-group">
                <label>{t('chat.systemPrompt.scope')}</label>
                <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as SystemPromptEntry['scope'] }))}>
                  <option value="box">Box Chat</option>
                  <option value="canvas">Canvas Chat</option>
                  <option value="both">Canvas + Box</option>
                </select>
              </div>
              <div className="input-group">
                <label>{t('chat.presets.template')}</label>
                <textarea
                  className="preset-template-input"
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={6}
                  spellCheck={false}
                />
              </div>
              <div className="sp-editor-actions">
                <button className="btn btn-primary" onClick={handleSave}>{t('chat.presets.save')}</button>
                <button className="btn" onClick={cancelEdit}>{t('chat.presets.cancel')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="sysprompt-embedded">{content}</div>;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sysprompt-modal" onClick={e => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
