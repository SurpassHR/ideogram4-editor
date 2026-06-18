export interface ShortcutItem {
  /** 按键标签的 i18n key（渲染时用 t() 解析，保证中英双语） */
  keyLabel: string;
  /** 描述文案的 i18n key */
  descKey: string;
}

export interface ShortcutGroup {
  /** 分组标题的 i18n key */
  groupKey: string;
  items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    groupKey: 'shortcuts.groups.boxOps',
    items: [
      { keyLabel: 'shortcuts.keys.ctrlD', descKey: 'shortcuts.items.duplicate' },
      { keyLabel: 'shortcuts.keys.ctrlX', descKey: 'shortcuts.items.cut' },
      { keyLabel: 'shortcuts.keys.ctrlC', descKey: 'shortcuts.items.copy' },
      { keyLabel: 'shortcuts.keys.ctrlV', descKey: 'shortcuts.items.paste' },
      { keyLabel: 'shortcuts.keys.delete', descKey: 'shortcuts.items.delete' },
    ],
  },
  {
    groupKey: 'shortcuts.groups.editing',
    items: [
      { keyLabel: 'shortcuts.keys.doubleClick', descKey: 'shortcuts.items.inlineEdit' },
      { keyLabel: 'shortcuts.keys.altDrag', descKey: 'shortcuts.items.altDrag' },
    ],
  },
  {
    groupKey: 'shortcuts.groups.canvas',
    items: [
      { keyLabel: 'shortcuts.keys.scroll', descKey: 'shortcuts.items.wheelZoom' },
      { keyLabel: 'shortcuts.keys.middleDrag', descKey: 'shortcuts.items.middlePan' },
    ],
  },
];
