---
name: flux3-klein-prompting
description: 为 BFL FLUX 3 Image Klein Base/Distilled 提供规范化提示词、T2I/单图编辑/多参考(至多10张)/Bounding Box布局、Prompt Upsampler四模式、4K压力测试及公平横评指导。当用户需要 ComfyUI FLUX 3 Klein 提示词、原图保留、参考图映射、obj框选、ON/OFF校验或 AI-KSK 30组与15组插画测试时使用。
compatibility: Agent Skills 格式；纯提示词无需GPU；验证脚本需 Python 3.9+ 标准库。ComfyUI具体节点以当前工作流版本和连接为准。
metadata:
  author: AI-KSK
  version: '1.1.0'
  updated: '2026-10-16'
---
# FLUX 3 Image Klein Prompting｜AI-KSK 校准版

## 作用与边界
只做提示词构建/审阅、参考与框选语义、教学案例、试验设计及运行前静态验收。**不能擅自改装模型、改写官方子图或宣称生成通过**。用户给了7套现成工作流时，优先复制原节点与链接，不自创替代推理链。用户要求改 JSON 时再对副本操作；不覆盖原文件。

## 执行步骤
1. **判断任务**：`T2I`、`EDIT`、`MULTI_REF`、`LAYOUT_T2I`、`LAYOUT_EDIT`、`BENCHMARK`、`4K_STRESS`。需要实际图片而未提供时才询问；若只写生成素材Prompt，不要求参考图。
2. **确定约束**：Base/Distilled、参考图数量和零基顺序、目标画面、允许改变与必须尽量保留的内容、比例与目标宽高、Seed、Steps、CFG、PUP路径、BBox模式、最终输出文件名。
3. **图像事实**：只根据真实看到的图写参考图外观。看不到的角色身份、饰品、文字不编造；身份/像素保持是目标而非保障。
4. **写完整英文 Full Scene Caption**：媒介/笔触风格 → 主体及数量、明确身份和外形 → 动作与左右前后关系 → 衣物/道具/材质 → 背景环境 → 镜头与裁切 → 光照色彩 → 精确文字和应保留细节。直接输出一段可粘贴的最终画面描述，不用`masterpiece/8K/best quality`代替细节。若用户要多组，按S/T编号分别提供。
5. **EDIT**：以编辑后的**整张画面**为描述核心，把局部修改融进去，并明确哪一项不能变。小饰品、手指、字体、姿态、大范围重构是高风险，需要把原图和输出并排评分。
6. **MULTI_REF**：首张为 `<ref_image_0>`，之后 `<ref_image_1>`…最多10张（按确实接入的次序）；逐图写身份/服饰/背景/道具的职责。**参考图控制外观，并不锁定像素和构图**。输出主体数量要清晰。
7. **LAYOUT**：`CreateBoundingBoxes.elements` → `Flux3LayoutPrompt.element`，主Caption里标记 `<obj_1>` 等，节点自动追加box表；**不要在这个节点前又手写第二份JSON表**。框内desc=对象是什么；Caption=做什么；Box=放在哪里。节点输出必须接到真正文本编码链，不只是`PreviewAny`。
8. **真框验收（硬规则）**：检查本次执行的 `editor_state` 有有效框，或 `bboxes` 有有效上游输入；检查 `Flux3LayoutPrompt` 的预览最终包含非空布局元素。若两者为空，判定为**纯提示词基线，不得报告BBox成功**。不要把“框显示在画布上”的截图当作已经入模的证据。运行元数据/输出需按节点实际版本核实。
9. **PUP四种模式**：官方 `t2i`、`i2i`、`t2i_bbox`、`i2i_bbox`。短句必须先使用官方PUP或等效、遵循完整caption规则的LLM扩写；对编辑的PUP必须有实际参考图上下文。已经由增强器/人工按同等规范生成的完整Caption可以直接输入模型，不必强制**再扩写一次**；不得说“从未扩写的短句关闭PUP也推荐”。
10. **开关看实际接线**：同名`ComfySwitchNode`在不同上传版里True/False可能相反。**先追踪`TextGenerate`输出接`on_true`还是`on_false`，再写开启状态**；不要把开关UI颜色当证据。AI-KSK的15组4K最新要求为 PUP全部ON；应审计15个顶层实例的`switch=True`及子图`on_true`为扩写分支。F03/F04早期版本可有相反接线，单独审计。
11. **横评**：同题Base/Distilled共享**完全相同的最终Caption**、原图、裁切、参考顺序、尺寸和Seed。若PUP开启，先一次增强并锁定结果再分配两路；两路各自产生不同扩写文本的测试不叫同提示词横评。推荐基线 Base 50步/CFG3.5、Distilled 16步/无额外guidance（部分ComfyUI采样器表现为CFG=1）；保留软件真实配置记录。推荐配置对比≠等步数≠等算力；耗时/PUP耗时/显存分列。首轮单Seed只能做示例，不代表稳定性。
12. **4K压力测**：BFL声明支持最高4K，但硬件显存、量化、ComfyUI前端/节点不因此保证一次成功。3072×4096为AI-KSK**3:4、12582912像素的自选压力尺寸**，并非“官方唯一4K预设”。先单任务实测真实PNG尺寸、GPU峰值与OOM，再决定是否运行15组；不得偷偷降分辨率冒充过关。15组新版本全部PUP ON，源提示词仍保留，务必把**增强后的最终Caption**保存供分析。
13. **交付格式**：任务/编号 → 英文完整Prompt → Base或Distilled → 参考编号/输入图 → 宽高与比例 → PUP状态及真实接线 → BBox数量/desc与最终布局预览 → 保存前缀 → 测试目标/失败条件。生成前不打分；对图像效果评分必须注明主观与样本数。

## 必需补充阅读
- [官方机制及许可](references/official-mechanics.md)
- [场景Caption模板及范例](references/prompt-patterns.md)
- [参考与BBox实测校准](references/bounding-box-workflow.md)
- [PUP四模式/开关/横评](references/upsampler-and-comparison.md)
- [4K与15组插画专案](references/4k-stress-and-style.md)
- [30组测评经验与证据纪律](references/empirical-notes.md)
- [已核对的官方来源](references/sources.md)
- [常见失败和修正](references/troubleshooting.md)
- [社区关切](references/community-notes.md)

## 资源和工具
- `assets/30_cases.source.json`：既定30组**原始设定**（保留，不擅自修改）。
- `assets/30_cases.skill_review.json`：技能对30组的建议，不覆盖原始方案。
- `assets/15_style_prompts.original.json`：15组已确定英文完整Prompt（原始设定保留）。
- `assets/15_4k_run_config.json`：当前用户指定的15组4K、PUP ON配置。
- `assets/reference_image_prompts.json`：A/B类素材提示词。
- `assets/seven_workflows_switch_audit.json`：历史审核笔记，**不能代替新导入工作流的即时线路验收**。
- `scripts/lint_prompt.py`：本地提示词静态审查。
- `scripts/audit_workflow.py`：JSON检查15组开关、4K尺寸、连线和空框提示。
- `scripts/validate_skill.py`：仓库结构及数据验证。

## 输出示例
- T2I：「按S01云端飞行少女生成一段英文完整Caption，3:4，3072×4096，PUP ON；不使用参考图。」→ 输出唯一Prompt+运行元数据，不保证生成效果。
- EDIT：「A01金色耳饰换白色五瓣花，人物ID不变。」→ 明确保留脸/发型/服饰/光影，生成完整编辑后的画面Caption，并说明面部漂移可能性。
- LAYOUT_EDIT：「A04杯子换花瓶，框1。」→ `obj_1`引用+框内desc+原图参考链+检查真实框数据，不得把空框出图作为控制证据。
