import { useState } from 'react';
import { useEditorStore } from '../../store';

export default function JsonToolbar() {
  const [jsonText, setJsonText] = useState('');
  const generateJSON = useEditorStore(s => s.generateJSON);
  const loadFromJSON = useEditorStore(s => s.loadFromJSON);

  const handleGenerate = () => {
    const output = generateJSON();
    setJsonText(JSON.stringify(output, null, 2));
  };

  const handleLoad = () => {
    try {
      const json = JSON.parse(jsonText);
      loadFromJSON(json);
    } catch (e) {
      alert('Invalid JSON: ' + (e as Error).message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button className="btn" onClick={handleGenerate}>Generate JSON Prompt</button>
        <button className="btn" onClick={handleLoad}>Load From Pasted JSON</button>
      </div>
      <textarea
        className="json-textarea"
        value={jsonText}
        onChange={e => setJsonText(e.target.value)}
        placeholder="JSON output will appear here..."
      />
    </div>
  );
}