import { describe, it, expect } from 'vitest';
import type { Box } from '../../types';
import { resolveTemplate } from '../resolveTemplate';

describe('resolveTemplate', () => {
  const baseBox: Box = {
    id: 'box_0',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    mode: 'obj',
    text: 'a cat',
    desc: 'A cute orange cat sitting on a windowsill',
    colors: ['#FF6600', '#FFFFFF', '#333333'],
    imageDataUrl: null,
    imageRole: 'both',
  };

  it('应替换 {box_text} 占位符', () => {
    const result = resolveTemplate('Text: {box_text}', baseBox);
    expect(result).toBe('Text: a cat');
  });

  it('应替换 {box_desc} 占位符', () => {
    const result = resolveTemplate('Desc: {box_desc}', baseBox);
    expect(result).toBe('Desc: A cute orange cat sitting on a windowsill');
  });

  it('应替换 {box_colors} 占位符', () => {
    const result = resolveTemplate('Colors: {box_colors}', baseBox);
    expect(result).toBe('Colors: #FF6600, #FFFFFF, #333333');
  });

  it('应替换 {box_mode} 占位符', () => {
    const result = resolveTemplate('Mode: {box_mode}', baseBox);
    expect(result).toBe('Mode: obj');
  });

  it('应替换所有占位符同时出现', () => {
    const result = resolveTemplate(
      '{box_text} - {box_desc} - {box_colors} - {box_mode}',
      baseBox,
    );
    expect(result).toBe(
      'a cat - A cute orange cat sitting on a windowsill - #FF6600, #FFFFFF, #333333 - obj',
    );
  });

  it('未知占位符应保持原样', () => {
    const result = resolveTemplate('Unknown: {unknown_var}', baseBox);
    expect(result).toBe('Unknown: {unknown_var}');
  });

  it('空 box 字段应替换为空字符串', () => {
    const emptyBox: Box = {
      id: 'box_1',
      x: 0, y: 0, w: 50, h: 50,
      mode: 'text',
      text: '',
      desc: '',
      colors: [],
      imageDataUrl: null,
      imageRole: 'both',
    };
    const result = resolveTemplate(
      'Text: [{box_text}] Desc: [{box_desc}] Colors: [{box_colors}]',
      emptyBox,
    );
    expect(result).toBe('Text: [] Desc: [] Colors: []');
  });

  it('支持多次替换同一占位符', () => {
    const result = resolveTemplate('{box_text} + {box_text}', baseBox);
    expect(result).toBe('a cat + a cat');
  });

  it('{box_mode} 对 text 模式应输出 text', () => {
    const textBox: Box = { ...baseBox, mode: 'text' };
    const result = resolveTemplate('Mode: {box_mode}', textBox);
    expect(result).toBe('Mode: text');
  });
});