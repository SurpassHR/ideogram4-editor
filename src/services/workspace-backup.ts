import type { Box } from '../types';
import type { CanvasChatSession } from '../types/chat';
import type { LlmProvider } from '../components/llm/types';
import type { PromptPreset } from '../types/presets';
import type {
  CanvasFavorite,
  CanvasSnapshotLite,
  ParseWorkspaceBackupResult,
  PersistedCanvasChatStateV1,
  WorkspaceBackupPackageV1,
  WorkspaceRestorePreviewItem,
  WorkspaceUiPreferences,
} from '../types/workspace';

interface CanvasSnapshotSource {
  canvasW: number;
  canvasH: number;
  canvasRatio: string;
  canvasScale: number;
  canvasCustomW: number;
  canvasCustomH: number;
  boxes: Box[];
  globalPalette: string[];
  highLevelDescription: string;
  aesthetics: string;
  lighting: string;
  medium: string;
  artStyle: string;
  background: string;
  photoArtStyleMode: 0 | 1;
}

interface WorkspaceBackupSource extends CanvasSnapshotSource {
  canvasChatSessions: CanvasChatSession[];
  activeCanvasChatSessionId: string;
  canvasFavorites: CanvasFavorite[];
}

interface WorkspaceExternalModules {
  chatPresets: PromptPreset[];
  llmProviders: LlmProvider[];
  uiPreferences: WorkspaceUiPreferences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function countMessages(sessions: CanvasChatSession[]): number {
  return sessions.reduce((sum, session) => sum + session.messages.length, 0);
}

function countRequestLogs(sessions: CanvasChatSession[]): number {
  return sessions.reduce((sum, session) => sum + session.requestLogs.length, 0);
}

function summarizeText(value: string, max = 32): string {
  const text = value.trim();
  if (!text) return 'No description';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function buildCanvasSnapshotLite(state: CanvasSnapshotSource): CanvasSnapshotLite {
  return {
    canvasW: state.canvasW,
    canvasH: state.canvasH,
    canvasRatio: state.canvasRatio,
    canvasScale: state.canvasScale,
    canvasCustomW: state.canvasCustomW,
    canvasCustomH: state.canvasCustomH,
    boxes: state.boxes.map(box => ({
      id: box.id,
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
    })),
    globalPalette: [...state.globalPalette],
    highLevelDescription: state.highLevelDescription,
    aesthetics: state.aesthetics,
    lighting: state.lighting,
    medium: state.medium,
    artStyle: state.artStyle,
    background: state.background,
    photoArtStyleMode: state.photoArtStyleMode,
  };
}

export function buildPersistedCanvasChatState(
  activeSessionId: string,
  sessions: CanvasChatSession[],
): PersistedCanvasChatStateV1 {
  const fallbackActiveId = sessions[0]?.id ?? activeSessionId;
  return {
    schemaVersion: 1,
    activeSessionId: sessions.some(session => session.id === activeSessionId) ? activeSessionId : fallbackActiveId,
    sessions,
    savedAt: Date.now(),
  };
}

export function buildWorkspaceBackupPackage(
  state: WorkspaceBackupSource,
  externalModules: WorkspaceExternalModules,
): WorkspaceBackupPackageV1 {
  return {
    app: 'ideogram4-editor',
    schemaVersion: 1,
    exportedAt: Date.now(),
    modules: {
      currentCanvas: buildCanvasSnapshotLite(state),
      canvasChatSessions: buildPersistedCanvasChatState(
        state.activeCanvasChatSessionId,
        state.canvasChatSessions,
      ),
      canvasFavorites: state.canvasFavorites,
      chatPresets: externalModules.chatPresets,
      llmProviders: externalModules.llmProviders,
      uiPreferences: externalModules.uiPreferences,
    },
  };
}

export function parseWorkspaceBackupPackage(raw: string): ParseWorkspaceBackupResult {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.app !== 'ideogram4-editor') {
      return { ok: false, error: '该 Gist 不是 Ideogram workspace backup。' };
    }
    if (parsed.schemaVersion !== 1) {
      return { ok: false, error: '备份版本不兼容，无法恢复。' };
    }
    if (
      !isRecord(parsed.modules)
      || !isRecord(parsed.modules.currentCanvas)
      || !isRecord(parsed.modules.canvasChatSessions)
      || !Array.isArray(parsed.modules.canvasFavorites)
      || !Array.isArray(parsed.modules.chatPresets)
      || !Array.isArray(parsed.modules.llmProviders)
      || !isRecord(parsed.modules.uiPreferences)
    ) {
      return { ok: false, error: '备份文件缺少必要模块。' };
    }
    return { ok: true, package: parsed as unknown as WorkspaceBackupPackageV1 };
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` };
  }
}

export function createRestorePreview(pkg: WorkspaceBackupPackageV1): WorkspaceRestorePreviewItem[] {
  const modules = pkg.modules;
  return [
    {
      module: 'currentCanvas',
      label: 'Current Canvas',
      summary: `${modules.currentCanvas.canvasW} x ${modules.currentCanvas.canvasH} · ${modules.currentCanvas.boxes.length} boxes · ${summarizeText(modules.currentCanvas.highLevelDescription)}`,
      defaultSelected: true,
    },
    {
      module: 'canvasChatSessions',
      label: 'Canvas Chat Sessions',
      summary: `${modules.canvasChatSessions.sessions.length} sessions · ${countMessages(modules.canvasChatSessions.sessions)} messages · ${countRequestLogs(modules.canvasChatSessions.sessions)} request logs`,
      defaultSelected: true,
    },
    {
      module: 'canvasFavorites',
      label: 'Canvas Favorites',
      summary: `${modules.canvasFavorites.length} favorites`,
      defaultSelected: true,
    },
    {
      module: 'chatPresets',
      label: 'Prompt Presets',
      summary: `${modules.chatPresets.length} presets`,
      defaultSelected: true,
    },
    {
      module: 'llmProviders',
      label: 'LLM Providers',
      summary: `${modules.llmProviders.length} providers · includes API keys`,
      defaultSelected: false,
      warning: '包含 API key，确认后会覆盖本机 provider 配置。',
    },
    {
      module: 'uiPreferences',
      label: 'UI Preferences',
      summary: `${modules.uiPreferences.lang} · ${modules.uiPreferences.chatModel || 'No model'} · stream ${modules.uiPreferences.chatStreamEnabled ? 'on' : 'off'}`,
      defaultSelected: true,
    },
  ];
}
