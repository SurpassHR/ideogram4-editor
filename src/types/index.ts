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
}

export interface IdeogramElement {
  type: 'obj' | 'text';
  bbox: [number, number, number, number];
  text?: string;
  desc: string;
  color_palette?: string[];
}

export interface IdeogramOutput {
  high_level_description: string;
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

export type InteractionMode = 'idle' | 'drawing' | 'dragging' | 'resizing';

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
}

export type GenerationStatus = 'idle' | 'generating' | 'polling' | 'done' | 'error';

export const MODE_PHOTO = 0 as const;
export const MODE_ARTSTYLE = 1 as const;
export type PhotoArtStyleMode = typeof MODE_PHOTO | typeof MODE_ARTSTYLE;