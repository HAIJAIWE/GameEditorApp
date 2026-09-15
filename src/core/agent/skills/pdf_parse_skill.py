from __future__ import annotations

from pathlib import Path
import re
from typing import Any, Optional

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params

logger = get_logger()


class PdfParseSkill(BaseSkill):
    name = "system.pdf_parse"
    description = "PDF文档解析: 读取PDF文件并提取文本/表格/目录结构"
    version = "1.0.0"
    parameters = [
        {"name": "action", "required": True, "description": "parse/text/toc/metadata/layout"},
        {"name": "path", "required": True, "description": "PDF文件路径"},
        {"name": "pages", "required": False, "description": "页码范围 (如 1-5 或 1,3,5)"},
        {"name": "detail", "required": False, "description": "layout动作: 仅提取 'tables'/'headings'/'images'/'blocks'"},
    ]
    tags = ["pdf", "document", "parse", "text", "extract"]

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        self._logger = get_logger()
        action = params.get("action", "parse")
        path = params.get("path", "")
        pages = params.get("pages", "")
        detail = params.get("detail", "")

        if not path:
            return {"success": False, "error": "缺少 path", "message": ""}

        resolved = self._resolve_path(path)
        if not resolved or not resolved.exists():
            return {"success": False, "error": f"文件不存在: {path}", "message": ""}

        if not resolved.suffix.lower() == ".pdf":
            return {"success": False, "error": f"不是PDF文件: {path}", "message": ""}

        try:
            page_range = self._parse_page_range(pages) if pages else None
            if action == "parse" or action == "text":
                return self._parse_pdf(resolved, page_range)
            elif action == "toc":
                return self._extract_toc(resolved)
            elif action == "metadata":
                return self._extract_metadata(resolved)
            elif action == "layout":
                return self._parse_layout(resolved, page_range, detail)
            else:
                return {"success": False, "error": f"未知 action: {action}", "message": ""}
        except Exception as e:
            self._logger.error(f"PDF解析异常: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    def _resolve_path(self, raw: str) -> Path:
        p = Path(raw)
        if p.is_absolute():
            return p
        cwd = Path.cwd()
        candidates = [cwd / p, cwd / "data" / p, cwd / "assets" / p]
        for c in candidates:
            if c.exists():
                return c
        return cwd / p

    def _parse_page_range(self, pages: str) -> Optional[list]:
        numbers: set[int] = set()
        for part in pages.split(","):
            part = part.strip()
            if "-" in part:
                try:
                    start, end = part.split("-", 1)
                    numbers.update(range(int(start), int(end) + 1))
                except ValueError as e:
                    logger.debug(f"操作失败: {e}")
            else:
                try:
                    numbers.add(int(part))
                except ValueError as e:
                    logger.debug(f"操作失败: {e}")
        return sorted(numbers) if numbers else None

    def _parse_pdf(self, path: Path, page_range: list = None) -> dict:
        text = self._try_pymupdf(path, page_range)
        if text:
            return self._build_result(path, text)

        text = self._try_pypdf(path, page_range)
        if text:
            return self._build_result(path, text)

        text = self._try_pdfplumber(path, page_range)
        if text:
            return self._build_result(path, text)

        return {"success": False,
                "error": "未安装PDF解析库，请 pip install PyMuPDF 或 pypdf 或 pdfplumber",
                "message": ""}

    def _try_pymupdf(self, path: Path, page_range: list = None) -> str:
        try:
            import fitz
            doc = fitz.open(str(path))
            lines = [f"# {path.name}", f"共 {doc.page_count} 页", ""]
            pages_to_read = page_range or range(doc.page_count)
            for i in pages_to_read:
                if 0 <= i < doc.page_count:
                    page = doc[i]
                    page_text = page.get_text()
                    if page_text.strip():
                        lines.append(f"## 第 {i+1} 页")
                        lines.append(page_text.strip())
                        lines.append("")
            doc.close()
            return "\n".join(lines) if len(lines) > 3 else ""
        except ImportError:
            self._logger.info("PyMuPDF (fitz) 未安装")
        except Exception as e:
            self._logger.warning(f"PyMuPDF 读取失败: {e}")
        return ""

    def _try_pypdf(self, path: Path, page_range: list = None) -> str:
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            lines = [f"# {path.name}", f"共 {len(reader.pages)} 页", ""]
            pages_to_read = page_range or range(len(reader.pages))
            for i in pages_to_read:
                if 0 <= i < len(reader.pages):
                    page = reader.pages[i]
                    page_text = page.extract_text()
                    if page_text and page_text.strip():
                        lines.append(f"## 第 {i+1} 页")
                        lines.append(page_text.strip())
                        lines.append("")
            return "\n".join(lines) if len(lines) > 3 else ""
        except ImportError:
            self._logger.info("pypdf 未安装")
        except Exception as e:
            self._logger.warning(f"pypdf 读取失败: {e}")
        return ""

    def _try_pdfplumber(self, path: Path, page_range: list = None) -> str:
        try:
            import pdfplumber
            with pdfplumber.open(str(path)) as pdf:
                lines = [f"# {path.name}", f"共 {len(pdf.pages)} 页", ""]
                pages_to_read = page_range or range(len(pdf.pages))
                for i in pages_to_read:
                    if 0 <= i < len(pdf.pages):
                        page = pdf.pages[i]
                        page_text = page.extract_text()
                        if page_text and page_text.strip():
                            lines.append(f"## 第 {i+1} 页")
                            lines.append(page_text.strip())
                            lines.append("")
                return "\n".join(lines) if len(lines) > 3 else ""
        except ImportError:
            self._logger.info("pdfplumber 未安装")
        except Exception as e:
            self._logger.warning(f"pdfplumber 读取失败: {e}")
        return ""

    def _extract_toc(self, path: Path) -> dict:
        try:
            import fitz
            doc = fitz.open(str(path))
            toc = doc.get_toc()
            doc.close()
            if toc:
                lines = [f"# {path.name} 目录", ""]
                for level, title, page in toc:
                    indent = "  " * (level - 1)
                    lines.append(f"{indent}- {title} (第{page}页)")
                return {"success": True, "message": "\n".join(lines), "data": {"toc": toc}}
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        return {"success": False, "error": "无法提取目录，请安装 PyMuPDF", "message": ""}

    def _extract_metadata(self, path: Path) -> dict:
        meta: dict[str, Any] = {"文件名": path.name, "大小": f"{path.stat().st_size / 1024:.1f} KB"}
        try:
            import fitz
            doc = fitz.open(str(path))
            pdf_meta = doc.metadata
            if pdf_meta:
                meta.update({k: v for k, v in pdf_meta.items() if v})
            meta["页数"] = doc.page_count
            doc.close()
        except Exception:
            try:
                from pypdf import PdfReader
                reader = PdfReader(str(path))
                meta["页数"] = len(reader.pages)
                info = reader.metadata
                if info:
                    meta.update({k.strip("/"): str(v) for k, v in info.items() if v})
            except Exception as e:
                logger.warning(f"操作失败: {e}")

        lines = [f"# {path.name} 信息", ""]
        for k, v in meta.items():
            lines.append(f"- **{k}**: {v}")
        return {"success": True, "message": "\n".join(lines), "data": meta}

    def _build_result(self, path: Path, text: str) -> dict:
        lines = text.strip().split("\n")
        total_lines = len(lines)
        preview = text[:3000]
        word_count = len(re.findall(r'\w+', text))
        return {
            "success": True,
            "message": preview + (f"\n\n... (共 {total_lines} 行, {word_count} 词)" if len(text) > 3000 else ""),
            "data": {
                "file": str(path),
                "line_count": total_lines,
                "word_count": word_count,
                "full_text": text,
            }
        }

    def _parse_layout(self, path: Path, page_range: list = None, detail: str = "") -> dict:
        want_tables = not detail or detail == "tables"
        want_headings = not detail or detail == "headings"
        want_images = not detail or detail == "images"
        want_blocks = not detail or detail == "blocks"

        import importlib.util

        if importlib.util.find_spec("fitz"):
            try:
                return self._layout_with_pymupdf(path, page_range, want_tables, want_headings, want_images, want_blocks)
            except Exception as e:
                self._logger.warning(f"PyMuPDF 版面分析失败: {e}")
        else:
            self._logger.info("PyMuPDF (fitz) 未安装，尝试降级")

        if importlib.util.find_spec("pdfplumber"):
            try:
                return self._layout_with_pdfplumber(path, page_range, want_tables, want_headings, want_images, want_blocks)
            except Exception as e:
                self._logger.warning(f"pdfplumber 版面分析失败: {e}")
        else:
            self._logger.info("pdfplumber 未安装，尝试降级")

        if importlib.util.find_spec("pypdf"):
            try:
                return self._layout_with_pypdf(path, page_range)
            except Exception as e:
                self._logger.warning(f"pypdf 版面分析失败: {e}")
        else:
            self._logger.info("pypdf 未安装")

        return {"success": False,
                "error": "未安装PDF解析库，请 pip install PyMuPDF 或 pypdf 或 pdfplumber",
                "message": ""}

    def _layout_with_pymupdf(self, path, page_range, want_tables, want_headings, want_images, want_blocks):
        import fitz
        doc = fitz.open(str(path))
        total_pages = doc.page_count
        pages_to_scan = page_range if page_range else list(range(total_pages))

        tables = []
        headings = []
        images = []
        blocks = []

        for pi in pages_to_scan:
            if not (0 <= pi < total_pages):
                continue
            page = doc[pi]
            page_num = pi + 1

            if want_tables:
                try:
                    found_tables = page.find_tables()
                    if found_tables and found_tables.tables:
                        for tab in found_tables.tables:
                            header_row = tab.header.names if tab.header and tab.header.names else None
                            extracted = tab.extract()
                            if extracted:
                                rows = extracted[1:] if header_row else extracted
                                headers = header_row if header_row else (extracted[0] if rows else [])
                                if not header_row and rows:
                                    rows = rows[1:]
                                tables.append({
                                    "page": page_num,
                                    "headers": [str(c) if c is not None else "" for c in headers],
                                    "rows": [[str(c) if c is not None else "" for c in row] for row in rows],
                                    "row_count": len(rows),
                                })
                except Exception as e:
                    self._logger.debug(f"第{page_num}页表格提取失败: {e}")

            if want_headings:
                try:
                    text_dict = page.get_text("dict")
                    for block in text_dict.get("blocks", []):
                        if block.get("type") != 0:
                            continue
                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                font_size = round(span.get("size", 0), 1)
                                text = span.get("text", "").strip()
                                if not text:
                                    continue
                                if font_size > 18:
                                    level = "h1"
                                elif font_size >= 14:
                                    level = "h2"
                                elif font_size >= 10:
                                    level = "h3"
                                else:
                                    continue
                                headings.append({
                                    "page": page_num,
                                    "level": level,
                                    "text": text,
                                    "font_size": font_size,
                                })
                except Exception as e:
                    self._logger.debug(f"第{page_num}页标题提取失败: {e}")

            if want_images:
                try:
                    img_list = page.get_images(full=True)
                    for idx, img in enumerate(img_list):
                        bbox = list(img[:4]) if len(img) >= 4 else [0, 0, 0, 0]
                        images.append({
                            "page": page_num,
                            "index": idx,
                            "bbox": bbox,
                        })
                except Exception as e:
                    self._logger.debug(f"第{page_num}页图片提取失败: {e}")

            if want_blocks:
                try:
                    block_list = page.get_text("blocks")
                    block_list.sort(key=lambda b: b[1])
                    for blk in block_list:
                        blocks.append({
                            "page": page_num,
                            "bbox": list(blk[:4]),
                            "text": blk[4].strip() if len(blk) > 4 and blk[4] else "",
                            # 修复条件顺序：先检查长度，再取 blk[6]（否则 IndexError）
                            "block_type": ("image" if len(blk) > 6 and blk[6] == 1 else "text"),
                        })
                except Exception as e:
                    self._logger.debug(f"第{page_num}页块提取失败: {e}")

        doc.close()

        data: dict[str, Any] = {"pages": total_pages}
        if want_tables:
            data["tables"] = tables
        if want_headings:
            data["headings"] = headings
        if want_images:
            data["images"] = images
        if want_blocks:
            data["blocks"] = blocks

        h1_count = sum(1 for h in headings if h["level"] == "h1")
        h2_count = sum(1 for h in headings if h["level"] == "h2")
        h3_count = sum(1 for h in headings if h["level"] == "h3")
        summary_parts = [f"{total_pages}页"]
        if want_tables:
            summary_parts.append(f"{len(tables)}表")
        if want_images:
            summary_parts.append(f"{len(images)}图")
        if want_headings:
            summary_parts.append(f"标题层级: h1={h1_count}/h2={h2_count}/h3={h3_count}")

        message = f"版面分析完成: {', '.join(summary_parts)}"
        return {"success": True, "message": message, "data": data}

    def _layout_with_pdfplumber(self, path, page_range, want_tables, want_headings, want_images, want_blocks):
        import pdfplumber

        tables = []
        blocks = []
        total_pages = 0

        with pdfplumber.open(str(path)) as pdf:
            total_pages = len(pdf.pages)
            pages_to_scan = page_range if page_range else list(range(total_pages))

            for pi in pages_to_scan:
                if not (0 <= pi < total_pages):
                    continue
                page = pdf.pages[pi]
                page_num = pi + 1

                if want_tables:
                    try:
                        extracted_tables = page.extract_tables()
                        if extracted_tables:
                            for tab in extracted_tables:
                                if not tab:
                                    continue
                                headers = [str(c) if c is not None else "" for c in tab[0]]
                                rows = [[str(c) if c is not None else "" for c in row] for row in tab[1:]]
                                tables.append({
                                    "page": page_num,
                                    "headers": headers,
                                    "rows": rows,
                                    "row_count": len(rows),
                                })
                    except Exception as e:
                        self._logger.debug(f"第{page_num}页表格提取失败: {e}")

                if want_blocks:
                    try:
                        text = page.extract_text()
                        if text:
                            blocks.append({
                                "page": page_num,
                                "bbox": [0, 0, page.width, page.height],
                                "text": text.strip(),
                                "block_type": "text",
                            })
                    except Exception as e:
                        self._logger.debug(f"第{page_num}页文本提取失败: {e}")

        data: dict[str, Any] = {"pages": total_pages}
        if want_tables:
            data["tables"] = tables
        if want_headings:
            data["headings"] = []
        if want_images:
            data["images"] = []
        if want_blocks:
            data["blocks"] = blocks

        summary_parts = [f"{total_pages}页"]
        if want_tables:
            summary_parts.append(f"{len(tables)}表")
        if want_images:
            summary_parts.append("0图")
        message = f"版面分析完成(pdfplumber降级): {', '.join(summary_parts)}"
        return {"success": True, "message": message, "data": data}

    def _layout_with_pypdf(self, path, page_range):
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        total_pages = len(reader.pages)
        return {
            "success": True,
            "message": f"版面分析(pypdf降级): {total_pages}页, pypdf不支持版面信息提取，请安装PyMuPDF获取完整版式数据",
            "data": {
                "pages": total_pages,
                "tables": [],
                "headings": [],
                "images": [],
                "blocks": [],
            },
        }
