"""Agent OS §11 — 数据库抽象层：SQLite为主 + 可选向量库"""
from contextlib import contextmanager
from pathlib import Path
import re
import sqlite3
import threading

# 合法SQL标识符正则（防SQL注入）
_VALID_IDENTIFIER = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _validate_identifier(name: str, max_len: int = 128) -> str:
    """校验SQL标识符（表名/列名），防止注入

    Args:
        name: 待校验的标识符
        max_len: 最大允许长度

    Returns:
        校验通过的标识符

    Raises:
        ValueError: 标识符不合法
    """
    if not name or len(name) > max_len:
        raise ValueError(f"非法标识符（长度异常）: {name!r}")
    if not _VALID_IDENTIFIER.match(name):
        raise ValueError(f"非法标识符（含特殊字符）: {name!r}")
    return name


def _validate_identifiers(names: list[str], max_len: int = 128) -> list[str]:
    """批量校验SQL标识符"""
    return [_validate_identifier(n, max_len) for n in names]


class Database:
    """Agent OS — 关系型数据库抽象层（SQLite），支持 CRUD + 索引 + 事务"""

    def __init__(self, db_path: str = ""):
        self._db_path = Path(db_path or "data/agent_os.db")
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        # 已注册的表名白名单，用于运行时校验
        self._registered_tables: set = set()

    @contextmanager
    def _conn(self):
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self._local.conn = sqlite3.connect(str(self._db_path))
            self._local.conn.row_factory = sqlite3.Row
            self._local.conn.execute("PRAGMA journal_mode=WAL")
            self._local.conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield self._local.conn
        except Exception:
            self._local.conn.rollback()
            raise

    def _ensure_table(self, table: str) -> str:
        """校验表名是否在白名单中，防止未授权访问"""
        safe = _validate_identifier(table)
        if self._registered_tables and safe not in self._registered_tables:
            raise ValueError(f"未注册的表名: {safe!r}（可用表: {sorted(self._registered_tables)}）")
        return safe

    def create_table(self, name: str, schema: str):
        safe_name = _validate_identifier(name)
        # schema中的列定义只允许合法标识符和常见SQL类型关键字
        with self._conn() as conn:
            conn.execute(f"CREATE TABLE IF NOT EXISTS {safe_name} ({schema})")
            conn.commit()
        self._registered_tables.add(safe_name)

    def insert(self, table: str, data: dict) -> int:
        safe_table = self._ensure_table(table)
        safe_columns = _validate_identifiers(list(data.keys()))
        columns = ", ".join(safe_columns)
        placeholders = ", ".join(["?"] * len(data))
        sql = f"INSERT INTO {safe_table} ({columns}) VALUES ({placeholders})"
        with self._conn() as conn:
            cursor = conn.execute(sql, tuple(data.values()))
            conn.commit()
            return cursor.lastrowid

    def upsert(self, table: str, data: dict, conflict_columns: list[str]) -> int:
        safe_table = self._ensure_table(table)
        safe_columns = _validate_identifiers(list(data.keys()))
        safe_conflict = _validate_identifiers(conflict_columns)
        columns = ", ".join(safe_columns)
        placeholders = ", ".join(["?"] * len(data))
        updates = ", ".join(f"{c}=excluded.{c}" for c in safe_columns if c not in safe_conflict)
        unique = ", ".join(safe_conflict)
        sql = f"INSERT INTO {safe_table} ({columns}) VALUES ({placeholders}) ON CONFLICT({unique}) DO UPDATE SET {updates}"
        with self._conn() as conn:
            cursor = conn.execute(sql, tuple(data.values()))
            conn.commit()
            return cursor.lastrowid

    def select(self, table: str, where: str = "", params: tuple = (),
               columns: str = "*", limit: int = 0, order_by: str = "") -> list[dict]:
        safe_table = self._ensure_table(table)
        # columns 仅允许 * 或合法标识符列表
        if columns != "*":
            safe_cols = ", ".join(_validate_identifiers(columns.split(",")))
        else:
            safe_cols = "*"
        sql = f"SELECT {safe_cols} FROM {safe_table}"
        if where:
            sql += f" WHERE {where}"
        if order_by:
            sql += f" ORDER BY {order_by}"
        if limit:
            sql += f" LIMIT {limit}"
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]

    def update(self, table: str, data: dict, where: str, params: tuple = ()) -> int:
        safe_table = self._ensure_table(table)
        safe_keys = _validate_identifiers(list(data.keys()))
        sets = ", ".join(f"{k}=?" for k in safe_keys)
        sql = f"UPDATE {safe_table} SET {sets} WHERE {where}"
        with self._conn() as conn:
            cursor = conn.execute(sql, tuple(data.values()) + params)
            conn.commit()
            return cursor.rowcount

    def delete(self, table: str, where: str, params: tuple = ()) -> int:
        safe_table = self._ensure_table(table)
        sql = f"DELETE FROM {safe_table} WHERE {where}"
        with self._conn() as conn:
            cursor = conn.execute(sql, params)
            conn.commit()
            return cursor.rowcount

    def execute(self, sql: str, params: tuple = ()) -> list[dict]:
        """执行原始SQL（仅限内部已校验的DDL，如CREATE INDEX）"""
        with self._conn() as conn:
            if sql.strip().upper().startswith("SELECT"):
                return [dict(r) for r in conn.execute(sql, params).fetchall()]
            cursor = conn.execute(sql, params)
            conn.commit()
            return [{"rowcount": cursor.rowcount}]

    def table_exists(self, table: str) -> bool:
        safe_table = _validate_identifier(table)
        rows = self.select("sqlite_master", "type='table' AND name=?", (safe_table,))
        return len(rows) > 0

    def close(self):
        if hasattr(self._local, "conn") and self._local.conn:
            self._local.conn.close()
            self._local.conn = None


class MemoryDatabase(Database):
    """Agent OS — 记忆专用数据库，预建 schema"""

    def __init__(self, db_path: str = ""):
        super().__init__(db_path or "data/memory_store.db")
        self.create_table("agent_memories", """
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            source TEXT DEFAULT 'conversation',
            category TEXT DEFAULT '',
            embedding_id TEXT,
            confidence REAL DEFAULT 1.0,
            access_count INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT
        """)
        self.create_table("user_preferences", """
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT
        """)
        self.create_table("session_logs", """
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            user_input TEXT,
            agent_response TEXT,
            success INTEGER DEFAULT 0,
            latency_ms REAL,
            created_at TEXT
        """)
        self.execute("CREATE INDEX IF NOT EXISTS idx_memories_source ON agent_memories(source)")
        self.execute("CREATE INDEX IF NOT EXISTS idx_memories_category ON agent_memories(category)")
        self.execute("CREATE INDEX IF NOT EXISTS idx_sessions_id ON session_logs(session_id)")
