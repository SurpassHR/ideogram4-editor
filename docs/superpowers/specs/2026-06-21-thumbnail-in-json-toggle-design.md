# 画布缩略图整合：JSON 代码块右上角「json / 预览」切换

## 目标

当前 Canvas Chat 的 assistant 回复卡片中，画布缩略图（`chat-msg-canvas-thumb`）作为独立元素渲染在卡片 header 和 body 之间，与 JSON 代码块各行其道，纵向占两个区域。改为：**缩略图不再独立渲染，仅在含 ` ```json ` 代码块的 AI 回复卡片中，在代码块右上角显示 iOS 滑块切换按钮「json / 预览」，预览即为画布截图，替换代码块展示**。

## 动机

- 缩略图与 JSON 代码块语义相关（都是「这次构图的视觉/数据产出」），空间上应紧密关联
- 独立 thumb 浪费卡片纵向空间，JSON 代码块本身有一块区域可复用
- 「json / 预览」切换模式是成熟 UI pattern（对比 GitHub diff 的 split/unified 切换）

## 确认的设计决策

| 问题 | 选择 |
|------|------|
| 预览内容 | 消息已有的画布截图（canvasSnapshotUrl），无新增截图逻辑 |
| 适用范围 | 仅含 JSON 代码块的 AI 卡片。无 JSON 的回复不显示缩略图 |
| 预览尺寸 | 撑满代码块区域（截图分辨率从 120px 升到 360px） |
| 切换按钮样式 | mini iOS 滑块开关（参考 ChatRunControls Stream 开关） |
| 默认视图 | json（滑块在左） |
| 架构方案 | 方案 A — 消息内容分段渲染（parseContentSegments + JsonCodeBlock 组件），放弃 DOM 后操作方案 |

## 架构

### 改动范围

```
新增文件：
  src/utils/code-block-parser.ts                ← fenced code block 分段解析器
  src/components/chat/JsonCodeBlock.tsx         ← JSON 块组件 (toggle + 预览)
  src/components/chat/__tests__/JsonCodeBlock.test.tsx

修改文件：
  src/components/chat/ChatMessage.tsx           ← 混合渲染 (文本段 markdown / JSON 块组件)
  src/hooks/useCanvasChat.ts                    ← 截图分辨率 120 → 360
  src/index.css                                 ← 删 .chat-msg-thumb-*，增 toggle/预览样式
  src/hooks/__tests__/useCanvasChat.test.tsx    ← 截图尺寸测试更新
```

### 数据流

```
ChatMessage 收到 message.content + message.canvasSnapshotUrl
        │
        ▼
parseContentSegments(content)  ←── 新工具函数
        │
  返回: [{ type: 'text', text }, { type: 'code', lang, code }, ...]
        │
        ▼
  逐段渲染:
    text 段  → dangerouslySetInnerHTML (marked + DOMPurify, 不变)
    code 段  → lang === 'json' && snapshotUrl
                   ? <JsonCodeBlock json={code} snapshotUrl={url} />
                   : <pre><code>{code}</code></pre>  (非 json 代码块原样)
```

## 组件设计

### `parseContentSegments(content: string): ContentSegment[]`

`ContentSegment = { type: 'text'; text: string } | { type: 'code'; lang: string; code: string }`

- 正则 `/^```(\S*)\n([\s\S]*?)```/gm` 匹配所有 fenced code blocks
- 按匹配位置切分文本 → text 段和 code 段交替
- text 段 `.trim()` 后为空则跳过
- 无 code block 时返回单个 text 段（不改变当前行为）
- lang 取 backtick 后第一 token，`.toLowerCase()`

### `JsonCodeBlock`

Props:

```ts
interface JsonCodeBlockProps {
  json: string;          // 原始 JSON 文本, 直接展示在 <pre> 中
  snapshotUrl: string;   // Data URL 画布截图
}
```

内部状态: `useState<'json' | 'preview'>('json')`

渲染结构:

```html
<div class="json-code-block">                    ← position: relative
  <label class="json-code-block-toggle" role="switch" aria-checked={view === 'preview'} tabIndex={0}
         onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(); } }}>
    <span data-active="true|false">json</span>
    <span class="json-code-block-toggle-track">
      <input type="checkbox" checked={view === 'preview'} onChange={handleToggle}
             aria-hidden="true" style="visuallyHidden" />
      <!-- thumb 由 ::after 伪元素渲染, 与 ChatRunControls Stream 开关一致 -->
    </span>
    <span data-active="true|false">预览</span>
  </label>

  {view === 'json' ? (
    <pre><code>{json}</code></pre>              ← 复用既有 .chat-msg-card-body pre 样式
  ) : (
    <div class="json-code-block-preview">
      <img src={snapshotUrl} alt="画布预览" />   ← 撑满容器, object-fit: contain
    </div>
  )}
</div>
```

Key behaviors:

- `onWheelCapture → e.stopPropagation()` 阻止滚轮冒泡到画布缩放
- `<img onError>` → 局部 state `imgError` → 显示占位文字 "预览不可用"
- 不解析/验证 JSON — 纯文本展示

### iOS 滑块样式

- Track: 28×14px, border-radius: 7px, 默认 `rgba(255,255,255,0.08)`, checked → `var(--primary)`
- Thumb: 用 `::after` 伪元素渲染 — 10×10px 白色圆点, checked 时 `left: 2px → 16px`, transition 0.15s。与 `chat-stream-toggle-track::after` 模式一致，不使用独立 `<span>` DOM 元素
- 激活标签: `color: var(--text)`, 非激活: `color: rgba(255,255,255,0.35)`
- 隐藏原生 `<input>`: `position:absolute; opacity:0; pointer-events:none`，仍可键盘聚焦（label 自身 `tabIndex={0}` + `onKeyDown` Enter/Space）
- 无障碍: `<label>` `role="switch"` + `aria-checked={view==='preview'}`，`<input>` 标记 `aria-hidden="true"`（实际控制权在 label onChange）

### CSS 新增/删除

新增: `.json-code-block`, `.json-code-block-toggle`, `.json-code-block-toggle-track`, `.json-code-block-toggle-track::after`, `.json-code-block-preview`, `.json-code-block-preview img`
删除: `.chat-msg-thumb-container`, `.chat-msg-canvas-thumb` (约 15 行)
`prefers-reduced-motion`: 在现有 `@media (prefers-reduced-motion: reduce)` 块 (index.css ~L322) 中追加 `.json-code-block-toggle-track::after { transition: none; }`，消除 thumb 滑动动画

### 既有代码修改

**ChatMessage.tsx:**

- 移除独立 thumb 块 (当前 L58-67: `!isUser && message.canvasSnapshotUrl && (...)` 整块删除)
- body 渲染替换: `isUser` 分支不变; `assistant` 分支从单体 `dangerouslySetInnerHTML` 改为分段渲染 loop
- 新增依赖 imports: `parseContentSegments` from `../../utils/code-block-parser`, `JsonCodeBlock` from `./JsonCodeBlock`

```tsx
// assistant body 渲染伪码
<div className="chat-msg-card-body">
  {parseContentSegments(message.content).map((seg, i) => {
    if (seg.type === 'code' && seg.lang === 'json' && message.canvasSnapshotUrl) {
      // 空 JSON 块跳过 — 无内容可切换
      if (!seg.code.trim()) {
        return <pre key={i}><code>{seg.code}</code></pre>;
      }
      return <JsonCodeBlock key={i} json={seg.code} snapshotUrl={message.canvasSnapshotUrl} />;
    }
    if (seg.type === 'code') {
      // 非 JSON 代码块: 保留 language-* class 标记, 与 marked 输出一致
      return (
        <pre key={i}>
          <code className={seg.lang ? `language-${seg.lang}` : ''}>{seg.code}</code>
        </pre>
      );
    }
    return <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.text) }} />;
  })}
</div>
```

**useCanvasChat.ts:**

- `TARGET_W` 120 → 360 (1 行)
- `toDataURL('image/jpeg', 0.6)` 不变

## 边角用例

| 场景 | 行为 |
|------|------|
| AI 回复不含 ``` 代码块 | 纯文本渲染，无 toggle，无缩略图 |
| AI 回复含 ```json 但字段残缺（非有效 IdeogramOutput） | 仍显示 toggle，仍可预览。toggle 不与 Apply 耦合 |
| AI 回复含非 json 代码块 (```python 等) | `<pre><code>` 原样渲染，无 toggle |
| snapshotUrl 为 undefined | 不渲染 JsonCodeBlock → 仅显示 `<pre>` 纯 JSON |
| 用户消息 | 不变。`isUser` 分支保持 `{message.content}` |
| 历史消息恢复（workspace-persistence 加载） | canvasSnapshotUrl 已在 ChatMessage 类型中持久化，正常走分段渲染 |
| per-box ChatPanel 的 ChatMessage | 不传 canvasSnapshotUrl，纯文本路径，零影响 |
| 图片加载失败 | onError → imgError state → 显示 "预览不可用" 占位 |
| 画布缩放滚轮 | JsonCodeBlock 容器 onWheelCapture → stopPropagation |
| reduced-motion | toggle thumb transition 在对应 media query 中设 none |

## 测试

| 文件 | 改动类型 | 覆盖点 |
|------|----------|--------|
| `src/utils/__tests__/code-block-parser.test.ts` | 新增 | 无 code block; 单个 ```json; 多个混合; 空 block; 连续 text |
| `src/components/chat/__tests__/JsonCodeBlock.test.tsx` | 新增 | 默认 json 视图; 点击切换预览; img onError; 无 snapshotUrl; onWheel stopPropagation |
| `src/components/chat/__tests__/ChatMessage.test.tsx` | 新增/修改 | 含 JSON assistant 卡渲染 JsonCodeBlock; 无 JSON 走纯文本; 用户消息不变; thumb DOM 不存在 |
| `src/hooks/__tests__/useCanvasChat.test.tsx` | 修改 | 截图 canvas.width === 360 |

## 实现注意事项

- `parseContentSegments` 是纯函数，无副作用，适合单独单元测试
- `JsonCodeBlock` 不接受 `onApply` prop — 本次变更仅涉及缩略图显示，Apply 位置由独立任务 `4bea4` 处理
- `marked.parse` 产生的 `<pre><code>` 块中 code 内容会有 HTML 转义 — `parseContentSegments` 解析原始 markdown 字符串，与 marked 的输出不冲突
- 截图分辨率提升后 Data URL 大小增长（~3× 宽 → ~9× 像素面积），360px JPEG quality 0.6 估计 ~30-80KB，对 Canvas Chat 消息列表内存占用仍可接受。长期可考虑迁移到 `blob:` URL，但超出本次范围

## 验收

- `rtk vitest` 全绿
- `rtk tsc` 无错误
- `rtk lint` 无新增警告
- 视觉确认: Canvas Chat 触发一次回复 → JSON 代码块右上角出现 mini iOS 开关 → 默认 json → 拨到预览显示画布截图 → 拨回 json 恢复代码 → 独立 thumb 不再出现 → 无 JSON 的回复无变化 → 用户消息无变化
