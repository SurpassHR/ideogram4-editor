import { create } from 'zustand';
import type { Box, IdeogramOutput, GenerationStatus, PhotoArtStyleMode } from '../types';
import type { CanvasChatRequestLogStep, CanvasChatSession, ChatMessage } from '../types/chat';
import type { PromptPreset } from '../types/presets';
import { PRESETS_STORAGE_KEY, createBuiltinPresets } from '../types/presets';
import { MODE_ARTSTYLE, MODE_PHOTO } from '../types';
import { computeCanvasDims, type RatioKey } from '../utils/canvas-dims';
import { detectBboxSystem, bboxToPixels } from '../utils/coordinates';
import type { LayoutQualityReport } from '../services/layout-validator';

// ─── 内部剪贴板（模块级变量，非 OS 剪贴板）──────────────────────────
let internalClipboard: Box[] = [];

function normalizeSelection(ids: string[], boxes: Box[]): string[] {
  const existingIds = new Set(boxes.map(box => box.id));
  return Array.from(new Set(ids)).filter(id => existingIds.has(id));
}

function selectionState(ids: string[], boxes: Box[]) {
  const selectedBoxIds = normalizeSelection(ids, boxes);
  return {
    selectedBoxIds,
    selectedBoxId: selectedBoxIds.length === 1 ? selectedBoxIds[0] : null,
  };
}

function uncheckedSelectionState(ids: string[]) {
  const selectedBoxIds = Array.from(new Set(ids));
  return {
    selectedBoxIds,
    selectedBoxId: selectedBoxIds.length === 1 ? selectedBoxIds[0] : null,
  };
}

function idsFromInput(ids: string | string[]): string[] {
  return Array.isArray(ids) ? ids : [ids];
}

function generateCanvasChatId(prefix: string): string {
  const hex = Math.random().toString(16).slice(2, 6);
  return `${prefix}_${Date.now()}_${hex}`;
}

function createCanvasChatSessionRecord(title = '新会话'): CanvasChatSession {
  const now = Date.now();
  return {
    id: generateCanvasChatId('canvas_session'),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    pendingIdeogramOutput: null,
    pendingQualityReport: null,
    requestLogs: [],
  };
}

const initialCanvasChatSession = createCanvasChatSessionRecord();

function canvasChatTitleFromMessage(message: ChatMessage): string {
  const text = message.content.trim();
  if (!text) return '新会话';
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}

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
  selectedBoxIds: string[];
  boxCounter: number;
  addBox: (box: Omit<Box, 'id'>) => string;
  updateBox: (id: string, updates: Partial<Omit<Box, 'id'>>) => void;
  removeBox: (id: string | string[]) => void;
  selectBox: (id: string | null) => void;
  selectBoxes: (ids: string[]) => void;
  toggleBoxSelection: (id: string) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
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
  updateChatHistoryMessage: (boxId: string, messageId: string, updates: Partial<ChatMessage>) => void;

  clearChatHistory: (boxId: string) => void;
  setChatModel: (model: string) => void;
  setEditingBoxId: (id: string | null) => void;

  // Canvas Chat 状态（画布级 AI 构图对话）
  isCanvasChatOpen: boolean;
  isCanvasChatMaximized: boolean;
  canvasChatSessions: CanvasChatSession[];
  activeCanvasChatSessionId: string;
  activeCanvasChatRequestId: string | null;
  canvasChatMessages: ChatMessage[];
  pendingIdeogramOutput: IdeogramOutput | null;
  createCanvasChatSession: (title?: string) => string;
  selectCanvasChatSession: (sessionId: string) => void;
  setCanvasChatMaximized: (maximized: boolean) => void;
  setCanvasChatOpen: (open: boolean) => void;
  addCanvasChatMessage: (message: ChatMessage) => void;
  setPendingIdeogramOutput: (output: IdeogramOutput | null) => void;
  clearCanvasChat: () => void;
  isCanvasChatLoading: boolean;
  setCanvasChatLoading: (loading: boolean) => void;
  updateCanvasChatMessage: (messageId: string, updates: Partial<Omit<ChatMessage, 'id'>>) => void;
  startCanvasChatRequest: (promptPreview: string) => string;
  appendCanvasChatRequestStep: (
    requestId: string,
    step: Omit<CanvasChatRequestLogStep, 'id' | 'at'>,
  ) => void;
  finishCanvasChatRequest: (requestId: string, status: 'success' | 'error', detail?: string) => void;

  // 布局质量检测结果
  pendingQualityReport: LayoutQualityReport | null;
  setPendingQualityReport: (report: LayoutQualityReport | null) => void;

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

  // 快捷键速查弹窗
  isShortcutsModalOpen: boolean;
  setShortcutsModalOpen: (open: boolean) => void;

  // 框操作（右键菜单 + 键盘快捷键）
  duplicateBox: (boxId: string | string[]) => void;
  cutBox: (boxId: string | string[]) => void;
  copyBox: (boxId: string | string[]) => void;
  pasteBox: (x?: number, y?: number) => void;
  bringToFront: (boxId: string | string[]) => void;
  sendToBack: (boxId: string | string[]) => void;
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
    selectedBoxIds: [],
    generatedImageUrl: null,
    generationStatus: 'idle',
  }),

  boxes: [],
  selectedBoxId: null,
  selectedBoxIds: [],
  boxCounter: 0,

  addBox: (box) => {
    const state = get();
    const id = `box_${state.boxCounter}`;
    set({
      boxes: [...state.boxes, { ...box, id }],
      selectedBoxId: id,
      selectedBoxIds: [id],
      boxCounter: state.boxCounter + 1,
    });
    return id;
  },

  updateBox: (id, updates) => set(state => ({
    boxes: state.boxes.map(b => b.id === id ? { ...b, ...updates } : b),
  })),

  removeBox: (id) => {
    const state = get();
    const ids = idsFromInput(id);
    const idSet = new Set(ids);
    const newHistories = { ...state.chatHistories };
    ids.forEach(boxId => delete newHistories[boxId]);
    const boxes = state.boxes.filter(b => !idSet.has(b.id));
    const nextSelection = selectionState(
      state.selectedBoxIds.filter(boxId => !idSet.has(boxId)),
      boxes,
    );
    const activeChatDeleted = state.activeChatBoxId ? idSet.has(state.activeChatBoxId) : false;
    set({
      boxes,
      ...nextSelection,
      activeChatBoxId: activeChatDeleted ? null : state.activeChatBoxId,
      isChatOpen: activeChatDeleted ? false : state.isChatOpen,
      editingBoxId: state.editingBoxId && idSet.has(state.editingBoxId) ? null : state.editingBoxId,
      chatHistories: newHistories,
    });
  },

  selectBox: (id) => set(state => ({
    ...uncheckedSelectionState(id ? [id] : []),
    ...(state.activeChatBoxId && state.activeChatBoxId !== id
      ? { isChatOpen: false, activeChatBoxId: null }
      : {}),
  })),

  selectBoxes: (ids) => set(state => {
    const nextSelection = selectionState(ids, state.boxes);
    const activeStillSelected = state.activeChatBoxId
      ? nextSelection.selectedBoxIds.includes(state.activeChatBoxId)
      : true;
    return {
      ...nextSelection,
      ...(!activeStillSelected ? { isChatOpen: false, activeChatBoxId: null } : {}),
    };
  }),

  toggleBoxSelection: (id) => set(state => {
    const selectedBoxIds = state.selectedBoxIds.includes(id)
      ? state.selectedBoxIds.filter(selectedId => selectedId !== id)
      : [...state.selectedBoxIds, id];
    return selectionState(selectedBoxIds, state.boxes);
  }),

  addToSelection: (id) => set(state => selectionState([...state.selectedBoxIds, id], state.boxes)),

  removeFromSelection: (id) => set(state => selectionState(
    state.selectedBoxIds.filter(selectedId => selectedId !== id),
    state.boxes,
  )),

  clearSelection: () => set(state => ({
    ...selectionState([], state.boxes),
    ...(state.activeChatBoxId ? { isChatOpen: false, activeChatBoxId: null } : {}),
  })),

  clearBoxes: () => set({ boxes: [], selectedBoxId: null, selectedBoxIds: [] }),

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
    if (state.globalPalette.length >= 5) return false;
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

  updateChatHistoryMessage: (boxId, messageId, updates) => set(state => ({
    chatHistories: {
      ...state.chatHistories,
      [boxId]: (state.chatHistories[boxId] || []).map(m =>
        m.id === messageId ? { ...m, ...updates } : m
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
  isCanvasChatMaximized: false,
  canvasChatSessions: [initialCanvasChatSession],
  activeCanvasChatSessionId: initialCanvasChatSession.id,
  activeCanvasChatRequestId: null,
  canvasChatMessages: [],
  isCanvasChatLoading: false,
  pendingIdeogramOutput: null,

  createCanvasChatSession: (title) => {
    const session = createCanvasChatSessionRecord(title);
    set(state => ({
      canvasChatSessions: [...state.canvasChatSessions, session],
      activeCanvasChatSessionId: session.id,
      activeCanvasChatRequestId: null,
      canvasChatMessages: [],
      pendingIdeogramOutput: null,
      pendingQualityReport: null,
    }));
    return session.id;
  },

  selectCanvasChatSession: (sessionId) => set(state => {
    const session = state.canvasChatSessions.find(s => s.id === sessionId);
    if (!session) return {};
    return {
      activeCanvasChatSessionId: session.id,
      activeCanvasChatRequestId: null,
      canvasChatMessages: session.messages,
      pendingIdeogramOutput: session.pendingIdeogramOutput,
      pendingQualityReport: session.pendingQualityReport,
    };
  }),

  setCanvasChatMaximized: (maximized) => set({ isCanvasChatMaximized: maximized }),

  setCanvasChatOpen: (open) => set({ isCanvasChatOpen: open }),

  addCanvasChatMessage: (message) => set(state => {
    const nextMessages = [...state.canvasChatMessages, message];
    return {
      canvasChatMessages: nextMessages,
      canvasChatSessions: state.canvasChatSessions.map(session => {
        if (session.id !== state.activeCanvasChatSessionId) return session;
        const shouldUpdateTitle = session.messages.length === 0 && message.role === 'user';
        return {
          ...session,
          title: shouldUpdateTitle ? canvasChatTitleFromMessage(message) : session.title,
          updatedAt: Date.now(),
          messages: [...session.messages, message],
        };
      }),
    };
  }),

  setPendingIdeogramOutput: (output) => set(state => ({
    pendingIdeogramOutput: output,
    canvasChatSessions: state.canvasChatSessions.map(session =>
      session.id === state.activeCanvasChatSessionId
        ? { ...session, pendingIdeogramOutput: output, updatedAt: Date.now() }
        : session
    ),
  })),

  clearCanvasChat: () => set(state => ({
    canvasChatMessages: [],
    pendingIdeogramOutput: null,
    pendingQualityReport: null,
    activeCanvasChatRequestId: null,
    canvasChatSessions: state.canvasChatSessions.map(session =>
      session.id === state.activeCanvasChatSessionId
        ? {
            ...session,
            updatedAt: Date.now(),
            messages: [],
            pendingIdeogramOutput: null,
            pendingQualityReport: null,
            requestLogs: [],
          }
        : session
    ),
  })),
  setCanvasChatLoading: (loading) => set({ isCanvasChatLoading: loading }),
  updateCanvasChatMessage: (messageId, updates) => set(state => ({
    canvasChatMessages: state.canvasChatMessages.map(m =>
      m.id === messageId ? { ...m, ...updates } : m
    ),
    canvasChatSessions: state.canvasChatSessions.map(session => {
      if (session.id !== state.activeCanvasChatSessionId) return session;
      return {
        ...session,
        updatedAt: Date.now(),
        messages: session.messages.map(m =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      };
    }),
  })),

  startCanvasChatRequest: (promptPreview) => {
    const requestId = generateCanvasChatId('canvas_request');
    const now = Date.now();
    set(state => ({
      activeCanvasChatRequestId: requestId,
      canvasChatSessions: state.canvasChatSessions.map(session =>
        session.id === state.activeCanvasChatSessionId
          ? {
              ...session,
              updatedAt: now,
              requestLogs: [
                ...session.requestLogs,
                {
                  id: requestId,
                  sessionId: session.id,
                  promptPreview,
                  status: 'running',
                  startedAt: now,
                  steps: [],
                },
              ],
            }
          : session
      ),
    }));
    return requestId;
  },

  appendCanvasChatRequestStep: (requestId, step) => {
    const logStep: CanvasChatRequestLogStep = {
      ...step,
      id: generateCanvasChatId('canvas_step'),
      at: Date.now(),
    };
    set(state => ({
      canvasChatSessions: state.canvasChatSessions.map(session => ({
        ...session,
        requestLogs: session.requestLogs.map(log =>
          log.id === requestId
            ? { ...log, steps: [...log.steps, logStep] }
            : log
        ),
      })),
    }));
  },

  finishCanvasChatRequest: (requestId, status, detail) => set(state => ({
    canvasChatSessions: state.canvasChatSessions.map(session => ({
      ...session,
      requestLogs: session.requestLogs.map(log =>
        log.id === requestId
          ? {
              ...log,
              status,
              endedAt: Date.now(),
              steps: detail
                ? [
                    ...log.steps,
                    {
                      id: generateCanvasChatId('canvas_step'),
                      at: Date.now(),
                      kind: status === 'success' ? 'done' : 'error',
                      status,
                      label: status === 'success' ? 'Request completed' : 'Request failed',
                      detail,
                    },
                  ]
                : log.steps,
            }
          : log
      ),
    })),
  })),

  // 布局质量检测结果
  pendingQualityReport: null,
  setPendingQualityReport: (report) => set(state => ({
    pendingQualityReport: report,
    canvasChatSessions: state.canvasChatSessions.map(session =>
      session.id === state.activeCanvasChatSessionId
        ? { ...session, pendingQualityReport: report, updatedAt: Date.now() }
        : session
    ),
  })),

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

  // ─── 快捷键速查弹窗 ─────────────────────────────────────────
  isShortcutsModalOpen: false,
  setShortcutsModalOpen: (open) => set({ isShortcutsModalOpen: open }),

  // ─── 框操作（右键菜单 + 键盘快捷键）────────────────────────

  duplicateBox: (boxId) => {
    const state = get();
    const idSet = new Set(idsFromInput(boxId));
    const sourceBoxes = state.boxes.filter(b => idSet.has(b.id));
    if (sourceBoxes.length === 0) return;
    const newBoxes = sourceBoxes.map((box, index): Box => ({
      ...box,
      id: `box_${state.boxCounter + index}`,
      x: box.x + 20,
      y: box.y + 20,
    }));
    set({
      boxes: [...state.boxes, ...newBoxes],
      ...selectionState(newBoxes.map(box => box.id), [...state.boxes, ...newBoxes]),
      boxCounter: state.boxCounter + newBoxes.length,
    });
  },

  cutBox: (boxId) => {
    const state = get();
    const idSet = new Set(idsFromInput(boxId));
    const sourceBoxes = state.boxes.filter(b => idSet.has(b.id));
    if (sourceBoxes.length === 0) return;
    internalClipboard = sourceBoxes.map(box => ({ ...box }));
    const newHistories = { ...state.chatHistories };
    sourceBoxes.forEach(box => delete newHistories[box.id]);
    const boxes = state.boxes.filter(b => !idSet.has(b.id));
    const activeChatDeleted = state.activeChatBoxId ? idSet.has(state.activeChatBoxId) : false;
    set({
      boxes,
      ...selectionState(
        state.selectedBoxIds.filter(id => !idSet.has(id)),
        boxes,
      ),
      activeChatBoxId: activeChatDeleted ? null : state.activeChatBoxId,
      isChatOpen: activeChatDeleted ? false : state.isChatOpen,
      editingBoxId: state.editingBoxId && idSet.has(state.editingBoxId) ? null : state.editingBoxId,
      chatHistories: newHistories,
    });
  },

  copyBox: (boxId) => {
    const state = get();
    const idSet = new Set(idsFromInput(boxId));
    const sourceBoxes = state.boxes.filter(b => idSet.has(b.id));
    if (sourceBoxes.length === 0) return;
    internalClipboard = sourceBoxes.map(box => ({ ...box }));
  },

  pasteBox: (x, y) => {
    if (internalClipboard.length === 0) return;
    const state = get();
    const first = internalClipboard[0];
    const baseX = x ?? first.x + 20;
    const baseY = y ?? first.y + 20;
    const newBoxes = internalClipboard.map((box, index): Box => ({
      ...box,
      id: `box_${state.boxCounter + index}`,
      x: baseX + (box.x - first.x),
      y: baseY + (box.y - first.y),
    }));
    set({
      boxes: [...state.boxes, ...newBoxes],
      ...selectionState(newBoxes.map(box => box.id), [...state.boxes, ...newBoxes]),
      boxCounter: state.boxCounter + newBoxes.length,
    });
  },

  bringToFront: (boxId) => {
    set(state => {
      const idSet = new Set(idsFromInput(boxId));
      const selected = state.boxes.filter(b => idSet.has(b.id));
      if (selected.length === 0) return state;
      const rest = state.boxes.filter(b => !idSet.has(b.id));
      const newBoxes = [...rest, ...selected];
      return { boxes: newBoxes };
    });
  },

  sendToBack: (boxId) => {
    set(state => {
      const idSet = new Set(idsFromInput(boxId));
      const selected = state.boxes.filter(b => idSet.has(b.id));
      if (selected.length === 0) return state;
      const rest = state.boxes.filter(b => !idSet.has(b.id));
      const newBoxes = [...selected, ...rest];
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
    const system = detectBboxSystem(json.compositional_deconstruction.elements);
    const newBoxes: Box[] = [];
    let counter = 0;

    for (const el of json.compositional_deconstruction.elements) {
      const { x, y, w, h } = bboxToPixels(el.bbox, cw, ch, system);
      newBoxes.push({
        id: `box_${counter}`,
        x, y, w, h,
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
      selectedBoxIds: [],
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
