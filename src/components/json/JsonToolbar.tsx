import { useState } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';

export default function JsonToolbar() {
  const [jsonText, setJsonText] = useState('');
  const generateJSON = useEditorStore(s => s.generateJSON);
  const loadFromJSON = useEditorStore(s => s.loadFromJSON);
  const { t } = useI18n();

  const handleGenerate = () => {
    const output = generateJSON();
    setJsonText(JSON.stringify(output, null, 2));
  };

  const handleLoad = () => {
    try {
      const json = JSON.parse(jsonText);
      loadFromJSON(json);
    } catch (e) {
      alert(t('json.invalidJson', { error: (e as Error).message }));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button className="btn" onClick={handleGenerate}>{t('json.generatePrompt')}</button>
        <button className="btn" onClick={handleLoad}>{t('json.loadFromPasted')}</button>
      </div>
      <textarea
        className="json-textarea"
        value={jsonText}
        onChange={e => setJsonText(e.target.value)}
        placeholder={t('json.placeholder')}
      />
    </div>
  );
}