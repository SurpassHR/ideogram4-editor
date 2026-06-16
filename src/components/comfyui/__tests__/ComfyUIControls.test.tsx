import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { act } from 'react';
import ComfyUIControls from '../ComfyUIControls';
import { useEditorStore } from '../../../store';
import { I18nProvider } from '../../../i18n/context';

// 辅助函数：用 I18nProvider 包裹渲染
function renderComfyUIControls() {
  return render(
    <I18nProvider>
      <ComfyUIControls />
    </I18nProvider>
  );
}

describe('ComfyUIControls', () => {
  beforeEach(() => {
    useEditorStore.setState({
      seed: 42,
      apiUrl: 'http://localhost:8188',
      generationStatus: 'idle',
    });
  });

  it('拖动种子滑块应立即更新 store 中的 seed 值', () => {
    renderComfyUIControls();

    const rangeInput = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(rangeInput).not.toBeNull();

    // 拖动滑块到 12345
    fireEvent.change(rangeInput, { target: { value: '12345' } });

    // Store 中的 seed 应已更新
    expect(useEditorStore.getState().seed).toBe(12345);
  });

  it('种子标签应显示格式化的种子值', () => {
    renderComfyUIControls();

    // 初始值为 00042（42 补齐 5 位）
    const label = document.querySelector('label span');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('00042');

    // 拖动到 12345 后，标签应更新
    const rangeInput = document.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(rangeInput, { target: { value: '12345' } });
    expect(label!.textContent).toBe('12345');
  });

  it('通过 store 直接修改 seed 时，滑块 value 应保持同步', () => {
    renderComfyUIControls();

    // 用 act 包裹 store 更新，确保 React 完成 re-render
    act(() => {
      useEditorStore.setState({ seed: 99999 });
    });

    const rangeInput = document.querySelector('input[type="range"]') as HTMLInputElement;
    // 受控组件：value 属性应反映 store 值
    expect(rangeInput.value).toBe('99999');
  });
});