import { describe, it, expect } from 'vitest';

import { extractAndValidateIdeogramJSON, buildCanvasChatContext, CANVAS_CHAT_SYSTEM_PROMPT, buildLayoutFeedbackPrompt } from '../llm-canvas-chat';

// ─── extractAndValidateIdeogramJSON ─────────────────────────────────

describe('extractAndValidateIdeogramJSON', () => {
  /** 生成有效的完整 IdeogramOutput JSON 字符串（带 ```json 代码块） */
  function wrap(json: unknown): string {
    return '```json\n' + JSON.stringify(json, null, 2) + '\n```';
  }

  const validOutput = {
    high_level_description: 'A peaceful garden scene with flowers and trees.',
    style_description: {
      aesthetics: 'Soft and ethereal',
      lighting: 'Golden hour sunlight',
      medium: 'digital art',
      art_style: 'Studio Ghibli inspired',
      color_palette: ['#FFD700', '#87CEEB', '#90EE90'],
    },
    compositional_deconstruction: {
      background: 'A lush green garden with distant mountains.',
      elements: [
        {
          type: 'obj' as const,
          bbox: [100, 200, 500, 800],
          desc: 'A large oak tree with detailed bark texture',
          color_palette: ['#8B4513', '#228B22'],
        },
        {
          type: 'text' as const,
          bbox: [600, 100, 700, 300],
          desc: 'Title text in elegant serif font',
          text: 'Welcome to the Garden',
        },
      ],
    },
  };

  // ─── 正向用例 ──────────────────────────────────────────────────

  it('应成功解析有效的完整 JSON（含多个 elements）', () => {
    const result = extractAndValidateIdeogramJSON(wrap(validOutput));
    expect(result).not.toBeNull();
    expect(result!.high_level_description).toBe('A peaceful garden scene with flowers and trees.');
    expect(result!.compositional_deconstruction.elements).toHaveLength(2);
    expect(result!.compositional_deconstruction.elements[0].type).toBe('obj');
    expect(result!.compositional_deconstruction.elements[1].type).toBe('text');
  });

  it('应解析单个 element 的有效 JSON', () => {
    const single = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [0, 0, 500, 500], desc: 'Single object' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(single));
    expect(result).not.toBeNull();
    expect(result!.compositional_deconstruction.elements).toHaveLength(1);
  });

  it('应接受 bbox 边界值 0 和 1000', () => {
    const boundary = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [0, 0, 1000, 1000], desc: 'Full canvas object' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(boundary));
    expect(result).not.toBeNull();
  });

  it('应处理 JSON 前后有额外文本的情况', () => {
    const text = `Here's my composition design for the scene:

\`\`\`json
${JSON.stringify(validOutput, null, 2)}
\`\`\`

Let me know if you'd like any adjustments!`;
    const result = extractAndValidateIdeogramJSON(text);
    expect(result).not.toBeNull();
    expect(result!.high_level_description).toBe('A peaceful garden scene with flowers and trees.');
  });

  it('应处理 photo 模式（无 art_style 字段）', () => {
    const photoMode = {
      ...validOutput,
      style_description: {
        aesthetics: 'Cinematic realism',
        lighting: 'Natural overcast',
        medium: 'photograph',
        photo: 'Portrait photography with shallow depth of field',
        color_palette: ['#FFFFFF', '#000000'],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(photoMode));
    expect(result).not.toBeNull();
    expect(result!.style_description.photo).toBeDefined();
  });

  // ─── 兼容模型未严格返回 ```json 代码块 ──────────────────────────

  it('应解析有效的纯 JSON 响应', () => {
    const result = extractAndValidateIdeogramJSON(JSON.stringify(validOutput, null, 2));
    expect(result).not.toBeNull();
    expect(result!.compositional_deconstruction.elements).toHaveLength(2);
  });

  it('应解析普通代码块中的有效 JSON', () => {
    const result = extractAndValidateIdeogramJSON(`\`\`\`\n${JSON.stringify(validOutput, null, 2)}\n\`\`\``);
    expect(result).not.toBeNull();
    expect(result!.high_level_description).toBe('A peaceful garden scene with flowers and trees.');
  });

  it('应解析前后带说明文本的有效 JSON 对象', () => {
    const result = extractAndValidateIdeogramJSON(`Here is the composition:\n${JSON.stringify(validOutput, null, 2)}\nDone.`);
    expect(result).not.toBeNull();
    expect(result!.style_description.aesthetics).toBe('Soft and ethereal');
  });

  it('纯文本无代码块应返回 null', () => {
    const result = extractAndValidateIdeogramJSON('Here is a nice garden scene without any code blocks.');
    expect(result).toBeNull();
  });

  // ─── 格式不完整的 JSON → null ─────────────────────────────────

  it('格式不完整的 JSON 应返回 null', () => {
    const result = extractAndValidateIdeogramJSON('```json\n{ "high_level_description": "incomplete"\n```');
    expect(result).toBeNull();
  });

  it('代码块内非 JSON 内容应返回 null', () => {
    const result = extractAndValidateIdeogramJSON('```json\nnot a json object at all\n```');
    expect(result).toBeNull();
  });

  it('JSON 为数组而非对象应返回 null', () => {
    const result = extractAndValidateIdeogramJSON('```json\n[1, 2, 3]\n```');
    expect(result).toBeNull();
  });

  // ─── bbox 值检测 ─────────────────────────────────────────────

  it('应接受 bbox > 1000 作为像素坐标', () => {
    const pixelCoords = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [0, 0, 2000, 500], desc: 'Pixel coordinate' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(pixelCoords));
    expect(result).not.toBeNull();
    expect(result!.compositional_deconstruction.elements[0].bbox).toEqual([0, 0, 2000, 500]);
  });

  it('bbox 值 < 0 应返回 null', () => {
    const outOfRange = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [-1, 0, 500, 500], desc: 'Negative coordinate' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(outOfRange));
    expect(result).toBeNull();
  });

  it('bbox 不是恰好 4 个值应返回 null', () => {
    const badBbox = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [0, 0, 500], desc: 'Only 3 values' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(badBbox));
    expect(result).toBeNull();
  });

  it('bbox 包含非数字值应返回 null', () => {
    const badBbox = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [0, 0, '500', 500], desc: 'String in bbox' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(badBbox));
    expect(result).toBeNull();
  });

  it('bbox 包含 NaN 应返回 null', () => {
    const specialStr = JSON.stringify(
      {
        ...validOutput,
        compositional_deconstruction: {
          ...validOutput.compositional_deconstruction,
          elements: [
            { type: 'obj', bbox: [0, 0, NaN, 500], desc: 'NaN in bbox' },
          ],
        },
      },
      null,
      2,
    );
    // JSON.stringify 把 NaN 变成 null，需要手动替换
    const withNaN = '```json\n' + specialStr.replace('null', 'NaN') + '\n```';
    const result = extractAndValidateIdeogramJSON(withNaN);
    expect(result).toBeNull();
  });

  // ─── 缺少必要字段 → null ──────────────────────────────────────

  it('无 elements 字段应返回 null', () => {
    const noElements = {
      high_level_description: 'A scene',
      style_description: validOutput.style_description,
      compositional_deconstruction: {
        background: 'Some background',
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(noElements));
    expect(result).toBeNull();
  });

  it('无 compositional_deconstruction 字段应返回 null', () => {
    const noCd = {
      high_level_description: 'A scene',
      style_description: validOutput.style_description,
    };
    const result = extractAndValidateIdeogramJSON(wrap(noCd));
    expect(result).toBeNull();
  });

  it('element 无 desc 字段应返回 null', () => {
    const noDesc = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [0, 0, 500, 500] },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(noDesc));
    expect(result).toBeNull();
  });

  it('element desc 为空字符串应返回 null', () => {
    const emptyDesc = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [0, 0, 500, 500], desc: '' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(emptyDesc));
    expect(result).toBeNull();
  });

  it('element desc 为纯空格应返回 null', () => {
    const whitespaceDesc = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [0, 0, 500, 500], desc: '   ' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(whitespaceDesc));
    expect(result).toBeNull();
  });

  // ─── elements 为空数组 → null ─────────────────────────────────

  it('elements 为空数组应返回 null', () => {
    const emptyElements = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(emptyElements));
    expect(result).toBeNull();
  });

  // ─── type 为任意非空字符串均合法（LLM 可能返回 natural language type）──

  it('element type 为任意非空字符串应合法', () => {
    const badType = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'shape', bbox: [0, 0, 500, 500], desc: 'Invalid type' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(badType));
    expect(result).not.toBeNull();
    expect(result!.compositional_deconstruction.elements[0].type).toBe('shape');
  });

  it('element type 为任意非空字符串应合法（非严格类型）', () => {
    const badType = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'box', bbox: [0, 0, 500, 500], desc: 'Neither obj nor text' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(badType));
    expect(result).not.toBeNull();
    expect(result!.compositional_deconstruction.elements[0].type).toBe('box');
  });

  it('element type 缺失应返回 null', () => {
    const noType = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { bbox: [0, 0, 500, 500], desc: 'No type field' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(noType));
    expect(result).toBeNull();
  });

  it('elements 中某一个不合法，整体应返回 null（混合合法与非法）', () => {
    const mixed = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          { type: 'obj' as const, bbox: [0, 0, 500, 500], desc: 'Valid element' },
          { type: 'obj' as const, bbox: [0, 0, -500, 500], desc: 'Invalid bbox element' },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(mixed));
    expect(result).toBeNull();
  });

  // ─── text 类型元素（正向）────────────────────────────────────

  it('应接受 type=text 且含 text 字段的 element', () => {
    const textElement = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'text' as const,
            bbox: [100, 200, 300, 800],
            desc: 'Bold title text',
            text: 'Hello World',
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(textElement));
    expect(result).not.toBeNull();
    expect(result!.compositional_deconstruction.elements[0].type).toBe('text');
    expect(result!.compositional_deconstruction.elements[0].text).toBe('Hello World');
  });
  // ─── 颜色数量上限 + CJK 文本拒绝 ──────────────────────────

  it('global color_palette > 16 should return null', () => {
    const tooManyColors = {
      ...validOutput,
      style_description: {
        ...validOutput.style_description,
        color_palette: [
          '#C62828', '#AD1457', '#6A1B9A', '#4527A0', '#283593',
          '#1565C0', '#00838F', '#00695C', '#2E7D32', '#558B2F',
          '#9E9D24', '#F9A825', '#FF8F00', '#E65100', '#D84315',
          '#4E342E', '#37474F',
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(tooManyColors));
    expect(result).toBeNull();
  });

  it('global color_palette <= 16 should pass', () => {
    const sixteenColors = {
      ...validOutput,
      style_description: {
        ...validOutput.style_description,
        color_palette: [
          '#C62828', '#AD1457', '#6A1B9A', '#4527A0', '#283593',
          '#1565C0', '#00838F', '#00695C', '#2E7D32', '#558B2F',
          '#9E9D24', '#F9A825', '#FF8F00', '#E65100', '#D84315',
          '#4E342E',
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(sixteenColors));
    expect(result).not.toBeNull();
  });

  it('per-element color_palette > 5 should return null', () => {
    const tooManyElementColors = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'obj',
            bbox: [100, 200, 500, 800],
            desc: 'An object with too many colors',
            color_palette: ['#A1', '#A2', '#A3', '#A4', '#A5', '#A6'],
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(tooManyElementColors));
    expect(result).toBeNull();
  });

  it('type=text with CJK characters should return null', () => {
    const cjkText = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'text',
            bbox: [100, 200, 300, 800],
            desc: 'Title text',
            text: '蝙蝠侠大战钢铁侠',
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(cjkText));
    expect(result).toBeNull();
  });

  it('type=text with Japanese Hiragana should return null', () => {
    const jpHiragana = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'text',
            bbox: [100, 200, 300, 800],
            desc: 'Title text',
            text: 'こんにちは',
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(jpHiragana));
    expect(result).toBeNull();
  });

  it('type=text with Japanese Katakana should return null', () => {
    const jpKatakana = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'text',
            bbox: [100, 200, 300, 800],
            desc: 'Title text',
            text: 'コンニチハ',
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(jpKatakana));
    expect(result).toBeNull();
  });

  it('type=text with Korean Hangul should return null', () => {
    const korHangul = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'text',
            bbox: [100, 200, 300, 800],
            desc: 'Title text',
            text: '안녕하세요',
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(korHangul));
    expect(result).toBeNull();
  });

  it('type=text with English text should pass', () => {
    const englishText = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'text',
            bbox: [100, 200, 300, 800],
            desc: 'Title text at top center',
            text: 'BATMAN VS IRON MAN',
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(englishText));
    expect(result).not.toBeNull();
  });

  it('type=obj with CJK in desc should pass (only text field is restricted)', () => {
    const cjkDesc = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'obj',
            bbox: [100, 200, 500, 800],
            desc: '一棵大树 with detailed bark texture',
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(cjkDesc));
    expect(result).not.toBeNull();
  });
});

// ─── buildCanvasChatContext ─────────────────────────────────────────

describe('buildCanvasChatContext', () => {
  it('应根据 store 快照生成 JSON 上下文字符串', () => {
    const snapshot = {
      boxes: [
        { x: 0, y: 0, w: 256, h: 256, mode: 'obj' as const, text: '', desc: 'A red box', colors: ['#FF0000'], imageDataUrl: null, imageRole: 'both' as const },
      ],
      canvasW: 1024,
      canvasH: 1024,
      globalPalette: ['#FF0000', '#00FF00'],
      highLevelDescription: 'Test scene',
      aesthetics: 'Minimal',
      lighting: 'Soft',
      medium: 'digital art',
      artStyle: 'flat design',
      background: 'White background',
      photoArtStyleMode: 1 as const,
    };

    const result = buildCanvasChatContext(snapshot);

    // 验证返回的是有效 JSON 字符串
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.high_level_description).toBe('Test scene');
    expect(parsed.style_description.aesthetics).toBe('Minimal');
    expect(parsed.compositional_deconstruction.elements).toHaveLength(1);
    expect(parsed.compositional_deconstruction.elements[0].desc).toBe('A red box');
  });

  it('空 boxes 应生成 elements 为空的 JSON', () => {
    const snapshot = {
      boxes: [],
      canvasW: 1024,
      canvasH: 1024,
      globalPalette: [],
      highLevelDescription: '',
      aesthetics: '',
      lighting: '',
      medium: '',
      artStyle: '',
      background: '',
      photoArtStyleMode: 1 as const,
    };

    const result = buildCanvasChatContext(snapshot);
    const parsed = JSON.parse(result);
    expect(parsed.compositional_deconstruction.elements).toHaveLength(0);
  });
});

// ─── buildLayoutFeedbackPrompt ──────────────────────────────────────

describe('buildLayoutFeedbackPrompt', () => {
  it('应在反馈文本外包裹布局反馈提示结构', () => {
    const result = buildLayoutFeedbackPrompt('element_area: elements too small\ncoverage: insufficient');
    expect(result).toContain('[Layout Feedback]');
    expect(result).toContain('element_area: elements too small');
    expect(result).toContain('coverage: insufficient');
    expect(result).toContain('Return your complete revised composition as a new');
    expect(result).toContain('```json');
  });

  it('空字符串反馈也应生成有效的提示结构', () => {
    const result = buildLayoutFeedbackPrompt('');
    expect(result).toContain('[Layout Feedback]');
    expect(result).toContain('```json');
  });

  it('特殊字符反馈应正确转义 no break', () => {
    const result = buildLayoutFeedbackPrompt('spacing: < 3% margin');
    expect(result).toContain('spacing: < 3% margin');
    expect(result).toContain('[Layout Feedback]');
  });
});

// ─── CANVAS_CHAT_SYSTEM_PROMPT ──────────────────────────────────────

describe('CANVAS_CHAT_SYSTEM_PROMPT', () => {
  it('应包含 aspect ratio 和 bbox 指南', () => {
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Aspect ratio, resolution and bbox relationship');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Vertical landmark guide');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('ymin/ymax landmarks');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Pixel verification examples');
  });
  it('应包含 Framing rules', () => {
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Framing rules');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Full body');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Knee-up');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Waist-up');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Bust-up');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Face close-up');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Horizontal placement guide');
  });
  it('应包含 bbox verification rule', () => {
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('bbox verification rule');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('vertical pixels');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('horizontal pixels');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('height_px');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('width_px');
  });

  it('应包含 Output format 和 Rules', () => {
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('## Output format');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('## Rules');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Key order must be exactly');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('color_palette');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('elements listed background-to-foreground');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('Output raw JSON only, nothing else');
  });

  it('应明确区分目标输出尺寸和 0-1000 bbox 坐标系统', () => {
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('aspect ratio');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('0-1000');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).toContain('pixel dimensions');
  });

  it('应不包含旧的模糊约束文本', () => {
    expect(CANVAS_CHAT_SYSTEM_PROMPT).not.toContain('Elements: 1-8 boxes total');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).not.toContain('Design a balanced composition');
    expect(CANVAS_CHAT_SYSTEM_PROMPT).not.toContain('Do not use 1024');
  });
});
