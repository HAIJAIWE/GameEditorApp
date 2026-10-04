"""从 Python 源码提取游戏术语表，生成 TS 数据文件。

用法（cwd = desktop/）：
    python scripts/extract_glossary.py

为什么用脚本而不是手抄：
    术语表有 143 条，手抄必然出错（本项目在 `sample_data.py` 上已有「AST 提取零丢失」的先例）。
    脚本化还让来源可追溯、可随 Python 侧更新重新生成。
"""

import ast
import json
import pathlib

SOURCE = pathlib.Path(__file__).resolve().parent.parent.parent / "src" / "ui" / "dialogs" / "type_editor_field_widget.py"
TARGET = pathlib.Path(__file__).resolve().parent.parent / "src" / "shared" / "glossaryTerms.ts"
CLASS_NAME = "FieldEditorWidget"
CONST_NAME = "GAME_TERMS_CN"


def load_terms() -> dict:
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == CLASS_NAME:
            for item in node.body:
                if (
                    isinstance(item, ast.Assign)
                    and isinstance(item.targets[0], ast.Name)
                    and item.targets[0].id == CONST_NAME
                ):
                    return ast.literal_eval(item.value)
    raise SystemExit(f"未找到 {CLASS_NAME}.{CONST_NAME}")


def render(terms: dict) -> str:
    lines = [
        "/**",
        " * 游戏术语表（中文术语 → 英文字段 ID 片段）。",
        " *",
        " * ⚠️ 本文件由脚本从 Python 源码 AST 提取生成，**请勿手改**。",
        " * 重新生成：`python scripts/extract_glossary.py`（cwd = desktop/）",
        f" * 来源：`{SOURCE.relative_to(SOURCE.parents[2])}::{CLASS_NAME}.{CONST_NAME}`",
        " */",
        "",
        "export const GAME_TERMS: Readonly<Record<string, string>> = {",
    ]
    for key, value in terms.items():
        lines.append(f"  {json.dumps(key, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False)},")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    terms = load_terms()
    TARGET.write_text(render(terms), encoding="utf-8")
    print(f"已生成 {TARGET}（{len(terms)} 条术语）")


if __name__ == "__main__":
    main()
