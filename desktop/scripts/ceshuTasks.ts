/**
 * 岗位任务生成：离线跑通提示词与解析（不调模型，不烧 token）。
 *
 * 用法：
 *   npx tsx scripts/ceshuTasks.ts --doc <策划书.json>          # 打印摘要 + 提示词
 *   npx tsx scripts/ceshuTasks.ts --demo                        # 用内置示例文档
 *   npx tsx scripts/ceshuTasks.ts --doc <x.json> --apply <ai返回.json>
 *
 * 存在的意义：提示词是这一路的质量上限，改完要能**立刻看到**喂给模型的是什么，
 * 而不是点一次按钮花一次钱才知道。`--apply` 用真实 AI 返回验证解析（岗位/章/优先级校验）。
 */
import { readFileSync } from 'node:fs'

import { createDefaultCeshu, normalizeCeshu } from '../src/shared/ceshu/ceshuModel'
import {
  buildRoleTaskPrompt,
  buildTaskDigest,
  countTaskPlan,
  isEmptyTaskPlan,
  parseRoleTaskPlan,
  taskRolesForDoc
} from '../src/shared/ceshu/ceshuTaskPrompt'
import { renderRoleTasksMarkdown } from '../src/shared/ceshu/ceshuTasks'
import type { CeshuDocument } from '../src/shared/ceshu/ceshuConstants'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function loadDoc(): CeshuDocument {
  const path = arg('doc')
  if (path !== undefined) return normalizeCeshu(JSON.parse(readFileSync(path, 'utf-8')))

  // 内置示例：一份「立项阶段」写完的小项目，用来肉眼检查提示词形状
  const doc = createDefaultCeshu({ scope: 'lite', name: '示例：猫咪经营邮局' })
  doc.meta.game_type = '模拟经营'
  doc.meta.positioning = '在小镇开一家邮局，猫邮差按路线送信'
  doc.gameplay.core_loop = '接单→规划路线→派猫送信→收钱→升级邮局'
  doc.gameplay.core_loop_points = ['接单', '规划路线', '派猫送信', '收钱', '升级邮局']
  doc.numeric.numeric_parameters = ['派送耗时|分钟|按距离线性', '邮差体力|点|每次派送 -10']
  return doc
}

function main(): void {
  const doc = loadDoc()
  const roles = taskRolesForDoc(doc)

  const applyPath = arg('apply')
  if (applyPath !== undefined) {
    const plan = parseRoleTaskPlan(readFileSync(applyPath, 'utf-8'), doc)
    console.log(`解析结果：${countTaskPlan(plan)} 条${isEmptyTaskPlan(plan) ? '（空）' : ''}`)
    for (const [role, tasks] of Object.entries(plan)) {
      console.log(`\n## ${role}（${tasks?.length ?? 0} 条）`)
      for (const task of tasks ?? []) {
        console.log(`  [${task.priority}] ${task.title}（依据：${task.source}）`)
        if (task.detail !== '') console.log(`        ${task.detail}`)
      }
    }
    console.log('\n--- 落到 tasks/<岗位>.md 的样子（程序岗）---\n')
    console.log(renderRoleTasksMarkdown({ ...doc, task_plan: plan }, 'programmer'))
    return
  }

  const digest = buildTaskDigest(doc)
  const { system, prompt } = buildRoleTaskPrompt(doc, roles)

  console.log(`岗位：${roles.join(', ')}`)
  console.log(`摘要 ${digest.length} 字符 / 提示词 ${prompt.length} 字符（system ${system.length}）\n`)
  console.log('===== 摘要（模型看到的「项目确定了什么」）=====')
  console.log(digest)
  console.log('\n===== system =====')
  console.log(system)
  console.log('\n===== prompt =====')
  console.log(prompt)
}

main()
