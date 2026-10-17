import { useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { getBuiltinSkills } from '../../skills/builtin-skills';
import { fetchSkillFromUrl } from '../../services/skill-import';
import { getAdapter } from '../../services/skill-adapters';
import {
  DEFAULT_SKILL_ID,
  SKILL_ADAPTER_IDS,
  isSkillAdapterId,
  type SkillAdapterId,
  type SkillRecord,
} from '../../types/skill';
import { IconClose, IconCopy, IconTrash, IconCheck } from '../ui/icons';

interface Props {
  embedded?: boolean;
  onClose?: () => void;
}

/** 安全渲染 SKILL.md 预览 */
function renderMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

function adapterLabel(id: SkillAdapterId): string {
  return getAdapter(id).label;
}

export default function SkillManagerPanel({ embedded, onClose }: Props) {
  const { t } = useI18n();
  const importedSkills = useEditorStore(s => s.importedSkills);
  const skillPrefs = useEditorStore(s => s.skillPrefs);
  const importSkill = useEditorStore(s => s.importSkill);
  const deleteSkill = useEditorStore(s => s.deleteSkill);
  const setActiveSkill = useEditorStore(s => s.setActiveSkill);
  const updateSkillPref = useEditorStore(s => s.updateSkillPref);

  const [expandedId, setExpandedId] = useState<string | null>(DEFAULT_SKILL_ID);
  const [urlValue, setUrlValue] = useState('');
  const [pasteValue, setPasteValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const skills = useMemo(
    () => [...getBuiltinSkills(), ...importedSkills],
    [importedSkills],
  );

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  };

  const handleImportUrl = async () => {
    if (!urlValue.trim()) return;
    setBusy(true);
    const fetched = await fetchSkillFromUrl(urlValue);
    setBusy(false);
    if (!fetched.ok) {
      notify(`${t('skills.importFailed')}: ${fetched.error}`);
      return;
    }
    const result = importSkill({ kind: 'files', files: fetched.files, sourceUrl: fetched.sourceUrl });
    if (!result.ok) {
      notify(`${t('skills.importFailed')}: ${result.error}`);
      return;
    }
    setUrlValue('');
    setExpandedId(result.skill.id);
    notify(t('skills.importSuccess'));
  };

  const handleImportPaste = () => {
    if (!pasteValue.trim()) return;
    const result = importSkill({
      kind: 'markdown',
      markdown: pasteValue,
      name: pasteValue.match(/^name:\s*(.+)$/m)?.[1]?.trim(),
    });
    if (!result.ok) {
      notify(`${t('skills.importFailed')}: ${result.error}`);
      return;
    }
    setPasteValue('');
    setExpandedId(result.skill.id);
    notify(t('skills.importSuccess'));
  };

  const handleImportFiles = async (fileList: FileList | null) => {
    const input = fileList ? Array.from(fileList) : [];
    if (input.length === 0) return;
    const files = await Promise.all(input.map(async file => ({
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      content: await file.text(),
    })));
    const result = importSkill({ kind: 'files', files });
    if (!result.ok) {
      notify(`${t('skills.importFailed')}: ${result.error}`);
      return;
    }
    setExpandedId(result.skill.id);
    notify(t('skills.importSuccess'));
  };

  const handleCopySkillJson = async (skill: SkillRecord) => {
    try {
      await navigator.clipboard?.writeText(JSON.stringify(skill, null, 2));
      notify(t('skills.copied'));
    } catch {
      notify(t('skills.importFailed'));
    }
  };

  const renderDetail = (skill: SkillRecord, referencePaths: string[], enabledRefs: string[]) => (
    <div className="skill-detail">
      <div className="skill-detail-meta">
        <span>{t('skills.adapter')}: {adapterLabel(skill.adapter)}</span>
        <span>{t('skills.license')}: {skill.license ?? '—'}</span>
        <span>{t('skills.version')}: {skill.version ?? '—'}</span>
        <span>{t('skills.filesCount', { count: skill.files.length })}</span>
      </div>

      {skill.sourceUrl && (
        <a className="skill-source-link" href={skill.sourceUrl} target="_blank" rel="noreferrer">
          {skill.sourceUrl}
        </a>
      )}

      <div className="input-group">
        <label>{t('skills.adapter')}</label>
        <select
          className="skill-adapter-select"
          value={skill.adapter}
          disabled={skill.source === 'builtin'}
          onChange={event => {
            const value = event.target.value;
            if (isSkillAdapterId(value)) updateSkillPref(skill.id, { adapter: value });
          }}
        >
          {SKILL_ADAPTER_IDS.map(id => (
            <option key={id} value={id}>{adapterLabel(id)}</option>
          ))}
        </select>
        <p className="skill-hint">{t('skills.adapterHint')}</p>
      </div>

      {referencePaths.length > 0 && (
        <div className="skill-references">
          <div className="skill-references-title">{t('skills.references')}</div>
          <p className="skill-hint">{t('skills.referencesHint')}</p>
          {referencePaths.map(path => (
            <label className="skill-ref-checkbox" key={path}>
              <input
                type="checkbox"
                checked={enabledRefs.includes(path)}
                onChange={() => {
                  const next = enabledRefs.includes(path)
                    ? enabledRefs.filter(p => p !== path)
                    : [...enabledRefs, path];
                  updateSkillPref(skill.id, { enabledReferencePaths: next });
                }}
              />
              <span>{path}</span>
            </label>
          ))}
        </div>
      )}

      <div className="skill-md-preview">
        <div className="skill-md-title">{t('skills.skillMd')}</div>
        <div
          className="skill-markdown"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(skill.files.find(f => f.path === 'SKILL.md')?.content ?? ''),
          }}
        />
      </div>

      <div className="skill-detail-actions">
        <button className="btn btn-primary skill-activate-button" onClick={() => setActiveSkill(skill.id)}>
          {skillPrefs.activeSkillId === skill.id ? <IconCheck size={12} /> : null} {t('skills.setActive')}
        </button>
        <button className="btn skill-copy-button" onClick={() => void handleCopySkillJson(skill)}>
          <IconCopy size={12} /> {t('skills.copyJson')}
        </button>
        {skill.source === 'imported' && (
          <button
            className="btn btn-danger skill-delete-button"
            onClick={() => { deleteSkill(skill.id); notify(t('skills.deleted')); }}
          >
            <IconTrash size={12} /> {t('skills.delete')}
          </button>
        )}
      </div>
    </div>
  );

  const content = (
    <>
      <div className="modal-header">
        <h3>{t('skills.title')}</h3>
        {!embedded && onClose && (
          <button className="modal-close-btn" onClick={onClose}><IconClose size={14} /></button>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="sysprompt-info">{t('skills.info')}</div>

      <div className="skill-import">
        <div className="skill-import-row">
          <input
            className="skill-import-url"
            type="text"
            placeholder={t('skills.importUrlPlaceholder')}
            value={urlValue}
            onChange={event => setUrlValue(event.target.value)}
          />
          <button className="btn btn-primary" onClick={() => void handleImportUrl()} disabled={busy}>
            {busy ? t('skills.importing') : t('skills.importUrl')}
          </button>
        </div>
        <div className="skill-import-row">
          <textarea
            className="skill-import-paste"
            placeholder={t('skills.importPastePlaceholder')}
            value={pasteValue}
            onChange={event => setPasteValue(event.target.value)}
            rows={3}
            spellCheck={false}
          />
        </div>
        <div className="skill-import-row">
          <button className="btn skill-import-paste-button" onClick={handleImportPaste}>
            {t('skills.importPaste')}
          </button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            {t('skills.importFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={event => void handleImportFiles(event.target.files)}
          />
        </div>
        <p className="skill-hint">{t('skills.guide')}</p>
      </div>

      <div className="skill-list">
        {skills.map(skill => {
          const referencePaths = skill.files.filter(f => f.path !== 'SKILL.md').map(f => f.path);
          const enabledRefs = skillPrefs.overrides[skill.id]?.enabledReferencePaths ?? referencePaths;
          const isActive = skillPrefs.activeSkillId === skill.id;

          return (
            <div
              className="skill-card"
              key={skill.id}
              data-skill-id={skill.id}
              data-source={skill.source}
              data-active={isActive}
            >
              <button
                className="skill-detail-toggle"
                onClick={() => setExpandedId(expandedId === skill.id ? null : skill.id)}
              >
                <span className="skill-card-main">
                  <span className="skill-card-name">{skill.displayName}</span>
                  <span className="skill-card-desc">{skill.description}</span>
                </span>
                <span className="skill-card-badge">
                  {skill.source === 'builtin' ? t('skills.builtin') : t('skills.imported')}
                </span>
                <span className="skill-card-adapter">{adapterLabel(skill.adapter)}</span>
                {isActive && <span className="skill-card-active"><IconCheck size={12} /></span>}
              </button>
              {expandedId === skill.id && renderDetail(skill, referencePaths, enabledRefs)}
            </div>
          );
        })}
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content skill-manager-modal" onClick={event => event.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
