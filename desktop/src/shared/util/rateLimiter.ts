/**
 * 令牌桶限流器 —— 移植自 旧版 `src/common/rate_limiter`（86 行，保护 AI API 调用频率）。
 *
 * 旧版 侧的真实消费者：`common/ai_client` 用 `_acquire_rate_limit(bucket, timeout)`
 * 包住 5 处 LLM / stream 调用（:193 :254 :357 :435 :579），是生产里在跑的限流。
 *
 * 语义对齐要点（与 旧版 逐条核对）：
 * - 初始令牌 = `burst`（满桶起步），不是 0。
 * - **每次 `acquire` 先按经过时间补充令牌再判断**：`tokens = min(burst, tokens + elapsedSec * rate)`，
 *   并**更新** `lastRefill`。
 * - **`available` 是只读的**：旧版 的 `available` property 只算不改（`_tokens` / `_last_refill` 不写回）。
 *   这点很容易写错 —— 写成会改状态的话，反复读 `available` 就会"白嫖"令牌。已由单测锁死。
 * - `waitAndAcquire`：先判 deadline 再尝试取令牌。⇒ **timeout=0 时即使有令牌也返回 false**
 *   （旧版 `while now < deadline` 同样一次都不进循环）。已由单测锁死。
 * - 桶命名与默认值照抄：`llm(3,5)` / `stream(5,8)` / `web_search(1,3)` / `image_gen(0.5,2)`；
 *   未知桶名回落 `(1,3)`。
 *
 * ⚠️ **增量补桶的浮点敏感度（勿"顺手修正"）**：每次 `acquire` 只按「距上次补充的时间」
 * 做**增量累加**，不是从固定锚点重算。⇒ 十个 0.1 相加在 IEEE754 下是 0.9999… 而非 1.0，
 * 极端情况下会多等一个轮询周期。
 * 实测（`.venv` 探针）：`rate=1 / burst=1`、轮询 100ms 时，理论 1000ms 拿到的令牌，
 * 若补桶增量恰好恒为 0.1 则会走到 1100ms。**旧版 同样是增量补桶**（已用探针核过其算术），
 * 属**算法固有**而非 TS 侧偏差 —— 若把这里改成"就近取整"或"从锚点重算"，就会破坏匹平。
 * 故单测按**区间**断言（1000~1100ms），不硬钉精确值。
 *
 * 有意偏离（旧版 → TS，逐条写明）：
 * 1. **不引入锁**：旧版 用 `threading.Lock` 保护多线程；TS 主进程是单线程事件循环，无共享内存竞争。
 * 2. **`waitAndAcquire` 改为 async**：旧版 阻塞线程等待；TS **绝不能阻塞事件循环**（会整个应用卡住），
 *    故改为 `await` 休眠器让出。
 * 3. **不导出模块级单例**：旧版 `RateLimiter` 是 `__new__` 单例。按本项目 `gameStyle.ts` 的既定约定
 *    （便于测试与依赖注入），此处只导出类，实例由调用方持有 —— 接线时由 main 进程持有一个实例。
 * 4. **时钟与休眠器可注入**：旧版 直接用 `time.monotonic()`；此处允许注入，使限流可确定性单测。
 * 5. **放弃 旧版 的 `threading.Event` 提前唤醒**：旧版 靠 `event.set()` 唤醒等待者，此处改为
 *    固定间隔轮询（上限 100ms，与 旧版 `event.wait(min(remaining, 0.1))` 的 0.1s 上限一致）。
 *    正确性等价，只是唤醒没那么即时。
 */

/** 单调时钟（毫秒） */
export interface MonotonicClock {
  now(): number
}

/** 休眠器 —— `waitAndAcquire` 用它让出事件循环（旧版 是阻塞线程） */
export interface Sleeper {
  sleep(ms: number): Promise<void>
}

export interface TokenBucketOptions {
  /** 每秒补充的令牌数（默认 3） */
  rate?: number
  /** 桶容量，同时是初始令牌数（默认 5） */
  burst?: number
  /** 注入时钟（默认 `performance.now()`，不可用时回退 `Date.now()`） */
  clock?: MonotonicClock
}

export const DEFAULT_RATE = 3
export const DEFAULT_BURST = 5
/** 未知桶名的回落参数（对齐 旧版 `RateLimiter.acquire` / `get_bucket`） */
export const FALLBACK_RATE = 1
export const FALLBACK_BURST = 3
export const DEFAULT_TIMEOUT_MS = 30_000
/** 轮询间隔上限（对齐 旧版 `event.wait(min(remaining, 0.1))`） */
export const POLL_INTERVAL_MS = 100

/** 4 个内置桶的限流参数（照抄 旧版 `RateLimiter.__init__._buckets`） */
export const DEFAULT_BUCKET_LIMITS: Readonly<Record<string, { rate: number; burst: number }>> = {
  llm: { rate: 3, burst: 5 },
  stream: { rate: 5, burst: 8 },
  web_search: { rate: 1, burst: 3 },
  image_gen: { rate: 0.5, burst: 2 }
}

/** 默认时钟：`performance.now()`（Node / 浏览器均有，且单调），不可用时回退 `Date.now()` */
function defaultClock(): MonotonicClock {
  const perf = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance : null
  return perf !== null ? { now: () => perf.now() } : { now: () => Date.now() }
}

/** 默认休眠器：`setTimeout` */
function defaultSleeper(): Sleeper {
  return { sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) }
}

export class TokenBucket {
  private readonly rate: number
  private readonly burst: number
  private readonly clock: MonotonicClock
  private tokens: number
  private lastRefill: number

  constructor(options: TokenBucketOptions = {}) {
    this.rate = options.rate ?? DEFAULT_RATE
    this.burst = options.burst ?? DEFAULT_BURST
    this.clock = options.clock ?? defaultClock()
    this.tokens = this.burst
    this.lastRefill = this.clock.now()
  }

  /**
   * 非阻塞取令牌：先补桶，够则扣减返回 true，否则 false。
   * 与 旧版 `acquire` 一致（含 `tokens=0` 时恒 true 的行为）。
   */
  acquire(tokens = 1): boolean {
    const now = this.clock.now()
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.lastRefill) / 1000) * this.rate)
    this.lastRefill = now

    if (this.tokens >= tokens) {
      this.tokens -= tokens
      return true
    }
    return false
  }

  /**
   * 当前可用令牌数。**只读**：补桶结果仅用于返回，不写回内部状态
   * （对齐 旧版 `available` property —— 写回会导致反复读取白嫖令牌）。
   */
  available(): number {
    const now = this.clock.now()
    return Math.min(this.burst, this.tokens + ((now - this.lastRefill) / 1000) * this.rate)
  }

  /**
   * 异步等待并取令牌（旧版 为阻塞线程版）。
   *
   * ⚠️ 与 旧版 一致的边界：**`timeoutMs = 0` 时直接返回 false**，即使桶里有令牌
   * （旧版 `while now < deadline` 一次都不进循环）。
   *
   * @param tokens 需要的令牌数
   * @param timeoutMs 最长等待毫秒
   * @param sleeper 注入休眠器（测试用）
   */
  async waitAndAcquire(
    tokens = 1,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    sleeper: Sleeper = defaultSleeper()
  ): Promise<boolean> {
    const deadline = this.clock.now() + timeoutMs
    while (this.clock.now() < deadline) {
      if (this.acquire(tokens)) return true
      const remaining = deadline - this.clock.now()
      if (remaining <= 0) return false
      await sleeper.sleep(Math.min(remaining, POLL_INTERVAL_MS))
    }
    return false
  }
}

/** 多桶限流管理器（对齐 旧版 `RateLimiter`，但不做单例） */
export class RateLimiter {
  private readonly buckets = new Map<string, TokenBucket>()
  private readonly clock: MonotonicClock

  constructor(clock?: MonotonicClock) {
    this.clock = clock ?? defaultClock()
    for (const [name, limit] of Object.entries(DEFAULT_BUCKET_LIMITS)) {
      this.buckets.set(name, new TokenBucket({ ...limit, clock: this.clock }))
    }
  }

  /** 取桶；不存在则按回落参数 `(1, 3)` 新建（对齐 旧版 `get_bucket`） */
  getBucket(name: string): TokenBucket {
    const existing = this.buckets.get(name)
    if (existing !== undefined) return existing
    const created = new TokenBucket({ rate: FALLBACK_RATE, burst: FALLBACK_BURST, clock: this.clock })
    this.buckets.set(name, created)
    return created
  }

  /**
   * 取一次令牌（默认 1 个），等待上限 `timeoutMs`。
   * 与 旧版 `RateLimiter.acquire(bucket, timeout)` 一致：委托给 `waitAndAcquire(1.0, timeout)`。
   */
  async acquire(bucket = 'llm', timeoutMs = DEFAULT_TIMEOUT_MS, sleeper?: Sleeper): Promise<boolean> {
    const target = this.getBucket(bucket)
    return sleeper === undefined
      ? target.waitAndAcquire(1, timeoutMs)
      : target.waitAndAcquire(1, timeoutMs, sleeper)
  }
}

/**
 * 进程级共享限流器（单例）。
 *
 * 主进程是 Electron 单实例，但**存在多个 `LlmClient` 实例**（见 `main/llm/client.ts` 的注入点），
 * 若每个实例各持一个 `RateLimiter`，桶状态不互通 ⇒ 限流形同虚设。
 * 故在此收敛为进程级单例，所有调用方共享同一组令牌桶（llm / stream / web_search / image_gen）。
 * 注入式单测不要走本函数，直接 `new RateLimiter(clock)` 即可隔离。
 */
let sharedInstance: RateLimiter | null = null

export function sharedRateLimiter(): RateLimiter {
  if (sharedInstance === null) sharedInstance = new RateLimiter()
  return sharedInstance
}
