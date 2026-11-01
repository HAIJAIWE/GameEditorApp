import { RISK_LEVEL, type RiskLevel } from './protocolData'

/**
 * 权限档位（对齐 dsh 的 permission-presets：sandbox/mode + approval/policy 两个旋钮合并成一个用户档位）。
 *
 * dsh 把「沙箱模式」与「审批策略」两个独立旋钮组合成预设；我们同样用两个维度表达，
 * 但对外收敛成三个用户可直接选的档位：
 * - `readOnly`：只读沙箱——拒绝一切写数据 / 文件 / 网络 / 系统工具（硬上限 READ_ONLY）。
 * - `ask`：放开到 SYSTEM，但任何非只读动作（≥ DATA_WRITE）都先问用户（dsh 的 workspace-write + ask）。
 * - `full`：放开到 SYSTEM，只有 SYSTEM 级仍走确认门——即当前的默认行为（dsh 的 danger-full-access + never）。
 */
export type PermissionMode = 'readOnly' | 'ask' | 'full'

/** 进程内权限策略：硬上限 + 确认门阈值 */
export interface PermissionPolicy {
  /** 风险硬上限：超过即拒绝、连确认都不能放行 */
  maxAllowedRisk: RiskLevel
  /** 确认门阈值：风险 ≥ 该档即要求用户确认 */
  confirmThreshold: RiskLevel
}

/** 用户可选的档位顺序（UI 渲染用） */
export const PERMISSION_MODES: readonly PermissionMode[] = ['readOnly', 'ask', 'full']

/** 把用户档位映射成调度器可执行的策略 */
export function resolvePermissionPolicy(mode: PermissionMode): PermissionPolicy {
  switch (mode) {
    case 'readOnly':
      // dsh read-only 沙箱：拒绝一切写/文件/网络/系统工具
      return { maxAllowedRisk: RISK_LEVEL.READ_ONLY, confirmThreshold: RISK_LEVEL.SYSTEM }
    case 'ask':
      // dsh workspace-write + ask：放开到 SYSTEM，但任何非只读动作都先问
      return { maxAllowedRisk: RISK_LEVEL.SYSTEM, confirmThreshold: RISK_LEVEL.DATA_WRITE }
    case 'full':
    default:
      // dsh danger-full-access + never：放开到 SYSTEM，仅 SYSTEM 级仍走确认门（保持既有审批 UI）
      return { maxAllowedRisk: RISK_LEVEL.SYSTEM, confirmThreshold: RISK_LEVEL.SYSTEM }
  }
}

/**
 * 进程内可变策略持有者。权限档位是「运行中可切换」的，调度器与确认门都**实时**读它，
 * 不把阈值拷死在构造期，避免「改了档位却要重建 store / 重开会话」才生效。
 */
export const permissionPolicyHolder: {
  current: PermissionPolicy
  mode: PermissionMode
  set(mode: PermissionMode): void
} = {
  current: resolvePermissionPolicy('full'),
  mode: 'full',
  set(mode: PermissionMode): void {
    this.mode = mode
    this.current = resolvePermissionPolicy(mode)
  }
}
