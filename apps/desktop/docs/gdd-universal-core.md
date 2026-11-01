# 底层：一个通用底座 + 可选系统模块（品类差异到底在哪）

> 承接 `gdd-china-vs-international.md`。用户问：总得有个底层吧？不同游戏类型难道都不一样吗？
> 答：**有底层，但它是「问题」不是「字段」；品类差异在「系统层」，不在底层。**

## 一、通用底座：6 个问题（所有游戏，任何品类，必答）

不管 FPS、卡牌、休闲合成、叙事，任何游戏都必须回答这 6 个：

1. **它是什么？** —— 一句话定位 + 给谁 + 和谁不一样
2. **核心体验是什么？** —— 设计支柱 / 想营造的感觉 + 拒绝什么
3. **核心循环？** —— 玩家每一刻做什么 → 得到什么 → 为什么再来一轮
4. **目标 / 进度 / 胜负？** —— 怎么算进步、怎么结束
5. **首个可玩范围（MVP）？** —— 最小可玩闭环是什么
6. **平台 / 受众 / 商业模式？** —— 在哪玩、给谁玩、怎么赚钱（或免费）

**验证**：Doom（1992）、Scrapbots（卡牌）、喵岛邮差（合成）——三份完全不同的东西，**这 6 问都答得出**。
这就是底层：**跨品类恒定**。

## 二、系统层：按品类/项目勾选（不是通用）

战斗、经济、卡牌、建造、叙事、关卡、技能、装备、社交、抽卡、竞技、天气……
**有没有，取决于品类；做多深，取决于项目。**

| 游戏 | 有战斗 | 有经济 | 有卡牌 | 有关卡 |
|---|---|---|---|---|
| Doom | ✅ | ❌ | ❌ | ✅ |
| Scrapbots | ✅(卡牌战斗) | ✅ | ✅ | ❌ |
| 喵岛邮差 | ❌ | ✅ | ❌ | ❌ |
| 纯叙事 | ❌ | ❌ | ❌ | ❌ |

**所以「不同游戏类型」真正的差异，是这张表的勾选，不是那 6 个问题。**

## 三、正确结构 = 薄底座 + 模块菜单

```
通用底座（恒定、必填）
   └─ 6 问
可选系统模块（按 game_type 预勾选，可增删）
   ├─ 战斗模块（内部有自己的必填：战斗方式/伤害公式…）
   ├─ 经济模块（货币/产出消耗…）
   ├─ 卡牌 / 建造 / 叙事 / 关卡 …
   └─ …
```

- **底座恒定**：换什么品类都不变；
- **模块可选**：`game_type` 只**预勾选默认模块**，不硬性"必须有"；
- **模块内部**再有必填——"战斗模块"对含战斗的游戏才必填。

## 四、对照我们的 24 章

我们的 **concept 阶段 7 章**其实混了底座和模块：

| 我们的章 | 属于 |
|---|---|
| meta（定位/标签） | 底座 |
| vision（愿景/差异化） | 底座 |
| gameplay（核心循环） | 底座 |
| mvp（可玩范围） | 底座 |
| **combat** | **模块**（无战斗品类不需要） |
| **economy** | **模块**（叙事/纯玩法可不需要） |
| **numeric** | **模块**（不是所有游戏都要公式） |

**关键结论：我们的 24 章本质是一张「模块菜单」，不是「通用清单」。**
之前做的「combat 按品类条件必填」是对的方向，但**终点应该是「底座必填 + 模块可选」**，
而不是"每个品类硬性一套"。这样更干净，也更接近真实工作流（国内按系统拆、国际 feature spec）。

## 五、建议的下一步（比"品类条件必填"更根本）

把 schema 显式拆成：

- **`UNIVERSAL_CORE`**：6 问（恒定必填，跨品类）；
- **`MODULES`**：战斗/经济/卡牌/关卡…（可选，`game_type` 预选，UI 先勾后填）。

这比"按品类写死一套必填"更符合真实世界，也让"打开就 24 章"彻底变成"打开先答 6 问，再勾你要做的系统"。

## 六、实施记录（2026-10-26，两步已落地）

**第一步：模型（向后兼容）**
- `ceshuConstants.ts`：`UNIVERSAL_CORE_CHAPTERS`（meta/vision/gameplay/mvp）+ `MODULE_CHAPTERS`（其余）+
  `isCoreChapter` + `enabledModuleChapters(doc)`（读 `meta.enabled_modules`，缺省=全部）+ `isChapterEnabled`；
  `visibleChapterKeys(scope, gameType?, enabledModules?)` 加模块过滤。
- `ceshuModel.visibleChaptersForDoc(doc)` = 档位 × 品类 × 模块；`computeChapterProgress` 已改用它。
- 守卫 `tests/unit/ceshuModules.test.ts`（6 项）。

**第二步：模块勾选 UI**
- 新组件 `CeshuModulePicker.tsx`：通用底座 4 章恒显示 + 系统模块复选框。
- `CeshuView` 导航里加「系统模块 N/M」按钮，展开勾选面板；勾选写入 `meta.enabled_modules`（随「文档信息」保存）；
  导航改用 `visibleChaptersForDoc(doc)`——**关掉的模块从导航消失、也不计入完成度**。
- DOM 测试 `tests/unit/dom/ceshuModulePicker.test.tsx`（2 项）。

**第三步：校验 / 机读包 / 导出 / 评分 联动**
- 校验（2 处）与机读包改用 `visibleChaptersForDoc(doc)`；导出 `visibleChapterEntries` 加 `enabledModules` 参数（docx/html/markdown/pptx 四处都传）；评分 `scoreChapters` 增加 `isChapterEnabled` 过滤。
- 守卫扩展 `tests/unit/ceshuModules.test.ts`（+3 项：关掉的模块不报必填、不进机读包、不参与评分）。

**未做（下一步）**：
1. 新文档默认 core-only（`createDefaultCeshu` 设 `meta.enabled_modules: []`）——会动到"24 章"相关测试，需单独处理。
