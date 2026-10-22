/**
 * 审阅队列「接受后光标落在哪」的纯逻辑（供 CeshuView 与单测共用）。
 *
 * ## 为什么要在写状态之前算
 * 接受一条会把该字段从待审列表里摘掉，`pendingReviewFields` 立刻变短。
 * 若等状态落盘后再按下标推算，拿到的已经是「新列表里的旧下标」，
 * 末尾几条会越界、中间几条会跳格。故先按**旧列表**算出目标下标，再写状态。
 */
export function cursorAfterAccept(currentIndex: number, remainingLength: number): number {
  // 负数 / NaN / Infinity 都是调用方传错的信号：回到队首，别让光标悬空
  if (!Number.isFinite(currentIndex) || !Number.isFinite(remainingLength)) return 0
  if (currentIndex < 0 || remainingLength <= 0) return 0
  /*
   * 列表变短后，原下标天然就是「下一条」；只有接受的是最后一条时原下标越界，
   * 夹到新的末位即可 —— 两者用同一句 clamp 表达。
   */
  const last = Math.max(0, Math.trunc(remainingLength) - 1)
  return Math.min(Math.trunc(currentIndex), last)
}
