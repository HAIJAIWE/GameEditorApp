// shared/agent/guard —— 循环卫生守卫：重复工具调用的检测与提醒（advisory，仅提示不阻断）。
// 设计出处见 repeatCall.ts 头注释（对齐 dsh `guard/repeat-tool-reminder`：advisory、链键用完整规范化参数、提醒本身有上限）。

export * from './repeatCall'
