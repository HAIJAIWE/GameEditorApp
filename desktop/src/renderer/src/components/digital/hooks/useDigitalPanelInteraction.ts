import { useState } from 'react'

import { isAnswerComplete, type DigitalPanelState } from '../../../../../shared/agent/ui'
import type { ConversationAction } from '../../../../../shared/agent/conversation'
import { toErrorMessage } from '../../../../../shared/util/system'
import type { ChatApi } from '../api/digitalPanelApi'

/**
 * 人机协作答复簇：确认破坏性动作 / 回答提问（含多问题逐题作答）。
 *
 * 三份草稿状态（单行回答、多问题文本、多问题点选）与「组装 + 提交」都在一起，
 * 提交后统一清空——它们在语义上是一次答复的三个入口，拆开只会让清空时机散落各处。
 */
export interface DigitalPanelInteraction {
  /** 单问题：自由文本回答 */
  answer: string
  setAnswer: (value: string) => void
  /** 多问题：自由文本作答（按下标对齐） */
  multiText: string[]
  setMultiText: React.Dispatch<React.SetStateAction<string[]>>
  /** 多问题：点选作答（按下标对齐；多选题为多个 label） */
  multiChoice: string[][]
  /** 多问题：按题组装后的答复（有选项的题取点选结果，其余取文本输入） */
  multiAnswers: string[]
  /** 多问题：每题都答完才可提交 */
  multiReady: boolean
  /** 交互答复（确认破坏性动作 / 回答提问，含多问题） */
  respond: (payload: { approved?: boolean; answer?: string; answers?: string[] }) => void
  /** 多问题：按题组装答复后一次性提交 */
  submitAnswers: () => void
  /** 点选/取消某题的一个候选 */
  toggleChoice: (index: number, label: string, multiSelect: boolean) => void
}

export function useDigitalPanelInteraction({
  interaction,
  dispatch,
  api,
  setLocalError
}: {
  /** 待答复的交互（`state.interaction`），无则为 null */
  interaction: DigitalPanelState['interaction']
  dispatch: (action: ConversationAction) => void
  api: ChatApi
  setLocalError: (message: string | null) => void
}): DigitalPanelInteraction {
  const [answer, setAnswer] = useState('')
  const [multiText, setMultiText] = useState<string[]>([])
  const [multiChoice, setMultiChoice] = useState<string[][]>([])

  const currentInteraction = interaction?.interaction ?? null
  const multiAnswers = (currentInteraction?.questions ?? []).map((question, index) =>
    question.options !== undefined && question.options.length > 0
      ? (multiChoice[index] ?? []).join('、')
      : (multiText[index] ?? '').trim()
  )
  const multiReady = currentInteraction !== null && isAnswerComplete(currentInteraction, multiAnswers)

  /** 交互答复（确认破坏性动作 / 回答提问，含多问题） */
  const respond = (payload: { approved?: boolean; answer?: string; answers?: string[] }): void => {
    const pending = interaction
    if (pending === null) return
    setAnswer('')
    setMultiText([])
    setMultiChoice([])
    dispatch({ kind: 'interaction' })
    void api.respondInteraction({ requestId: pending.requestId, ...payload }).catch((error: unknown) => {
      setLocalError(toErrorMessage(error))
    })
  }

  /** 多问题：按题组装答复（有选项的题取点选结果，其余取文本输入） */
  const submitAnswers = (): void => {
    const questions = interaction?.interaction.questions ?? []
    const answers = questions.map((question, index) =>
      question.options !== undefined && question.options.length > 0
        ? (multiChoice[index] ?? []).join('、')
        : (multiText[index] ?? '').trim()
    )
    respond({ answers })
  }

  /** 点选/取消某题的一个候选 */
  const toggleChoice = (index: number, label: string, multiSelect: boolean): void => {
    setMultiChoice((current) => {
      const next = [...current]
      const picked = next[index] ?? []
      if (!multiSelect) {
        next[index] = picked[0] === label ? [] : [label]
        return next
      }
      next[index] = picked.includes(label) ? picked.filter((item) => item !== label) : [...picked, label]
      return next
    })
  }

  return {
    answer,
    setAnswer,
    multiText,
    setMultiText,
    multiChoice,
    multiAnswers,
    multiReady,
    respond,
    submitAnswers,
    toggleChoice
  }
}
