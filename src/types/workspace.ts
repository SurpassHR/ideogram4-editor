import type { Box, PhotoArtStyleMode } from './index';
import type { CanvasChatSession, ChatThinkingLevel } from './chat';
import type { PromptPreset } from './presets';
import type { LlmProvider } from '../components/llm/types';

export interface PersistedCanvasChatStateV1 {
  schemaVersion: 1;
  activeSessionId: string;
  sessions: CanvasChatSession[];
  savedAt: number;
}

export type CanvasSnapshotBox = Omit<Box, 'imageDataUrl'> & {
  imageDataUrl?: null;
};

export interface CanvasSnapshotLite {
  canvasW: number;
  canvasH: number;
  canvasRatio: string;
  canvasScale: number;
  canvasCustomW: number;
  canvasCustomH: number;
  boxes: CanvasSnapshotBox[];
  globalPalette: string[];
  highLevelDescription: string;
  aesthetics: string;
  lighting: string;
  medium: string;
  artStyle: string;
  background: string;
  photoArtStyleMode: PhotoArtStyleMode;
}

export interface CanvasFavorite {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  snapshot: CanvasSnapshotLite;
}

export interface WorkspaceBackupSettings {
  schemaVersion: 1;
  githubToken: string;
  gistId: string | null;
  lastBackupAt: number | null;
  lastRestoreAt: number | null;
}

export interface WorkspaceUiPreferences {
  lang: string;
  chatModel: string;
  chatResponseLang: string;
  chatStreamEnabled: boolean;
  chatThinkingLevel: ChatThinkingLevel;
}

export interface WorkspaceBackupPackageV1 {
  app: 'ideogram4-editor';
  schemaVersion: 1;
  exportedAt: number;
  modules: {
    currentCanvas: CanvasSnapshotLite;
    canvasChatSessions: PersistedCanvasChatStateV1;
    canvasFavorites: CanvasFavorite[];
    chatPresets: PromptPreset[];
    llmProviders: LlmProvider[];
    uiPreferences: WorkspaceUiPreferences;
  };
}

export type WorkspaceRestoreModule =
  | 'currentCanvas'
  | 'canvasChatSessions'
  | 'canvasFavorites'
  | 'chatPresets'
  | 'llmProviders'
  | 'uiPreferences';

export type WorkspaceRestoreSelections = Record<WorkspaceRestoreModule, boolean>;

export interface WorkspaceRestorePreviewItem {
  module: WorkspaceRestoreModule;
  label: string;
  summary: string;
  defaultSelected: boolean;
  warning?: string;
}

export type StorageResult = { ok: true } | { ok: false; error: string };

export type ParseWorkspaceBackupResult =
  | { ok: true; package: WorkspaceBackupPackageV1 }
  | { ok: false; error: string };
