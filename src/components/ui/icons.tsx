/**
 * 统一 SVG 图标组件
 *
 * 规范：所有图标使用 SVG 组件，禁止混用 emoji、Unicode 字符、图标链接。
 * 尺寸默认 16px，通过 size prop 调整。颜色继承 currentColor。
 */

import type { ReactNode, SVGAttributes } from 'react';

interface IconProps extends SVGAttributes<SVGElement> {
  size?: number;
}

function createIcon(path: ReactNode, viewBox = '0 0 24 24') {
  return ({ size = 16, className, ...rest }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      {path}
    </svg>
  );
}

/** 画笔/调色板 — Logo */
export const IconPalette = createIcon(
  <>
    <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.5C20.7 15 22 13.7 22 12c0-5.5-4.5-10-10-10z" />
  </>,
);

/** 齿轮 — 设置/配置 */
export const IconGear = createIcon(
  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />,
);

/** 闪电 — 生成/快捷操作 */
export const IconZap = createIcon(
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
);

/** 方框 — 边界框属性 */
export const IconBox = createIcon(
  <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
);

/** 星星 — 收藏 */
export const IconStar = createIcon(
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
);

/** ✕ 关闭 — 关闭按钮 */
export const IconClose = createIcon(
  <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
);

/** 键盘 — 快捷键 */
export const IconKeyboard = createIcon(
  <><rect width="20" height="16" x="2" y="4" rx="2" /><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h.01M18 16h.01" /><path d="M8 16h8" /></>,
);

/** 星星闪烁 — AI/Sparkle */
export const IconSparkle = createIcon(
  <><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063A2 2 0 0 0 14.063 15.5l-1.582 6.135a.5.5 0 0 1-.963 0z" /></>,
);

/** 大脑 — Canvas Chat/AI 思考 */
export const IconBrain = createIcon(
  <><path d="M12 5a3 3 0 1 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z" /><path d="M12 11v4" /><path d="M8 17a2 2 0 0 0-2 2" /><path d="M16 17a2 2 0 0 1 2 2" /><path d="M4 12a8 8 0 0 1 8-8" /><path d="M20 12a8 8 0 0 0-8-8" /></>,
);

/** 垃圾桶 — 删除 */
export const IconTrash = createIcon(
  <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
);

/** 铅笔 — 编辑/重命名 */
export const IconPencil = createIcon(
  <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>,
);

/** 扫帚 — 清除 */
export const IconBroom = createIcon(
  <><path d="m3 21 3.5-3.5" /><path d="M10 14 5 9" /><path d="m14 4 5 5" /><path d="M19 9a5 5 0 0 1-7 7l-2-2a5 5 0 0 1 7-7z" /></>,
);

/** 箭头右 — 发送/前进 */
export const IconArrowRight = createIcon(
  <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
);

/** 地球 — 语言 */
export const IconGlobe = createIcon(
  <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
);

/** 最大化/展开 */
export const IconMaximize = createIcon(
  <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /></>,
);

/** 更多/省略号 */
export const IconMoreHorizontal = createIcon(
  <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
);

/** 相机 — 照片模式 */
export const IconCamera = createIcon(
  <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
);

/** 图片 — 图片占位 */
export const IconImage = createIcon(
  <><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,
);

/** 刷新/重置 */
export const IconRefresh = createIcon(
  <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>,
);

/** 调色板色板 — 颜色选择 */
export const IconSwatch = createIcon(
  <><path d="M11 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" /><path d="M18.5 8.5 21 11" /></>,
  '0 0 24 24',
);

/** 勾选 — 采纳/完成 */
export const IconCheck = createIcon(
  <polyline points="20 6 9 17 4 12" />,
);

/** 复制 */
export const IconCopy = createIcon(
  <><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
);

/** 文件/JSON */
export const IconFile = createIcon(
  <><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></>,
);

/** 上移一层 */
export const IconBringToFront = createIcon(
  <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 12v-4a4 4 0 0 1 4-4h4" /></>,
);

/** 下移一层 */
export const IconSendToBack = createIcon(
  <><path d="M12 16v-4a4 4 0 0 0-4-4H4" /><rect x="4" y="12" width="12" height="12" rx="2" /></>,
);

/** 图片叠加 — 参考图 */
export const IconImagePlus = createIcon(
  <><path d="M21 12v3a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h7" /><line x1="16" y1="5" x2="22" y2="5" /><line x1="19" y1="2" x2="19" y2="8" /><circle cx="9" cy="9" r="2" /></>,
);
