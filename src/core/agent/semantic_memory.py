from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from common.logger import get_logger

logger = get_logger()
from core.agent.memory import VectorEmbedder, get_embedder  # noqa: E402  # logger 前置初始化后再导入的既有模式


class SemanticMemory:
    """基于 ChromaDB 的语义向量记忆库

    纯 Python 依赖（chromadb 无 C++ 编译），存储记忆向量用于：
    - 语义相似检索（非关键词匹配）
    - 记忆聚类去重
    - 预热注入（启动时加载最相关记忆到上下文）
    """

    def __init__(self, data_dir: Path, embedder: Optional[VectorEmbedder] = None):
        self._data_dir = Path(data_dir)
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._embedder = embedder or get_embedder()
        self._logger = get_logger()
        # chromadb 为可选依赖：其泛型签名过严（且未安装时不存在），
        # 统一标注为 Any，保证有无 chromadb 两种环境下类型检查一致
        self._client: Any = None
        self._collection: Any = None
        self._ready = False
        try:
            import chromadb
            self._client = chromadb.PersistentClient(path=str(self._data_dir / "chroma"))
            self._collection = self._client.get_or_create_collection(
                name="agent_memories",
                metadata={"hnsw:space": "cosine"}
            )
            self._ready = True
        except ImportError:
            self._logger.debug("ChromaDB 未安装，语义记忆功能不可用")
        except Exception as e:
            self._logger.warning(f"ChromaDB 初始化失败: {e}")

    @property
    def ready(self) -> bool:
        return self._ready

    def add(self, doc_id: str, text: str, metadata: dict = None, source: str = "conversation"):
        """添加文档到语义记忆库

        Args:
            doc_id: 文档唯一标识符
            text: 文档文本内容
            metadata: 可选的元数据字典
            source: 文档来源标签 (如 "conversation", "file", "api")
        """
        if not self._ready:
            return
        collection = self._collection
        if collection is None:
            return
        vec = self._embedder.embed(text)
        meta = metadata or {}
        meta["_source"] = source
        meta["_text_preview"] = text[:200]
        try:
            collection.add(
                ids=[doc_id],
                embeddings=[vec],
                metadatas=[meta],
                documents=[text[:1000]],
            )
        except ValueError:
            collection.upsert(
                ids=[doc_id],
                embeddings=[vec],
                metadatas=[meta],
                documents=[text[:1000]],
            )
        except Exception as e:
            self._logger.debug(f"[Semantic] 添加文档失败: {e}")

    def search(
            self,
            query: str,
            top_k: int = 5,
            source_filter: str = None
    ) -> list[dict[str, str]]:
        """语义相似度搜索

        Args:
            query: 搜索查询文本
            top_k: 返回结果数量上限
            source_filter: 按来源标签过滤 (None 表示不过滤)

        Returns:
            返回匹配结果列表，每项包含 id / document / source
        """
        if not self._ready:
            return []
        collection = self._collection
        if collection is None:
            return []
        try:
            vec = self._embedder.embed(query)
            where = {"_source": source_filter} if source_filter else None
            results = collection.query(
                query_embeddings=[vec],
                n_results=min(top_k, self.count()),
                where=where,
            )
            return self._safe_extract_results(results)
        except (ValueError, KeyError, TypeError, AttributeError):
            self._logger.error("语义搜索异常", exc_info=True)
            return []

    def _safe_extract_results(self, results: dict) -> list[dict[str, str]]:
        try:
            ids = results.get("ids", [[]])
            docs = results.get("documents", [[]])
            metas = results.get("metadatas", [[]])
            dists = results.get("distances", [[]])
            id_list = ids[0] if ids and len(ids) > 0 else []
            doc_list = docs[0] if docs and len(docs) > 0 else []
            meta_list = metas[0] if metas and len(metas) > 0 else []
            dist_list = dists[0] if dists and len(dists) > 0 else []

            extracted = []
            for i in range(min(len(id_list), len(doc_list))):
                meta = meta_list[i] if i < len(meta_list) else {}
                source = meta.get("source", "") if isinstance(meta, dict) else ""
                dist = dist_list[i] if i < len(dist_list) else 0.0
                extracted.append({
                    "id": id_list[i],
                    "document": doc_list[i],
                    "source": source,
                    "similarity": round(1.0 - dist, 3) if dist else 1.0,
                })
            return extracted
        except (IndexError, TypeError):
            return []

    def deduplicate(self, text: str, threshold: float = 0.92) -> bool:
        """检查文本是否与已有记忆高度重复

        Args:
            text: 待检查的文本
            threshold: 相似度阈值 (0.0-1.0)，超过此值视为重复

        Returns:
            True 如果存在高度相似的已有记忆
        """
        if not self._ready:
            return False
        results = self.search(text, top_k=1)
        if results and float(results[0]["similarity"]) >= threshold:
            return True
        return False

    def cluster(self, query: str, top_k: int = 10) -> list[dict]:
        """基于语义相似度聚类检索相关记忆

        Args:
            query: 聚类中心查询文本
            top_k: 返回的最相关记忆数量

        Returns:
            按相似度排序的记忆列表
        """
        return self.search(query, top_k)

    def warmup_inject(self, context_keywords: list, max_chunks: int = 5) -> str:
        """启动预热：根据关键词注入最相关的记忆片段到上下文

        Args:
            context_keywords: 用于检索的关键词列表
            max_chunks: 最多注入的记忆片段数量

        Returns:
            格式化的预热记忆字符串，可直接拼接进 LLM 上下文
        """
        if not self._ready:
            return ""
        chunks = []
        seen = set()
        for kw in context_keywords:
            for item in self.search(kw, top_k=3):
                if item["id"] not in seen:
                    chunks.append(item["document"][:300])
                    seen.add(item["id"])
                    if len(chunks) >= max_chunks:
                        break
            if len(chunks) >= max_chunks:
                break
        if not chunks:
            return ""
        return "[预热记忆]\n" + "\n".join(f"- {c}" for c in chunks)

    def delete(self, doc_id: str):
        """从语义记忆库中删除指定文档

        Args:
            doc_id: 要删除的文档唯一标识符
        """
        if not self._ready:
            return
        collection = self._collection
        if collection is None:
            return
        try:
            collection.delete(ids=[doc_id])
        except KeyError as e:
            logger.debug(f"操作失败: {e}")
        except Exception as e:
            self._logger.debug(f"[Semantic] 删除文档失败: {e}")

    def count(self) -> int:
        """获取语义记忆库中的文档总数

        Returns:
            文档数量，若 ChromaDB 不可用则返回 0
        """
        if not self._ready:
            return 0
        if self._collection is None:
            return 0
        try:
            return self._collection.count()
        except AttributeError:
            return 0
        except Exception as e:
            self._logger.debug(f"[Semantic] 统计失败: {e}")
            return 0
