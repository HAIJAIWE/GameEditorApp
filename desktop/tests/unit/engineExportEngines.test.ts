import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportEngineData, isEngineTarget } from '../../src/main/engineExport/exporter'
import {
  bucketize,
  ENGINE_EXTENSIONS,
  ENGINE_LABELS,
  renderCocosJson,
  renderGodotGd,
  renderUnityCs,
  renderUnrealHeader
} from '../../src/main/engineExport/engines'
import { engineExportInputSchema } from '../../src/shared/schema/core/schemas'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

/**
 * 引擎导出四格式（unity / unreal / godot / cocos2d）单测。
 *
 * 动机：菜单里「导出为 Unity / Unreal / Godot / Cocos2d 格式」四项此前
 * **全都调同一个导出器**，而 `EngineTarget` 只有 `'lua'` —— 四个都吐 `.lua`。
 * 本测试锁死「四个目标各出自己的产物」，防止再退化。
 *
 * 旧版 真源：`src/features/engine_export`（四个独立导出器）+
 * `src/ui/dialogs/engine_export`（`_generate_*_export` 产物内容 + 追加的扩展名）。
 */

const TYPES: DataTypeDef[] = [
  {
    id: 'role',
    name: '角色',
    pluralKey: 'roles',
    color: '#2196F3',
    formFields: [{ name: 'name', label: '角色名称:', type: 'entry', editable: true }]
  },
  {
    id: 'skill',
    name: '技能',
    pluralKey: 'skills',
    color: '#4CAF50',
    formFields: [{ name: 'name', label: '技能名称:', type: 'entry', editable: true }]
  },
  {
    id: 'pet',
    name: '宠物',
    pluralKey: 'pets',
    color: '#8BC34A',
    formFields: [{ name: 'name', label: '宠物名称:', type: 'entry', editable: true }]
  }
]

function record(id: string, type: string, data: Record<string, unknown>): ItemRecord {
  return { id, type, data, createdAt: '', updatedAt: '' }
}

const RECORDS: ItemRecord[] = [
  record('r1', 'role', { name: '法师' }),
  record('s1', 'skill', { name: '火球' })
]

describe('引擎导出：目标枚举与扩展名', () => {
  it('五个目标全部被 zod 契约接受（lua + 四引擎）', () => {
    for (const engine of ['lua', 'unity', 'unreal', 'godot', 'cocos2d']) {
      expect(engineExportInputSchema.safeParse({ engine, path: 'x' }).success).toBe(true)
    }
  })

  it('非法目标被 zod 拒绝（防止又混进一个没实现的引擎）', () => {
    expect(engineExportInputSchema.safeParse({ engine: 'unreal5', path: 'x' }).success).toBe(false)
  })

  it('扩展名与 旧版 一致：.cs / .h / .gd / .json', () => {
    expect(ENGINE_EXTENSIONS).toEqual({ unity: '.cs', unreal: '.h', godot: '.gd', cocos2d: '.json' })
  })

  it('引擎显示名用于对话框标题', () => {
    expect(ENGINE_LABELS).toEqual({ unity: 'Unity', unreal: 'Unreal', godot: 'Godot', cocos2d: 'Cocos2d' })
  })

  it('isEngineTarget 判据', () => {
    expect(isEngineTarget('godot')).toBe(true)
    expect(isEngineTarget('unity')).toBe(true)
    expect(isEngineTarget('godot2')).toBe(false)
  })
})

describe('引擎导出：分桶', () => {
  it('按 pluralKey 归桶，未收录类型回退 type 原文（不丢数据）', () => {
    const buckets = bucketize([...RECORDS, record('x1', 'unknown_type', { name: '神秘' })], TYPES)
    expect([...buckets.keys()].sort()).toEqual(['roles', 'skills', 'unknown_type'])
    expect(buckets.get('roles')).toEqual([{ name: '法师' }])
  })
})

describe('引擎导出：Unity C#（对齐 _generate_unity_export）', () => {
  const buckets = bucketize(RECORDS, TYPES)

  it('骨架：ScriptableObject + using + 有数据的桶才生成 List 字段', () => {
    const cs = renderUnityCs(buckets)
    expect(cs.startsWith('// Unity C# Script - Auto Generated')).toBe(true)
    expect(cs).toContain('using UnityEngine;')
    expect(cs).toContain('using System.Collections.Generic;')
    expect(cs).toContain('public class GameData : ScriptableObject')
    expect(cs).toContain('public List<SkillData> skills = new List<SkillData>();')
    expect(cs).toContain('public List<RoleData> roles = new List<RoleData>();')
    // monsters/equips/items 无数据 → 不生成
    expect(cs).not.toContain('public List<MonsterData> monsters')
  })

  it('补上 旧版 漏定义的 TalentRef 类（否则生成的 .cs 编译不过）', () => {
    const cs = renderUnityCs(buckets)
    expect(cs).toContain('public List<TalentRef> talents;')
    expect(cs).toContain('public class TalentRef {')
  })

  it('带「实际数据」块', () => {
    const cs = renderUnityCs(buckets)
    expect(cs).toContain('// === 实际数据（JSON，键为 schema 的 pluralKey） ===')
    // 每行前缀是 `// ` + 该行原有的 JSON 缩进（顶层键在 JSON 里缩进 2 空格 → 共 3 空格）
    expect(cs).toMatch(/\/\/ {3}"roles": \[/)
    expect(cs).toContain('"name": "法师"')
  })

  it('幂等：同输入两次渲染逐字节相等', () => {
    expect(renderUnityCs(bucketize(RECORDS, TYPES))).toBe(renderUnityCs(bucketize(RECORDS, TYPES)))
  })
})

describe('引擎导出：Unreal C++ 头（对齐 _generate_unreal_export）', () => {
  const buckets = bucketize(RECORDS, TYPES)

  it('骨架：#pragma once + CoreMinimal.h + 三个 USTRUCT', () => {
    const header = renderUnrealHeader(buckets)
    expect(header.startsWith('// Unreal Engine C++ Header - Auto Generated')).toBe(true)
    expect(header).toContain('#pragma once')
    expect(header).toContain('#include "CoreMinimal.h"')
    for (const struct of ['FSkillData', 'FRoleData', 'FMonsterData']) {
      expect(header).toContain(`USTRUCT(BlueprintType)\nstruct ${struct}`)
      expect(header).toContain('GENERATED_BODY()')
      expect(header).toContain('UPROPERTY(EditAnywhere, BlueprintReadWrite)')
    }
  })

  it('Unreal 字段名是 PascalCase', () => {
    const header = renderUnrealHeader(buckets)
    expect(header).toContain('FString Id;')
    expect(header).toContain('int32 Damage = 0;')
    expect(header).toContain('int32 MaxHP = 0;')
    expect(header).toContain('int32 Level = 1;')
  })
})

describe('引擎导出：Godot GDScript（对齐 _generate_godot_export）', () => {
  it('extends Resource + class_name + 有数据的桶才生成 var', () => {
    const gd = renderGodotGd(bucketize(RECORDS, TYPES))
    expect(gd.startsWith('# Godot GDScript - Auto Generated')).toBe(true)
    expect(gd).toContain('extends Resource')
    expect(gd).toContain('class_name GameData')
    expect(gd).toContain('var skills = []')
    expect(gd).toContain('var roles = []')
    expect(gd).not.toContain('var monsters = []')
  })

  it('数据块用 # 注释前缀（GDScript 注释符，与 C#/C++ 的 // 不同）', () => {
    const gd = renderGodotGd(bucketize(RECORDS, TYPES))
    expect(gd).toContain('# === 实际数据（JSON，键为 schema 的 pluralKey） ===')
    expect(gd).not.toContain('// ===')
  })
})

describe('引擎导出：Cocos2d JSON（对齐 export_file 的 cocos2d 分支）', () => {
  it('七个规范键恒存在（无数据时为空数组），且 schema 一致时与 旧版 同形', () => {
    const parsed = JSON.parse(renderCocosJson(bucketize(RECORDS, TYPES)))
    expect(Object.keys(parsed).slice(0, 7)).toEqual([
      'skills',
      'roles',
      'monsters',
      'equips',
      'items',
      'talents',
      'achievements'
    ])
    expect(parsed.skills).toEqual([{ name: '火球' }])
    expect(parsed.monsters).toEqual([])
  })

  it('额外桶**不静默丢弃**', () => {
    const parsed = JSON.parse(renderCocosJson(bucketize([...RECORDS, record('p1', 'pet', { name: '小鸡' })], TYPES)))
    expect(parsed.pets).toEqual([{ name: '小鸡' }])
  })

  it('产物是合法 JSON 且以换行结尾', () => {
    const text = renderCocosJson(bucketize(RECORDS, TYPES))
    expect(text.endsWith('\n')).toBe(true)
    expect(() => JSON.parse(text)).not.toThrow()
  })
})

describe('引擎导出：落盘（真实文件，验证扩展名与内容同时生效）', () => {
  it('四个新目标各写出自己的扩展名与内容', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'engine-export-'))
    const cases: [Parameters<typeof exportEngineData>[2]['engine'], string][] = [
      ['unity', 'using UnityEngine;'],
      ['unreal', '#pragma once'],
      ['godot', 'extends Resource'],
      ['cocos2d', '"skills"']
    ]
    for (const [engine, marker] of cases) {
      const result = await exportEngineData(RECORDS, TYPES, { engine, targetPath: join(dir, `GameData.${engine}`) })
      expect(result.engine).toBe(engine)
      expect(result.filePath.endsWith(ENGINE_EXTENSIONS[engine as keyof typeof ENGINE_EXTENSIONS])).toBe(true)
      const content = readFileSync(result.filePath, 'utf-8')
      expect(content).toContain(marker)
      expect(result.bytes).toBe(Buffer.byteLength(content, 'utf-8'))
    }
  })
})
