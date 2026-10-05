import { getTypeById } from '../../shared/typeSchema'
import type { DataTypeDef, ItemRecord } from '../../shared/types'

/**
 * 目标引擎（不含 `lua`——Lua 渲染器在 `./lua.ts`，本文件处理另外四个）。
 *
 * 背景：`features/engine_export.py` 的 PyQt 版有**四个各自独立**的导出器
 * （`export_to_unity/unreal/godot/cocos2d`），菜单里也是四个独立项
 * （`ui/menus.py:64-67`）。TS 侧原本 `EngineTarget` 只有 `'lua'`，
 * 四个菜单项**全都调同一个导出器、都吐 `.lua`** —— 菜单文案与实际产物不符。
 * 本文件把四个目标补齐为真导出器。
 */
export type EngineKind = 'unity' | 'unreal' | 'godot' | 'cocos2d'

/** 引擎 → 产物扩展名（PyQt `ui/dialogs/engine_export.py::export_file` 追加的后缀） */
export const ENGINE_EXTENSIONS: Record<EngineKind, string> = {
  unity: '.cs',
  unreal: '.h',
  godot: '.gd',
  cocos2d: '.json'
}

/** 引擎 → 用户可见名（用于对话框标题与提示） */
export const ENGINE_LABELS: Record<EngineKind, string> = {
  unity: 'Unity',
  unreal: 'Unreal',
  godot: 'Godot',
  cocos2d: 'Cocos2d'
}

/**
 * Cocos2d 导出的 7 个固定键（PyQt `export_file` 里 `data.get(...)` 逐个列的）。
 * 顺序即 Python dict 字面量顺序，保证同输入两次渲染结果完全相等（幂等）。
 */
const COCOS_KEYS = ['skills', 'roles', 'monsters', 'equips', 'items', 'talents', 'achievements'] as const

/** 代码模板里用到的 5 个桶（PyQt 三个导出器的 `if data.get(...)` 条件） */
const TEMPLATE_KEYS = ['skills', 'roles', 'monsters', 'equips', 'items'] as const

/**
 * 数据按 schema 的 `pluralKey` 归桶。
 *
 * 与 Python 的 `data_manager.data`（`dict[str, list[dict]]`，键是复数类型名）语义对齐；
 * `pluralKey` 缺失时回退 `record.type` 原文，**保证数据不丢**。
 */
export function bucketize(records: ItemRecord[], types: DataTypeDef[]): Map<string, Record<string, unknown>[]> {
  const buckets = new Map<string, Record<string, unknown>[]>()
  for (const record of records) {
    const key = getTypeById(types, record.type)?.pluralKey ?? record.type
    const bucket = buckets.get(key)
    const row = record.data as Record<string, unknown>
    if (bucket) {
      bucket.push(row)
    } else {
      buckets.set(key, [row])
    }
  }
  return buckets
}

/** 取某桶的数据行；不存在返回空数组（不返回 undefined，调用方不必判空） */
function rowsOf(buckets: Map<string, Record<string, unknown>[]>, key: string): Record<string, unknown>[] {
  return buckets.get(key) ?? []
}

/** 稳定 JSON（2 空格缩进、不转义非 ASCII —— 与 Python `json.dumps(..., ensure_ascii=False, indent=2)` 一致） */
function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/**
 * 实际数据块 —— 补 PyQt 的一处**实现与文案不符**。
 *
 * PyQt 三个代码模板导出的对话框里写着「将生成 .cs 代码模板 + 实际数据」
 * （`ui/dialogs/engine_export.py::_generate_unity_preview` 等），
 * 但 `_generate_unity_export` / `_generate_unreal_export` / `_generate_godot_export`
 * **只吐类/结构体声明，一行真实数据都没有**。按本项目「Python 缺陷在 TS 侧修正并记录」
 * 的规矩，这里在模板之后追加一段注释包裹的真实数据 JSON。
 */
function dataBlock(buckets: Map<string, Record<string, unknown>[]>, commentPrefix: string): string {
  const payload: Record<string, Record<string, unknown>[]> = {}
  for (const [key, rows] of [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    payload[key] = rows
  }
  if (Object.keys(payload).length === 0) return ''
  const body = toJson(payload)
  const commented = body
    .split('\n')
    .map((line) => `${commentPrefix} ${line}`)
    .join('\n')
  return `\n${commentPrefix} === 实际数据（JSON，键为 schema 的 pluralKey） ===\n${commented}\n`
}

/**
 * Unity C# 脚本（对齐 PyQt `_generate_unity_export`）。
 *
 * 与 PyQt 的两处**有意偏差**：
 * 1) PyQt 的 `RoleData.skills` 声明了 `public List<TalentRef> talents;` 却**从未定义 `TalentRef` 类**
 *    —— 生成的 .cs 编译不过。TS 侧补上定义。
 * 2) 追加「实际数据」块（见 `dataBlock` 的说明）。
 */
export function renderUnityCs(buckets: Map<string, Record<string, unknown>[]>): string {
  const parts: string[] = []
  parts.push('// Unity C# Script - Auto Generated\n')
  parts.push('using UnityEngine;\n')
  parts.push('using System.Collections.Generic;\n\n')
  parts.push('public class GameData : ScriptableObject\n')
  parts.push('{\n')
  const listFields: [string, string][] = [
    ['skills', 'SkillData'],
    ['roles', 'RoleData'],
    ['monsters', 'MonsterData'],
    ['equips', 'EquipData'],
    ['items', 'ItemData']
  ]
  for (const [key, dataClass] of listFields) {
    if (rowsOf(buckets, key).length > 0) {
      parts.push(`    public List<${dataClass}> ${key} = new List<${dataClass}>();\n`)
    }
  }
  parts.push('}\n\n')

  const classes = [
    'public class SkillData { public string id; public string name; public string type; public int damage; public float cooldown; }',
    'public class RoleData { public string id; public string name; public string className; public int hp; public int mp; public int attack; public int defense; public List<SkillRef> skills; public List<TalentRef> talents; }',
    'public class MonsterData { public string id; public string name; public int level; public int hp; public int attack; public int defense; public int exp; public List<SkillRef> skills; public List<DropData> equipDrops; public List<DropData> itemDrops; public List<GenericDrop> genericDrops; }',
    'public class SkillRef { public string name; public int level; }',
    // ↓ PyQt 漏了这个类（RoleData 引用了它），补上以保证生成的 .cs 能编译
    'public class TalentRef { public string name; public int level; }',
    'public class DropData { public string name; public int rate; public int countMin; public int countMax; }',
    'public class GenericDrop { public string type; public string name; public int rate; public int minVal; public int maxVal; }'
  ]
  for (const declaration of classes) {
    parts.push('[System.Serializable]\n')
    parts.push(`${declaration}\n\n`)
  }
  return parts.join('') + dataBlock(buckets, '//')
}

/** Unreal C++ 头文件（对齐 PyQt `_generate_unreal_export`，三个结构体恒定输出） */
export function renderUnrealHeader(buckets: Map<string, Record<string, unknown>[]>): string {
  const parts: string[] = []
  parts.push('// Unreal Engine C++ Header - Auto Generated\n')
  parts.push('#pragma once\n\n')
  parts.push('#include "CoreMinimal.h"\n\n')

  const struct = (name: string, fields: [string, string][]): string => {
    const body = fields
      .map(([type, field]) => `    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n    ${type} ${field};\n`)
      .join('\n')
    return `USTRUCT(BlueprintType)\nstruct ${name}\n{\n    GENERATED_BODY()\n\n${body}};\n\n`
  }

  parts.push(struct('FSkillData', [['FString', 'Id'], ['FString', 'Name'], ['int32', 'Damage = 0']]))
  parts.push(
    struct('FRoleData', [
      ['FString', 'Id'],
      ['FString', 'Name'],
      ['int32', 'MaxHP = 0'],
      ['int32', 'AttackPower = 0']
    ])
  )
  parts.push(
    struct('FMonsterData', [
      ['FString', 'Id'],
      ['FString', 'Name'],
      ['int32', 'Level = 1'],
      ['int32', 'MaxHP = 0']
    ])
  )
  return parts.join('').replace(/\n\n$/, '\n') + dataBlock(buckets, '//')
}

/** Godot GDScript 资源（对齐 PyQt `_generate_godot_export`：`extends Resource` + 按桶加 `var x = []`） */
export function renderGodotGd(buckets: Map<string, Record<string, unknown>[]>): string {
  const parts: string[] = []
  parts.push('# Godot GDScript - Auto Generated\n\n')
  parts.push('extends Resource\n\n')
  parts.push('class_name GameData\n\n')
  for (const key of TEMPLATE_KEYS) {
    if (rowsOf(buckets, key).length > 0) {
      parts.push(`var ${key} = []\n`)
    }
  }
  return parts.join('') + dataBlock(buckets, '#')
}

/**
 * Cocos2d JSON（对齐 PyQt `export_file` 的 cocos2d 分支）。
 *
 * 与 PyQt 的**有意偏差**：PyQt 只写死 7 个键，多出来的桶会被**静默丢弃**。
 * TS 的 schema 是用户可配的，可能有第 8、第 9 个类型；这里保留 7 个规范键在最前
 * （schema 与 Python 一致时产物与 PyQt **逐字节相同**），其余桶按名排序追加在后面，
 * **不丢数据**。
 */
export function renderCocosJson(buckets: Map<string, Record<string, unknown>[]>): string {
  const payload: Record<string, Record<string, unknown>[]> = {}
  for (const key of COCOS_KEYS) {
    payload[key] = rowsOf(buckets, key)
  }
  const extras = [...buckets.keys()].filter((key) => !(COCOS_KEYS as readonly string[]).includes(key)).sort()
  for (const key of extras) {
    payload[key] = rowsOf(buckets, key)
  }
  return `${toJson(payload)}\n`
}

/** 目标引擎 → 渲染器（`lua` 不在此表，由 `exporter.ts` 单独路由到 `renderLuaGameData`） */
export const ENGINE_RENDERERS: Record<
  EngineKind,
  (buckets: Map<string, Record<string, unknown>[]>) => string
> = {
  unity: renderUnityCs,
  unreal: renderUnrealHeader,
  godot: renderGodotGd,
  cocos2d: renderCocosJson
}
