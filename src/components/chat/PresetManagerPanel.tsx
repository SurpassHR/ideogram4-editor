import { useState, useMemo } from 'react';
import type { PromptPreset } from '../../types/presets';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';

interface Props {
  onClose: () => void;
}

const EMPTY_FORM = {
  name: '',
  description: '',
  promptTemplate: '',
  tags: [] as string[],
};

export default function PresetManagerPanel({ onClose }: Props) {
  const chatPresets = useEditorStore(s => s.chatPresets);
  const addPreset = useEditorStore(s => s.addPreset);
  const updatePreset = useEditorStore(s => s.updatePreset);
  const deletePreset = useEditorStore(s => s.deletePreset);
  const { t } = useI18n();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; description: string; promptTemplate: string; tags: string[] }>(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // 提取所有标签
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    chatPresets.forEach(p => p.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [chatPresets]);

  // 搜索和标签过滤
  const filteredPresets = useMemo(() => {
    let list = chatPresets;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q)),
      );
    }
    if (selectedTag) {
      list = list.filter(p => p.tags.includes(selectedTag));
    }
    return list;
  }, [chatPresets, searchQuery, selectedTag]);

  // 开始编辑预设
  const startEdit = (preset: PromptPreset) => {
    setEditingId(preset.id);
    setForm({
      name: preset.name,
      description: preset.description,
      promptTemplate: preset.promptTemplate,
      tags: [...preset.tags],
    });
  };

  // 新建预设
  const startNew = () => {
    setEditingId('__new__');
    setForm({ ...EMPTY_FORM });
  };

  // 添加标签
  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm(f => ({ ...f, tags: [...f.tags, tag] }));
    }
    setTagInput('');
  };

  // 删除标签
  const removeTag = (tag: string) => {
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  };

  // 保存
  const handleSave = () => {
    if (!form.name.trim()) {
      showToast('Name is required');
      return;
    }
    if (!form.promptTemplate.trim()) {
      showToast('Template is required');
      return;
    }

    if (editingId === '__new__') {
      addPreset({
        name: form.name.trim(),
        description: form.description.trim(),
        promptTemplate: form.promptTemplate,
        tags: form.tags,
      });
    } else if (editingId) {
      updatePreset(editingId, {
        name: form.name.trim(),
        description: form.description.trim(),
        promptTemplate: form.promptTemplate,
        tags: form.tags,
      });
    }

    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  // 复制预设
  const handleDuplicate = (preset: PromptPreset) => {
    addPreset({
      name: `${preset.name} (Copy)`,
      description: preset.description,
      promptTemplate: preset.promptTemplate,
      tags: [...preset.tags],
    });
  };

  // 删除预设
  const handleDelete = (id: string) => {
    deletePreset(id);
    if (editingId === id) {
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
    }
  };

  const isEditing = editingId !== null;
  const isNew = editingId === '__new__';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content preset-manager" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('chat.presets.title')}</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Toast */}
        {toast && <div className="toast">{toast}</div>}

        {/* Search & filter bar */}
        <div className="preset-toolbar">
          <input
            className="preset-search"
            type="text"
            placeholder={t('chat.presets.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select
            className="preset-tag-filter"
            value={selectedTag || ''}
            onChange={e => setSelectedTag(e.target.value || null)}
          >
            <option value="">{t('chat.presets.allTags')}</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={startNew}>
            {t('chat.presets.addPreset')}
          </button>
        </div>

        <div className="preset-manager-body">
          {/* Preset list */}
          <div className="preset-list">
            {filteredPresets.length === 0 && (
              <div className="preset-empty">{t('chat.presets.noPresets')}</div>
            )}
            {filteredPresets.map(preset => (
              <div
                key={preset.id}
                className={`preset-card ${editingId === preset.id ? 'active' : ''}`}
                onClick={() => startEdit(preset)}
              >
                <div className="preset-card-header">
                  <span className="preset-card-name">{preset.name}</span>
                  <span className="preset-card-date">
                    {new Date(preset.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="preset-card-desc">{preset.description}</div>
                <div className="preset-card-tags">
                  {preset.tags.map(tag => (
                    <span key={tag} className="preset-tag">{tag}</span>
                  ))}
                </div>
                <div className="preset-card-actions">
                  <button className="btn btn-small" onClick={e => { e.stopPropagation(); startEdit(preset); }}>
                    {t('chat.presets.edit')}
                  </button>
                  <button className="btn btn-small" onClick={e => { e.stopPropagation(); handleDuplicate(preset); }}>
                    {t('chat.presets.duplicate')}
                  </button>
                  <button className="btn btn-small btn-danger" onClick={e => { e.stopPropagation(); handleDelete(preset.id); }}>
                    {t('chat.presets.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Edit form */}
          {isEditing && (
            <div className="preset-edit-form">
              <h4>{isNew ? t('chat.presets.newPreset') : t('chat.presets.editPreset')}</h4>

              <div className="input-group">
                <label>{t('chat.presets.name')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t('chat.presets.namePlaceholder')}
                />
              </div>

              <div className="input-group">
                <label>{t('chat.presets.description')}</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={t('chat.presets.descPlaceholder')}
                />
              </div>

              <div className="input-group">
                <label>{t('chat.presets.template')}</label>
                <textarea
                  className="preset-template-input"
                  value={form.promptTemplate}
                  onChange={e => setForm(f => ({ ...f, promptTemplate: e.target.value }))}
                  placeholder={t('chat.presets.templatePlaceholder')}
                  rows={4}
                />
                <div className="preset-variable-hint">
                  {t('chat.presets.variableHint')}: {'{box_text}'} {'{box_desc}'} {'{box_colors}'} {'{box_mode}'}
                </div>
              </div>

              <div className="input-group">
                <label>{t('chat.presets.tags')}</label>
                <div className="preset-tags-editor">
                  {form.tags.map(tag => (
                    <span key={tag} className="preset-tag removable">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="preset-tag-remove">✕</button>
                    </span>
                  ))}
                  <div className="preset-tag-input-row">
                    <input
                      type="text"
                      className="preset-tag-input"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                      placeholder={t('chat.presets.addTag')}
                    />
                    <button className="btn btn-small" onClick={addTag}>{t('chat.presets.addTag')}</button>
                  </div>
                </div>
              </div>

              <div className="preset-edit-actions">
                <button className="btn btn-primary" onClick={handleSave}>{t('chat.presets.save')}</button>
                <button className="btn" onClick={cancelEdit}>{t('chat.presets.cancel')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}