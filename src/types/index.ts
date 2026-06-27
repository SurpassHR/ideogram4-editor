export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'obj' | 'text';
  text: string;
  desc: string;
  colors: string[];
  /** Data URL（base64）或 Blob URL，用于在 box 中显示参考图像 */
  imageDataUrl: string | null;
  /** 图像用途：'background' 仅背景展示 | 'reference' 仅 AI 参考 | 'both' 两者 */
  imageRole: 'background' | 'reference' | 'both';
}

export interface IdeogramElement {
  type: string;
  bbox: [number, number, number, number];
  text?: string;
  desc: string;
  color_palette?: string[];
}

export interface IdeogramOutput {
  high_level_description: string;
  /** 画布宽度（像素），LLM 返回时携带此字段使 bbox 能正确适配当前画布 */
  canvasW?: number;
  /** 画布高度（像素），LLM 返回时携带此字段使 bbox 能正确适配当前画布 */
  canvasH?: number;
  style_description: {
    aesthetics: string;
    lighting: string;
    medium?: string;
    art_style?: string;
    photo?: string;
    color_palette: string[];
  };
  compositional_deconstruction: {
    background: string;
    elements: IdeogramElement[];
  };
}

export type InteractionMode = 'idle' | 'drawing' | 'dragging' | 'resizing' | 'pendingSelection' | 'marqueeSelect';

export interface DragInitialBox {
  id: string;
  x: number;
  y: number;
}

export interface InteractionState {
  mode: InteractionMode;
  startX: number;
  startY: number;
  dragStartX: number;
  dragStartY: number;
  initialBoxX: number;
  initialBoxY: number;
  initialBoxW: number;
  initialBoxH: number;
  currentBoxElement: HTMLDivElement | null;
  pendingBoxId: string | null;
  pointerMoved: boolean;
  clickTargetId: string | null;
  lastClickTime: number;
  lastClickBoxId: string | null;
  dragBoxIds: string[];
  initialDragBoxes: DragInitialBox[];
}

export type GenerationStatus = 'idle' | 'generating' | 'polling' | 'done' | 'error';

export const MODE_PHOTO = 0 as const;
export const MODE_ARTSTYLE = 1 as const;
export type PhotoArtStyleMode = typeof MODE_PHOTO | typeof MODE_ARTSTYLE;
