import { create } from 'zustand';
import type { Box, IdeogramOutput, GenerationStatus, PhotoArtStyleMode } from '../types';
import type { ChatMessage } from '../types/chat';
import type { PromptPreset } from '../types/presets';
import { PRESETS_STORAGE_KEY, createBuiltinPresets } from '../types/presets';
import { MODE_ARTSTYLE, MODE_PHOTO } from '../types';
import { computeCanvasDims, type RatioKey } from '../utils/canvas-dims';

// ─── 内部剪贴板（模块级变量，非 OS 剪贴板）──────────────────────────
let internalClipboard: Box | null = null;

// ─── 预设持久化辅助 ────────────────────────────────────────────

/** 从 localStorage 加载预设，首次使用自动初始化内置预设 */
function loadPresetsFromStorage(): PromptPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore corrupt data
  }
  // 首次使用：初始化内置预设并持久化
  const builtins = createBuiltinPresets();
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(builtins));
  return builtins;
}

/** 将预设持久化到 localStorage */
function savePresetsToStorage(presets: PromptPreset[]): void {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

interface EditorStore {
  canvasW: number;
  canvasH: number;
  canvasRatio: string;
  canvasScale: number;
  canvasCustomW: number;
  canvasCustomH: number;
  setCanvasScale: (scale: number) => void;
  setCanvasCustom: (w: number, h: number) => void;
  setCanvasDimensions: (w: number, h: number) => void;
  setCanvasRatio: (ratio: string) => void;
  resetCanvas: () => void;

  boxes: Box[];
  selectedBoxId: string | null;
  boxCounter: number;
  addBox: (box: Omit<Box, 'id'>) => string;
  updateBox: (id: string, updates: Partial<Omit<Box, 'id'>>) => void;
  removeBox: (id: string) => void;
  selectBox: (id: string | null) => void;
  clearBoxes: () => void;

  globalPalette: string[];
  highLevelDescription: string;
  aesthetics: string;
  lighting: string;
  medium: string;
  artStyle: string;
  background: string;
  photoArtStyleMode: PhotoArtStyleMode;
  setGlobalSetting: (key: string, value: string) => void;
  setPhotoArtStyleMode: (mode: PhotoArtStyleMode) => void;
  addGlobalColor: (hex: string) => boolean;
  removeGlobalColor: (hex: string) => void;
  addBoxColor: (hex: string) => boolean;
  removeBoxColor: (hex: string) => void;

  apiUrl: string;
  seed: number;
  setApiUrl: (url: string) => void;
  setSeed: (seed: number) => void;

  generationStatus: GenerationStatus;
  generatedImageUrl: string | null;
  setGenerationStatus: (status: GenerationStatus) => void;
  setGeneratedImageUrl: (url: string | null) => void;

  generateJSON: () => IdeogramOutput;
  loadFromJSON: (json: IdeogramOutput) => void;

  // Chat 状态
  activeChatBoxId: string | null;
  isChatOpen: boolean;
  chatHistories: Record<string, ChatMessage[]>;
  chatModel: string;
  editingBoxId: string | null;
  openChat: (boxId: string) => void;
  closeChat: () => void;
  addChatMessage: (boxId: string, message: ChatMessage) => void;
  markChatMessageAdopted: (boxId: string, messageId: string) => void;
  clearChatHistory: (boxId: string) => void;
  setChatModel: (model: string) => void;
  setEditingBoxId: (id: string | null) => void;

  // Canvas Chat 状态（画布级 AI 构图对话）
  isCanvasChatOpen: boolean;
  canvasChatMessages: ChatMessage[];
  pendingIdeogramOutput: IdeogramOutput | null;
  setCanvasChatOpen: (open: boolean) => void;
  addCanvasChatMessage: (message: ChatMessage) => void;
  setPendingIdeogramOutput: (output: IdeogramOutput | null) => void;
  clearCanvasChat: () => void;

  // LLM 回复语言偏好（persist）
  chatResponseLang: string;
  setChatResponseLang: (lang: string) => void;

  // Image 操作
  importImageToBox: (boxId: string, dataUrl: string) => void;
  clearBoxImage: (boxId: string) => void;

  // 预设状态
  chatPresets: PromptPreset[];
  addPreset: (preset: Omit<PromptPreset, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updatePreset: (id: string, updates: Partial<Omit<PromptPreset, 'id'>>) => void;
  deletePreset: (id: string) => void;

  // 画布背景图
  canvasBackgroundUrl: string | null;
  setCanvasBackgroundUrl: (url: string | null) => void;

  // 框操作（右键菜单 + 键盘快捷键）
  duplicateBox: (boxId: string) => void;
  cutBox: (boxId: string) => void;
  copyBox: (boxId: string) => void;
  pasteBox: (x?: number, y?: number) => void;
  bringToFront: (boxId: string) => void;
  sendToBack: (boxId: string) => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  canvasW: 1024,
  canvasH: 1024,
  canvasRatio: '1:1',
  canvasScale: 4,
  canvasCustomW: 16,
  canvasCustomH: 9,

  setCanvasDimensions: (w, h) => set({
    canvasW: w,
    canvasH: h,
  }),

  setCanvasRatio: (ratio) => {
    const state = get();
    const { w, h } = computeCanvasDims(ratio as RatioKey, state.canvasScale, state.canvasCustomW, state.canvasCustomH);
    set({ canvasRatio: ratio, canvasW: w, canvasH: h });
  },
  setCanvasScale: (scale) => {
    const state = get();
    const { w, h } = computeCanvasDims(state.canvasRatio as RatioKey, scale, state.canvasCustomW, state.canvasCustomH);
    set({ canvasScale: scale, canvasW: w, canvasH: h });
  },

  setCanvasCustom: (w, h) => {
    const state = get();
    const { w: newW, h: newH } = computeCanvasDims(state.canvasRatio as RatioKey, state.canvasScale, w, h);
    set({ canvasCustomW: w, canvasCustomH: h, canvasW: newW, canvasH: newH });
  },

  resetCanvas: () => set({
    boxes: [],
    selectedBoxId: null,
    generatedImageUrl: null,
    generationStatus: 'idle',
  }),

  boxes: [],
  selectedBoxId: null,
  boxCounter: 0,

  addBox: (box) => {
    const state = get();
    const id = `box_${state.boxCounter}`;
    set({
      boxes: [...state.boxes, { ...box, id }],
      selectedBoxId: id,
      boxCounter: state.boxCounter + 1,
    });
    return id;
  },

  updateBox: (id, updates) => set(state => ({
    boxes: state.boxes.map(b => b.id === id ? { ...b, ...updates } : b),
  })),

  removeBox: (id) => {
    const state = get();
    const newHistories = { ...state.chatHistories };
    delete newHistories[id];
    set({
      boxes: state.boxes.filter(b => b.id !== id),
      selectedBoxId: state.selectedBoxId === id ? null : state.selectedBoxId,
      activeChatBoxId: state.activeChatBoxId === id ? null : state.activeChatBoxId,
      isChatOpen: state.activeChatBoxId === id ? false : state.isChatOpen,
      chatHistories: newHistories,
    });
  },

  selectBox: (id) => set(state => ({
    selectedBoxId: id,
    ...(state.activeChatBoxId && state.activeChatBoxId !== id
      ? { isChatOpen: false, activeChatBoxId: null }
      : {}),
  })),

  clearBoxes: () => set({ boxes: [], selectedBoxId: null }),

  globalPalette: [],
  highLevelDescription: '',
  aesthetics: '',
  lighting: '',
  medium: '',
  artStyle: '',
  background: '',
  photoArtStyleMode: MODE_ARTSTYLE,

  setGlobalSetting: (key, value) => set({ [key]: value }),

  setPhotoArtStyleMode: (mode) => set({
    photoArtStyleMode: mode,
    ...(mode === MODE_PHOTO ? { medium: 'photograph' } : {}),
  }),

  addGlobalColor: (hex) => {
    const upper = hex.toUpperCase();
    const state = get();
    if (state.globalPalette.length >= 16) return false;
    if (state.globalPalette.includes(upper)) return false;
    set({ globalPalette: [...state.globalPalette, upper] });
    return true;
  },

  removeGlobalColor: (hex) => set(state => ({
    globalPalette: state.globalPalette.filter(c => c !== hex),
  })),

  addBoxColor: (hex) => {
    const upper = hex.toUpperCase();
    const state = get();
    if (!state.selectedBoxId) return false;
    const box = state.boxes.find(b => b.id === state.selectedBoxId);
    if (!box) return false;
    if (box.colors.length >= 5) return false;
    if (box.colors.includes(upper)) return false;
    set({
      boxes: state.boxes.map(b =>
        b.id === state.selectedBoxId ? { ...b, colors: [...b.colors, upper] } : b
      ),
    });
    return true;
  },

  removeBoxColor: (hex) => set(state => ({
    boxes: state.boxes.map(b =>
      b.id === state.selectedBoxId
        ? { ...b, colors: b.colors.filter(c => c !== hex) }
        : b
    ),
  })),

  apiUrl: 'http://localhost:8188',
  seed: 42,
  setApiUrl: (url) => set({ apiUrl: url }),
  setSeed: (seed) => set({ seed }),

  generationStatus: 'idle',
  generatedImageUrl: null,
  setGenerationStatus: (status) => set({ generationStatus: status }),
  setGeneratedImageUrl: (url) => set({ generatedImageUrl: url }),

  // Chat 状态
  activeChatBoxId: null,
  isChatOpen: false,
  chatHistories: {},
  chatModel: localStorage.getItem('ideogram4-chat-model') || '',
  editingBoxId: null,

  openChat: (boxId) => set({ activeChatBoxId: boxId, isChatOpen: true }),

  closeChat: () => set({ isChatOpen: false, activeChatBoxId: null }),

  addChatMessage: (boxId, message) => set(state => ({
    chatHistories: {
      ...state.chatHistories,
      [boxId]: [...(state.chatHistories[boxId] || []), message],
    },
  })),

  markChatMessageAdopted: (boxId, messageId) => set(state => ({
    chatHistories: {
      ...state.chatHistories,
      [boxId]: (state.chatHistories[boxId] || []).map(m =>
        m.id === messageId ? { ...m, adopted: true } : m
      ),
    },
  })),

  clearChatHistory: (boxId) => set(state => ({
    chatHistories: {
      ...state.chatHistories,
      [boxId]: [],
    },
  })),

  setChatModel: (model) => {
    localStorage.setItem('ideogram4-chat-model', model);
    set({ chatModel: model });
  },

  setEditingBoxId: (id) => set({ editingBoxId: id }),

  // Canvas Chat 状态（画布级 AI 构图对话）
  isCanvasChatOpen: false,
  canvasChatMessages: [],
  pendingIdeogramOutput: null,

  setCanvasChatOpen: (open) => set({ isCanvasChatOpen: open }),

  addCanvasChatMessage: (message) => set(state => ({
    canvasChatMessages: [...state.canvasChatMessages, message],
  })),

  setPendingIdeogramOutput: (output) => set({ pendingIdeogramOutput: output }),

  clearCanvasChat: () => set({
    canvasChatMessages: [],
    pendingIdeogramOutput: null,
  }),

  // LLM 回复语言偏好
  chatResponseLang: localStorage.getItem('ideogram4-chat-lang') || 'auto',
  setChatResponseLang: (lang) => {
    localStorage.setItem('ideogram4-chat-lang', lang);
    set({ chatResponseLang: lang });
  },

  // Image 操作
  importImageToBox: (boxId, dataUrl) => set(state => ({
    boxes: state.boxes.map(b => b.id === boxId ? { ...b, imageDataUrl: dataUrl } : b),
  })),

  clearBoxImage: (boxId) => set(state => ({
    boxes: state.boxes.map(b => b.id === boxId ? { ...b, imageDataUrl: null } : b),
  })),

  // 预设
  chatPresets: loadPresetsFromStorage(),

  addPreset: (preset) => {
    const state = get();
    const now = Date.now();
    const id = `preset_${now}`;
    const newPreset: PromptPreset = {
      ...preset,
      id,
      createdAt: now,
      updatedAt: now,
    };
    const newPresets = [...state.chatPresets, newPreset];
    savePresetsToStorage(newPresets);
    set({ chatPresets: newPresets });
  },

  updatePreset: (id, updates) => {
    const state = get();
    const newPresets = state.chatPresets.map(p =>
      p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p,
    );
    savePresetsToStorage(newPresets);
    set({ chatPresets: newPresets });
  },

  deletePreset: (id) => {
    const state = get();
    const newPresets = state.chatPresets.filter(p => p.id !== id);
    savePresetsToStorage(newPresets);
    set({ chatPresets: newPresets });
  },

  // ─── 画布背景图 ─────────────────────────────────────────────
  canvasBackgroundUrl: null,
  setCanvasBackgroundUrl: (url) => set({ canvasBackgroundUrl: url }),

  // ─── 框操作（右键菜单 + 键盘快捷键）────────────────────────

  duplicateBox: (boxId) => {
    const state = get();
    const box = state.boxes.find(b => b.id === boxId);
    if (!box) return;
    const newId = `box_${state.boxCounter}`;
    const newBox: Box = {
      ...box,
      id: newId,
      x: box.x + 20,
      y: box.y + 20,
    };
    set({
      boxes: [...state.boxes, newBox],
      selectedBoxId: newId,
      boxCounter: state.boxCounter + 1,
    });
  },

  cutBox: (boxId) => {
    const state = get();
    const box = state.boxes.find(b => b.id === boxId);
    if (!box) return;
    internalClipboard = { ...box };
    const newHistories = { ...state.chatHistories };
    delete newHistories[boxId];
    set({
      boxes: state.boxes.filter(b => b.id !== boxId),
      selectedBoxId: state.selectedBoxId === boxId ? null : state.selectedBoxId,
      activeChatBoxId: state.activeChatBoxId === boxId ? null : state.activeChatBoxId,
      isChatOpen: state.activeChatBoxId === boxId ? false : state.isChatOpen,
      chatHistories: newHistories,
    });
  },

  copyBox: (boxId) => {
    const state = get();
    const box = state.boxes.find(b => b.id === boxId);
    if (!box) return;
    internalClipboard = { ...box };
  },

  pasteBox: (x, y) => {
    if (!internalClipboard) return;
    const state = get();
    const newId = `box_${state.boxCounter}`;
    const newBox: Box = {
      ...internalClipboard,
      id: newId,
      x: x ?? internalClipboard.x + 20,
      y: y ?? internalClipboard.y + 20,
    };
    set({
      boxes: [...state.boxes, newBox],
      selectedBoxId: newId,
      boxCounter: state.boxCounter + 1,
    });
  },

  bringToFront: (boxId) => {
    set(state => {
      const idx = state.boxes.findIndex(b => b.id === boxId);
      if (idx === -1 || idx === state.boxes.length - 1) return state;
      const newBoxes = [...state.boxes];
      const [box] = newBoxes.splice(idx, 1);
      newBoxes.push(box);
      return { boxes: newBoxes };
    });
  },

  sendToBack: (boxId) => {
    set(state => {
      const idx = state.boxes.findIndex(b => b.id === boxId);
      if (idx === -1 || idx === 0) return state;
      const newBoxes = [...state.boxes];
      const [box] = newBoxes.splice(idx, 1);
      newBoxes.unshift(box);
      return { boxes: newBoxes };
    });
  },

  generateJSON: () => {
    const state = get();
    const { canvasW, canvasH, boxes, globalPalette, highLevelDescription, aesthetics, lighting, medium, artStyle, background, photoArtStyleMode } = state;

    const norm = (val: number, max: number) => Math.min(1000, Math.max(0, Math.round((val / max) * 1000)));

    const elements = boxes.map(box => {
      const x1 = norm(box.x, canvasW);
      const y1 = norm(box.y, canvasH);
      const x2 = norm(box.x + box.w, canvasW);
      const y2 = norm(box.y + box.h, canvasH);

      const el: Record<string, unknown> = {
        type: box.mode,
        bbox: [y1, x1, y2, x2],
      };

      if (box.mode === 'text') el.text = box.text;
      el.desc = box.desc;
      if (box.colors && box.colors.length > 0) el.color_palette = box.colors;

      return el;
    });

    const styleDescription: Record<string, unknown> = {
      aesthetics,
      lighting,
      color_palette: globalPalette,
    };

    if (photoArtStyleMode === MODE_PHOTO) {
      styleDescription.photo = artStyle;
      styleDescription.medium = medium;
    } else {
      styleDescription.medium = medium;
      styleDescription.art_style = artStyle;
    }

    return {
      high_level_description: highLevelDescription,
      canvasW,
      canvasH,
      style_description: styleDescription as IdeogramOutput['style_description'],
      compositional_deconstruction: {
        background,
        elements: elements as unknown as IdeogramOutput['compositional_deconstruction']['elements'],
      },
    };
  },

  loadFromJSON: (json) => {
    const state = get();
    // 优先使用 JSON 内嵌的画布尺寸，fallback 到 store 当前值
    const cw = json.canvasW ?? state.canvasW;
    const ch = json.canvasH ?? state.canvasH;

    const denorm = (val: number, max: number) => (val / 1000) * max;

    const newBoxes: Box[] = [];
    let counter = 0;

    for (const el of json.compositional_deconstruction.elements) {
      const [y1, x1, y2, x2] = el.bbox;
      newBoxes.push({
        id: `box_${counter}`,
        x: denorm(x1, cw),
        y: denorm(y1, ch),
        w: denorm(x2 - x1, cw),
        h: denorm(y2 - y1, ch),
        mode: el.type,
        text: el.text || '',
        desc: el.desc || '',
        colors: el.color_palette || [],
        imageDataUrl: null,
        imageRole: 'both',
      });
      counter++;
    }

    const sd = json.style_description;
    const mode: PhotoArtStyleMode = 'photo' in sd ? MODE_PHOTO : MODE_ARTSTYLE;

    set({
      boxes: newBoxes,
      boxCounter: counter,
      selectedBoxId: null,
      highLevelDescription: json.high_level_description || '',
      aesthetics: sd.aesthetics || '',
      lighting: sd.lighting || '',
      medium: (mode === MODE_PHOTO ? (sd.photo as string) || '' : sd.medium || ''),
      artStyle: (mode === MODE_PHOTO ? sd.medium || '' : sd.art_style || ''),
      background: json.compositional_deconstruction.background || '',
      globalPalette: sd.color_palette || [],
      photoArtStyleMode: mode,
    });
  },
}));
