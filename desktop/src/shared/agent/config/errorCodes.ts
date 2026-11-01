/**
 * 技能错误码**单源**。
 *
 * 之前各技能各写各的字符串（`'EBADARG'` / `'ENOSERVER'`…），容易拼错、也不便统一处理。
 * 这里集中定义；技能一律用 `SKILL_ERRORS.X` 引用。**字符串值保持不变**——面板/测试里
 * 已有的比较不需要改。
 *
 * 命名约定：
 * - `E*` 前缀是**我们自己**的错误码；
 * - 与 Node errno 同名的（`ENOENT` / `ENOTDIR`）属于透传，不在此表。
 */

export const SKILL_ERRORS = {
  /** 参数缺失/非法 */
  BAD_ARG: 'EBADARG',
  /** 未知 action */
  BAD_ACTION: 'EBADACTION',
  /** 名称非法（含路径分隔符/非法字符） */
  BAD_NAME: 'EBADNAME',
  /** URL 非法 */
  BAD_URL: 'EBADURL',
  /** 协议不支持（非 http/https） */
  BAD_PROTOCOL: 'EBADPROTOCOL',
  /** 路径越界（围栏拒绝） */
  ESCAPE: 'EESCAPE',
  /** 未找到（文件/文档/会话/任务） */
  NOT_FOUND: 'ENOTFOUND',
  /** 目标是目录 */
  IS_DIR: 'EISDIR',
  /** 读取失败 */
  READ: 'EREAD',
  /** 写入失败 */
  WRITE: 'EWRITE',
  /** 解析失败（docx/pdf/xlsx…） */
  PARSE: 'EPARSE',
  /** 超出大小上限 */
  TOO_BIG: 'ETOOBIG',
  /** 未配置语言服务器 */
  NO_SERVER: 'ENOSERVER',
  /** LSP 调用失败 */
  LSP: 'ELSP',
  /** 不支持的格式/平台 */
  UNSUPPORTED: 'EUNSUPPORTED',
  /** HTTP 非 2xx */
  HTTP: 'EHTTP',
  /** 超时 */
  TIMEOUT: 'ETIMEDOUT',
  /** 抓取失败 */
  FETCH: 'EFETCH',
  /** 搜索失败 */
  SEARCH: 'ESEARCH',
  /** 浏览器操作失败 */
  BROWSER: 'EBROWSER',
  /** SSRF 防护拒绝（内网/本机地址） */
  BLOCKED: 'EBLOCKED',
  /** 子进程启动失败 */
  SPAWN: 'ESPAWN',
  /** 脚本执行失败 */
  SCRIPT: 'ESCRIPT',
  /** 无活动会话 */
  NO_SESSION: 'ENOSESSION',
  /** workflow 某步失败 */
  STEP_FAILED: 'ESTEPFAILED',
  /** 禁止嵌套 workflow */
  NESTED: 'ENESTED',
  /** 禁止嵌套 ptc */
  NESTED_PTC: 'E_NESTED',
  /** 文本出现多次（edit 歧义） */
  AMBIGUOUS: 'EAMBIGUOUS',
  /** 新增失败 */
  ADD: 'EADD',
  /** ptc 执行失败 */
  PTC: 'EPTC',
  /** ptc 工具调用次数超限 */
  TOO_MANY_CALLS: 'E_TOO_MANY_CALLS',
  /** 沙箱拒绝（read-only） */
  SANDBOX_DENIED: 'FS_SANDBOX_DENIED'
} as const

/** 所有技能错误码的联合类型 */
export type SkillErrorCode = (typeof SKILL_ERRORS)[keyof typeof SKILL_ERRORS]
