export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * 计算聊天面板的最优位置：锚定到边界框，在容器矩形内 clamp。
 *
 * 默认行为：面板放在 box 下方，水平居中。
 * 如果超出底部，则翻转到 box 上方。
 * 水平和垂直边缘都会 clamp 到容器范围内。
 *
 * @param boxRect      - 边界框的 DOM rect（锚点）
 * @param containerRect - 画板/容器的 DOM rect（clamp 边界）
 * @param panelW       - 面板宽度
 * @param panelH       - 面板高度
 * @param padding      - 距容器边缘的内边距（默认 10）
 */
export function computeChatPanelPosition(
  boxRect: Rect,
  containerRect: Rect,
  panelW: number,
  panelH: number,
  padding = 10,
): { top: number; left: number } {
  const containerW = containerRect.right - containerRect.left;
  const containerH = containerRect.bottom - containerRect.top;

  // 容器无有效区域时，回退到无边界限制
  const ctRight = containerW > 0 ? containerRect.right - padding : Infinity;
  const ctLeft = containerW > 0 ? containerRect.left + padding : -Infinity;
  const ctBottom = containerH > 0 ? containerRect.bottom - padding : Infinity;
  const ctTop = containerH > 0 ? containerRect.top + padding : -Infinity;

  // 默认：面板在 box 下方，水平居中
  let top = boxRect.bottom + 6;
  let left = boxRect.left + (boxRect.right - boxRect.left - panelW) / 2;

  // 水平 clamp
  if (left + panelW > ctRight) left = ctRight - panelW;
  if (left < ctLeft) left = ctLeft;

  // 垂直：面板超出底部则翻转到 box 上方
  if (top + panelH > ctBottom) {
    top = boxRect.top - panelH - 6;
  }
  if (top < ctTop) top = ctTop;

  return { top: Math.round(top), left: Math.round(left) };
}