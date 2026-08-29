from common.logger import get_logger

logger = get_logger()

import gzip
import io
import os
import re
import urllib.request


class Cedict:
    _instance = None

    def __init__(self):
        self._lookup = {}
        self._loaded = False

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _data_path(self):
        return os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'cedict.txt')

    def _download(self):
        url = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz'
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:  # nosec B310
                data = resp.read()
            with gzip.GzipFile(fileobj=io.BytesIO(data)) as f:
                content = f.read().decode('utf-8')
            os.makedirs(os.path.dirname(self._data_path()), exist_ok=True)
            with open(self._data_path(), 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception:
            return False

    def _load(self):
        if self._loaded:
            return
        self._loaded = True

        path = self._data_path()
        if not os.path.exists(path):
            if not self._download():
                return

        try:
            with open(path, encoding='utf-8') as f:
                for line in f:
                    if line.startswith('#') or not line.strip():
                        continue
                    match = re.match(r'^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+/(.+)/$', line)
                    if match:
                        simplified = match.group(2)
                        definitions = match.group(4).split('/')[0]
                        if simplified not in self._lookup:
                            self._lookup[simplified] = definitions
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def translate(self, chinese_word: str) -> str:
        self._load()
        return self._lookup.get(chinese_word, '')


def load_cedict():
    return Cedict.get()
