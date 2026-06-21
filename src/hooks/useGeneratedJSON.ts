import { useMemo } from 'react';
import { useEditorStore } from '../store';
import type { IdeogramOutput } from '../types';

/**
 * 自定义 hook：订阅 store 中所有影响 JSON 输出的字段，
 * 通过 useMemo 缓存 generateJSON() 的派生结果。
 * 组件只需引入此 hook 即可获得实时同步的 IdeogramOutput。
 */
export function useGeneratedJSON(): IdeogramOutput {
  const boxes = useEditorStore(s => s.boxes);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const globalPalette = useEditorStore(s => s.globalPalette);
  const highLevelDescription = useEditorStore(s => s.highLevelDescription);
  const aesthetics = useEditorStore(s => s.aesthetics);
  const lighting = useEditorStore(s => s.lighting);
  const medium = useEditorStore(s => s.medium);
  const artStyle = useEditorStore(s => s.artStyle);
  const background = useEditorStore(s => s.background);
  const photoArtStyleMode = useEditorStore(s => s.photoArtStyleMode);
  const generateJSON = useEditorStore(s => s.generateJSON);

  return useMemo(
    () => generateJSON(),
    [
      boxes,
      canvasW,
      canvasH,
      globalPalette,
      highLevelDescription,
      aesthetics,
      lighting,
      medium,
      artStyle,
      background,
      photoArtStyleMode,
      generateJSON,
    ],
  );
}
