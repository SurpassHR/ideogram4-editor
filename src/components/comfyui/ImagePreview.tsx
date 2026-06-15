import { useEditorStore } from '../../store';

export default function ImagePreview() {
  const generatedImageUrl = useEditorStore(s => s.generatedImageUrl);
  const generationStatus = useEditorStore(s => s.generationStatus);

  if (generationStatus === 'error') {
    return (
      <div className="panel" style={{ color: '#e74c3c' }}>
        Generation failed. Check the console for details.
      </div>
    );
  }

  if (!generatedImageUrl) return null;

  return (
    <div>
      <img
        src={generatedImageUrl}
        alt="Generated result"
        style={{ maxWidth: '100%', maxHeight: 800, borderRadius: 4 }}
      />
    </div>
  );
}