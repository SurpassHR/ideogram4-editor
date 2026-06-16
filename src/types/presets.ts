/** 提示词预设类型定义 */

export interface PromptPreset {
  id: string;              // 唯一标识，如 "preset_1700000000000"
  name: string;            // 预设名称，如 "人物细节增强"
  description: string;     // 用途说明
  promptTemplate: string;  // 提示词模板，支持 {box_text}, {box_desc}, {box_colors}, {box_mode}
  tags: string[];          // 用户自定义标签，如 ["人物", "细节"]
  createdAt: number;       // 创建时间戳
  updatedAt: number;       // 修改时间戳
}

/** 预设持久化 localStorage key */
export const PRESETS_STORAGE_KEY = 'ideogram4-chat-presets';

/** 内置默认预设 */
export const BUILTIN_PRESETS: Omit<PromptPreset, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: '增强细节描述',
    description: '增强视觉细节的英文描述，适合 Ideogram 4 图像生成',
    promptTemplate: 'Based on the following content, generate a detailed English prompt with rich visual details:\n\nText: {box_text}\nDescription: {box_desc}\nColors: {box_colors}\nMode: {box_mode}\n\nProvide an enhanced English prompt suitable for Ideogram 4 image generation.',
    tags: ['细节', '英文'],
  },
  {
    name: '中文 prompt 优化',
    description: '将简单描述优化为详细的中文 prompt',
    promptTemplate: '请基于以下内容，优化为更详细的中文 prompt：\n\n文字：{box_text}\n描述：{box_desc}\n颜色：{box_colors}\n模式：{box_mode}\n\n输出优化后的中文 prompt。',
    tags: ['中文', '通用'],
  },
  {
    name: '场景氛围描写',
    description: '增强场景氛围和光影描写',
    promptTemplate: 'Enhance the scene atmosphere and lighting description:\n\n{box_desc}\n\nFocus on mood, lighting, environmental details, and spatial composition. Output in English.',
    tags: ['场景', '氛围'],
  },
  {
    name: '人物特征增强',
    description: '增强人物面部、姿态、服饰等细节',
    promptTemplate: 'Enhance the character description with detailed facial features, posture, clothing, and expression:\n\n{box_desc}\n\nFocus on character details. Output in English.',
    tags: ['人物', '细节'],
  },
];

/** 为内置预设生成完整 PromptPreset 对象 */
export function createBuiltinPresets(): PromptPreset[] {
  const now = Date.now();
  return BUILTIN_PRESETS.map((preset, i) => ({
    ...preset,
    id: `preset_builtin_${i}`,
    createdAt: now,
    updatedAt: now,
  }));
}