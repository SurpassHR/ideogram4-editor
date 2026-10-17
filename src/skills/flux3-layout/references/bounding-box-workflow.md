# Bounding Box 教学与提示词规范

## 先辨认三种不同空间坐标接口（极易混淆）
| 场景 | 期望数据 | 范围与顺序 | 使用方式 |
|---|---|---|---|
| ComfyUI `CreateBoundingBoxes` 可视化编辑器 | 框的画布位置与尺寸 | 画布的像素宽高/编辑器内部元数据 | 在节点界面拖动，不手填1000坐标 |
| `Flux3LayoutPrompt` 拼接后的caption JSON表 | 每个元素的`bbox` | **[top,left,bottom,right]，0–1000** | 由节点按内部格式生成，勿重复拼接 |
| BFL官方推理CLI `--boxes` 外置JSON | `bbox` / `src_bbox` / `tgt_bbox` | **[y_min,x_min,y_max,x_max]，0–1** | 独立推理CLI参数，不要直接粘入Comfy caption |

官方 Hugging Face Diffusers文档及模型卡采用0–1000 caption格式，BFL Github CLI README展示0–1 boxes.json；**不是官方自相矛盾，而是两个输入接口不同**。

## 真正生效前的硬性检查
- 输入框不是只看节点截图，需核对当前执行时`editor_state`非空，或者`bboxes`输入收到有效上游；如两者都空，则没有框。
- `Flux3LayoutPrompt`对空元素数组不会追加布局表；检查最终输出是否包含可解析非空的layout元素。如果输出只剩原始指令，此轮标记“无框提示词基线”。
- 第一轮T25–T28曾出现空框但有结果的假阳性，务必做“有框 vs 无框”对比。

## 核心节点链路
- 先设参考 `LoadImage`（若编辑）→编辑模型参考输入（如 `ReferenceMultiLatent`）。
- 在 `CreateBoundingBoxes` 中设置背景图（可选）和与测试目标一致的画布 `width/height`。
- 画框：选择`对象/obj`；在每个框 `desc` 填写目标对象外观，框1对应 `obj_1`、框2对应 `obj_2`。文本框应选择节点支持的文本类型并写明精确内容。
- `CreateBoundingBoxes.elements` → `Flux3LayoutPrompt.element`。
- `Flux3LayoutPrompt.prompt`：填含 `<obj_1>`/`<obj_2>` 的**完整结果画面描述**；`Flux3LayoutPrompt` 输出→下游文本编码。
- 确认右侧预览的最终caption确实接入采样链，而非仅连接预览文本节点。
- `CreateBoundingBoxes.preview` 只是可视化定位，不是自动生成的像素 Mask。框和 `desc` 只产生**软位置引导**。

## `dress` 为何最后变红色？
`desc='dress'` 负责声明 `obj_1` 是裙子；`change the dress color <obj_1> to red` 中的 **`to red`** 才是变红的编辑指令；框决定“何处”，`desc`决定“物体是什么”，完整caption决定“改成什么”。不能认为 `dress` 自动携带红色。

## 单框白花耳饰案例（T26）
1. 上传清晰耳饰人像，参考图在第一个索引 `<ref_image_0>`。
2. 框住**金色耳饰实际位置**，少量边界余量；不要框整个头，也不要小到完全没覆盖饰品。
3. 元素描述：`single white five-petal flower-shaped earring`。
4. 完整结果caption：
   `In <ref_image_0>, the same adult woman appears in the original close-up portrait with unchanged face, hair, turquoise clothing, lighting and background. At <obj_1> on her visible ear, one white five-petal flower-shaped earring replaces the original large gold dangling earring. The flower has a natural attachment to the earlobe, realistic scale, soft shading and no remaining gold jewelry. The composition and facial expression remain consistent with the reference.`
5. 关注：旧耳饰是否残留、花是否偏移到脸上、脸/发型/背景是否改变。不要声称局部“像素级锁定”。

## 多框位置教学（T27/T28）
- 示例T27左侧花瓶`obj_1`、右侧蓝书`obj_2`：分别框选，分别给`desc`，在总caption里引用两个ID；不要把两框叠成一个框。
- 对多框输出单独评分：“目标出现在指定区域”“大小匹配”“布局关系正确”“额外物件/框外更改”。
- 0–1000 JSON 的y坐标在前，常见手写错误是用 `[x1,y1,x2,y2]`。
- 编辑器必须启用当前节点要求的 `Nodes 2.0` 等前端功能才能正常画框，具体设置名称以当前 ComfyUI 版本为准。

## 细节限制
小型耳饰、纤细文字、极高密度物件的框控容易失效；改耳饰属于演示难点。建议先用桌面杯子→花瓶等较大对象教学，再用耳饰作为进阶压力测试。

## 高级框选：从原图位置移动到新位置（进阶）

仅在使用**支持该语法的布局caption接口**时，元素可带有：

- `from`: `"ref_image_0"`（从第一张参考图取对象）或 `"target"`（目标画面）
- `src_bbox`: 参考图的原始范围；
- `tgt_bbox`: 输出图中的目标范围；
- 两者相等表示请求尽量保留原位；两者不同表示移动；部分官方布局编辑格式可使用 `null` 目标表示移除。实际支持程度必须以当前 ComfyUI 节点接口及模型测试为准。

例如完整caption的尾部（**不是** ComfyUI `CreateBoundingBoxes` 节点直接手填的像素框）：

```json
[
  {
    "id": "obj_1",
    "from": "ref_image_0",
    "src_bbox": [350, 100, 750, 350],
    "tgt_bbox": [200, 550, 600, 800],
    "desc": "a dark wooden chair seen in the reference photo"
  }
]
```

这段是为了讲明 `src_bbox/tgt_bbox` 语义的**示例数据**；若你采用 `Flux3LayoutPrompt` 自动生成的只含 `bbox/desc` 表，不可假定它已具备高级源→目标移动表字段。需要在真正运行接口先验收后再用于课程。来源：Hugging Face Diffusers 官方文章 https://huggingface.co/blog/flux-3 。
