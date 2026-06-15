import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';

export default function ImagePreview() {
  const generatedImageUrl = useEditorStore(s => s.generatedImageUrl);
  const generationStatus = useEditorStore(s => s.generationStatus);
  const { t } = useI18n();

  if (generationStatus === 'error') {
    return (
      <div className="panel" style={{ color: '#e74c3c' }}>
        {t('comfyui.generationFailed')}
      </div>
    );
  }

  if (!generatedImageUrl) return null;

  return (
    <div>
      <img
        src={generatedImageUrl}
        alt={t('comfyui.generatedResult')}
        style={{ maxWidth: '100%', maxHeight: 800, borderRadius: 4 }}
      />
    </div>
  );
}