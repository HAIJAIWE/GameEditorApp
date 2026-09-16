"""类型编辑器的 AI 辅助（字段建议 / 已有数据分析 / 模板导入 / 网络参考）

自 type_editor_dialog.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QDialog,
    QHBoxLayout,
    QInputDialog,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QTextBrowser,
    QTextEdit,
    QVBoxLayout,
)

from common.logger import get_logger
from config.constants import FIELD_TYPE_MAP
from core.type_schema import TypeField
from ui.dialogs.type_editor_dialog_state import TypeEditorDialogState

logger = get_logger()

FIELD_TYPES = FIELD_TYPE_MAP


class TypeEditorAIMixin(TypeEditorDialogState):
    """类型编辑器的 AI 辅助能力"""

    def ai_suggest_fields(self):
        """AI根据策划案推荐当前类型的字段"""
        if self._current_type_index < 0:
            QMessageBox.information(self, "提示", "请先选择一个数据类型")
            return
        t = self.schema.types[self._current_type_index]

        from config.settings import get_config
        config = get_config()
        planning_dir = config.active_planning_dir

        plan_context = ""
        if planning_dir and planning_dir.exists():
            docs_file = config.config_dir / "planning_docs_v3.json"
            if docs_file.exists():
                try:
                    import json as _j
                    with open(docs_file, encoding="utf-8") as _f:
                        docs_data = _j.load(_f)
                    if isinstance(docs_data, list) and docs_data:
                        doc = docs_data[0]
                        concept = doc.get("game_concept", "")[:500]
                        gameplay = doc.get("gameplay", "")[:400]
                        systems = doc.get("systems", "")[:300]
                        plan_context = f"【游戏理念】{concept}\n【核心玩法】{gameplay}\n【系统设计】{systems}"
                except Exception:
                    get_logger().exception("AI推荐字段加载失败")

        existing_fields_info = ""
        if t.form_fields:
            existing_fields_info = "\n当前已有字段：\n"
            for f in t.form_fields:
                existing_fields_info += f"  - {f.name} ({f.label}, {f.type})\n"

        prompt = f"""你是一位资深游戏数据架构师，专精于为各类游戏设计完整、专业的数据类型字段系统。

你的任务：为游戏中的「{t.name}」类型设计一套完整的字段定义。

{plan_context}

当前已有的字段（可能不完整）：
{existing_fields_info if existing_fields_info else "(无，新建类型)"}

请设计 8~18 个字段，必须包含以下类型组合来保证信息的完整性：
- 身份类(2~3个): id, name, (可选)alias/nickname
- 分类类(2~3个): type, category, sub_type, kind
- 品质类(1~2个): rarity, quality, level, tier, grade
- 数值类(2~5个): 根据游戏类型，定义核心属性的数值字段（如攻击/防御/生命/费用/速度/冷却等）
- 描述类(1~2个): desc, description, detail, lore, flavor_text
- 标签类(1个): tags, keywords, traits, attributes
- 视觉类(0~2个): image, icon, model, portrait (非必须但建议有)
- 扩展类(2~4个): 其他此类型专属的字段

输出严格的JSON数组格式（只输出JSON，不要额外解释）：
```json
[
  {{"name": "英文ID", "label": "中文显示名:", "type": "控件类型", "editable": true/false, "values": ["选项1","选项2"], "from_": 最小值, "to_": 最大值}},
  ...
]
```

字段类型可选：entry, combobox, spinbox, double_spin, tags, template, desc, content, achievement_desc, image, image_desc, image_tags, dialog

关键规则：
1. id字段必须放在第一位，type="entry", editable=false
2. 下拉选择(combobox)必须提供3个以上的values选项
3. 数值字段(spinbox/double_spin)必须提供合理的from_和to_
4. 字段label以中文冒号结尾，如"攻击力:"、"稀有度:"
5. 字段名用英文下划线，如"atk_power"、"rarity_level"
6. 核心数值字段要给实际游戏常用的范围，不要随便填0~9999
7. 所有字段都应该对此类型有实际用途，避免无意义字段
8. 字段按重要程度排序（ID→名称→分类→核心数值→品质→标签→描述→图片）"""

        from features.ai import show_ai_generate_dialog
        result = show_ai_generate_dialog(self, data_type="planning", initial_prompt=prompt)

        if result and 'desc' in result and result['desc']:
            import json
            import re
            json_match = re.search(r'\[[\s\S]*?\]', result['desc'])
            if not json_match:
                json_match = re.search(r'```json\s*(\[[\s\S]*?\])\s*```', result['desc'])
            if json_match:
                try:
                    new_fields_data = json.loads(json_match.group(1))
                    new_fields = []
                    for fd in new_fields_data:
                        new_fields.append(TypeField(
                            name=fd.get("name", ""),
                            label=fd.get("label", ""),
                            type=fd.get("type", "entry"),
                            editable=fd.get("editable", True),
                            values=fd.get("values"),
                            from_=fd.get("from_"),
                            to=fd.get("to"),
                        ))

                    confirm = QMessageBox.question(
                        self, "确认添加",
                        f"AI 推荐了 {len(new_fields)} 个字段。\n\n"
                        f"是否替换「{t.name}」的所有字段？\n\n"
                        f"(现有 {len(t.form_fields)} 个字段将被替换)",
                        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                        QMessageBox.StandardButton.No
                    )
                    if confirm == QMessageBox.StandardButton.Yes:
                        t.form_fields = new_fields
                        self.on_type_selected(self._current_type_index)
                        self._mark_dirty()
                        QMessageBox.information(self, "成功", f"已应用 {len(new_fields)} 个AI推荐的字段！")
                except (json.JSONDecodeError, KeyError):
                    QMessageBox.warning(self, "解析失败", "AI返回的字段格式有误，无法解析。")
    def analyze_existing_data(self):
        """分析库中已有数据，发现缺失或冗余的字段"""
        if self._current_type_index < 0:
            QMessageBox.information(self, "提示", "请先选择一个数据类型")
            return
        t = self.schema.types[self._current_type_index]
        plural_key = t.plural_key

        from config.settings import get_config
        config = get_config()
        dm = config.data_manager
        data_list = dm.data.get(plural_key, [])

        if not data_list:
            QMessageBox.information(self, "提示", f"当前库中「{t.name}」还没有任何数据。建议先用 AI 推荐字段或从模板导入。")
            return

        field_names_in_schema = [f.name for f in t.form_fields]
        field_names_in_data = set()
        field_usage_count = {}
        for item in data_list:
            for key in item.keys():
                if key not in ("id",):
                    field_names_in_data.add(key)
                    field_usage_count[key] = field_usage_count.get(key, 0) + 1
                    val = item.get(key, "")
                    if val is None or (isinstance(val, str) and not val.strip()) or val == 0:
                        pass

        missing_in_schema = [k for k in field_names_in_data if k not in field_names_in_schema]
        unused_in_schema = [f.name for f in t.form_fields if f.name not in field_names_in_data and f.name != "id"]

        report = f"📊 数据分析报告 — 「{t.name}」（共 {len(data_list)} 条数据）\n\n"
        report += f"Schema 定义字段数: {len(field_names_in_schema)}\n"
        report += f"数据实际使用字段: {len(field_names_in_data)}\n\n"

        if missing_in_schema:
            report += f"⚠️ 数据中有但 Schema 缺少的字段 ({len(missing_in_schema)} 个):\n"
            for k in missing_in_schema:
                count = field_usage_count.get(k, 0)
                pct = count / len(data_list) * 100
                report += f"  · {k} — {count}条使用 ({pct:.0f}%)\n"
            report += "\n💡 建议: 这些字段可能需要添加到 Schema 中\n\n"

        if unused_in_schema:
            report += f"📋 Schema 有但数据未使用的字段 ({len(unused_in_schema)} 个):\n"
            for k in unused_in_schema:
                report += f"  · {k}\n"
            report += "\n💡 建议: 考虑删除这些字段或检查是否有数据没填写\n\n"

        popular_fields = sorted(field_usage_count.items(), key=lambda x: -x[1])[:10]
        report += "🔥 使用率最高的字段:\n"
        for k, c in popular_fields:
            report += f"  · {k}: {c}/{len(data_list)} ({c/len(data_list)*100:.0f}%)\n"

        dialog = QDialog(self, Qt.WindowType.Dialog)
        dialog.setWindowTitle(f"数据分析 — {t.name}")
        dialog.setMinimumSize(500, 400)
        layout = QVBoxLayout(dialog)

        text_edit = QTextEdit()
        text_edit.setPlainText(report)
        text_edit.setReadOnly(True)
        layout.addWidget(text_edit)

        btn_layout = QHBoxLayout()
        add_missing_btn = QPushButton("+ 补充缺失字段到Schema")
        btn_layout.addWidget(add_missing_btn)
        btn_layout.addStretch()
        close_btn = QPushButton("关闭")
        btn_layout.addWidget(close_btn)
        layout.addLayout(btn_layout)

        def on_add_missing():
            for k in missing_in_schema:
                guess_type = "entry"
                all_numeric = True
                for item in data_list[:20]:
                    v = item.get(k)
                    if v is not None and not isinstance(v, (int, float)):
                        all_numeric = False
                        break
                if all_numeric and any(isinstance(item.get(k), (int, float)) for item in data_list[:10] if item.get(k) is not None):
                    guess_type = "spinbox"

                new_field = TypeField(
                    name=k.replace(" ", "_").lower(),
                    label=k,
                    type=guess_type,
                    editable=True,
                )
                t.form_fields.append(new_field)
            self.on_type_selected(self._current_type_index)
            self._mark_dirty()
            dialog.accept()

        add_missing_btn.clicked.connect(on_add_missing)
        close_btn.clicked.connect(dialog.reject)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()
    def import_from_template(self):
        """从预设游戏类型模板导入字段"""
        if self._current_type_index < 0:
            QMessageBox.information(self, "提示", "请先选择一个数据类型")
            return
        t = self.schema.types[self._current_type_index]

        items = [k for k in self.TYPE_TEMPLATES.keys() if k != "空白（手动创建）"]
        choice, ok = QInputDialog.getItem(self, "导入模板", f"为「{t.name}」选择字段模板：", items, 0, False)
        if not ok or not choice:
            return

        template_fields = self.TYPE_TEMPLATES[choice]
        confirm = QMessageBox.question(
            self, "确认导入",
            f"将用「{choice}」模板的 {len(template_fields)} 个字段\n"
            f"替换「{t.name}」当前的 {len(t.form_fields)} 个字段？\n\n"
            f"提示：你可以之后再手动调整或让AI优化。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if confirm == QMessageBox.StandardButton.Yes:
            t.form_fields = [
                TypeField(name=f.name, label=f.label, type=f.type, editable=f.editable,
                         values=f.values, from_=f.from_, to=f.to)
                for f in template_fields
            ]
            self.on_type_selected(self._current_type_index)
            self._mark_dirty()
            QMessageBox.information(self, "导入成功", f"已从「{choice}」模板导入 {len(template_fields)} 个字段！")
    def search_web_reference(self):
        """联网搜索同类游戏的字段设计参考"""
        if self._current_type_index < 0:
            QMessageBox.information(self, "提示", "请先选择一个数据类型")
            return
        t = self.schema.types[self._current_type_index]

        dialog = QDialog(self, Qt.WindowType.Dialog)
        dialog.setWindowTitle(f"联网搜索 — {t.name} 字段设计参考")
        dialog.setMinimumSize(600, 500)
        layout = QVBoxLayout(dialog)

        search_input = QLineEdit()
        search_input.setPlaceholderText(f"搜索关键词，如：「{t.name} 数据结构」「游戏{t.name}字段设计」...")
        layout.addWidget(search_input)

        result_browser = QTextBrowser()
        result_browser.setOpenExternalLinks(True)
        layout.addWidget(result_browser)

        def do_search():
            query = search_input.text().strip() or f"游戏 {t.name} 数据结构 字段设计"
            result_browser.append(f"<b>🔍 正在搜索: {query}</b>\n<br>")
            result_browser.append("⏳ 正在获取参考信息...<br>")

            try:
                from common.web_fetcher import WebFetcher
                fetcher = WebFetcher(timeout=15)

                urls_to_try = [
                    f"https://www.google.com/search?q={query.replace(' ', '+')}+game+data+structure",
                    f"https://zh.wikipedia.org/wiki/{query}",
                ]

                found_content = []
                for url in urls_to_try:
                    try:
                        content = fetcher.fetch(url)
                        if content and len(content) > 200:
                            preview = content[:800].replace("\n", "<br>")
                            found_content.append(f"<b>来源:</b> {url}<br><br>{preview}<br><hr><br>")
                    except Exception as e:
                        found_content.append(f"<i>{url}: 获取失败 - {e}</i><br><br>")

                if found_content:
                    result_browser.clear()
                    for fc in found_content:
                        result_browser.append(fc)
                else:
                    result_browser.append("<br>⚠️ 未找到足够的参考信息。<br><br>"
                                   "<b>建议：</b><br>"
                                   "· 尝试更具体的关键词<br>"
                                   "· 使用「AI推荐字段」功能<br>"
                                   "· 从预设模板导入后手动调整<br>")
            except ImportError:
                result_browser.append("<br>⚠️ 网络工具暂不可用。<br><br>"
                               "建议使用其他智能工具：<br>"
                               "· 🤖 AI推荐字段 — 根据策划案自动生成<br>"
                               "· 📋 导入模板 — 使用预设的专业模板<br>"
                               "· 📊 分析数据 — 基于已有数据推断字段<br>")

        search_btn = QPushButton("🔍 开始搜索")
        search_btn.clicked.connect(do_search)
        layout.addWidget(search_btn)

        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()
