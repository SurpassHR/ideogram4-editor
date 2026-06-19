export type Lang = 'en' | 'zh';

export interface Translations {
  header: {
    ratio: string;
    scale: string;
    resetCanvas: string;
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
    llmProviders: string;
    promptPresets: string;
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
    generatePrompt: string;
    loadFromPasted: string;
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
    copy: string;
    copied: string;
    clearHistory: string;
    loading: string;
    error: string;
    emptyHint: string;
    langAuto: string;
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
    image: {
      uploadHint: string;
      clear: string;
      attachImage: string;
    };
  };
  layoutQuality: {
    title: string;
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
    canvas: '🎨 Canvas',
    settings: '⚙ Settings',
  },
  settings: {
    llmProviders: '🤖 LLM Providers',
    promptPresets: '📋 Prompt Presets',
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
    generatePrompt: 'Generate JSON Prompt',
    loadFromPasted: 'Load From Pasted JSON',
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
    duplicate: '📋 Duplicate',
    cut: '✂️ Cut',
    copy: '📄 Copy',
    delete: '🗑️ Delete',
    bringToFront: '⬆ Bring to Front',
    sendToBack: '⬇ Send to Back',
    importReferenceImage: '🖼 Import Reference Image',
    clearReferenceImage: '🧹 Clear Reference Image',
    openAiChat: '✨ Open AI Chat',
    paste: '📋 Paste',
    importBackgroundImage: '🖼 Import Background Image',
    clearBackgroundImage: '🧹 Clear Background Image',
    clearAllBoxes: '🧹 Clear All Boxes',
    fitToArtboard: '📐 Fit to Artboard',
  },
  chat: {
    title: '✨ AI Chat',
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
    copy: 'Copy',
    copied: 'Copied!',
    clearHistory: 'Clear',
    loading: 'AI is thinking...',
    error: 'Error: {error}',
    emptyHint: 'Send a message to start the conversation',
    langAuto: 'Auto',
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
    image: {
      uploadHint: 'Upload an image',
      clear: 'Remove image',
      attachImage: 'Attach image as reference',
    },
  },
  layoutQuality: {
    title: 'Layout Quality Check',
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
    canvas: '🎨 画布',
    settings: '⚙ 设置',
  },
  settings: {
    llmProviders: '🤖 LLM 提供商',
    promptPresets: '📋 提示词预设',
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
    generatePrompt: '生成 JSON Prompt',
    loadFromPasted: '从粘贴的 JSON 加载',
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
    duplicate: '📋 复制框',
    cut: '✂️ 剪切',
    copy: '📄 复制',
    delete: '🗑️ 删除',
    bringToFront: '⬆ 置于顶层',
    sendToBack: '⬇ 置于底层',
    importReferenceImage: '🖼 导入参考图像',
    clearReferenceImage: '🧹 清除参考图像',
    openAiChat: '✨ 打开 AI 对话',
    paste: '📋 粘贴',
    importBackgroundImage: '🖼 导入背景图像',
    clearBackgroundImage: '🧹 清除背景图像',
    clearAllBoxes: '🧹 清除所有框',
    fitToArtboard: '📐 适应画板',
  },
  chat: {
    title: '✨ AI 对话',
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
    copy: '复制',
    copied: '已复制！',
    clearHistory: '清空',
    loading: 'AI 正在思考...',
    error: '错误：{error}',
    emptyHint: '发送消息开始对话',
    langAuto: '自动',
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
    image: {
      uploadHint: '上传图像',
      clear: '移除图像',
      attachImage: '附加图像作为参考',
    },
  },
  layoutQuality: {
    title: '布局质量检测',
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
