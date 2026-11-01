import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BUCKET_LIMITS,
  FALLBACK_BURST,
  FALLBACK_RATE,
  POLL_INTERVAL_MS,
  RateLimiter,
  TokenBucket,
  type MonotonicClock,
  type Sleeper
} from '@mobai/shared/util/system'

/**
 * 令牌桶限流器测试。
 *
 * 用**假时钟 + 假休眠器**做确定性断言：休眠器每次被调用就把时钟往前推，
 * 这样 `waitAndAcquire` 的轮询循环可预测、不依赖真实计时。
 *
 * 重点锁死两个**极易写错**的 旧版 语义（写错了不红、但行为悄悄变）：
 *  1. `available()` 只读、不改内部状态（写回会让反复读取白嫖令牌）；
 *  2. `waitAndAcquire` 先判 deadline 再取令牌 ⇒ `timeout=0` 时有令牌也返回 false。
 */

class FakeClock implements MonotonicClock {
  t = 0
  now(): number {
    return this.t
  }
  advance(ms: number): void {
    this.t += ms
  }
}

class FakeSleeper implements Sleeper {
  readonly calls: number[] = []
  constructor(private readonly clock: FakeClock) {}
  async sleep(ms: number): Promise<void> {
    this.calls.push(ms)
    this.clock.advance(ms)
  }
}

/** 建一组联动的假时钟 + 假休眠器 + 桶 */
function setup(options: { rate?: number; burst?: number } = {}) {
  const clock = new FakeClock()
  const sleeper = new FakeSleeper(clock)
  const bucket = new TokenBucket({ ...options, clock })
  return { clock, sleeper, bucket }
}

describe('令牌桶：基础语义', () => {
  it('初始令牌 = burst（满桶起步，不是 0）', () => {
    const { bucket } = setup({ rate: 1, burst: 5 })
    expect(bucket.available()).toBe(5)
  })

  it('acquire 逐个扣减，耗尽后返回 false', () => {
    const { bucket } = setup({ rate: 1, burst: 3 })
    expect(bucket.acquire()).toBe(true)
    expect(bucket.acquire()).toBe(true)
    expect(bucket.acquire()).toBe(true)
    expect(bucket.acquire()).toBe(false)
  })

  it('按经过时间补桶（rate=1 ⇒ 每秒补 1 个），上限为 burst', () => {
    const { clock, bucket } = setup({ rate: 1, burst: 5 })
    bucket.acquire(5) // 抽干
    expect(bucket.available()).toBe(0)

    clock.advance(2000)
    expect(bucket.available()).toBe(2)

    clock.advance(10_000) // 远超 burst
    expect(bucket.available()).toBe(5) // 封顶
  })

  it('🟢 available() 只读：反复读取不消耗令牌，也不推进 lastRefill', () => {
    const { clock, bucket } = setup({ rate: 1, burst: 5 })
    bucket.acquire(5) // tokens=0, lastRefill=0

    clock.advance(1000)
    expect(bucket.available()).toBe(1)

    // 若 available() 写回了 lastRefill（=1000），这里会算成 1；正确实现应仍是 2
    clock.advance(1000)
    expect(bucket.available()).toBe(2)

    // 且读取本身不消耗：连读三次值不变
    expect(bucket.available()).toBe(2)
    expect(bucket.available()).toBe(2)

    // 读完之后仍可正常取令牌（内部 tokens 未被动过）
    expect(bucket.acquire(2)).toBe(true)
    expect(bucket.acquire(1)).toBe(false)
  })

  it('tokens=0 的请求恒为 true', () => {
    const { bucket } = setup({ rate: 1, burst: 1 })
    bucket.acquire(1) // 抽干
    expect(bucket.acquire(0)).toBe(true)
  })
})

describe('令牌桶：waitAndAcquire', () => {
  it('令牌不足时轮询等待，补够后成功返回', async () => {
    const { clock, sleeper, bucket } = setup({ rate: 1, burst: 1 })
    bucket.acquire(1) // 抽干

    const ok = await bucket.waitAndAcquire(1, 2000, sleeper)

    expect(ok).toBe(true)
    // 每秒补 1 个、每次轮询 100ms ⇒ 理论上第 10 次（1000ms）拿到令牌。
    // ⚠️ 但增量补桶是浮点累加：本假时钟按整数 100ms 步进 ⇒ 每次补桶增量恒为 0.1，
    // 十个 0.1 相加是 0.9999… < 1，会多走一轮（实测 1100ms）。
    // 旧版 同为增量补桶（已用 .venv 探针核过），属算法固有 ⇒ 按区间断言，不硬钉 1000。
    expect(clock.t).toBeGreaterThanOrEqual(1000)
    expect(clock.t).toBeLessThanOrEqual(1100)
    expect(sleeper.calls.length).toBeGreaterThanOrEqual(10)
    // 每次休眠都不超过轮询上限，且最后一次可能只睡到"够用"
    expect(sleeper.calls.every((ms) => ms <= POLL_INTERVAL_MS)).toBe(true)
  })

  it('等待期间令牌一直不够 ⇒ 超时返回 false，且不超过 deadline', async () => {
    const { clock, sleeper, bucket } = setup({ rate: 1, burst: 1 })
    bucket.acquire(1) // 抽干

    const ok = await bucket.waitAndAcquire(1, 150, sleeper)

    expect(ok).toBe(false)
    expect(clock.t).toBe(150) // 停在 deadline，不多走
    // 最后一次只睡到 deadline（min(remaining, 100) = 50）
    expect(sleeper.calls).toEqual([100, 50])
  })

  it('🟢 timeout=0 时即使桶里有令牌也返回 false', async () => {
    const { sleeper, bucket } = setup({ rate: 1, burst: 5 })
    expect(bucket.available()).toBe(5) // 令牌充足

    const ok = await bucket.waitAndAcquire(1, 0, sleeper)

    expect(ok).toBe(false)
    expect(sleeper.calls).toHaveLength(0) // 一次都没等
  })

  it('令牌充足时立即返回 true，不进入等待', async () => {
    const { sleeper, bucket } = setup({ rate: 1, burst: 5 })
    const ok = await bucket.waitAndAcquire(1, 1000, sleeper)
    expect(ok).toBe(true)
    expect(sleeper.calls).toHaveLength(0)
  })
})

describe('RateLimiter 多桶管理器', () => {
  it('内置 4 个桶的参数与 旧版 一致', () => {
    expect(DEFAULT_BUCKET_LIMITS).toEqual({
      llm: { rate: 3, burst: 5 },
      stream: { rate: 5, burst: 8 },
      web_search: { rate: 1, burst: 3 },
      image_gen: { rate: 0.5, burst: 2 }
    })
  })

  it('llm 桶：burst=5 且 rate=3/s（抽干 5 个后 1 秒补回 3 个）', () => {
    const clock = new FakeClock()
    const limiter = new RateLimiter(clock)
    const bucket = limiter.getBucket('llm')

    for (let i = 0; i < 5; i += 1) expect(bucket.acquire()).toBe(true)
    expect(bucket.acquire()).toBe(false) // burst=5

    clock.advance(1000)
    expect(bucket.available()).toBe(3) // rate=3/s
  })

  it('未知桶名回落到 (1, 3)', () => {
    const clock = new FakeClock()
    const limiter = new RateLimiter(clock)
    const bucket = limiter.getBucket('nope')

    for (let i = 0; i < FALLBACK_BURST; i += 1) expect(bucket.acquire()).toBe(true)
    expect(bucket.acquire()).toBe(false)

    clock.advance(1000)
    expect(bucket.available()).toBe(FALLBACK_RATE)
  })

  it('getBucket 对同一名字返回同一个桶实例', () => {
    const limiter = new RateLimiter(new FakeClock())
    expect(limiter.getBucket('llm')).toBe(limiter.getBucket('llm'))
  })

  it('acquire 委托给桶的 waitAndAcquire(1, timeout)', async () => {
    const clock = new FakeClock()
    const sleeper = new FakeSleeper(clock)
    const limiter = new RateLimiter(clock)

    // 抽干 llm 桶后，等 200ms（不够补 1 个：rate=3 ⇒ 需 ~334ms）⇒ 应超时
    for (let i = 0; i < 5; i += 1) limiter.getBucket('llm').acquire()
    expect(await limiter.acquire('llm', 200, sleeper)).toBe(false)
  })

  it('acquire 默认桶为 llm，令牌充足时立即通过', async () => {
    const limiter = new RateLimiter(new FakeClock())
    expect(await limiter.acquire()).toBe(true)
  })
})
