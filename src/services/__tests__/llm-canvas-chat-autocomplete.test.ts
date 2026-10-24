import { describe, it, expect } from 'vitest';
import { buildSceneAutoCompletePrompt, buildImageInversionPrompt } from '../llm-canvas-chat';
import type { Box } from '../../types';

describe('Scene Auto-Complete and Inversion Prompt Builders', () => {
  it('buildSceneAutoCompletePrompt generates structured prompt with boxes and dimensions', () => {
    const boxes: Box[] = [{
      id: 'box-1',
      x: 100,
      y: 100,
      w: 200,
      h: 200,
      mode: 'obj',
      text: 'astronaut',
      desc: '',
      colors: [], imageDataUrl: '', imageRole: 'reference'
    }];
    const prompt = buildSceneAutoCompletePrompt(boxes, 1024, 1024, 'cyberpunk style');
    expect(prompt).toContain('astronaut');
    expect(prompt).toContain('cyberpunk style');
    expect(prompt).toContain('high_level_description');
    expect(prompt).toContain('elements');
  });

  it('buildImageInversionPrompt generates inversion prompt with canvas dimensions', () => {
    const prompt = buildImageInversionPrompt(1920, 1080);
    expect(prompt).toContain('1920');
    expect(prompt).toContain('1080');
    expect(prompt).toContain('object');
    expect(prompt).toContain('text');
  });
});

