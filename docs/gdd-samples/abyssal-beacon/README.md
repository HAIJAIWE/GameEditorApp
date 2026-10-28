# 深潮灯塔 · Abyssal Beacon

用 **game-designer-pro** 方法论生成的一个**单路塔防**样例：GDD + 可复算数值 + 可玩 HTML Demo + 设计契约。

## 怎么玩

双击 `demo.html`（单文件、无外部依赖），或用浏览器打开：

- 右侧选塔（探照灯 / 声呐塔 / 腐蚀塔）→ 点空地建造；
- 点已有塔可升级 / 拆除；
- 守住 20 波，灯塔耐久归 0 即失败；
- 调试面板：×1 / ×2 / ×5 倍速、+100 生物质、重置。

## 文件

| 文件 | 说明 |
|---|---|
| `gdd.md` | 设计文档（8 段：首页 / 走读 / 架构 / 机制 / 数值 / MVP / 原型 / 变更） |
| `demo.html` | 可玩 Demo（与 GDD 共用 `abyssal-beacon-v1` 常量） |
| `contract.json` | 设计契约（参数 / 断言 / 原型检查 / 旅程） |
| `proof.png` | 无头浏览器验收截图 |

## 验证

- `contract.json`：`PASS design contract validation passed with no findings`
- Demo 无头验收（headless Chrome）：首载 0 错误、建塔扣费（150→100）、第一波击杀（wave 0→1）、失败与重开闭合

## 规则集

`abyssal-beacon-v1` —— GDD 第 5 章的数值表与 `demo.html` 里的 `RULES` 常量同源；改数值必须同步两处。
