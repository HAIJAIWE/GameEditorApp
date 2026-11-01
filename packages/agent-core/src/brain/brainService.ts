/**
 * Agent Brain 服务（**重写后的桶文件**，2026-10-18）。
 *
 * 实现已拆到 `./agentService/` 包：
 *  - `types`         ：对外契约
 *  - `domainContext` ：域 grounding / 默认评估器
 *  - `memory`        ：记忆块装配
 *  - `service`       ：AgentBrainService 主实现
 *
 * 外部 import 站点零改动——本文件继续导出与拆分前完全相同的公共 API。
 */

export * from '../agentService/index'
