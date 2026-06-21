export type Lang = 'en' | 'zh';

export interface Translations {
  header: {
    ratio: string;
    scale: string;
    resetCanvas: string;
    favoriteCanvas: string;
    favoriteSaved: string;
    ratios: {
      '1:1': string;
      '16:9': string;
      '9:16': string;
      '4:3': string;
      '3:2': string;
      '2:1': string;
      custom: string;
    };
  };
  nav: {
    canvas: string;
    settings: string;
  };
  settings: {
    pageTitle: string;
    pageSubtitle: string;
    moduleNavLabel: string;
    activeModuleLabel: string;
    llmProviders: string;
    promptPresets: string;
    modules: {
      llm: {
        title: string;
        description: string;
        status: string;
      };
      presets: {
        title: string;
        description: string;
        status: string;
      };
      workspace: {
        title: string;
        description: string;
        status: string;
        statusWithGist: string;
      };
    };
    workspace: {
      heading: string;
      favorites: string;
      favoriteCount: string;
      noFavorites: string;
      boxCount: string;
      restore: string;
      rename: string;
      delete: string;
      backup: string;
      fixedGist: string;
      githubToken: string;
      githubTokenPlaceholder: string;
      createToken: string;
      gistId: string;
      gistIdPlaceholder: string;
      lastBackup: string;
      lastRestore: string;
      never: string;
      saveSettings: string;
      backUpNow: string;
      restoreFromGist: string;
      findBackupGist: string;
      findingBackup: string;
      backupFound: string;
      backupNotFound: string;
      clearSettings: string;
      securityNote: string;
      settingsSaved: string;
      settingsCleared: string;
      backingUp: string;
      backupDone: string;
      loadingRestore: string;
      restoreReady: string;
      restoring: string;
      restoreDone: string;
      restorePreview: string;
      llmProviderWarning: string;
      confirmRestore: string;
      cancelRestore: string;
      renameFavoritePrompt: string;
      restoreFavoriteConfirm: string;
      deleteFavoriteConfirm: string;
      favoriteRestored: string;
      favoriteDeleted: string;
      modules: {
        currentCanvas: string;
        canvasChatSessions: string;
        canvasFavorites: string;
        chatPresets: string;
        llmProviders: string;
        uiPreferences: string;
      };
    };
  };
  panels: {
    globalSettings: {
      title: string;
      photo: string;
      artStyle: string;
      highLevelDescription: string;
      aesthetics: string;
      lighting: string;
      medium: string;
      background: string;
      globalColorPalette: string;
    };
    boxProperties: {
      title: string;
      mode: string;
      objectLabel: string;
      textLabel: string;
      textContent: string;
      description: string;
      boxColorPalette: string;
      deleteBox: string;
      multiSelected: string;
      deleteSelected: string;
    };
  };
  colorPalette: {
    add: string;
    maxColors: string;
  };
  json: {
    panel: string;
    generatePrompt: string;
    loadFromPasted: string;
    jsonMode: string;
    previewMode: string;
    placeholder: string;
    invalidJson: string;
  };
  comfyui: {
    generation: string;
    seed: string;
    apiUrl: string;
    generateImage: string;
    generating: string;
    generationFailed: string;
    generatedResult: string;
  };
  llm: {
    tools: string;
    configureToUse: string;
    configure: string;
    models: string;
    manageConfig: string;
    optimizePrompt: string;
  };
  llmConfig: {
    back: string;
    title: string;
    providers: string;
    addProvider: string;
    noProviders: string;
    id: string;
    idPlaceholder: string;
    idImmutable: string;
    name: string;
    namePlaceholder: string;
    protocolType: string;
    baseUrl: string;
    apiKey: string;
    show: string;
    hide: string;
    keyMasked: string;
    modelList: string;
    fetching: string;
    fetchModels: string;
    fillBaseUrlFirst: string;
    fillApiKeyFirst: string;
    clickFetchHint: string;
    uncheckToRemove: string;
    newProvider: string;
    unsavedChanges: string;
    upToDate: string;
    delete: string;
    saving: string;
    saveConfig: string;
    selectOrCreate: string;
    newProviderButton: string;
    loading: string;
    toast: {
      idNameRequired: string;
      saved: string;
      saveFailed: string;
      confirmDelete: string;
      deleted: string;
      deleteFailed: string;
      fillBaseUrl: string;
      fillApiKey: string;
      fetchedModels: string;
      fetchFailed: string;
    };
  };
  optimize: {
    optimizing: string;
    aiSuggestion: string;
    adopt: string;
    dismiss: string;
    noProvider: string;
    failed: string;
    sparkleTooltip: string;
  };
  common: {
    imageDropError: string;
  };
  artboard: {
    resetPosition: string;
  };
  contextMenu: {
    duplicate: string;
    cut: string;
    copy: string;
    delete: string;
    bringToFront: string;
    sendToBack: string;
    importReferenceImage: string;
    clearReferenceImage: string;
    openAiChat: string;
    paste: string;
    importBackgroundImage: string;
    clearBackgroundImage: string;
    clearAllBoxes: string;
    fitToArtboard: string;
  };
  chat: {
    title: string;
    boxBadge: string;
    modelSelect: string;
    noProvider: string;
    configureLlm: string;
    inputPlaceholder: string;
    send: string;
    adopt: string;
    dismiss: string;
    adopted: string;
    you: string;
    retry: string;
    edit: string;
    editingMessage: string;
    copy: string;
    copied: string;
    clearHistory: string;
    loading: string;
    stop: string;
    error: string;
    emptyHint: string;
    langAuto: string;
    streamOutput: string;
    streamShort: string;
    streamHint: string;
    thinkingStrength: string;
    thinkingShort: string;
    thinkingHint: string;
    targetImageSize: string;
    targetSizeShort: string;
    targetSizeHint: string;
    jsonView: string;
    previewView: string;
    previewAlt: string;
    previewUnavailable: string;
    thinkingLevels: {
      off: string;
      low: string;
      medium: string;
      high: string;
    };
    canvasSessions: {
      sectionTitle: string;
      newSession: string;
      menuAria: string;
      titleLabel: string;
      rename: string;
      renameAria: string;
      clear: string;
      clearAria: string;
      delete: string;
      deleteAria: string;
      saveRename: string;
      saveRenameAria: string;
      cancelRename: string;
      messageCount: string;
      terminal: string;
      noRequestLogs: string;
      requestDetails: string;
      closeDetails: string;
      copy: string;
      copied: string;
    };
    presets: {
      title: string;
      selectPreset: string;
      manage: string;
      addPreset: string;
      searchPlaceholder: string;
      allTags: string;
      noPresets: string;
      edit: string;
      editPreset: string;
      newPreset: string;
      name: string;
      namePlaceholder: string;
      description: string;
      descPlaceholder: string;
      template: string;
      templatePlaceholder: string;
      variableHint: string;
      tags: string;
      addTag: string;
      save: string;
      cancel: string;
      delete: string;
      duplicate: string;
    };
    systemPrompt: {
      title: string;
      moduleDesc: string;
      info: string;
      canvasTitle: string;
      canvasDesc: string;
      boxTitle: string;
      boxDesc: string;
      apply: string;
      reset: string;
      default: string;
      customized: string;
      custom: string;
    };
    image: {
      uploadHint: string;
      clear: string;
      attachImage: string;
    };
  };
  layoutQuality: {
    title: string;
    passedTitle: string;
    pass: string;
    fail: string;
    accept: string;
    regenerate: string;
    metric: {
      element_area: string;
      coverage: string;
      spacing: string;
      margin: string;
      element_count: string;
      aspect_ratio: string;
    };
  };
  shortcuts: {
    button: string;
    title: string;
    close: string;
    groups: {
      boxOps: string;
      editing: string;
      canvas: string;
    };
    keys: {
      ctrlD: string;
      ctrlX: string;
      ctrlC: string;
      ctrlV: string;
      delete: string;
      doubleClick: string;
      altDrag: string;
      scroll: string;
      middleDrag: string;
    };
    items: {
      duplicate: string;
      cut: string;
      copy: string;
      paste: string;
      delete: string;
      inlineEdit: string;
      altDrag: string;
      wheelZoom: string;
      middlePan: string;
    };
  };
}

const en: Translations = {
  header: {
    ratio: 'Ratio:',
    scale: '×',
    resetCanvas: 'Reset Canvas',
    favoriteCanvas: 'Favorite Canvas',
    favoriteSaved: 'Canvas saved to favorites.',
    ratios: {
      '1:1': '1:1 (Square)',
      '16:9': '16:9 (Widescreen)',
      '9:16': '9:16 (Portrait)',
      '4:3': '4:3 (Classic)',
      '3:2': '3:2 (Photography)',
      '2:1': '2:1 (Panorama)',
      custom: 'Custom',
    },
  },
  nav: {
    canvas: 'Canvas',
    settings: 'Settings',
  },
  settings: {
    pageTitle: 'Configuration Center',
    pageSubtitle: 'Manage model providers, reusable prompt templates, and workspace backups from one focused console.',
    moduleNavLabel: 'Settings modules',
    activeModuleLabel: 'Active module',
    llmProviders: 'LLM Providers',
    promptPresets: 'Prompt Presets',
    modules: {
      llm: {
        title: 'LLM Providers',
        description: 'Configure the models used by box chat and canvas composition.',
        status: 'Provider list opens here',
      },
      presets: {
        title: 'Prompt Presets',
        description: 'Manage reusable templates for per-box chat and canvas chat.',
        status: '{count} presets',
      },
      workspace: {
        title: 'Workspace',
        description: 'Save favorite canvases and back up local workspace data to a private Gist.',
        status: '{count} favorites',
        statusWithGist: '{count} favorites · Gist backup configured',
      },
    },
    workspace: {
      heading: 'Workspace',
      favorites: 'Canvas Favorites',
      favoriteCount: '{count} saved',
      noFavorites: 'No favorite canvases yet.',
      boxCount: '{count} boxes',
      restore: 'Restore',
      rename: 'Rename',
      delete: 'Delete',
      backup: 'Workspace Backup',
      fixedGist: 'Fixed private Gist',
      githubToken: 'GitHub Token',
      githubTokenPlaceholder: 'Personal access token',
      createToken: 'Create a token with gist scope',
      gistId: 'Gist ID',
      gistIdPlaceholder: 'Created after first backup',
      lastBackup: 'Last backup',
      lastRestore: 'Last restore',
      never: 'Never',
      saveSettings: 'Save Settings',
      backUpNow: 'Back Up Now',
      restoreFromGist: 'Restore From Gist',
      findBackupGist: 'Find Backup Gist',
      findingBackup: 'Searching for backup Gist...',
      backupFound: 'Backup Gist found.',
      backupNotFound: 'No backup Gist found. Create one with "Back Up Now".',
      clearSettings: 'Clear Local Settings',
      securityNote: 'Private Gist is not end-to-end encrypted. GitHub PAT is saved in localStorage, and workspace backups include LLM provider API keys.',
      settingsSaved: 'Workspace settings saved.',
      settingsCleared: 'Workspace backup settings cleared.',
      backingUp: 'Backing up workspace...',
      backupDone: 'Workspace backup completed.',
      loadingRestore: 'Loading backup from Gist...',
      restoreReady: 'Restore preview is ready.',
      restoring: 'Restoring selected modules...',
      restoreDone: 'Workspace restore completed.',
      restorePreview: 'Restore Preview',
      llmProviderWarning: 'Includes API keys. Confirming restore will overwrite local provider configuration.',
      confirmRestore: 'Confirm Restore',
      cancelRestore: 'Cancel',
      renameFavoritePrompt: 'Rename favorite',
      restoreFavoriteConfirm: 'Restore this favorite and overwrite the current canvas?',
      deleteFavoriteConfirm: 'Delete this favorite canvas?',
      favoriteRestored: 'Favorite canvas restored.',
      favoriteDeleted: 'Favorite canvas deleted.',
      modules: {
        currentCanvas: 'Current Canvas',
        canvasChatSessions: 'Canvas Chat Sessions',
        canvasFavorites: 'Canvas Favorites',
        chatPresets: 'Prompt Presets',
        llmProviders: 'LLM Providers',
        uiPreferences: 'UI Preferences',
      },
    },
  },
  panels: {
    globalSettings: {
      title: 'Global Settings',
      photo: 'Photo',
      artStyle: 'Art Style',
      highLevelDescription: 'High Level Description',
      aesthetics: 'Aesthetics',
      lighting: 'Lighting',
      medium: 'Medium',
      background: 'Background',
      globalColorPalette: 'Global Color Palette',
    },
    boxProperties: {
      title: 'Box Properties',
      mode: 'Mode',
      objectLabel: 'Object (obj)',
      textLabel: 'Text (text)',
      textContent: 'Text Content',
      description: 'Description',
      boxColorPalette: 'Box Color Palette',
      deleteBox: 'Delete Box',
      multiSelected: 'Selected {count} elements',
      deleteSelected: 'Delete Selected',
    },
  },
  colorPalette: {
    add: 'Add',
    maxColors: 'Max {max} colors allowed.',
  },
  json: {
    panel: 'JSON',
    generatePrompt: 'Generate JSON Prompt',
    loadFromPasted: 'Load From Pasted JSON',
    jsonMode: 'JSON',
    previewMode: 'Preview',
    placeholder: 'JSON output will appear here...',
    invalidJson: 'Invalid JSON: {error}',
  },
  comfyui: {
    generation: 'Generation',
    seed: 'Seed:',
    apiUrl: 'ComfyUI API URL',
    generateImage: 'Generate Image',
    generating: 'Generating...',
    generationFailed: 'Generation failed. Check the console for details.',
    generatedResult: 'Generated result',
  },
  llm: {
    tools: 'LLM Tools',
    configureToUse: 'Configure LLM providers to use AI-assisted prompt generation',
    configure: 'Configure LLM',
    models: '{count} models',
    manageConfig: 'Manage Config',
    optimizePrompt: 'Optimize Prompt',
  },
  llmConfig: {
    back: '← Back',
    title: 'LLM Configuration',
    providers: 'Providers',
    addProvider: '+ Add',
    noProviders: 'No providers yet. Click "+ Add" to create one.',
    id: 'ID',
    idPlaceholder: 'e.g. my-openai',
    idImmutable: 'Cannot be modified after creation',
    name: 'Name',
    namePlaceholder: 'e.g. GPT-4o',
    protocolType: 'Protocol Type',
    baseUrl: 'Base URL',
    apiKey: 'API Key',
    show: 'Show',
    hide: 'Hide',
    keyMasked: 'Key is masked. Re-enter to update.',
    modelList: 'Model List',
    fetching: 'Fetching...',
    fetchModels: 'Fetch Models',
    fillBaseUrlFirst: 'Please fill in Base URL and API Key first',
    fillApiKeyFirst: 'Please fill in a valid API Key first',
    clickFetchHint: 'Click "Fetch Models" to pull from provider',
    uncheckToRemove: 'Uncheck to remove the model',
    newProvider: 'New Provider',
    unsavedChanges: 'Unsaved changes',
    upToDate: 'Up to date',
    delete: 'Delete',
    saving: 'Saving...',
    saveConfig: 'Save Config',
    selectOrCreate: 'Select a provider or create a new configuration',
    newProviderButton: '+ New Provider',
    loading: 'Loading...',
    toast: {
      idNameRequired: 'ID and name cannot be empty',
      saved: 'Saved successfully',
      saveFailed: 'Save failed: {error}',
      confirmDelete: 'Are you sure you want to delete this provider?',
      deleted: 'Deleted successfully',
      deleteFailed: 'Delete failed: {error}',
      fillBaseUrl: 'Please fill in Base URL first',
      fillApiKey: 'Please fill in a valid API Key first',
      fetchedModels: 'Fetched {count} models',
      fetchFailed: 'Failed to fetch models: {error}',
    },
  },
  optimize: {
    optimizing: 'AI is optimizing...',
    aiSuggestion: 'AI Suggestion:',
    adopt: 'Adopt',
    dismiss: 'Dismiss',
    noProvider: 'No LLM provider available. Please configure one first.',
    failed: 'Optimization failed: {error}',
    sparkleTooltip: 'AI optimize this field',
  },
  common: {
    imageDropError: 'Please drop an image file.',
  },
  artboard: {
    resetPosition: 'Reset artboard position',
  },
  contextMenu: {
    duplicate: 'Duplicate',
    cut: 'Cut',
    copy: 'Copy',
    delete: 'Delete',
    bringToFront: 'Bring to Front',
    sendToBack: 'Send to Back',
    importReferenceImage: 'Import Reference Image',
    clearReferenceImage: 'Clear Reference Image',
    openAiChat: 'Open AI Chat',
    paste: 'Paste',
    importBackgroundImage: 'Import Background Image',
    clearBackgroundImage: 'Clear Background Image',
    clearAllBoxes: 'Clear All Boxes',
    fitToArtboard: 'Fit to Artboard',
  },
  chat: {
    title: 'AI Chat',
    boxBadge: 'box: {name}',
    modelSelect: 'Select model',
    noProvider: 'No LLM provider configured yet',
    configureLlm: 'Configure LLM',
    inputPlaceholder: 'Type a message...',
    send: 'Send',
    adopt: 'Adopt',
    dismiss: 'Dismiss',
    adopted: 'Adopted ✓',
    you: 'You',
    retry: 'Retry',
    edit: 'Edit',
    editingMessage: 'Editing message — press Esc to cancel',
    copy: 'Copy',
    copied: 'Copied!',
    clearHistory: 'Clear',
    loading: 'AI is thinking...',
    stop: 'Stop',
    error: 'Error: {error}',
    emptyHint: 'Send a message to start the conversation',
    langAuto: 'Auto',
    streamOutput: 'Stream output',
    streamShort: 'Stream',
    streamHint: 'Show AI responses as they arrive.',
    thinkingStrength: 'Thinking strength',
    thinkingShort: 'Think',
    thinkingHint: 'Reasoning effort depends on the selected model.',
    targetImageSize: 'Canvas Chat target image size',
    targetSizeShort: 'Size',
    targetSizeHint: 'Target canvasW/canvasH for the next Canvas Chat composition.',
    jsonView: 'json',
    previewView: 'Preview',
    previewAlt: 'Canvas preview',
    previewUnavailable: 'Preview unavailable',
    thinkingLevels: {
      off: 'Off',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    },
    canvasSessions: {
      sectionTitle: 'Sessions',
      newSession: '+ New',
      menuAria: 'Session actions for {title}',
      titleLabel: 'Session title',
      rename: 'Rename',
      renameAria: 'Rename session',
      clear: 'Clear',
      clearAria: 'Clear session',
      delete: 'Delete',
      deleteAria: 'Delete session',
      saveRename: 'Save',
      saveRenameAria: 'Save session name',
      cancelRename: 'Cancel',
      messageCount: '{count} messages',
      terminal: 'Terminal',
      noRequestLogs: 'No request logs yet',
      requestDetails: 'Request details',
      closeDetails: 'Close request details',
      copy: 'Copy',
      copied: 'Copied',
    },
    presets: {
      title: 'Preset Manager',
      selectPreset: 'Select Preset...',
      manage: 'Manage Presets',
      addPreset: '+ Add',
      searchPlaceholder: 'Search presets...',
      allTags: 'All Tags',
      noPresets: 'No presets yet.',
      edit: 'Edit',
      editPreset: 'Edit Preset',
      newPreset: 'New Preset',
      name: 'Name',
      namePlaceholder: 'e.g. Character Detail Enhancer',
      description: 'Description',
      descPlaceholder: 'Brief description of the preset\'s purpose',
      template: 'Template',
      templatePlaceholder: 'Enter your prompt template with variables...',
      variableHint: 'Available variables',
      tags: 'Tags',
      addTag: 'Add',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      duplicate: 'Duplicate',
    },
    systemPrompt: {
      title: 'System Prompts',
      moduleDesc: 'Edit Canvas & Box chat system prompts',
      info: 'Customize the system prompts that guide AI behavior. Changes affect new conversations only. Reset to restore the default prompt.',
      canvasTitle: 'Canvas Chat System Prompt',
      canvasDesc: 'Guides the AI composition dialog behavior and output format',
      boxTitle: 'Per-Box Chat System Prompt',
      boxDesc: 'Guides per-box AI chat for prompt optimization',
      apply: 'Apply',
      reset: 'Reset',
      default: 'Default',
      customized: 'Customized',
      custom: 'Custom',
    },
    image: {
      uploadHint: 'Upload an image',
      clear: 'Remove image',
      attachImage: 'Attach image as reference',
    },
  },
  layoutQuality: {
    title: 'Layout Quality Check',
    passedTitle: 'Layout Check Passed',
    pass: 'Layout check passed.',
    fail: 'Layout issues detected:',
    accept: 'Accept Current Layout',
    regenerate: 'Regenerate',
    metric: {
      element_area: 'Element Size',
      coverage: 'Canvas Coverage',
      spacing: 'Element Spacing',
      margin: 'Canvas Margin',
      element_count: 'Element Count',
      aspect_ratio: 'Aspect Ratio',
    },
  },
  shortcuts: {
    button: 'Shortcuts',
    title: 'Shortcuts',
    close: 'Close',
    groups: {
      boxOps: 'Box Operations',
      editing: 'Interactive Editing',
      canvas: 'Canvas View',
    },
    keys: {
      ctrlD: 'Ctrl+D',
      ctrlX: 'Ctrl+X',
      ctrlC: 'Ctrl+C',
      ctrlV: 'Ctrl+V',
      delete: 'Delete',
      doubleClick: 'Double-click',
      altDrag: 'Alt+Drag',
      scroll: 'Scroll',
      middleDrag: 'Middle-drag',
    },
    items: {
      duplicate: 'Duplicate selected box',
      cut: 'Cut selected box',
      copy: 'Copy selected box',
      paste: 'Paste',
      delete: 'Delete selected box',
      inlineEdit: 'Inline edit box text',
      altDrag: 'Draw a new box over existing ones',
      wheelZoom: 'Zoom the artboard',
      middlePan: 'Pan the artboard',
    },
  },
};

const zh: Translations = {
  header: {
    ratio: '比例：',
    scale: '×',
    resetCanvas: '重置画布',
    favoriteCanvas: '收藏当前画布',
    favoriteSaved: '画布已加入收藏。',
    ratios: {
      '1:1': '1:1 (方形)',
      '16:9': '16:9 (宽屏)',
      '9:16': '9:16 (竖屏)',
      '4:3': '4:3 (经典)',
      '3:2': '3:2 (摄影)',
      '2:1': '2:1 (全景)',
      custom: '自定义',
    },
  },
  nav: {
    canvas: '画布',
    settings: '设置',
  },
  settings: {
    pageTitle: '配置中心',
    pageSubtitle: '集中管理模型提供商、可复用提示词模板和工作区备份。',
    moduleNavLabel: '设置模块',
    activeModuleLabel: '当前模块',
    llmProviders: 'LLM 提供商',
    promptPresets: '提示词预设',
    modules: {
      llm: {
        title: 'LLM 提供商',
        description: '配置边界框对话和画布构图使用的模型。',
        status: '提供商列表在此管理',
      },
      presets: {
        title: '提示词预设',
        description: '管理 per-box chat 和 canvas chat 的可复用模板。',
        status: '{count} 个预设',
      },
      workspace: {
        title: 'Workspace',
        description: '管理画布收藏，并将本地工作区数据备份到 private Gist。',
        status: '{count} 个收藏',
        statusWithGist: '{count} 个收藏 · 已配置 Gist 备份',
      },
    },
    workspace: {
      heading: 'Workspace',
      favorites: '画布收藏',
      favoriteCount: '已保存 {count} 个',
      noFavorites: '还没有收藏画布。',
      boxCount: '{count} 个框',
      restore: '恢复',
      rename: '重命名',
      delete: '删除',
      backup: '工作区备份',
      fixedGist: '固定 private Gist',
      githubToken: 'GitHub Token',
      githubTokenPlaceholder: 'Personal access token',
      createToken: '创建 Gist 权限的 Token',
      gistId: 'Gist ID',
      gistIdPlaceholder: '首次备份后自动生成',
      lastBackup: '最后备份',
      lastRestore: '最后恢复',
      never: '从未',
      saveSettings: '保存设置',
      backUpNow: '立即备份',
      restoreFromGist: '从 Gist 恢复',
      findBackupGist: '查找备份 Gist',
      findingBackup: '正在查找备份 Gist...',
      backupFound: '已找到备份 Gist。',
      backupNotFound: '未找到备份 Gist。请先通过"立即备份"创建一个。',
      clearSettings: '清空本地设置',
      securityNote: 'Private Gist 不是端到端加密。GitHub PAT 会保存到本机 localStorage，工作区备份会包含 LLM provider API key。',
      settingsSaved: 'Workspace 设置已保存。',
      settingsCleared: 'Workspace 备份设置已清空。',
      backingUp: '正在备份工作区...',
      backupDone: '工作区备份完成。',
      loadingRestore: '正在从 Gist 读取备份...',
      restoreReady: '恢复预览已准备好。',
      restoring: '正在恢复选中模块...',
      restoreDone: '工作区恢复完成。',
      restorePreview: '恢复预览',
      llmProviderWarning: '包含 API key，确认恢复后会覆盖本机 provider 配置。',
      confirmRestore: '确认恢复',
      cancelRestore: '取消',
      renameFavoritePrompt: '重命名收藏',
      restoreFavoriteConfirm: '恢复该收藏会覆盖当前画布，是否继续？',
      deleteFavoriteConfirm: '删除这个画布收藏？',
      favoriteRestored: '画布收藏已恢复。',
      favoriteDeleted: '画布收藏已删除。',
      modules: {
        currentCanvas: '当前画布',
        canvasChatSessions: 'Canvas Chat 会话',
        canvasFavorites: '画布收藏',
        chatPresets: '聊天预设',
        llmProviders: 'LLM 提供商',
        uiPreferences: 'UI 偏好',
      },
    },
  },
  panels: {
    globalSettings: {
      title: '全局设置',
      photo: '照片',
      artStyle: '艺术风格',
      highLevelDescription: '高层描述',
      aesthetics: '美学',
      lighting: '光照',
      medium: '媒介',
      background: '背景',
      globalColorPalette: '全局调色板',
    },
    boxProperties: {
      title: '边界框属性',
      mode: '模式',
      objectLabel: '对象 (obj)',
      textLabel: '文本 (text)',
      textContent: '文本内容',
      description: '描述',
      boxColorPalette: '边界框调色板',
      deleteBox: '删除边界框',
      multiSelected: '已选中 {count} 个元素',
      deleteSelected: '删除选中项',
    },
  },
  colorPalette: {
    add: '添加',
    maxColors: '最多允许 {max} 种颜色。',
  },
  json: {
    panel: 'JSON',
    generatePrompt: '生成 JSON Prompt',
    loadFromPasted: '从粘贴的 JSON 加载',
    jsonMode: 'JSON',
    previewMode: '预览',
    placeholder: 'JSON 输出将显示在此处...',
    invalidJson: '无效的 JSON：{error}',
  },
  comfyui: {
    generation: '图像生成',
    seed: '种子：',
    apiUrl: 'ComfyUI API 地址',
    generateImage: '生成图像',
    generating: '生成中...',
    generationFailed: '生成失败，请查看控制台了解详情。',
    generatedResult: '生成结果',
  },
  llm: {
    tools: 'LLM 工具',
    configureToUse: '配置 LLM 提供商以使用 AI 辅助生成 prompt',
    configure: '配置 LLM',
    models: '{count} 个模型',
    manageConfig: '管理配置',
    optimizePrompt: '优化 Prompt',
  },
  llmConfig: {
    back: '← 返回',
    title: 'LLM 配置',
    providers: '提供商',
    addProvider: '+ 添加',
    noProviders: '暂无提供商，点击「+ 添加」创建',
    id: 'ID',
    idPlaceholder: '例如：my-openai',
    idImmutable: '创建后不可修改',
    name: '名称',
    namePlaceholder: '例如：GPT-4o',
    protocolType: '协议类型',
    baseUrl: 'Base URL',
    apiKey: 'API Key',
    show: '显示',
    hide: '隐藏',
    keyMasked: '密钥已脱敏，如需更换请重新输入',
    modelList: '模型列表',
    fetching: '获取中...',
    fetchModels: '获取模型列表',
    fillBaseUrlFirst: '请先填写 Base URL 和 API Key',
    fillApiKeyFirst: '请先填写有效的 API Key',
    clickFetchHint: '点击「获取模型列表」从提供商拉取',
    uncheckToRemove: '取消勾选将移除该模型',
    newProvider: '新建提供商',
    unsavedChanges: '有未保存的更改',
    upToDate: '已是最新',
    delete: '删除',
    saving: '保存中...',
    saveConfig: '保存配置',
    selectOrCreate: '选择一个提供商或创建新的配置',
    newProviderButton: '+ 新建提供商',
    loading: '加载中...',
    toast: {
      idNameRequired: 'ID 和名称不能为空',
      saved: '保存成功',
      saveFailed: '保存失败：{error}',
      confirmDelete: '确定要删除该提供商吗？',
      deleted: '删除成功',
      deleteFailed: '删除失败：{error}',
      fillBaseUrl: '请先填写 Base URL',
      fillApiKey: '请先填写有效的 API Key',
      fetchedModels: '获取到 {count} 个模型',
      fetchFailed: '获取模型失败：{error}',
    },
  },
  optimize: {
    optimizing: 'AI 正在优化...',
    aiSuggestion: 'AI 建议：',
    adopt: '采纳',
    dismiss: '忽略',
    noProvider: '暂无可用的 LLM 提供商，请先配置。',
    failed: '优化失败：{error}',
    sparkleTooltip: 'AI 优化此字段',
  },
  common: {
    imageDropError: '请拖放图像文件。',
  },
  artboard: {
    resetPosition: '重置画板位置',
  },
  contextMenu: {
    duplicate: '复制框',
    cut: '剪切',
    copy: '复制',
    delete: '删除',
    bringToFront: '置于顶层',
    sendToBack: '置于底层',
    importReferenceImage: '导入参考图像',
    clearReferenceImage: '清除参考图像',
    openAiChat: '打开 AI 对话',
    paste: '粘贴',
    importBackgroundImage: '导入背景图像',
    clearBackgroundImage: '清除背景图像',
    clearAllBoxes: '清除所有框',
    fitToArtboard: '适应画板',
  },
  chat: {
    title: 'AI 对话',
    boxBadge: '框: {name}',
    modelSelect: '选择模型',
    noProvider: '尚未配置 LLM 提供商',
    configureLlm: '配置 LLM',
    inputPlaceholder: '输入消息...',
    send: '发送',
    adopt: '采纳',
    dismiss: '忽略',
    adopted: '已采纳 ✓',
    you: '你',
    retry: '重试',
    edit: '编辑',
    editingMessage: '正在编辑消息 — 按 Esc 取消',
    copy: '复制',
    copied: '已复制！',
    clearHistory: '清空',
    loading: 'AI 正在思考...',
    stop: '停止',
    error: '错误：{error}',
    emptyHint: '发送消息开始对话',
    langAuto: '自动',
    streamOutput: '流式输出',
    streamShort: '流式',
    streamHint: '边生成边显示 AI 回复。',
    thinkingStrength: '思考强度',
    thinkingShort: '思考',
    thinkingHint: '实际 reasoning 效果取决于当前模型能力。',
    targetImageSize: 'Canvas Chat 目标图像尺寸',
    targetSizeShort: '尺寸',
    targetSizeHint: '下一次 Canvas Chat 构图返回的 canvasW/canvasH 目标尺寸。',
    jsonView: 'json',
    previewView: '预览',
    previewAlt: '画布预览',
    previewUnavailable: '预览不可用',
    thinkingLevels: {
      off: '关',
      low: '低',
      medium: '中',
      high: '高',
    },
    canvasSessions: {
      sectionTitle: '会话',
      newSession: '+ 新建',
      menuAria: '{title} 会话操作',
      titleLabel: '会话标题',
      rename: '重命名',
      renameAria: '重命名会话',
      clear: '清空',
      clearAria: '清空会话',
      delete: '删除',
      deleteAria: '删除会话',
      saveRename: '保存',
      saveRenameAria: '保存会话名称',
      cancelRename: '取消',
      messageCount: '{count} 条消息',
      terminal: '终端',
      noRequestLogs: '暂无请求日志',
      requestDetails: '请求详情',
      closeDetails: '关闭请求详情',
      copy: '复制',
      copied: '已复制',
    },
    presets: {
      title: '预设管理',
      selectPreset: '选择预设...',
      manage: '管理预设',
      addPreset: '+ 添加',
      searchPlaceholder: '搜索预设...',
      allTags: '全部标签',
      noPresets: '暂无预设',
      edit: '编辑',
      editPreset: '编辑预设',
      newPreset: '新建预设',
      name: '名称',
      namePlaceholder: '例如：人物细节增强',
      description: '描述',
      descPlaceholder: '预设用途说明',
      template: '模板',
      templatePlaceholder: '输入提示词模板，使用变量占位符...',
      variableHint: '可用变量',
      tags: '标签',
      addTag: '添加',
      save: '保存',
      cancel: '取消',
      delete: '删除',
      duplicate: '复制',
    },
    systemPrompt: {
      title: '系统提示词',
      moduleDesc: '编辑 Canvas Chat 和 Per-Box Chat 的系统提示词',
      info: '自定义 AI 行为的系统提示词。修改仅影响新对话。点击 Reset 恢复默认。',
      canvasTitle: 'Canvas Chat 系统提示词',
      canvasDesc: '引导画布级 AI 构图对话的行为和输出格式',
      boxTitle: 'Per-Box Chat 系统提示词',
      boxDesc: '引导单框 AI 对话的提示词优化行为',
      apply: '应用',
      reset: '重置',
      default: '默认',
      customized: '已自定义',
      custom: '自定义',
    },
    image: {
      uploadHint: '上传图像',
      clear: '移除图像',
      attachImage: '附加图像作为参考',
    },
  },
  layoutQuality: {
    title: '布局质量检测',
    passedTitle: '布局检测通过',
    pass: '布局质量检测通过。',
    fail: '布局存在以下问题：',
    accept: '接受当前布局',
    regenerate: '重新生成',
    metric: {
      element_area: '元素大小',
      coverage: '画布覆盖率',
      spacing: '元素间距',
      margin: '边缘距离',
      element_count: '元素数量',
      aspect_ratio: '宽高比',
    },
  },
  shortcuts: {
    button: '快捷键',
    title: '快捷键',
    close: '关闭',
    groups: {
      boxOps: '框操作',
      editing: '交互编辑',
      canvas: '画布视图',
    },
    keys: {
      ctrlD: 'Ctrl+D',
      ctrlX: 'Ctrl+X',
      ctrlC: 'Ctrl+C',
      ctrlV: 'Ctrl+V',
      delete: 'Delete',
      doubleClick: '双击',
      altDrag: 'Alt+拖拽',
      scroll: '滚轮',
      middleDrag: '中键拖拽',
    },
    items: {
      duplicate: '复制选中框',
      cut: '剪切选中框',
      copy: '复制选中框',
      paste: '粘贴',
      delete: '删除选中框',
      inlineEdit: '内联编辑框内文字',
      altDrag: '在已有框上绘制新框',
      wheelZoom: '缩放画板',
      middlePan: '平移画板',
    },
  },
};

export const translations: Record<Lang, Translations> = { en, zh };
export const DEFAULT_LANG: Lang = 'en';
