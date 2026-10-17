# Third-Party Notices

本仓库在 `src/skills/` 下内置了以下第三方 Agent Skill 文本的**逐字节快照**（未修改），
用于让编辑器在离线状态下复用上游的提示词工程成果。内容版权归原作者所有，按各自许可证分发。

## src/skills/ideogram4/

- 上游：https://github.com/ruashots/ideogram4-skill
- 文件：`SKILL.md`、`references/schema.md`
- 快照 commit：`c005b044922a5dce7ef928366618015b119b9998`（2026-06-11）
- 许可证：MIT

## src/skills/flux3-layout/

- 上游：https://github.com/AI-KSK/flux3-klein-prompting
- 文件：`SKILL.md`、`references/bounding-box-workflow.md`
- 快照 commit：`d14351801391055d7ce9e993593ebe06f24e8429`（2026-10-16）
- 许可证：Apache-2.0

## src/skills/moss-layout/

- 上游：https://github.com/OpenMOSS/MOSS-Image
- 文件：`skills/moss-image-prompt-enhancer/SKILL.md`、`skills/moss-image-prompt-enhancer/references/layout.md`
- 快照 commit：`c1355e6b1986dfe8fba3c0455783a05899212342`（2026-10-16）
- 许可证：Apache-2.0

## 注意事项

- Ideogram 4 的**模型权重**为非商用许可（见上游 `SKILL.md` 的 license gate），本仓库仅内置其提示词格式文档。
- 未内置无 LICENSE 声明的第三方 skill（例如 `kkget/Comfyui-Flux3-promt-Skill`、`artificialguybr/krea2-ideogram4-prompt-skill`），仅支持用户自行通过 URL 导入。
- 更新内置快照时请同步更新本文件的 commit 与日期。
