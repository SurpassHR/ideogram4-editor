import { create } from 'zustand';
import type { Box, IdeogramOutput, GenerationStatus, PhotoArtStyleMode } from '../types';
import type { ChatMessage } from '../types/chat';
import { MODE_ARTSTYLE, MODE_PHOTO } from '../types';

interface EditorStore {
  canvasW: number;
  canvasH: number;
  setCanvasDimensions: (w: number, h: number) => void;
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
  openChat: (boxId: string) => void;
  closeChat: () => void;
  addChatMessage: (boxId: string, message: ChatMessage) => void;
  markChatMessageAdopted: (boxId: string, messageId: string) => void;
  clearChatHistory: (boxId: string) => void;
  setChatModel: (model: string) => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  canvasW: 1024,
  canvasH: 1024,

  setCanvasDimensions: (w, h) => set({
    canvasW: w,
    canvasH: h,
  }),

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
      style_description: styleDescription as IdeogramOutput['style_description'],
      compositional_deconstruction: {
        background,
        elements: elements as unknown as IdeogramOutput['compositional_deconstruction']['elements'],
      },
    };
  },

  loadFromJSON: (json) => {
    const state = get();
    const { canvasW, canvasH } = state;

    const denorm = (val: number, max: number) => (val / 1000) * max;

    const newBoxes: Box[] = [];
    let counter = 0;

    for (const el of json.compositional_deconstruction.elements) {
      const [y1, x1, y2, x2] = el.bbox;
      newBoxes.push({
        id: `box_${counter}`,
        x: denorm(x1, canvasW),
        y: denorm(y1, canvasH),
        w: denorm(x2 - x1, canvasW),
        h: denorm(y2 - y1, canvasH),
        mode: el.type,
        text: el.text || '',
        desc: el.desc || '',
        colors: el.color_palette || [],
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
