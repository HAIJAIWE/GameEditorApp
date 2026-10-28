# 游戏文档 vs 游戏架构：一张地图（含权威书单）

> 你问的"游戏设计文档"和"写游戏架构"其实是**两条不同的轨道**——读者不同、写法不同、生命周期不同。
> 先分清它们，再谈"怎么写"就有方向了。下面所有书/资料都是**可核实的**（不编）。

## 一、先分清两件事

| | **游戏设计文档（Design）** | **游戏架构（Engineering / TDD）** |
|---|---|---|
| 回答 | 做什么？给谁？为什么好玩？怎么赚钱？ | 怎么实现？模块怎么分？数据怎么流？ |
| 读者 | 制作人 / 策划 / 美术 / 发行 | 程序 / 技术美术 / 引擎 |
| 形态 | 一页 pitch + 策划案 + 数值表 | 架构图 + 模块边界 + 接口/状态机 + 数据表 |
| 谁写 | 策划（系统/数值/文案） | 主程 / 架构师 |
| 典型产物 | Doom Bible、Diablo pitch、系统策划案 | 引擎架构、0 A.D. 的 tech 文档、downflux 的 client/server |

**关键**：一份项目两样都要，但**不是同一份文档**。设计文档给"做什么"，架构文档给"怎么做"。

## 二、轨道 A：游戏设计（做什么）——该读什么

**权威书（可核实）**
- **《The Art of Game Design: A Book of Lenses》**（Jesse Schell，第 3 版 2019，CRC Press）——用"透镜"逼你从多个角度审视设计，是"设计思维"的地基。
- **《Level Up! The Guide to Great Video Game Design》**（Scott Rogers，第 2 版 2014）——从概念到上线的实操，含"怎么写设计文档"。

**真实文档（我们已核对过的）**
- Doom Bible（1992 FPS）：写**体验/内容**，几乎不写数值规格；
- Diablo 1994 Pitch（8 页）：**极短**，但含"市场 + 团队 + 排期"；
- Cataclysm-DDA / 0 A.D.：**wiki/知识库**，中心页 + 子页；
- 数值策划 Excel（真实 SLG）：**数值全进表**（参数/曲线/矩阵 + 公式总表）。

**怎么写（设计侧的三条）**
1. **一页讲清**（定位/核心循环/MVP），再分层展开；
2. **数值进表**，不写散文；
3. **按读者写**：给制作人看影响与排期，给程序看规则与数据。

## 三、轨道 B：游戏架构（怎么实现）——该读什么

**权威书（可核实）**
- **《Game Engine Architecture》**（Jason Gregory，已出第 4 版，Naughty Dog 主程）——引擎各系统的权威大部头（内存、渲染、动画、物理、音频）。
- **《Game Programming Patterns》**（Robert Nystrom，2014，**官网免费** gameprogrammingpatterns.com）——把经典设计模式落到游戏：游戏循环、状态机、组件、对象池、事件。
- **《Real-Time Rendering》**（Akenine-Möller / Haines / Hoffman，第 4 版）——图形渲染圣经（做渲染才需要）。

**真实文档（我们核对过的）**
- **0 A.D.** 的 `XML.Entity.Traits.*` / `List:Entities:...`：实体/属性/动作的**架构级索引**；
- **downflux** `design/client.md / server.md / fsm.md / network.md`：客户端/服务器/状态机/网络的**技术设计**。

**怎么写（架构侧的三条）**
1. **画边界**：模块/系统怎么分、谁依赖谁；
2. **写接口**：数据结构、状态机、消息/协议；
3. **代码即文档**：能跑的原型/接口比散文准。

## 四、两条轨怎么衔接（这才是关键）

**数据表是桥梁**——它既是策划的设计产物，又是程序读的接口（前面那份数值 Excel 就是）。
所以一条健康链路是：

```
设计文档（做什么，一页+分层）
   └─ 系统/数值设计 → 数据表（参数/曲线/矩阵 + 说明表）
        └─ 架构文档（怎么读这些表、怎么算、怎么同步）
             └─ 程序实现 + 测试按表验证
```

## 五、给你的学习路线（从"见识低"到"能判断"）

1. **先读《Game Programming Patterns》**（免费）——建立"代码/系统怎么组织"的直觉，成本最低、收益最快；
2. **再读《The Art of Game Design》**——建立"设计怎么想"的框架（透镜法）；
3. **看真实文档对照**：Doom Bible（叙事）、Diablo pitch（商业）、CDDA/0 A.D.（wiki）、数值 Excel（数据）；
4. **回到你的产品**：你已经把"一页摘要 + 分层 + 机读数据 + 岗位任务"做出来了——这正好对应上面"设计文档 + 数据表"两层；缺的是**架构层**（系统/接口/状态机文档）和**wiki 化**（中心页+子页）。

## 六、一句话

- **设计文档**回答"做什么"，靠"一页 + 分层 + 表"；
- **架构文档**回答"怎么做"，靠"边界 + 接口 + 状态机"；
- 两者用**数据表**衔接；
- 热门项目早就不写"一份大 GDD"了，而是 **pitch / wiki / 表** 三件套。

## 七、来源（可核对）

- Game Engine Architecture — `https://www.gameenginebook.com/`（Jason Gregory，第 4 版）
- Game Programming Patterns — `https://gameprogrammingpatterns.com/`（Robert Nystrom，免费在线）
- The Art of Game Design — CRC Press 第 3 版（Jesse Schell）
- Level Up! — Scott Rogers 第 2 版（2014）
- Real-Time Rendering — 第 4 版（Akenine-Möller 等）
- How to Write a Game Design Document — Leandro Gonzalez（2016，机核有译文）
- 真实文档样本见 `gdd-writing-examples.md`
