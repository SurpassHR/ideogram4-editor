import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { useAutoGrowTextarea } from '../useAutoGrowTextarea';

function Harness({ value }: { value: string }) {
  const register = useAutoGrowTextarea(value, 160);
  return <textarea ref={register} value={value} readOnly />;
}

function stubScrollHeight(el: HTMLElement, height: number) {
  Object.defineProperty(el, 'scrollHeight', { value: height, configurable: true });
}

describe('useAutoGrowTextarea', () => {
  it('内容增多时按 scrollHeight 增高', () => {
    const { container, rerender } = render(<Harness value="一行" />);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;

    stubScrollHeight(textarea, 90);
    rerender(<Harness value={'一行\n两行\n三行'} />);

    expect(textarea.style.height).toBe('90px');
    expect(textarea.style.overflowY).toBe('hidden');
  });

  it('超过最大高度后停止增高并转为内部滚动', () => {
    const { container, rerender } = render(<Harness value="一行" />);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;

    stubScrollHeight(textarea, 420);
    rerender(<Harness value="很多行" />);

    expect(textarea.style.height).toBe('160px');
    expect(textarea.style.overflowY).toBe('auto');
  });

  it('清空内容后回落到内容高度', () => {
    const { container, rerender } = render(<Harness value={'很多\n很多'} />);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;

    stubScrollHeight(textarea, 420);
    rerender(<Harness value={'很多\n很多\n更多'} />);
    expect(textarea.style.height).toBe('160px');

    stubScrollHeight(textarea, 36);
    rerender(<Harness value="" />);
    expect(textarea.style.height).toBe('36px');
    expect(textarea.style.overflowY).toBe('hidden');
  });
});
