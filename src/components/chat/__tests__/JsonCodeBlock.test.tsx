import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JsonCodeBlock from '../JsonCodeBlock';

// Mock i18n
vi.mock('../../../i18n/context', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'chat.jsonView': 'json',
        'chat.previewView': 'Preview',
        'chat.previewAlt': 'Canvas preview',
        'chat.previewUnavailable': 'Preview unavailable',
      };
      return map[key] ?? key;
    },
    lang: 'en',
  }),
}));

const sampleJson = '{"key": "value"}';
const snapshotUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('JsonCodeBlock', () => {
  it('默认渲染 json 视图', () => {
    render(<JsonCodeBlock json={sampleJson} snapshotUrl={snapshotUrl} />);
    expect(screen.getByText(sampleJson)).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('点击切换按钮切换到预览视图', () => {
    render(<JsonCodeBlock json={sampleJson} snapshotUrl={snapshotUrl} />);
    const switchEl = screen.getByRole('switch');
    fireEvent.click(switchEl);
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByAltText('Canvas preview')).toBeTruthy();
  });

  it('再点击切换回 json 视图', () => {
    render(<JsonCodeBlock json={sampleJson} snapshotUrl={snapshotUrl} />);
    const switchEl = screen.getByRole('switch');
    fireEvent.click(switchEl);
    fireEvent.click(switchEl);
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(sampleJson)).toBeTruthy();
  });

  it('键盘 Enter 切换', () => {
    render(<JsonCodeBlock json={sampleJson} snapshotUrl={snapshotUrl} />);
    const switchEl = screen.getByRole('switch');
    fireEvent.keyDown(switchEl, { key: 'Enter' });
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
  });

  it('键盘 Space 切换', () => {
    render(<JsonCodeBlock json={sampleJson} snapshotUrl={snapshotUrl} />);
    const switchEl = screen.getByRole('switch');
    fireEvent.keyDown(switchEl, { key: ' ' });
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
  });

  it('图片加载失败显示占位文字', () => {
    render(<JsonCodeBlock json={sampleJson} snapshotUrl={snapshotUrl} />);
    const switchEl = screen.getByRole('switch');
    fireEvent.click(switchEl);
    const img = screen.getByAltText('Canvas preview');
    fireEvent.error(img);
    expect(screen.getByText('Preview unavailable')).toBeTruthy();
  });

  it('onWheelCapture 阻止滚轮冒泡', () => {
    const onWheel = vi.fn();
    render(
      <div onWheel={onWheel}>
        <JsonCodeBlock json={sampleJson} snapshotUrl={snapshotUrl} />
      </div>,
    );
    const container = document.querySelector('.json-code-block')!;
    fireEvent.wheel(container);
    expect(onWheel).not.toHaveBeenCalled();
  });
});
