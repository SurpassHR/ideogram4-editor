/** JSON prompt scheme 与各模型独立的 global 设置。 */

export type JsonScheme = 'ideogram4' | 'flux3-layout' | 'moss-layout';

export type MossCanvasKind = 'single' | 'multi_panel' | 'collage';

export interface Flux3Globals {
  /** FLUX 3 的完整英文场景段落；布局 JSON 仍只包含 bbox 行。 */
  fullScenePrompt: string;
  palette: string[];
}

export interface MossGlobals {
  summaryCaption: string;
  meta: string[];
  canvas: MossCanvasKind;
  palette: string[];
}
