import type {
  CanvasChatRequestLog,
  CanvasChatRequestLogDetail,
  CanvasChatRequestLogStep,
  CanvasChatSession,
  ChatMessage,
  ChatMessageForApi,
  ChatThinkingLevel,
} from '../types/chat';
import type {
  CanvasFavorite,
  CanvasSnapshotLite,
  PersistedCanvasChatStateV1,
  StorageResult,
  WorkspaceBackupSettings,
} from '../types/workspace';

export const CANVAS_CHAT_STORAGE_KEY = 'ideogram4-canvas-chat-sessions:v1';
export const CANVAS_FAVORITES_STORAGE_KEY = 'ideogram4-canvas-favorites:v1';
export const WORKSPACE_BACKUP_SETTINGS_STORAGE_KEY = 'ideogram4-workspace-backup-settings:v1';

const DEFAULT_BACKUP_SETTINGS: WorkspaceBackupSettings = {
  schemaVersion: 1,
  githubToken: '',
  gistId: null,
  lastBackupAt: null,
  lastRestoreAt: null,
};

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const role = value.role === 'user' || value.role === 'assistant' ? value.role : null;
  if (!role || typeof value.id !== 'string' || typeof value.content !== 'string') return null;
  return {
    id: value.id,
    role,
    content: value.content,
    timestamp: safeNumber(value.timestamp, Date.now()),
    ...(typeof value.adopted === 'boolean' ? { adopted: value.adopted } : {}),
    ...(typeof value.thinking === 'string' ? { thinking: value.thinking } : {}),
    ...(typeof value.canvasSnapshotUrl === 'string' ? { canvasSnapshotUrl: value.canvasSnapshotUrl } : {}),
  };
}

function sanitizeStep(value: unknown): CanvasChatRequestLogStep | null {
  if (!isRecord(value)) return null;
  const status = value.status === 'pending' || value.status === 'running' || value.status === 'success' || value.status === 'error'
    ? value.status
    : null;
  if (!status || typeof value.kind !== 'string' || typeof value.id !== 'string' || typeof value.label !== 'string') {
    return null;
  }
  return {
    id: value.id,
    at: safeNumber(value.at, Date.now()),
    kind: value.kind as CanvasChatRequestLogStep['kind'],
    status,
    label: value.label,
    ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
  };
}

function sanitizeChatMessageForApi(value: unknown): ChatMessageForApi | null {
  if (!isRecord(value)) return null;
  if ((value.role !== 'user' && value.role !== 'assistant') || typeof value.content !== 'string') return null;
  return {
    role: value.role,
    content: value.content,
  };
}

function sanitizeRequestLogMetadata(value: unknown): CanvasChatRequestLogDetail['metadata'] | undefined {
  if (!isRecord(value)) return undefined;
  const canvasSize = isRecord(value.canvasSize)
    ? {
        width: safeNumber(value.canvasSize.width, 0),
        height: safeNumber(value.canvasSize.height, 0),
      }
    : { width: 0, height: 0 };
  const thinkingLevel: ChatThinkingLevel =
    value.thinkingLevel === 'off' || value.thinkingLevel === 'low' || value.thinkingLevel === 'medium' || value.thinkingLevel === 'high'
      ? value.thinkingLevel
      : 'medium';
  return {
    providerId: safeString(value.providerId),
    providerName: safeString(value.providerName),
    modelName: safeString(value.modelName),
    responseLang: safeString(value.responseLang) || 'auto',
    streamEnabled: typeof value.streamEnabled === 'boolean' ? value.streamEnabled : true,
    thinkingLevel,
    targetSize: safeNumber(value.targetSize, 1024),
    canvasSize,
    boxCount: safeNumber(value.boxCount, 0),
  };
}

function sanitizeRequestLogDetail(value: unknown): CanvasChatRequestLogDetail | undefined {
  if (!isRecord(value)) return undefined;
  const detail: CanvasChatRequestLogDetail = {};
  const metadata = sanitizeRequestLogMetadata(value.metadata);
  if (metadata) detail.metadata = metadata;
  if (typeof value.systemPrompt === 'string') detail.systemPrompt = value.systemPrompt;
  if (Array.isArray(value.messages)) {
    detail.messages = value.messages
      .map(sanitizeChatMessageForApi)
      .filter((message): message is ChatMessageForApi => message !== null);
  }
  if (typeof value.responseText === 'string') detail.responseText = value.responseText;
  if (typeof value.parsedJsonText === 'string') detail.parsedJsonText = value.parsedJsonText;
  if (typeof value.parseError === 'string') detail.parseError = value.parseError;
  return Object.keys(detail).length > 0 ? detail : undefined;
}

function interruptedStep(): CanvasChatRequestLogStep {
  return {
    id: `canvas_step_${Date.now()}_restore`,
    at: Date.now(),
    kind: 'error',
    status: 'error',
    label: 'Request interrupted',
    detail: '页面刷新前中断，无法继续运行该请求。',
  };
}

function sanitizeRequestLog(value: unknown): CanvasChatRequestLog | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.sessionId !== 'string') return null;
  const status = value.status === 'running' || value.status === 'success' || value.status === 'error'
    ? value.status
    : 'error';
  const steps = Array.isArray(value.steps)
    ? value.steps.map(sanitizeStep).filter((step): step is CanvasChatRequestLogStep => step !== null)
    : [];
  const wasRunning = status === 'running';
  const detail = sanitizeRequestLogDetail(value.detail);
  return {
    id: value.id,
    sessionId: value.sessionId,
    promptPreview: safeString(value.promptPreview),
    status: wasRunning ? 'error' : status,
    startedAt: safeNumber(value.startedAt, Date.now()),
    endedAt: wasRunning ? Date.now() : safeOptionalNumber(value.endedAt),
    steps: wasRunning ? [...steps, interruptedStep()] : steps,
    ...(detail ? { detail } : {}),
  };
}

function sanitizeSession(value: unknown): CanvasChatSession | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string') return null;
  const messages = Array.isArray(value.messages)
    ? value.messages.map(sanitizeMessage).filter((message): message is ChatMessage => message !== null)
    : [];
  const requestLogs = Array.isArray(value.requestLogs)
    ? value.requestLogs.map(sanitizeRequestLog).filter((log): log is CanvasChatRequestLog => log !== null)
    : [];
  return {
    id: value.id,
    title: safeString(value.title) || '新会话',
    createdAt: safeNumber(value.createdAt, Date.now()),
    updatedAt: safeNumber(value.updatedAt, Date.now()),
    messages,
    pendingIdeogramOutput: isRecord(value.pendingIdeogramOutput) ? value.pendingIdeogramOutput as unknown as CanvasChatSession['pendingIdeogramOutput'] : null,
    pendingQualityReport: isRecord(value.pendingQualityReport) ? value.pendingQualityReport as unknown as CanvasChatSession['pendingQualityReport'] : null,
    requestLogs,
  };
}

export function loadCanvasChatState(): PersistedCanvasChatStateV1 | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CANVAS_CHAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.sessions)) return null;
    const sessions = parsed.sessions
      .map(sanitizeSession)
      .filter((session): session is CanvasChatSession => session !== null);
    if (sessions.length === 0) return null;
    const activeSessionId = typeof parsed.activeSessionId === 'string'
      && sessions.some(session => session.id === parsed.activeSessionId)
      ? parsed.activeSessionId
      : sessions[0].id;
    return {
      schemaVersion: 1,
      activeSessionId,
      sessions,
      savedAt: safeNumber(parsed.savedAt, Date.now()),
    };
  } catch {
    return null;
  }
}

export function saveCanvasChatState(state: PersistedCanvasChatStateV1): StorageResult {
  const storage = getStorage();
  if (!storage) return { ok: false, error: 'localStorage 不可用' };
  try {
    storage.setItem(CANVAS_CHAT_STORAGE_KEY, JSON.stringify({ ...state, schemaVersion: 1 }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function sanitizeSnapshot(value: unknown): CanvasSnapshotLite | null {
  if (!isRecord(value) || !Array.isArray(value.boxes)) return null;
  return {
    canvasW: safeNumber(value.canvasW, 1024),
    canvasH: safeNumber(value.canvasH, 1024),
    canvasRatio: safeString(value.canvasRatio) || '1:1',
    canvasScale: safeNumber(value.canvasScale, 4),
    canvasCustomW: safeNumber(value.canvasCustomW, 16),
    canvasCustomH: safeNumber(value.canvasCustomH, 9),
    boxes: value.boxes
      .filter(isRecord)
      .map(box => ({
        id: typeof box.id === 'string' ? box.id : '',
        x: safeNumber(box.x),
        y: safeNumber(box.y),
        w: safeNumber(box.w),
        h: safeNumber(box.h),
        mode: box.mode === 'text' ? 'text' as const : 'obj' as const,
        text: safeString(box.text),
        desc: safeString(box.desc),
        colors: Array.isArray(box.colors) ? box.colors.filter((color): color is string => typeof color === 'string') : [],
        imageDataUrl: null,
        imageRole: box.imageRole === 'background' || box.imageRole === 'reference' || box.imageRole === 'both'
          ? box.imageRole
          : 'both',
      })),
    globalPalette: Array.isArray(value.globalPalette) ? value.globalPalette.filter((color): color is string => typeof color === 'string') : [],
    highLevelDescription: safeString(value.highLevelDescription),
    aesthetics: safeString(value.aesthetics),
    lighting: safeString(value.lighting),
    medium: safeString(value.medium),
    artStyle: safeString(value.artStyle),
    background: safeString(value.background),
    photoArtStyleMode: value.photoArtStyleMode === 0 ? 0 : 1,
  };
}

function sanitizeFavorite(value: unknown): CanvasFavorite | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const snapshot = sanitizeSnapshot(value.snapshot);
  if (!snapshot) return null;
  return {
    id: value.id,
    title: safeString(value.title) || 'Untitled',
    createdAt: safeNumber(value.createdAt, Date.now()),
    updatedAt: safeNumber(value.updatedAt, Date.now()),
    snapshot,
  };
}

export function loadCanvasFavorites(): CanvasFavorite[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(CANVAS_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeFavorite).filter((favorite): favorite is CanvasFavorite => favorite !== null);
  } catch {
    return [];
  }
}

export function saveCanvasFavorites(favorites: CanvasFavorite[]): StorageResult {
  const storage = getStorage();
  if (!storage) return { ok: false, error: 'localStorage 不可用' };
  try {
    storage.setItem(CANVAS_FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function loadWorkspaceBackupSettings(): WorkspaceBackupSettings {
  const storage = getStorage();
  if (!storage) return DEFAULT_BACKUP_SETTINGS;
  try {
    const raw = storage.getItem(WORKSPACE_BACKUP_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_BACKUP_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.schemaVersion !== 1) return DEFAULT_BACKUP_SETTINGS;
    return {
      schemaVersion: 1,
      githubToken: safeString(parsed.githubToken),
      gistId: typeof parsed.gistId === 'string' && parsed.gistId.trim() ? parsed.gistId : null,
      lastBackupAt: safeNullableNumber(parsed.lastBackupAt),
      lastRestoreAt: safeNullableNumber(parsed.lastRestoreAt),
    };
  } catch {
    return DEFAULT_BACKUP_SETTINGS;
  }
}

export function saveWorkspaceBackupSettings(settings: WorkspaceBackupSettings): StorageResult {
  const storage = getStorage();
  if (!storage) return { ok: false, error: 'localStorage 不可用' };
  try {
    storage.setItem(WORKSPACE_BACKUP_SETTINGS_STORAGE_KEY, JSON.stringify({ ...settings, schemaVersion: 1 }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
