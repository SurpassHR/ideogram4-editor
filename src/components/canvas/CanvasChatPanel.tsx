import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasChat } from '../../hooks/useCanvasChat';
import ChatMessage from '../chat/ChatMessage';
import SelectMenu from '../chat/SelectMenu';
import ChatRunControls from '../chat/ChatRunControls';
import ContextMenu from './ContextMenu';
import { IconClose, IconMaximize, IconArrowRight, IconStop, IconMoreHorizontal, IconPencil, IconBroom, IconTrash } from '../ui/icons';
import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import { resolveTemplate } from '../../utils/resolveTemplate';
import { validateIdeogramJSONVerbose } from '../../services/llm-canvas-chat';
import { highlightJson } from '../../utils/json-highlight';
import type { CanvasChatRequestLog } from '../../types/chat';

// ─── Terminal 5 段折叠条目定义 ──────────────────────────────────────────

interface TerminalSection {
  kind: string;
  label: string;
  status: 'success' | 'error';
  content: string;
  /** 内容类型：'json' | 'text' | 'mixed'，决定是否应用 JSON 高亮 */
  contentType: 'json' | 'text' | 'http' | 'mixed';
}

/** 从请求日志中提取 5 个展示段 */
function buildTerminalSections(log: CanvasChatRequestLog): TerminalSection[] {
  const detail = log.detail;
  if (!detail) return [];

  const overallOk = log.status === 'success';
  const sections: TerminalSection[] = [];

  // 1. System Prompt
  if (detail.systemPrompt) {
    sections.push({
      kind: 'system_prompt',
      label: `System Prompt (${(detail.systemPrompt.length / 1024).toFixed(1)}KB)`,
      status: 'success',
      content: detail.systemPrompt,
      contentType: 'text',
    });
  }

  // 2. User Prompt（最后一条 user 消息）
  const userMsg = detail.messages?.filter(m => m.role === 'user').slice(-1)[0];
  if (userMsg) {
    const userContent = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content, null, 2);
    sections.push({
      kind: 'user_prompt',
      label: `User Prompt (${(userContent.length / 1024).toFixed(1)}KB)`,
      status: 'success',
      content: userContent,
      contentType: 'mixed',
    });
  }

  // 3. Context（画布上下文 JSON）
  if (detail.contextJson) {
    sections.push({
      kind: 'context',
      label: `Context (${(detail.contextJson.length / 1024).toFixed(1)}KB)`,
      status: 'success',
      content: detail.contextJson,
      contentType: 'json',
    });
  }

  // 4. Request Body（HTTP 请求）
  if (detail.requestBody) {
    sections.push({
      kind: 'request_body',
      label: `Request Body (${(detail.requestBody.length / 1024).toFixed(1)}KB)`,
      status: 'success',
      content: detail.requestBody,
      contentType: 'http',
    });
  }

  // 5. Response Body — 展示 HTTP 响应（状态行 + 响应头 + 响应体）
  const hasResponse = detail.responseText !== undefined || detail.parseError !== undefined;
  if (hasResponse) {
    const bodyContent = detail.responseText !== undefined
      ? detail.responseText
      : (detail.parseError || '');
    const statusCode = detail.responseStatus ?? (overallOk ? 200 : 500);
    // 用 HTTP 状态码对应的标准原因短语，不因后续解析失败而改写
    const statusText = {
      200: 'OK', 201: 'Created', 204: 'No Content',
      301: 'Moved', 302: 'Found', 304: 'Not Modified',
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
      404: 'Not Found', 405: 'Method Not Allowed', 408: 'Timeout',
      409: 'Conflict', 422: 'Unprocessable', 429: 'Too Many Requests',
      500: 'Internal Server Error', 502: 'Bad Gateway',
      503: 'Service Unavailable', 504: 'Gateway Timeout',
    }[statusCode] ?? 'Unknown';
    const headers = detail.responseHeaders ?? {};
    const EXCLUDED_HEADERS = ['transfer-encoding', 'accept-ranges', 'vary', 'cache-control', 'content-length'];
    const headerLines = Object.entries(headers)
      .filter(([k]) => !EXCLUDED_HEADERS.includes(k.toLowerCase()))
      .map(([k, v]) => `${k}: ${v}`);
    // 以实际响应体长度为准，避免与原始 content-length 重复
    const allHeaders = headerLines.length > 0
      ? [...headerLines, `Content-Length: ${new TextEncoder().encode(bodyContent).length}`]
      : [];
    const content = [
      `HTTP/1.1 ${statusCode} ${statusText}`,
      ...allHeaders,
      '',
      bodyContent,
    ].join('\n');
    sections.push({
      kind: 'response_body',
      label: `Response Body (${(bodyContent.length / 1024).toFixed(1)}KB)`,
      status: overallOk ? 'success' : 'error',
      content,
      contentType: 'http',
    });
  }

  return sections;
}

/** 对文本应用高亮 */
function highlightContent(text: string, contentType: string): string {
  if (contentType === 'json') {
    // 尝试解析提取 JSON
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return highlightJson(trimmed);
      } catch {
        // fallback
      }
    }
  }
  if (contentType === 'http') {
    // HTTP 请求/响应：高亮状态行、header 行和 body
    return text.split('\n').map(line => {
      // HTTP 响应状态行: HTTP/1.1 200 OK
      const respMatch = line.match(/^(HTTP\/[\d.]+)\s+(\d+)\s+(.+)/);
      if (respMatch) {
        return `<span class="hl-punct">${escapeHtml(respMatch[1])}</span> <span class="hl-num">${escapeHtml(respMatch[2])}</span> <span class="hl-str">${escapeHtml(respMatch[3])}</span>`;
      }
      // HTTP 请求行: POST /path HTTP/1.1
      if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s/.test(line)) {
        return line.replace(
          /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)(\s+\S+)(\s+HTTP\/[\d.]+)$/,
          (_, method, path, httpVer) =>
            `<span class="hl-method">${method}</span>${escapeHtml(path)}<span class="hl-punct">${escapeHtml(httpVer)}</span>`,
        );
      }
      // Header 行
      if (/^[A-Za-z][A-Za-z0-9-]*:/.test(line)) {
        const idx = line.indexOf(':');
        return `<span class="hl-header-key">${escapeHtml(line.slice(0, idx))}</span>:<span class="hl-header-val">${escapeHtml(line.slice(idx + 1))}</span>`;
      }
      // JSON body
      if (/^\s*[{[\]]/.test(line)) {
        try { return highlightJson(line); } catch { return escapeHtml(line); }
      }
      return escapeHtml(line);
    }).join('\n');
  }
  if (contentType === 'mixed') {
    // 混合内容：检测 ```json 代码块
    return text.split(/(```json[\s\S]*?```)/).map(part => {
      if (part.startsWith('```json')) {
        const inner = part.replace(/```json\n?/, '').replace(/```\n?$/, '');
        try {
          return `<span class="hl-comment">// --- JSON ---</span>\n${highlightJson(inner)}`;
        } catch {
          return escapeHtml(part);
        }
      }
      return escapeHtml(part);
    }).join('');
  }
  return escapeHtml(text);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 渲染 Terminal 的 5 个折叠区域 */
function renderTerminalSections(
  log: CanvasChatRequestLog | null,
  expandedStepId: string | null,
  setExpandedStepId: (id: string | null) => void,
  t: (path: string, vars?: Record<string, string | number>) => string,
  _highlightJson: (json: string) => string,
  onCopy: (section: string, text: string) => void,
  copiedSection: string | null,
): React.ReactNode {
  if (!log || !log.detail) return null;

  const sections = buildTerminalSections(log);
  if (sections.length === 0) return null;

  return sections.map(section => {
    const isExpanded = expandedStepId === section.kind;
    return (
      <button
        key={section.kind}
        type="button"
        className={`canvas-chat-terminal-step ${section.status}${isExpanded ? ' expanded' : ''}`}
        onClick={() => setExpandedStepId(isExpanded ? null : section.kind)}
      >
        <div className="canvas-chat-terminal-step-row">
          <span className="canvas-chat-terminal-step-indicator">
            {isExpanded ? '▾' : '▸'}
          </span>
          <span className="canvas-chat-terminal-step-kind">{section.kind}</span>
          <span className="canvas-chat-terminal-step-label">{section.label}</span>
        </div>
        {isExpanded && (
          <div className="canvas-chat-terminal-step-detail">
            <pre
              className="canvas-chat-terminal-pre-highlight"
              dangerouslySetInnerHTML={{
                __html: highlightContent(section.content, section.contentType),
              }}
            />
            <button
              type="button"
              className="canvas-chat-terminal-copy-btn"
              onClick={e => {
                e.stopPropagation();
                onCopy(section.kind, section.content);
              }}
            >
              {copiedSection === section.kind ? t('chat.canvasSessions.copied') : t('chat.canvasSessions.copy')}
            </button>
          </div>
        )}
      </button>
    );
  });
}

export default function CanvasChatPanel() {
  const {
    messages,
    isLoading,
    modelOptions,
    chatModel,
    chatResponseLang,
    sendMessage,
    stopGeneration,
    retryMessage,
    editAndSend,
    applyMessageOutput,
    handleSelectModel,
    setChatResponseLang,
    canvasChatTargetSize,
    setCanvasChatTargetSize,
    hasProviders,
    chatPresets,
    selectedPreset,
    selectedBox,
    handleSelectPreset,
    systemPrompts,
    activeCanvasChatSystemPromptId,
  } = useCanvasChat();

  const isCanvasChatOpen = useEditorStore(s => s.isCanvasChatOpen);
  const isCanvasChatMaximized = useEditorStore(s => s.isCanvasChatMaximized);
  const canvasChatSessions = useEditorStore(s => s.canvasChatSessions);
  const activeCanvasChatSessionId = useEditorStore(s => s.activeCanvasChatSessionId);
  const activeCanvasChatRequestId = useEditorStore(s => s.activeCanvasChatRequestId);
  const setCanvasChatMaximized = useEditorStore(s => s.setCanvasChatMaximized);
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);
  const createCanvasChatSession = useEditorStore(s => s.createCanvasChatSession);
  const selectCanvasChatSession = useEditorStore(s => s.selectCanvasChatSession);
  const renameCanvasChatSession = useEditorStore(s => s.renameCanvasChatSession);
  const deleteCanvasChatSession = useEditorStore(s => s.deleteCanvasChatSession);
  const clearCanvasChatSession = useEditorStore(s => s.clearCanvasChatSession);

  const { t } = useI18n();
  const [inputText, setInputText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [sessionMenu, setSessionMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [applyToast, setApplyToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [detailLogId, setDetailLogId] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const activeSession = canvasChatSessions.find(session => session.id === activeCanvasChatSessionId) ?? canvasChatSessions[0];
  const terminalLogs = activeSession?.requestLogs ?? [];
  const activeTerminalLog = terminalLogs.find(log => log.id === activeCanvasChatRequestId) ?? terminalLogs[terminalLogs.length - 1] ?? null;
  const detailLog = detailLogId ? terminalLogs.find(log => log.id === detailLogId) ?? null : null;
  const renamingSession = renamingSessionId
    ? canvasChatSessions.find(session => session.id === renamingSessionId) ?? null
    : null;

  // 点击画布空白区关闭面板
  useEffect(() => {
    if (!isCanvasChatOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (isCanvasChatMaximized) return;
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setCanvasChatOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isCanvasChatMaximized, isCanvasChatOpen, setCanvasChatOpen]);

  // Escape 关闭面板
  useEffect(() => {
    if (!isCanvasChatOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detailLogId) {
        setDetailLogId(null);
        return;
      }
      if (isCanvasChatMaximized) {
        setCanvasChatMaximized(false);
      } else {
        setCanvasChatOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detailLogId, isCanvasChatMaximized, isCanvasChatOpen, setCanvasChatMaximized, setCanvasChatOpen]);

  const handleAddProvider = useCallback(() => {
    window.location.hash = '#/settings';
  }, []);

  const handleMaximize = useCallback(() => {
    setCanvasChatOpen(true);
    setCanvasChatMaximized(true);
  }, [setCanvasChatMaximized, setCanvasChatOpen]);

  const handleRestore = useCallback(() => {
    setCanvasChatMaximized(false);
  }, [setCanvasChatMaximized]);

  const handleCreateSession = useCallback(() => {
    createCanvasChatSession();
  }, [createCanvasChatSession]);

  const handleOpenRenameSession = useCallback((sessionId: string) => {
    const session = canvasChatSessions.find(item => item.id === sessionId);
    if (!session) return;
    setRenamingSessionId(session.id);
    setRenameDraft(session.title);
    setSessionMenu(null);
  }, [canvasChatSessions]);

  const handleConfirmRenameSession = useCallback(() => {
    if (!renamingSessionId) return;
    renameCanvasChatSession(renamingSessionId, renameDraft);
    setRenamingSessionId(null);
    setRenameDraft('');
  }, [renameCanvasChatSession, renameDraft, renamingSessionId]);

  const handleCancelRenameSession = useCallback(() => {
    setRenamingSessionId(null);
    setRenameDraft('');
  }, []);

  const handleDeleteSession = useCallback((sessionId: string) => {
    deleteCanvasChatSession(sessionId);
    setSessionMenu(null);
  }, [deleteCanvasChatSession]);

  const handleClearSession = useCallback((sessionId: string) => {
    clearCanvasChatSession(sessionId);
    setSessionMenu(null);
  }, [clearCanvasChatSession]);

  const handleWorkbenchWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const openSessionMenu = useCallback((sessionId: string, x: number, y: number) => {
    if (sessionId !== activeCanvasChatSessionId) {
      selectCanvasChatSession(sessionId);
    }
    setSessionMenu({ sessionId, x, y });
  }, [activeCanvasChatSessionId, selectCanvasChatSession]);

  const handleSessionContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    openSessionMenu(sessionId, e.clientX, e.clientY);
  }, [openSessionMenu]);

  const handleSessionMenuClick = useCallback((e: React.MouseEvent<HTMLButtonElement>, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    openSessionMenu(sessionId, rect.right + 4, rect.top);
  }, [openSessionMenu]);

  // 新消息自动滚到底部
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isLoading]);
  // 阻止 wheel 事件冒泡到 Artboard（避免缩放 canvas 而非滚动消息列表）
  // 边界时 preventDefault 防止页面滚动链
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
      const scrollingDown = e.deltaY > 0;
      const scrollingUp = e.deltaY < 0;

      // 能继续滚动 → 停止冒泡（阻止画布缩放）但允许默认滚动
      if ((scrollingDown && !atBottom) || (scrollingUp && !atTop)) {
        e.stopPropagation();
        return;
      }

      // 到达边界或无滚动内容 → 同时阻止默认行为（页面滚动链）和冒泡（画布缩放）
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [isCanvasChatOpen]);

  // Apply 成功 toast
  useEffect(() => {
    if (applyToast) {
      const timer = setTimeout(() => {
        setApplyToast(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [applyToast]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  }, []);

  const handleRetry = useCallback((messageId: string) => {
    retryMessage(messageId);
  }, [retryMessage]);

  const handleEdit = useCallback((messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    setInputText(msg.content);
    setEditingMessageId(messageId);
    // 聚焦输入框
    setTimeout(() => {
      const el = document.querySelector('.canvas-chat-input-area .chat-input');
      if (el instanceof HTMLElement) el.focus();
    }, 0);
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    // 选中预设且当前有选中 box 时解析模板变量
    const resolvedText = selectedPreset && selectedBox
      ? resolveTemplate(text, selectedBox)
      : text;

    if (editingMessageId) {
      setEditingMessageId(null);
      editAndSend(editingMessageId, resolvedText);
    } else {
      sendMessage(resolvedText);
    }
    handleSelectPreset(null); // 发送后清除预设选择
  }, [inputText, isLoading, sendMessage, editAndSend, selectedPreset, selectedBox, handleSelectPreset, editingMessageId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && editingMessageId) {
      setEditingMessageId(null);
      setInputText('');
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, editingMessageId]);

  /** 选中预设：将模板文本填入输入框 */
  const handlePresetChange = useCallback((presetId: string) => {
    if (!presetId) {
      handleSelectPreset(null);
      return;
    }
    handleSelectPreset(presetId);
    const preset = chatPresets.find(p => p.id === presetId);
    if (preset) {
      setInputText(preset.promptTemplate);
    }
  }, [chatPresets, handleSelectPreset]);

  const activeCanvasChatSystemPrompt = activeCanvasChatSystemPromptId
    ? systemPrompts.find(p => p.id === activeCanvasChatSystemPromptId)
    : null;

  const canvasSystemPromptOptions = [
    { value: '', label: 'Default' },
    ...systemPrompts
      .filter(p => p.scope === 'canvas' || p.scope === 'both')
      .map(p => ({ value: p.id, label: p.name })),
  ];

  const handleCanvasSystemPromptChange = useCallback((value: string) => {
    if (!value) {
      useEditorStore.getState().setActiveCanvasChatSystemPrompt(null);
    } else {
      useEditorStore.getState().setActiveCanvasChatSystemPrompt(value);
    }
  }, []);

  const handleTargetSizeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setCanvasChatTargetSize(Number(e.currentTarget.value));
  }, [setCanvasChatTargetSize]);

  const handleCopyDebugText = useCallback(async (section: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedSection(section);
      window.setTimeout(() => setCopiedSection(null), 1200);
    } catch {
      setCopiedSection(null);
    }
  }, []);

  const targetSizeLabel = canvasChatTargetSize >= 4096
    ? '4K'
    : canvasChatTargetSize >= 2048
      ? '2K'
      : '1K';

  const renderTargetSizeControl = () => (
    <label className="canvas-chat-target-size-control" title={t('chat.targetSizeHint')}>
      <span className="chat-run-label">{t('chat.targetSizeShort')}: {targetSizeLabel}</span>
      <input
        type="range"
        min={1024}
        max={4096}
        step={1024}
        aria-label={t('chat.targetImageSize')}
        value={canvasChatTargetSize}
        onChange={handleTargetSizeChange}
      />
    </label>
  );

  const renderDebugBlock = (title: string, text: string, section: string) => (
    <section className="canvas-chat-request-detail-section">
      <div className="canvas-chat-request-detail-section-header">
        <h4>{title}</h4>
        <button
          type="button"
          className="canvas-chat-request-detail-copy"
          onClick={() => handleCopyDebugText(section, text)}
        >
          {copiedSection === section ? t('chat.canvasSessions.copied') : t('chat.canvasSessions.copy')}
        </button>
      </div>
      <pre className="canvas-chat-request-detail-pre">{text || '—'}</pre>
    </section>
  );

  const renderRequestDetailModal = () => {
    if (!detailLog) return null;
    const detail = detailLog.detail;
    const metadata = detail?.metadata;
    const metadataText = metadata
      ? [
          `${metadata.providerName} · ${metadata.modelName}`,
          `providerId: ${metadata.providerId}`,
          `responseLang: ${metadata.responseLang}`,
          `streamEnabled: ${metadata.streamEnabled}`,
          `thinkingLevel: ${metadata.thinkingLevel}`,
          `targetSize: ${metadata.targetSize}`,
          `canvasSize: ${metadata.canvasSize.width}x${metadata.canvasSize.height}`,
          `boxCount: ${metadata.boxCount}`,
          `backgroundImage: ${metadata.backgroundImageAttached ? 'yes' : 'no'}`,
        ].join('\n')
      : 'Request metadata was not captured.';
    return createPortal(
      <div className="modal-overlay canvas-chat-request-detail-overlay" onClick={() => setDetailLogId(null)}>
        <div
          className="canvas-chat-request-detail-modal"
          role="dialog"
          aria-label={t('chat.canvasSessions.requestDetails')}
          onClick={e => e.stopPropagation()}
        >
          <div className="canvas-chat-request-detail-header">
            <div>
              <p className="canvas-chat-request-detail-kicker">{detailLog.status}</p>
              <h3>{t('chat.canvasSessions.requestDetails')}</h3>
            </div>
            <button
              type="button"
              className="canvas-chat-icon-btn"
              aria-label={t('chat.canvasSessions.closeDetails')}
              title={t('chat.canvasSessions.closeDetails')}
              onClick={() => setDetailLogId(null)}
            >
              <IconClose size={14} />
            </button>
          </div>
          <div className="canvas-chat-request-detail-body">
            {renderDebugBlock('Metadata', metadataText, 'metadata')}
            {renderDebugBlock('Request', detail?.requestBody ?? 'Request payload was not captured.', 'request')}
            {renderDebugBlock('Response', detail?.responseText ?? 'Response was not captured.', 'response')}
            {renderDebugBlock('Parsed JSON', detail?.parsedJsonText ?? 'No JSON code block was extracted.', 'parsed-json')}
            {renderDebugBlock('Error', detail?.parseError ?? 'Request completed without a parse error.', 'error')}
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  const handleApplyMessage = useCallback((messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const result = validateIdeogramJSONVerbose(msg.content);
    if (!result.output) {
      setErrorToast(result.error || 'JSON 解析失败，请检查格式');
      return;
    }
    const count = applyMessageOutput(msg);
    if (count) {
      setApplyToast(`Applied ${count} boxes`);
      useEditorStore.getState().updateCanvasChatMessage(messageId, { applied: true });
    }
  }, [applyMessageOutput, messages]);

  // ─── 始终渲染：底部横杠可点击 toggle + JS 状态驱动面板 ──────
  return (
    <>
      <div
        ref={wrapperRef}
        className={`canvas-chat-handle-wrapper${isCanvasChatOpen ? ' open' : ''}${isCanvasChatMaximized ? ' maximized' : ''}`}
      >
        <div className="canvas-chat-panel">
          {/* Header */}
          <div className="canvas-chat-header">
            <span className="canvas-chat-header-title">🤖 Canvas AI Compose</span>
            <span className="chat-header-spacer" />
            <button
              type="button"
              className="canvas-chat-icon-btn"
              aria-label="Maximize Canvas Chat"
              title="Maximize Canvas Chat"
              onClick={handleMaximize}
            >
              <IconMaximize size={14} />
            </button>
          </div>

          {/* 无 LLM 配置提示 */}
          {!hasProviders && (
            <div className="chat-no-provider">
              <p>{t('chat.noProvider')}</p>
              <button
                className="btn"
                onClick={handleAddProvider}
                style={{ fontSize: 12, padding: '5px 14px' }}
              >
                {t('llmConfig.addProvider')}
              </button>
            </div>
          )}

          {/* Messages */}
          {hasProviders && (
            <div className="chat-messages" ref={messagesRef}>
              {messages.length === 0 && !isLoading && (
                <div className="chat-empty-hint">{t('chat.emptyHint')}</div>
              )}
              {messages.map(msg => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  dismissed={false}
                  onApply={handleApplyMessage}
                  onRetry={msg.role === 'assistant' ? handleRetry : undefined}
                  onEdit={msg.role === 'user' ? handleEdit : undefined}
                  isLoading={isLoading}
                />
              ))}
              {isLoading && (
                <div className="chat-loading">
                  <span className="canvas-chat-spinner" />
                  {' '}{t('chat.loading')}
                  {' · '}<span className="chat-stop-hint" style={{ color: 'var(--danger)' }}>{t('chat.stop')}</span>
                </div>
              )}
            </div>
          )}

          {/* Input Area */}
          {hasProviders && (
            <div className="canvas-chat-input-area">
              <div className="canvas-chat-toolbar">
                {chatPresets.length > 0 && (
                  <SelectMenu
                    className="chat-preset-select"
                    options={chatPresets.map(p => ({ value: p.id, label: p.name }))}
                    value={selectedPreset?.id || ''}
                    onChange={handlePresetChange}
                    placeholder={t('chat.presets.selectPreset')}
                  />
                )}
                <SelectMenu
                  className="chat-sp-select"
                  options={canvasSystemPromptOptions}
                  value={activeCanvasChatSystemPrompt?.id || ''}
                  onChange={handleCanvasSystemPromptChange}
                  placeholder={t('chat.systemPrompt.sp')}
                />
                <SelectMenu
                  className="chat-model-select"
                  options={modelOptions.map(opt => ({ value: opt.value, label: opt.label }))}
                  value={chatModel}
                  onChange={handleSelectModel}
                  placeholder={t('chat.modelSelect')}
                />
                <SelectMenu
                  className="chat-lang-select"
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'en', label: 'EN' },
                    { value: 'zh', label: '中文' },
                  ]}
                  value={chatResponseLang}
                  onChange={setChatResponseLang}
                />
                {renderTargetSizeControl()}
                <ChatRunControls />
                <span className="chat-header-spacer" />
              </div>
              <div className="canvas-chat-input-row">
                <textarea
                  ref={textareaRef}
                  className={`chat-input${editingMessageId ? ' editing' : ''}`}
                  rows={2}
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the scene you want to compose..."
                  disabled={isLoading}
                />
                <div className="canvas-chat-input-actions">
                  {isLoading ? (
                    <button
                      className="chat-send-btn stop"
                      onClick={stopGeneration}
                      aria-label={t('chat.stop')}
                      title={t('chat.stop')}
                    >
                      <IconStop size={14} />
                    </button>
                  ) : (
                    <button
                      className="chat-send-btn"
                      onClick={handleSend}
                      disabled={!inputText.trim()}
                      aria-label={t('chat.send')}
                      title={t('chat.send')}
                    >
                      <IconArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Apply 成功 Toast */}
          {applyToast && (
            <div className="canvas-chat-toast">{applyToast}</div>
          )}
          {errorToast && (
            <div className="canvas-chat-toast-error">{errorToast}</div>
          )}
        </div>
        {isCanvasChatMaximized && (
          <>
            <div className="canvas-chat-backdrop" aria-hidden="true" />
            <div
              className="canvas-chat-workbench"
              role="dialog"
              aria-label="Canvas Chat Workbench"
              onWheelCapture={handleWorkbenchWheel}
            >
            <aside className="canvas-chat-workbench-sidebar">
              <div className="canvas-chat-workbench-section-title">{t('chat.canvasSessions.sectionTitle')}</div>
              <button
                type="button"
                className="canvas-chat-session-new"
                onClick={handleCreateSession}
              >
                {t('chat.canvasSessions.newSession')}
              </button>
              <div className="canvas-chat-session-list">
                {canvasChatSessions.map(session => (
                  <div
                    key={session.id}
                    className={`canvas-chat-session-item${session.id === activeCanvasChatSessionId ? ' active' : ''}`}
                    onContextMenu={e => handleSessionContextMenu(e, session.id)}
                  >
                    <button
                      type="button"
                      className="canvas-chat-session-select"
                      onClick={() => selectCanvasChatSession(session.id)}
                    >
                      <span className="canvas-chat-session-title">{session.title}</span>
                      <span className="canvas-chat-session-meta">
                        {t('chat.canvasSessions.messageCount', { count: session.messages.length })}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="canvas-chat-session-menu-button"
                      aria-label={t('chat.canvasSessions.menuAria', { title: session.title })}
                      title={t('chat.canvasSessions.menuAria', { title: session.title })}
                      onClick={e => handleSessionMenuClick(e, session.id)}
                    >
                      <IconMoreHorizontal size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </aside>

            <section className="canvas-chat-workbench-chat">
              <div className="canvas-chat-workbench-header">
                <span className="canvas-chat-header-title">Canvas AI Compose</span>
                <button
                  type="button"
                  className="canvas-chat-icon-btn"
                  aria-label="Restore Canvas Chat"
                  title="Restore Canvas Chat"
                  onClick={handleRestore}
                >
                  <IconClose size={14} />
                </button>
              </div>
              <div className="canvas-chat-workbench-messages">
                {!hasProviders && (
                  <div className="chat-no-provider">
                    <p>{t('chat.noProvider')}</p>
                    <button
                      className="btn"
                      onClick={handleAddProvider}
                      style={{ fontSize: 12, padding: '5px 14px' }}
                    >
                      {t('llmConfig.addProvider')}
                    </button>
                  </div>
                )}
                {hasProviders && messages.length === 0 && !isLoading && (
                  <div className="chat-empty-hint">{t('chat.emptyHint')}</div>
                )}
                {hasProviders && messages.map(msg => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    dismissed={false}
                    onApply={handleApplyMessage}
                    onRetry={msg.role === 'assistant' ? handleRetry : undefined}
                    onEdit={msg.role === 'user' ? handleEdit : undefined}
                    isLoading={isLoading}
                  />
                ))}
              </div>
              {hasProviders && (
                <div className="canvas-chat-input-area canvas-chat-workbench-input-area">
                  {editingMessageId && (
                    <div className="chat-editing-indicator">
                      {t('chat.editingMessage')}
                      <button className="chat-editing-cancel" onClick={() => { setEditingMessageId(null); setInputText(''); }}>
                        <IconClose size={14} />
                      </button>
                    </div>
                  )}
                  <div className="canvas-chat-toolbar">
                    {chatPresets.length > 0 && (
                      <SelectMenu
                        className="chat-preset-select"
                        options={chatPresets.map(p => ({ value: p.id, label: p.name }))}
                        value={selectedPreset?.id || ''}
                        onChange={handlePresetChange}
                        placeholder={t('chat.presets.selectPreset')}
                      />
                    )}
                    <SelectMenu
                      className="chat-sp-select"
                      options={canvasSystemPromptOptions}
                      value={activeCanvasChatSystemPrompt?.id || ''}
                      onChange={handleCanvasSystemPromptChange}
                      placeholder={t('chat.systemPrompt.sp')}
                    />
                    <SelectMenu
                      className="chat-model-select"
                      options={modelOptions.map(opt => ({ value: opt.value, label: opt.label }))}
                      value={chatModel}
                      onChange={handleSelectModel}
                      placeholder={t('chat.modelSelect')}
                    />
                    <SelectMenu
                      className="chat-lang-select"
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'en', label: 'EN' },
                        { value: 'zh', label: '中文' },
                      ]}
                      value={chatResponseLang}
                      onChange={setChatResponseLang}
                    />
                    {renderTargetSizeControl()}
                    <ChatRunControls />
                    <span className="chat-header-spacer" />
                  </div>
                  <div className="canvas-chat-input-row">
                    <textarea
                      className={`chat-input${editingMessageId ? ' editing' : ''}`}
                      rows={2}
                      value={inputText}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe the scene you want to compose..."
                      disabled={isLoading}
                    />
                    <div className="canvas-chat-input-actions">
                      {isLoading ? (
                        <button
                          className="chat-send-btn stop"
                          onClick={stopGeneration}
                          aria-label={t('chat.stop')}
                          title={t('chat.stop')}
                        >
                          <IconStop size={14} />
                        </button>
                      ) : (
                        <button
                          className="chat-send-btn"
                          onClick={handleSend}
                          disabled={!inputText.trim()}
                          aria-label={t('chat.send')}
                          title={t('chat.send')}
                        >
                          <IconArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <aside className="canvas-chat-terminal-panel">
              <div className="canvas-chat-workbench-section-title">{t('chat.canvasSessions.terminal')}</div>
              {activeTerminalLog ? (
                <div className="canvas-chat-terminal-log">
                  <button
                    type="button"
                    className={`canvas-chat-terminal-request ${activeTerminalLog.status}`}
                    onClick={() => setDetailLogId(activeTerminalLog.id)}
                    title="查看请求完整详情"
                  >
                    <span className="canvas-chat-terminal-request-title">
                      {activeTerminalLog.promptPreview}
                    </span>
                    <span className="canvas-chat-terminal-request-status">
                      {activeTerminalLog.status}
                    </span>
                  </button>
                  <div className="canvas-chat-terminal-sections">
                    {renderTerminalSections(activeTerminalLog, expandedStepId, setExpandedStepId, t, highlightJson, handleCopyDebugText, copiedSection)}
                  </div>
                </div>
              ) : (
                <div className="canvas-chat-terminal-empty">{t('chat.canvasSessions.noRequestLogs')}</div>
              )}
            </aside>
            </div>
          </>
        )}
      </div>

      {sessionMenu && (
        <ContextMenu
          x={sessionMenu.x}
          y={sessionMenu.y}
          onClose={() => setSessionMenu(null)}
          items={[
            {
              icon: <IconPencil size={12} />,
              label: t('chat.canvasSessions.rename'),
              onClick: () => handleOpenRenameSession(sessionMenu.sessionId),
            },
            {
              icon: <IconBroom size={12} />,
              label: t('chat.canvasSessions.clear'),
              onClick: () => handleClearSession(sessionMenu.sessionId),
            },
            'divider',
            {
              icon: <IconTrash size={12} />,
              label: t('chat.canvasSessions.delete'),
              danger: true,
              onClick: () => handleDeleteSession(sessionMenu.sessionId),
            },
          ]}
        />
      )}

      {renamingSession && createPortal(
        <div className="modal-overlay canvas-chat-rename-overlay" onClick={handleCancelRenameSession}>
          <div
            className="canvas-chat-rename-modal"
            role="dialog"
            aria-label={t('chat.canvasSessions.renameAria')}
            onClick={e => e.stopPropagation()}
          >
            <h3>{t('chat.canvasSessions.renameAria')}</h3>
            <label className="canvas-chat-rename-label" htmlFor="canvas-chat-rename-input">
              {t('chat.canvasSessions.titleLabel')}
            </label>
            <input
              id="canvas-chat-rename-input"
              className="canvas-chat-rename-input"
              aria-label={t('chat.canvasSessions.titleLabel')}
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleConfirmRenameSession();
                if (e.key === 'Escape') handleCancelRenameSession();
              }}
              autoFocus
            />
            <div className="canvas-chat-rename-actions">
              <button className="btn" type="button" onClick={handleCancelRenameSession}>
                {t('chat.canvasSessions.cancelRename')}
              </button>
              <button
                className="btn canvas-chat-apply-btn"
                type="button"
                aria-label={t('chat.canvasSessions.saveRenameAria')}
                onClick={handleConfirmRenameSession}
                disabled={!renameDraft.trim()}
              >
                {t('chat.canvasSessions.saveRename')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {renderRequestDetailModal()}
    </>
  );
}
