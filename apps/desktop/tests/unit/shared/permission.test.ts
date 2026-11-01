import { describe, expect, it } from 'vitest'

import {
  PERMISSION_MODES,
  permissionPolicyHolder,
  resolvePermissionPolicy,
  type PermissionMode
} from '@mobai/shared/agent/config'
import { RISK_LEVEL } from '@mobai/shared/agent/config'

/**
 * 权限档位（对齐 dsh 的 read-only / ask / full）。
 * 验证：三档预设映射、档位顺序、共享持有者的实时切换语义。
 */
describe('permission modes (dsh-style readOnly/ask/full)', () => {
  it('resolves each preset to the expected policy', () => {
    expect(resolvePermissionPolicy('readOnly')).toEqual({
      maxAllowedRisk: RISK_LEVEL.READ_ONLY,
      confirmThreshold: RISK_LEVEL.SYSTEM
    })
    expect(resolvePermissionPolicy('ask')).toEqual({
      maxAllowedRisk: RISK_LEVEL.SYSTEM,
      confirmThreshold: RISK_LEVEL.DATA_WRITE
    })
    expect(resolvePermissionPolicy('full')).toEqual({
      maxAllowedRisk: RISK_LEVEL.SYSTEM,
      confirmThreshold: RISK_LEVEL.SYSTEM
    })
  })

  it('PERMISSION_MODES lists the three modes in readOnly/ask/full order', () => {
    expect([...PERMISSION_MODES]).toEqual<PermissionMode[]>(['readOnly', 'ask', 'full'])
  })

  it('holder defaults to full', () => {
    // 每次 import 都是同一单例；以模块初值为准（full）
    expect(permissionPolicyHolder.mode).toBe('full')
    expect(permissionPolicyHolder.current).toEqual(resolvePermissionPolicy('full'))
  })

  it('holder.set switches mode and updates current in place (no rebuild needed)', () => {
    const before = permissionPolicyHolder.mode
    permissionPolicyHolder.set('readOnly')
    expect(permissionPolicyHolder.mode).toBe('readOnly')
    expect(permissionPolicyHolder.current).toEqual(resolvePermissionPolicy('readOnly'))
    permissionPolicyHolder.set('ask')
    expect(permissionPolicyHolder.current).toEqual(resolvePermissionPolicy('ask'))
    // 还原，避免影响其它测试
    permissionPolicyHolder.set(before)
  })
})
