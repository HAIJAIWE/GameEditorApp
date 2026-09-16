"""向量嵌入器 —— 字符级/词级 ngram + TF-IDF 加权（自 memory.py 拆出，逻辑未改动）"""
from __future__ import annotations

import hashlib
import math
from typing import Optional

from common.logger import get_logger

logger = get_logger()
class VectorEmbedder:
    """增强型向量嵌入器 — 字符级ngram + 词级ngram + TF-IDF加权

    相比纯哈希ngram方案，改进点：
    1. 字符级3-gram捕获中文子词语义（如"火球术"→"火球","球术"）
    2. 词级ngram保留词序信息
    3. TF-IDF加权：稀有词获得更高权重，提升区分度
    4. 维度从128提升到256，减少哈希碰撞
    """
    VECTOR_DIM = 256
    WORD_NGRAM_SIZES = (1, 2, 3)
    CHAR_NGRAM_SIZE = 3
    HASH_FUNCS = 3

    def __init__(self):
        self._cache: dict[str, list[float]] = {}
        # 文档频率统计（用于IDF加权）
        self._doc_freq: dict[str, int] = {}
        self._doc_count: int = 0

    def _update_idf(self, tokens: set):
        """更新文档频率统计"""
        self._doc_count += 1
        for token in tokens:
            self._doc_freq[token] = self._doc_freq.get(token, 0) + 1

    def _idf_weight(self, token: str) -> float:
        """计算IDF权重"""
        if self._doc_count == 0 or token not in self._doc_freq:
            return 1.0
        df = self._doc_freq[token]
        # 平滑IDF，避免除零和极端值
        return 1.0 + math.log((self._doc_count + 1) / (df + 1))

    def embed(self, text: str) -> list[float]:
        if not text:
            return [0.0] * self.VECTOR_DIM

        cache_key = hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()
        if cache_key in self._cache:
            return self._cache[cache_key]

        vec = [0.0] * self.VECTOR_DIM
        text_lower = text.lower()

        # 1. 词级ngram（保留词序）
        word_tokens = text_lower.split()
        unique_tokens = set(word_tokens)
        self._update_idf(unique_tokens)

        for n in self.WORD_NGRAM_SIZES:
            for i in range(len(word_tokens) - n + 1):
                ngram = " ".join(word_tokens[i:i+n])
                # IDF加权：稀有词组合获得更高权重
                weight = 1.0 / n
                if n == 1:
                    weight *= self._idf_weight(ngram)
                for h in range(self.HASH_FUNCS):
                    idx = self._hash_to_dim(f"w:{ngram}", h)
                    vec[idx] += weight

        # 2. 字符级ngram（捕获中文子词语义）
        for i in range(len(text_lower) - self.CHAR_NGRAM_SIZE + 1):
            char_ngram = text_lower[i:i + self.CHAR_NGRAM_SIZE]
            for h in range(self.HASH_FUNCS):
                idx = self._hash_to_dim(f"c:{char_ngram}", h)
                vec[idx] += 0.3  # 字符级权重较低，作为补充信号

        # 3. L2归一化
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]

        self._cache[cache_key] = vec
        if len(self._cache) > 5000:
            # LRU淘汰：清除最早的一半
            keys = list(self._cache.keys())
            for k in keys[:len(keys) // 2]:
                del self._cache[k]
        return vec

    def _hash_to_dim(self, text: str, seed: int) -> int:
        raw = hashlib.sha256(f"{seed}:{text}".encode()).digest()
        val = int.from_bytes(raw[:4], "big")
        return val % self.VECTOR_DIM

    @staticmethod
    def cosine_similarity(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b, strict=False))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)


_embedder: Optional[VectorEmbedder] = None


def get_embedder() -> VectorEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = VectorEmbedder()
    return _embedder
