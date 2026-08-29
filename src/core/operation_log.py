"""操作日志 — 记录所有数据变更，支持按会话回滚

用法：
  1. 在 brain.process() 中设置会话 ID：
     set_conversation_id("conv_xxx")
  
  2. data_manager 自动记录每次增删改的 before/after 快照
  
  3. 按会话回滚：
     count, errors = OperationLog.rollback_conversation("conv_xxx", data_manager)
"""

from __future__ import annotations

from copy import deepcopy
import threading
import time
from typing import Optional

_conv_context = threading.local()


def set_conversation_id(conv_id: Optional[str]):
    """设置当前线程的会话 ID（brain.process 入口调用）"""
    _conv_context.conv_id = conv_id


def get_conversation_id() -> Optional[str]:
    """获取当前线程的会话 ID"""
    return getattr(_conv_context, "conv_id", None)


class OperationLog:
    """线程安全的操作日志 — 记录所有数据变更操作"""

    _operations: list[dict] = []
    _lock = threading.Lock()
    # 内存上限：避免长时间运行导致日志无限增长
    _MAX_OPERATIONS = 5000
    # 每次超过上限时清理的条目数（旧条目优先淘汰）
    _PURGE_BATCH = 500

    # ------------------------------------------------------------------
    # 写入
    # ------------------------------------------------------------------

    @classmethod
    def record(cls, op_type: str, data_type: str, item_id: str,
               item_name: str = "",
               before: Optional[dict] = None,
               after: Optional[dict] = None):
        """记录一次数据操作

        Args:
            op_type: 'create' | 'update' | 'delete'
            data_type: 数据类型名（如 roles, skills）
            item_id: 条目 ID
            item_name: 条目名称（便于日志展示）
            before: 操作前的数据快照（create 为 None）
            after: 操作后的数据快照（delete 为 None）
        """
        conv_id = get_conversation_id()
        if not conv_id:
            return  # 非对话上下文（如手动编辑）不记录

        with cls._lock:
            cls._operations.append({
                "op_type": op_type,
                "data_type": data_type,
                "item_id": str(item_id),
                "item_name": item_name or str(item_id),
                "before": deepcopy(before) if before is not None else None,
                "after": deepcopy(after) if after is not None else None,
                "conv_id": conv_id,
                "timestamp": time.time(),
            })
            # 上限清理：超过阈值时淘汰最旧的条目，避免内存泄漏
            if len(cls._operations) > cls._MAX_OPERATIONS:
                cls._operations = cls._operations[cls._PURGE_BATCH:]

    # ------------------------------------------------------------------
    # 查询
    # ------------------------------------------------------------------

    @classmethod
    def get_by_conversation(cls, conv_id: str) -> list[dict]:
        """获取指定会话的所有操作记录"""
        with cls._lock:
            return [op for op in cls._operations if op["conv_id"] == conv_id]

    @classmethod
    def get_all(cls) -> list[dict]:
        with cls._lock:
            return list(cls._operations)

    @classmethod
    def count(cls) -> int:
        with cls._lock:
            return len(cls._operations)

    @classmethod
    def count_by_conversation(cls, conv_id: str) -> int:
        with cls._lock:
            return sum(1 for op in cls._operations if op["conv_id"] == conv_id)

    # ------------------------------------------------------------------
    # 回滚
    # ------------------------------------------------------------------

    @classmethod
    def rollback_conversation(cls, conv_id: str, data_manager) -> tuple[int, list[str]]:
        """回滚指定会话的所有操作 — 反向执行，恢复数据到对话前的状态

        Args:
            conv_id: 会话 ID
            data_manager: OptimizedDataManager 实例

        Returns:
            (回滚条目数, 错误列表)
        """
        ops = cls.get_by_conversation(conv_id)
        if not ops:
            return 0, []

        count = 0
        errors: list[str] = []

        for op in reversed(ops):
            try:
                dt = op["data_type"]
                if op["op_type"] == "create":
                    data_manager.delete_item(dt, op["item_id"])
                elif op["op_type"] == "delete":
                    if op["before"] is not None:
                        data_manager.add_item(dt, op["before"])
                elif op["op_type"] == "update":
                    if op["before"] is not None:
                        data_manager.update_item(dt, op["item_id"], op["before"])
                count += 1
            except Exception as e:
                errors.append(f"{op['op_type']}「{op['item_name']}」: {e}")

        # 清除该会话的操作记录（避免重复回滚）
        with cls._lock:
            cls._operations = [op for op in cls._operations
                               if op["conv_id"] != conv_id]

        return count, errors

    @classmethod
    def clear(cls):
        """清空所有操作记录"""
        with cls._lock:
            cls._operations.clear()
