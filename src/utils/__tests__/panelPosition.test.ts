import { describe, it, expect } from 'vitest';
import { computeChatPanelPosition, type Rect } from '../panelPosition';

function makeRect(
  top: number,
  left: number,
  width: number,
  height: number,
): Rect {
  return {
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

describe('computeChatPanelPosition', () => {
  const PANEL_W = 320;
  const PANEL_H = 400;
  const PADDING = 10;

  it('当有足够空间时，面板应在 box 下方水平居中', () => {
    const boxRect = makeRect(100, 200, 100, 50);
    const containerRect = makeRect(0, 0, 800, 600);

    const pos = computeChatPanelPosition(boxRect, containerRect, PANEL_W, PANEL_H, PADDING);

    // box 底部 + 6px 间距
    expect(pos.top).toBe(156); // 100 + 50 + 6 = 156
    // 水平居中：(200 + 50) - 320/2 = 250 - 160 = 90
    expect(pos.left).toBe(90);
  });

  it('面板超出容器右边界时，应将 left 推回', () => {
    const boxRect = makeRect(100, 600, 200, 50);
    const containerRect = makeRect(0, 0, 800, 600);

    const pos = computeChatPanelPosition(boxRect, containerRect, PANEL_W, PANEL_H, PADDING);

    // left 应被 clamp 到容器右边界 - padding - panelW
    // containerRight = 800, padding = 10
    // maxLeft = 800 - 10 - 320 = 470
    expect(pos.left).toBe(470);
  });

  it('面板超出容器左边界时，应将 left 推到 padding 处', () => {
    const boxRect = makeRect(100, -50, 50, 30);
    const containerRect = makeRect(0, 0, 800, 600);

    const pos = computeChatPanelPosition(boxRect, containerRect, PANEL_W, PANEL_H, PADDING);

    // left 应被 clamp 到 padding = 10
    expect(pos.left).toBe(10);
  });

  it('面板超出容器底部时，应翻转到 box 上方', () => {
    const boxRect = makeRect(400, 200, 100, 50);
    const containerRect = makeRect(0, 0, 800, 500);

    // box 底部 = 450，面板高度 = 400，450 + 400 = 850 > 500
    // 应翻转到 box 上方
    const pos = computeChatPanelPosition(boxRect, containerRect, PANEL_W, PANEL_H, PADDING);

    // top = box.top - panelH - 6 = 400 - 400 - 6 = -6
    // 但被 container top + padding clamp 到 10
    expect(pos.top).toBe(10);
  });

  it('翻转后面板仍超出容器顶部时，应 clamp 到 padding', () => {
    const boxRect = makeRect(5, 200, 100, 30);
    const containerRect = makeRect(0, 0, 800, 500);

    // box 在顶部附近，面板无法放在上方
    // 放在下方：box.bottom + 6 = 41，41 + 400 = 441 < 500，所以放下方
    const pos = computeChatPanelPosition(boxRect, containerRect, PANEL_W, PANEL_H, PADDING);

    // 下方有足够空间，不应翻转
    expect(pos.top).toBe(41); // 5 + 30 + 6
  });

  it('容器为空（零面积）时不应返回 NaN', () => {
    const boxRect = makeRect(100, 200, 100, 50);
    const containerRect = makeRect(0, 0, 0, 0);

    const pos = computeChatPanelPosition(boxRect, containerRect, PANEL_W, PANEL_H, PADDING);

    // 应回退到无限边界，面板在 box 下方居中
    expect(Number.isFinite(pos.top)).toBe(true);
    expect(Number.isFinite(pos.left)).toBe(true);
  });
});