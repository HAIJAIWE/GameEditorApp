# 游戏用什么技术栈？AI 生成游戏是不是都 HTML/2D？

> 用户问：大多数游戏什么技术栈？难道 AI 生成游戏都是 HTML/2D 吗？
> 结论先说：**真实游戏绝大多数在 Unity/Unreal；HTML/JS 只是「AI 生成原型」这一层的主流，不是整个行业。**

## 一、真实游戏的技术栈（2026 数据）

| 引擎 / 栈 | 语言 | 份额（2026，据 GDC / SteamDB 类数据） | 典型用途 |
|---|---|---|---|
| **Unity** | C# | Steam 约 **48.2%**；top 手游约 **68.5%** | 手游、独立、2D/3D、跨平台（含 WebGL） |
| **Unreal** | C++ + Blueprint | Steam 约 **19.4%**；次世代 AAA 约 **54%** | 高保真 3D、AAA、影视虚拟制片 |
| **Godot** | GDScript / C# | 独立管线约 **14%**；新独立 Steam 约 **6.8%** | 小团队、开源、零抽成（MIT） |
| **自研 C++/Rust 引擎** | C++/Rust | AAA 约 **12%**（Capcom RE、EA Frostbite） | 大厂自研 |
| **Web（JS/TS）** | JS/TS | 浏览器游戏 | Three.js / Babylon / PlayCanvas / Phaser |
| **Cocos Creator** | TS/JS | 国内小游戏生态 | 微信/抖音小游戏 |
| **Roblox / GameMaker** | Luau / GML | 特定平台 | Roblox 平台 / 2D 独立 |

**语言对应**：C# → Unity；C++ → Unreal/自研；GDScript → Godot；JS/TS → Web；Luau → Roblox；GML → GameMaker。
（注意：Godot 4 的 C# 目前**不能导出 Web**，浏览器向要用 GDScript。）

## 二、AI 生成游戏，其实是四个层次（不是一层）

| 层 | 代表（2026） | 技术栈 | 交付什么 |
|---|---|---|---|
| ① **Text-to-Game（浏览器）** | **Rosebud AI**（YC，Gemini/Claude 驱动，浏览器内实时生成/调试 **JavaScript**）、Seele 等 | **HTML/JS** | 能直接在浏览器玩的 demo |
| ② **引擎内 AI 辅助** | Unity MCP、UnrealClaude、Ludo.ai（生成 **Unity 代码**/3D 资产） | Unity(C#) / Unreal(C++) | 在真引擎里加速生产 |
| ③ **资产生成** | PixelVibe（像素）、AI 3D 建模、Scenario | 任意 | 图/模型/贴图/音效 |
| ④ **世界模型** | Genie / GameNGen 类研究 | 神经网络 | 研究性质，非工程栈 |

**所以回答你的问题：**
- **"大多数 AI 生成游戏 = HTML/2D"——在「① Text-to-Game 浏览器」这一层，基本成立**（Rosebud 就是代表，且它的生成产物就是 **JavaScript**）。
- **但这不是整个行业**：真实上线的游戏 90% 在 Unity/Unreal；AI 在那里是「② 引擎内辅助」，不是"用 HTML 重做"。
- 一句话：**HTML/2D 是 AI 生成游戏的"入口层/原型层"，不是"生产层"。**

## 三、为什么"原型层"偏爱 HTML/JS

1. **即开即玩**：浏览器双击就跑，不用装引擎、不用打包；
2. **易分享**：一个文件/一个链接发出去；
3. **LLM 最会写 JS/HTML**：单文件、无编译、反馈快；
4. **成本最低**：适合"先验证值不值得做"。

这也正是我们 `generateDemo` 的定位——**和 Rosebud 同一层（浏览器 Text-to-Game 原型）**。

## 四、我们的差异化在哪

- **Rosebud 类**：偏「直接出一个能玩的 demo」；
- **我们**：偏「**想法 → 立项一页 → 原型 demo → 能开工的规格**」——
  也就是除了 demo（层②），还产出 **数据表 / 岗位任务 / 机读包 / 断言（层③）**，能把成果交给 Unity/Unreal 团队真做。
- 所以不是"又做一个 Rosebud"，而是"**多一层通往真开发的桥**"。HTML 原型只是入口，不是终点。

## 五、Web 游戏 / 小游戏 / 可玩广告：别混（两条轴）

你问"AI 生成的内容是 web 游戏还是小游戏"。先分清**两条不同的轴**：

- **轴 A 交付介质**：Web（浏览器打开）／小游戏（微信·抖音·快手等超 App 内）／原生 App·主机／可玩广告（Playable Ad）
- **轴 B 技术栈**：HTML5/JS（web）／Cocos·Laya·Unity（小游戏）／Unity·Unreal（原生）／单文件 JS（可玩广告/原型）

| 形态 | 跑在哪 | 常见技术栈 | 是不是"上线产品" |
|---|---|---|---|
| **Web 游戏** | 浏览器 | HTML5/JS（Three/Phaser/Pixi） | 可上线（itch.io/自站） |
| **小游戏** | 微信/抖音/快手 超 App | Cocos Creator / LayaAir / Unity 导出 | 是（要过平台审核） |
| **可玩广告** | 广告位（浏览器/App 内） | 单文件 HTML/JS | 是（投放用，通常几 MB 内） |
| **原型 demo** | 本地/浏览器 | 单文件 HTML/JS | **否**（验证用） |

**"AI 生成"的产物落在哪，看它被用来干什么**：
- 快速验证 → **原型 demo**（单文件 HTML），不是产品；
- 投广告 → **可玩广告**（单文件，几 MB）；
- 上微信/抖音 → **小游戏**（Cocos/Unity 导出，要审核）；
- 真做游戏 → **引擎内 AI 辅助**（Unity/Unreal）。

**关键：小游戏 ≠ web 游戏。** 小游戏是**发行渠道**（超 App 内），web 游戏是**打开方式**（浏览器）。
技术上高度重叠（都是 JS 运行时），但**审核、变现、分发完全不同**。

## 六、不用引擎行不行？三条「无引擎」路径（2026 都真实存在）

你问"别人直接在 AI 那边生成了，不用引擎？"——**对，2026 有三条路，但成熟度不同**：

| 路径 | 是什么 | 代表 | 成熟度 |
|---|---|---|---|
| ① 单文件 HTML/JS | 浏览器直接跑，无引擎无资源 | 我们的 demo、Rosebud AI | 成熟（原型/小游戏） |
| ② Vibe Coding / Vibe Gaming | AI 编码助手 + 轻量栈（Canvas2D + TS + Vite / 微信小游戏），一个人 + AI 做完并上架 | 2026 大量「一人工作室」 | 成熟（小游戏/工具） |
| ③ 世界模型 | 不写代码、不用引擎，神经网络直接生成可交互世界 | **Genie 3**（DeepMind，实时 24fps/720p，研究预览，仅几分钟连续交互）、GameNGen（神经 DOOM）、LingBot-World（蚂蚁开源） | 研究/预览，**还不能做产品** |

**代价**：无引擎能覆盖"轻、2D、小、原型、小游戏"；一旦要资产管线、复杂 3D/物理、多人、大内容、上架主机 → 还是得引擎。

**关键认知**：**"生成"正在变成模型能力**（ChatGPT / Claude 直接出单文件游戏）。
所以别跟"AI 直接生成"比生成速度——你的价值在**生成之后**：立项一页、可维护、能迭代、能交给引擎/团队。

## 七、来源

- 引擎份额：GDC 2026 State of the Industry / SteamDB / 各 2026 引擎横评（Unity ~48% Steam、~68.5% 手游；Unreal 19.4% Steam、54% AAA；Godot 14% 独立）
- 语言/导出限制：devpebble 2026「Best programming language for game development」（Godot 4 C# 不能导出 Web）
- Rosebud AI：百度百科 / DoNews 2026（YC 孵化，浏览器 Text-to-Game，实时生成 JavaScript，集成 Gemini/Claude）
- Ludo.ai：生成游戏概念 / 3D 资产 / Unity 代码
