# 2026 年 GDD 现状：从「静态文档」到「活的设计系统」

> 承接 `real-gdd-structure-comparison.md`（4 份真实公开策划书）。那 4 份是 1992–2021 的样本；
> 本文看**当下（2026）**行业怎么演进，并对照我们这套 24 章 / 阶段分层 / 机读层到底站哪。

## 一、2026 的五条主线（都有可核对来源）

1. **静态大文档 → 活文档（Living Document）**
   IEEE VR 2026 的 "The Game Playbook" 明确以**活文档**取代一次性写完的静态 GDD，且把「干预手册 + 逻辑模型 + GDD」合并成**单一制品**，理论必须**显式映射**到玩法机制上。协作侧，Nuclino 等把 GDD 变成实时协作 wiki（2026-01 仍在推）。

2. **大而全 → 一页 + 分层展开（One-page + Layered, MVP-first）**
   gamedesigndocument.com 主打「一页式 GDD + change log」；OpenAgenticGame-GDD 直接给四阶段写作顺序（先核心设计 → 世界观/AI → 类型适配 → 附录）。

3. **人读 → 人机双读（Markdown / 机读优先）**
   OpenAgenticGame-GDD（2026-01~03，活跃）口号就是 **"md is first class, forget word/excel"**：**每章一个独立 Markdown 文件**、天然适配 Git、可被 AI 直接解析。传统 PDF/Word 因「协作与迭代」差被明确抛弃。

4. **AI 全程参与 + 量化（Agent-first, Quantitative）**
   同一项目内置：好玩浓度测试器、世界观 AI 助手、设计质量 AI 评估，并用**加权评分**（玩法逻辑 15%、剧情 10%…）把主观设计变可打分。生态里还出现带 `/gdd` 命令的 agent 工具链（2026-04）。

5. **类型化模块（Genre-adapted, Modular）**
   同一模板覆盖 **8 大类型**（动作/RPG/策略/卡牌/模拟经营/消除/放置/恋爱养成），按类型**动态选章**——**没有一个万能章节表**。

## 二、我们这套站在哪（对照表）

| 2026 趋势 | 我们的实现 | 状态 |
|---|---|---|
| 活文档 / 协作 | 版本 + 变更日志 + 迁移，但**单机**、无实时协作 | ◐ 部分 |
| 一页 + 分层（MVP 优先） | `ceshuStages` 立项/研发/发行 + 机读分区 | ● 对齐 |
| Markdown / 机读优先 | 机读层（JSON bundle）+ 契约 + 断言 | ● 对齐 |
| AI 全程 + 量化 | `aiHint`/`reviewHint` 契约、AI 起草、scorer 评分 | ● 对齐 |
| 类型化模块 | `game_type` 条件必填（combat 已做，economy 待扩） | ●/◐ |
| 理论→机制显式映射 | `numeric_assertions` / `design_claims`（主张→证据核对） | ● 对齐 |

## 三、结论（说人话）

- **我们不是落后，是提前站在 2026 的主流上**：分层、机读、AI 起草、量化、类型化——这五条正是 2026 公认的方向，而我们过去几轮已经把前四条落地了。
- **真正的差距只有两块**：
  1. **协作活文档**——行业在往多人实时协作 wiki 走，我们还是单机桌面 + 版本历史；
  2. **一页式视图**——2026 强调「一页讲清、再分层展开」，我们缺一个「一页总览」入口（阶段分层已接近，但不是一个可交付的单页）。
- **下一步性价比最高**：补一个「一页式摘要视图」（把 concept 阶段压成一页），既对齐 2026 主流，又直接降低「打开就 24 章」的门槛——和之前阶段分层是同一件事的收尾。

## 四、来源

- IEEE VR 2026 Tutorials — *The Game Playbook: Designing for Serious Games*：`https://ieeevr.org/2026/program/tutorials/`
- gamedesigndocument.com — 一页式 GDD + change log：`https://gamedesigndocument.com/`
- OpenAgenticGame-GDD（2026-01~03，Markdown/AI-agent 优先）：`https://github.com/wanghaisheng/openagenticgame-gdd`
- MRCalderon3D/everything-game-dev-code（2026-04，agent 工具链含 `/gdd`）：`https://github.com/MRCalderon3D/everything-game-dev-code`
- Nuclino — 协作式 GDD（2026-01）：`https://www.nuclino.com/articles/game-design-document-template`
