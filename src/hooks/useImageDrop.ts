import { useEffect } from 'react';
import { useEditorStore } from '../store';
import { extractComfyUIMetadata } from '../utils/png-metadata';
import type { IdeogramOutput } from '../types';

export function useImageDrop() {
  const setCanvasDimensions = useEditorStore(s => s.setCanvasDimensions);
  const setGeneratedImageUrl = useEditorStore(s => s.setGeneratedImageUrl);
  const loadFromJSON = useEditorStore(s => s.loadFromJSON);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        alert('Please drop an image file.');
        return;
      }

      const imgUrl = URL.createObjectURL(file);
      setGeneratedImageUrl(imgUrl);

      const img = new Image();
      img.onload = () => {
        setCanvasDimensions(img.width, img.height);
      };
      img.src = imgUrl;

      if (file.type === 'image/png') {
        try {
          const buffer = await file.arrayBuffer();
          const json = extractComfyUIMetadata(buffer);
          if (json.prompt && typeof json.prompt === 'object' && 'high_level_description' in (json.prompt as Record<string, unknown>)) {
            loadFromJSON(json.prompt as IdeogramOutput);
          }
        } catch {
          // Not a PNG with embedded metadata - that's fine, image just displays
        }
      }
    };

    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);

    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, [setCanvasDimensions, setGeneratedImageUrl, loadFromJSON]);
}