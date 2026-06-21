import { create } from 'zustand';
import type { Box, IdeogramOutput, GenerationStatus, PhotoArtStyleMode } from '../types';
import type { CanvasChatRequestLogDetail, CanvasChatRequestLogStep, CanvasChatSession, ChatMessage, ChatThinkingLevel } from '../types/chat';
import type { PromptPreset } from '../types/presets';
import type { CanvasFavorite, CanvasSnapshotLite, PersistedCanvasChatStateV1, WorkspaceBackupSettings } from '../types/workspace';
import { PRESETS_STORAGE_KEY, createBuiltinPresets } from '../types/presets';
import { MODE_ARTSTYLE, MODE_PHOTO } from '../types';
import { computeCanvasDims, inferCanvasControlsFromDimensions, type RatioKey } from '../utils/canvas-dims';
import { detectBboxSystem, bboxToPixels } from '../utils/coordinates';
import type { LayoutQualityReport } from '../services/layout-validator';
import {
  loadCanvasChatState,
  loadCanvasFavorites,
  loadWorkspaceBackupSettings,
  saveCanvasChatState,
  saveCanvasFavorites,
  saveWorkspaceBackupSettings,
} from '../services/workspace-persistence';
import { buildCanvasSnapshotLite, buildPersistedCanvasChatState } from '../services/workspace-backup';

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

function generateWorkspaceId(prefix: string): string {
  const hex = Math.random().toString(16).slice(2, 8);
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

function createInitialCanvasChatRuntime() {
  const persisted = loadCanvasChatState();
  if (persisted && persisted.sessions.length > 0) {
    const activeSession = persisted.sessions.find(session => session.id === persisted.activeSessionId)
      ?? persisted.sessions[0];
    return {
      sessions: persisted.sessions,
      activeSessionId: activeSession.id,
      messages: activeSession.messages,
      pendingIdeogramOutput: activeSession.pendingIdeogramOutput,
      pendingQualityReport: activeSession.pendingQualityReport,
    };
  }
  return {
    sessions: [initialCanvasChatSession],
    activeSessionId: initialCanvasChatSession.id,
    messages: initialCanvasChatSession.messages,
    pendingIdeogramOutput: initialCanvasChatSession.pendingIdeogramOutput,
    pendingQualityReport: initialCanvasChatSession.pendingQualityReport,
  };
}

const initialCanvasChatRuntime = createInitialCanvasChatRuntime();

function persistCanvasChatRuntime(state: {
  canvasChatSessions: CanvasChatSession[];
  activeCanvasChatSessionId: string;
}) {
  saveCanvasChatState(buildPersistedCanvasChatState(
    state.activeCanvasChatSessionId,
    state.canvasChatSessions,
  ));
}

function persistFavorites(favorites: CanvasFavorite[]) {
  saveCanvasFavorites(favorites);
}

function persistBackupSettings(settings: WorkspaceBackupSettings) {
  saveWorkspaceBackupSettings(settings);
}

function titleFromCurrentCanvas(state: Pick<EditorStore, 'highLevelDescription'>): string {
  const text = state.highLevelDescription.trim();
  if (text) return text.length > 24 ? text.slice(0, 24) : text;
  return new Date().toLocaleString();
}

function boxCounterFromBoxes(boxes: Box[]): number {
  const numericIds = boxes
    .map(box => /^box_(\d+)$/.exec(box.id)?.[1])
    .filter((value): value is string => value != null)
    .map(value => Number(value));
  return numericIds.length > 0 ? Math.max(...numericIds) + 1 : boxes.length;
}

function boxesFromSnapshot(snapshot: CanvasSnapshotLite): Box[] {
  const usedIds = new Set<string>();
  return snapshot.boxes.map((box, index) => {
    const proposedId = box.id && !usedIds.has(box.id) ? box.id : `box_${index}`;
    usedIds.add(proposedId);
    return {
      id: proposedId,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      mode: box.mode,
      text: box.text,
      desc: box.desc,
      colors: [...box.colors],
      imageDataUrl: null,
      imageRole: box.imageRole,
    };
  });
}

function canvasStateFromSnapshot(snapshot: CanvasSnapshotLite) {
  const boxes = boxesFromSnapshot(snapshot);
  return {
    canvasW: snapshot.canvasW,
    canvasH: snapshot.canvasH,
    canvasRatio: snapshot.canvasRatio,
    canvasScale: snapshot.canvasScale,
    canvasCustomW: snapshot.canvasCustomW,
    canvasCustomH: snapshot.canvasCustomH,
    boxes,
    boxCounter: boxCounterFromBoxes(boxes),
    selectedBoxId: null,
    selectedBoxIds: [],
    globalPalette: [...snapshot.globalPalette],
    highLevelDescription: snapshot.highLevelDescription,
    aesthetics: snapshot.aesthetics,
    lighting: snapshot.lighting,
    medium: snapshot.medium,
    artStyle: snapshot.artStyle,
    background: snapshot.background,
    photoArtStyleMode: snapshot.photoArtStyleMode,
  };
}

function canvasChatTitleFromMessage(message: ChatMessage): string {
  const text = message.content.trim();
  if (!text) return '新会话';
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}

const CHAT_STREAM_ENABLED_STORAGE_KEY = 'ideogram4-chat-stream-enabled';
const CHAT_THINKING_LEVEL_STORAGE_KEY = 'ideogram4-chat-thinking-level';
const CHAT_THINKING_LEVELS: ChatThinkingLevel[] = ['off', 'low', 'medium', 'high'];
const CANVAS_CHAT_TARGET_SIZE_STORAGE_KEY = 'ideogram4-canvas-chat-target-size';
const CANVAS_CHAT_TARGET_SIZES = [1024, 2048, 4096] as const;
type CanvasChatTargetSize = typeof CANVAS_CHAT_TARGET_SIZES[number];

function loadChatStreamEnabled(): boolean {
  return localStorage.getItem(CHAT_STREAM_ENABLED_STORAGE_KEY) !== 'false';
}

function loadChatThinkingLevel(): ChatThinkingLevel {
  const raw = localStorage.getItem(CHAT_THINKING_LEVEL_STORAGE_KEY);
  return CHAT_THINKING_LEVELS.includes(raw as ChatThinkingLevel)
    ? raw as ChatThinkingLevel
    : 'medium';
}

function normalizeCanvasChatTargetSize(size: number): CanvasChatTargetSize {
  const numeric = Number.isFinite(size) ? size : 1024;
  return CANVAS_CHAT_TARGET_SIZES.reduce<CanvasChatTargetSize>((nearest, candidate) => {
    return Math.abs(candidate - numeric) < Math.abs(nearest - numeric) ? candidate : nearest;
  }, 1024);
}

function loadCanvasChatTargetSize(): CanvasChatTargetSize {
  const raw = Number(localStorage.getItem(CANVAS_CHAT_TARGET_SIZE_STORAGE_KEY));
  return normalizeCanvasChatTargetSize(raw);
}

function scaleBoxesToCanvas(boxes: Box[], scaleX: number, scaleY: number): Box[] {
  if (boxes.length === 0) return boxes;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return boxes;
  if (scaleX === 1 && scaleY === 1) return boxes;
  return boxes.map(box => ({
    ...box,
    x: box.x * scaleX,
    y: box.y * scaleY,
    w: box.w * scaleX,
    h: box.h * scaleY,
  }));
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
  applyCanvasSnapshot: (snapshot: CanvasSnapshotLite) => void;

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
  setChatHistory: (boxId: string, messages: ChatMessage[]) => void;
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
  renameCanvasChatSession: (sessionId: string, title: string) => void;
  deleteCanvasChatSession: (sessionId: string) => void;
  clearCanvasChatSession: (sessionId: string) => void;
  setCanvasChatMaximized: (maximized: boolean) => void;
  setCanvasChatOpen: (open: boolean) => void;
  addCanvasChatMessage: (message: ChatMessage) => void;
  setCanvasChatMessages: (messages: ChatMessage[]) => void;
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
  updateCanvasChatRequestDetail: (
    requestId: string,
    updates: Partial<CanvasChatRequestLogDetail>,
  ) => void;
  finishCanvasChatRequest: (requestId: string, status: 'success' | 'error', detail?: string) => void;
  replaceCanvasChatState: (state: PersistedCanvasChatStateV1) => void;

  // 布局质量检测结果
  pendingQualityReport: LayoutQualityReport | null;
  setPendingQualityReport: (report: LayoutQualityReport | null) => void;

  // LLM 回复语言偏好（persist）
  chatResponseLang: string;
  setChatResponseLang: (lang: string) => void;
  chatStreamEnabled: boolean;
  chatThinkingLevel: ChatThinkingLevel;
  canvasChatTargetSize: CanvasChatTargetSize;
  setChatStreamEnabled: (enabled: boolean) => void;
  setChatThinkingLevel: (level: ChatThinkingLevel) => void;
  setCanvasChatTargetSize: (size: number) => void;

  // Image 操作
  importImageToBox: (boxId: string, dataUrl: string) => void;
  clearBoxImage: (boxId: string) => void;

  // 预设状态
  chatPresets: PromptPreset[];
  addPreset: (preset: Omit<PromptPreset, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updatePreset: (id: string, updates: Partial<Omit<PromptPreset, 'id'>>) => void;
  deletePreset: (id: string) => void;
  replaceChatPresets: (presets: PromptPreset[]) => void;

  // 画布背景图
  canvasBackgroundUrl: string | null;
  setCanvasBackgroundUrl: (url: string | null) => void;

  // Workspace 持久化
  canvasFavorites: CanvasFavorite[];
  favoriteCurrentCanvas: (title?: string) => string;
  renameCanvasFavorite: (id: string, title: string) => void;
  deleteCanvasFavorite: (id: string) => void;
  restoreCanvasFavorite: (id: string) => void;
  replaceCanvasFavorites: (favorites: CanvasFavorite[]) => void;
  workspaceBackupSettings: WorkspaceBackupSettings;
  setWorkspaceBackupSettings: (updates: Partial<WorkspaceBackupSettings>) => void;

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
    ...inferCanvasControlsFromDimensions(w, h),
  }),

  setCanvasRatio: (ratio) => {
    const state = get();
    const { w, h } = computeCanvasDims(ratio as RatioKey, state.canvasScale, state.canvasCustomW, state.canvasCustomH);
    set({ canvasRatio: ratio, canvasW: w, canvasH: h });
  },
  setCanvasScale: (scale) => {
    const state = get();
    const { w, h } = computeCanvasDims(state.canvasRatio as RatioKey, scale, state.canvasCustomW, state.canvasCustomH);
    const scaleX = state.canvasW > 0 ? w / state.canvasW : 1;
    const scaleY = state.canvasH > 0 ? h / state.canvasH : 1;
    set({
      canvasScale: scale,
      canvasW: w,
      canvasH: h,
      boxes: scaleBoxesToCanvas(state.boxes, scaleX, scaleY),
    });
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

  applyCanvasSnapshot: (snapshot) => set({
    ...canvasStateFromSnapshot(snapshot),
    canvasBackgroundUrl: null,
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

  setChatHistory: (boxId, messages) => set(state => ({
    chatHistories: {
      ...state.chatHistories,
      [boxId]: messages,
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
  canvasChatSessions: initialCanvasChatRuntime.sessions,
  activeCanvasChatSessionId: initialCanvasChatRuntime.activeSessionId,
  activeCanvasChatRequestId: null,
  canvasChatMessages: initialCanvasChatRuntime.messages,
  isCanvasChatLoading: false,
  pendingIdeogramOutput: initialCanvasChatRuntime.pendingIdeogramOutput,

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
    persistCanvasChatRuntime(get());
    return session.id;
  },

  selectCanvasChatSession: (sessionId) => {
    set(state => {
    const session = state.canvasChatSessions.find(s => s.id === sessionId);
    if (!session) return {};
    return {
      activeCanvasChatSessionId: session.id,
      activeCanvasChatRequestId: null,
      canvasChatMessages: session.messages,
      pendingIdeogramOutput: session.pendingIdeogramOutput,
      pendingQualityReport: session.pendingQualityReport,
    };
    });
    persistCanvasChatRuntime(get());
  },

  renameCanvasChatSession: (sessionId, title) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    set(state => ({
      canvasChatSessions: state.canvasChatSessions.map(session =>
        session.id === sessionId
          ? { ...session, title: trimmedTitle, updatedAt: Date.now() }
          : session
      ),
    }));
    persistCanvasChatRuntime(get());
  },

  deleteCanvasChatSession: (sessionId) => {
    set(state => {
    const targetIndex = state.canvasChatSessions.findIndex(session => session.id === sessionId);
    if (targetIndex < 0) return {};

    const remainingSessions = state.canvasChatSessions.filter(session => session.id !== sessionId);
    if (remainingSessions.length === 0) {
      const session = createCanvasChatSessionRecord();
      return {
        canvasChatSessions: [session],
        activeCanvasChatSessionId: session.id,
        activeCanvasChatRequestId: null,
        canvasChatMessages: [],
        pendingIdeogramOutput: null,
        pendingQualityReport: null,
      };
    }

    if (state.activeCanvasChatSessionId !== sessionId) {
      return { canvasChatSessions: remainingSessions };
    }

    const nextIndex = Math.min(targetIndex, remainingSessions.length - 1);
    const nextSession = remainingSessions[nextIndex];
    return {
      canvasChatSessions: remainingSessions,
      activeCanvasChatSessionId: nextSession.id,
      activeCanvasChatRequestId: null,
      canvasChatMessages: nextSession.messages,
      pendingIdeogramOutput: nextSession.pendingIdeogramOutput,
      pendingQualityReport: nextSession.pendingQualityReport,
    };
    });
    persistCanvasChatRuntime(get());
  },

  clearCanvasChatSession: (sessionId) => {
    set(state => {
    const isActiveSession = state.activeCanvasChatSessionId === sessionId;
    return {
      ...(isActiveSession
        ? {
            canvasChatMessages: [],
            pendingIdeogramOutput: null,
            pendingQualityReport: null,
            activeCanvasChatRequestId: null,
          }
        : {}),
      canvasChatSessions: state.canvasChatSessions.map(session =>
        session.id === sessionId
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
    };
    });
    persistCanvasChatRuntime(get());
  },

  setCanvasChatMaximized: (maximized) => set({ isCanvasChatMaximized: maximized }),

  setCanvasChatOpen: (open) => set({ isCanvasChatOpen: open }),

  setCanvasChatMessages: (messages) => set(state => ({
    canvasChatMessages: messages,
  })),

  addCanvasChatMessage: (message) => {
    set(state => {
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
    });
    persistCanvasChatRuntime(get());
  },

  setPendingIdeogramOutput: (output) => {
    set(state => ({
      pendingIdeogramOutput: output,
      canvasChatSessions: state.canvasChatSessions.map(session =>
        session.id === state.activeCanvasChatSessionId
          ? { ...session, pendingIdeogramOutput: output, updatedAt: Date.now() }
          : session
      ),
    }));
    persistCanvasChatRuntime(get());
  },

  clearCanvasChat: () => {
    set(state => ({
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
    }));
    persistCanvasChatRuntime(get());
  },
  setCanvasChatLoading: (loading) => set({ isCanvasChatLoading: loading }),
  updateCanvasChatMessage: (messageId, updates) => {
    set(state => ({
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
    }));
    persistCanvasChatRuntime(get());
  },

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
    persistCanvasChatRuntime(get());
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
    persistCanvasChatRuntime(get());
  },

  updateCanvasChatRequestDetail: (requestId, updates) => {
    set(state => ({
      canvasChatSessions: state.canvasChatSessions.map(session => ({
        ...session,
        requestLogs: session.requestLogs.map(log => {
          if (log.id !== requestId) return log;
          const previousDetail = log.detail ?? {};
          return {
            ...log,
            detail: {
              ...previousDetail,
              ...updates,
              ...(updates.metadata
                ? { metadata: { ...(previousDetail.metadata ?? {}), ...updates.metadata } }
                : {}),
            },
          };
        }),
      })),
    }));
    persistCanvasChatRuntime(get());
  },

  finishCanvasChatRequest: (requestId, status, detail) => {
    set(state => ({
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
    }));
    persistCanvasChatRuntime(get());
  },

  replaceCanvasChatState: (persisted) => {
    const activeSession = persisted.sessions.find(session => session.id === persisted.activeSessionId)
      ?? persisted.sessions[0];
    if (!activeSession) return;
    set({
      canvasChatSessions: persisted.sessions,
      activeCanvasChatSessionId: activeSession.id,
      activeCanvasChatRequestId: null,
      canvasChatMessages: activeSession.messages,
      pendingIdeogramOutput: activeSession.pendingIdeogramOutput,
      pendingQualityReport: activeSession.pendingQualityReport,
    });
    persistCanvasChatRuntime(get());
  },

  // 布局质量检测结果
  pendingQualityReport: initialCanvasChatRuntime.pendingQualityReport,
  setPendingQualityReport: (report) => {
    set(state => ({
      pendingQualityReport: report,
      canvasChatSessions: state.canvasChatSessions.map(session =>
        session.id === state.activeCanvasChatSessionId
          ? { ...session, pendingQualityReport: report, updatedAt: Date.now() }
          : session
      ),
    }));
    persistCanvasChatRuntime(get());
  },

  // LLM 回复语言偏好
  chatResponseLang: localStorage.getItem('ideogram4-chat-lang') || 'auto',
  setChatResponseLang: (lang) => {
    localStorage.setItem('ideogram4-chat-lang', lang);
    set({ chatResponseLang: lang });
  },
  chatStreamEnabled: loadChatStreamEnabled(),
  chatThinkingLevel: loadChatThinkingLevel(),
  canvasChatTargetSize: loadCanvasChatTargetSize(),
  setChatStreamEnabled: (enabled) => {
    localStorage.setItem(CHAT_STREAM_ENABLED_STORAGE_KEY, String(enabled));
    set({ chatStreamEnabled: enabled });
  },
  setChatThinkingLevel: (level) => {
    localStorage.setItem(CHAT_THINKING_LEVEL_STORAGE_KEY, level);
    set({ chatThinkingLevel: level });
  },
  setCanvasChatTargetSize: (size) => {
    const nextSize = normalizeCanvasChatTargetSize(size);
    localStorage.setItem(CANVAS_CHAT_TARGET_SIZE_STORAGE_KEY, String(nextSize));
    set({ canvasChatTargetSize: nextSize });
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
      p.id === id ? { ...p, ...updates, updatedAt: Math.max(Date.now(), p.updatedAt + 1) } : p,
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

  replaceChatPresets: (presets) => {
    savePresetsToStorage(presets);
    set({ chatPresets: presets });
  },

  // ─── 画布背景图 ─────────────────────────────────────────────
  canvasBackgroundUrl: null,
  setCanvasBackgroundUrl: (url) => set({ canvasBackgroundUrl: url }),

  // ─── Workspace 持久化 ───────────────────────────────────────
  canvasFavorites: loadCanvasFavorites(),

  favoriteCurrentCanvas: (title) => {
    const state = get();
    const now = Date.now();
    const favorite: CanvasFavorite = {
      id: generateWorkspaceId('favorite'),
      title: (title?.trim() || titleFromCurrentCanvas(state)),
      createdAt: now,
      updatedAt: now,
      snapshot: buildCanvasSnapshotLite(state),
    };
    const favorites = [favorite, ...state.canvasFavorites];
    persistFavorites(favorites);
    set({ canvasFavorites: favorites });
    return favorite.id;
  },

  renameCanvasFavorite: (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const favorites = get().canvasFavorites.map(favorite =>
      favorite.id === id ? { ...favorite, title: trimmed, updatedAt: Date.now() } : favorite,
    );
    persistFavorites(favorites);
    set({ canvasFavorites: favorites });
  },

  deleteCanvasFavorite: (id) => {
    const favorites = get().canvasFavorites.filter(favorite => favorite.id !== id);
    persistFavorites(favorites);
    set({ canvasFavorites: favorites });
  },

  restoreCanvasFavorite: (id) => {
    const favorite = get().canvasFavorites.find(item => item.id === id);
    if (!favorite) return;
    set({
      ...canvasStateFromSnapshot(favorite.snapshot),
      canvasBackgroundUrl: null,
    });
  },

  replaceCanvasFavorites: (favorites) => {
    persistFavorites(favorites);
    set({ canvasFavorites: favorites });
  },

  workspaceBackupSettings: loadWorkspaceBackupSettings(),

  setWorkspaceBackupSettings: (updates) => {
    const nextSettings = {
      ...get().workspaceBackupSettings,
      ...updates,
      schemaVersion: 1 as const,
    };
    persistBackupSettings(nextSettings);
    set({ workspaceBackupSettings: nextSettings });
  },

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
