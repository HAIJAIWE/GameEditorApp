import json
import logging
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

SUPPORTED_LOCALES = {
    "zh_CN": "简体中文",
    "en_US": "English (US)",
}

DEFAULT_LOCALE = "zh_CN"


class I18nManager:
    _instance: Optional[I18nManager] = None

    def __new__(cls) -> I18nManager:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._locale: str = DEFAULT_LOCALE
        self._translations: dict[str, dict[str, str]] = {}
        self._locale_dir: Optional[Path] = None
        self._load_builtin_translations()

    def configure(self, locale_dir: str) -> None:
        self._locale_dir = Path(locale_dir)
        self._locale_dir.mkdir(parents=True, exist_ok=True)

    def set_locale(self, locale: str) -> None:
        if locale in SUPPORTED_LOCALES:
            self._locale = locale
            self._load_translations_for_locale(locale)
            logger.info("语言切换: %s -> %s", locale, SUPPORTED_LOCALES.get(locale, locale))
        else:
            logger.warning("不支持的语言: %s, 可用: %s", locale, list(SUPPORTED_LOCALES.keys()))

    @property
    def locale(self) -> str:
        return self._locale

    @property
    def locale_name(self) -> str:
        return SUPPORTED_LOCALES.get(self._locale, self._locale)

    def t(self, key: str, default: Optional[str] = None, **kwargs: Any) -> str:
        translation = self._translations.get(self._locale, {}).get(key)
        if translation is None:
            translation = default or key
        if kwargs:
            translation = translation.format(**kwargs)
        return translation

    def __call__(self, key: str, default: Optional[str] = None, **kwargs: Any) -> str:
        return self.t(key, default, **kwargs)

    def register_translations(self, locale: str, translations: dict[str, str]) -> None:
        if locale not in self._translations:
            self._translations[locale] = {}
        self._translations[locale].update(translations)

    def get_available_locales(self) -> list[dict[str, str]]:
        return [
            {"code": code, "name": name}
            for code, name in SUPPORTED_LOCALES.items()
        ]

    def get_missing_keys(self) -> dict[str, list[str]]:
        all_keys: set = set()
        for translations in self._translations.values():
            all_keys.update(translations.keys())
        return {
            locale: sorted(all_keys - set(self._translations.get(locale, {}).keys()))
            for locale in SUPPORTED_LOCALES
        }

    def export_all(self, filepath: str) -> None:
        data = {
            "meta": {"supported_locales": list(SUPPORTED_LOCALES.keys())},
            "translations": {
                locale: {k: v for k, v in sorted(trans.items())}
                for locale, trans in sorted(self._translations.items())
            }
        }
        Path(filepath).write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        logger.info("翻译已导出: %s", filepath)

    def import_all(self, filepath: str) -> None:
        data = json.loads(Path(filepath).read_text(encoding="utf-8"))
        translations = data.get("translations", {})
        for locale, trans in translations.items():
            self.register_translations(locale, trans)
        logger.info("翻译已导入: %d 语言", len(translations))

    def _load_builtin_translations(self):
        self.register_translations("zh_CN", _BUILTIN_ZH_CN)
        self.register_translations("en_US", _BUILTIN_EN_US)

    def _load_translations_for_locale(self, locale: str):
        if not self._locale_dir:
            return
        filepath = self._locale_dir / f"{locale}.json"
        if filepath.exists():
            try:
                self.import_all(str(filepath))
            except Exception as e:
                logger.warning("加载翻译文件失败 %s: %s", locale, e)


def get_i18n() -> I18nManager:
    return I18nManager()


_BUILTIN_ZH_CN = {
    "app.title": "墨白可视化编辑",
    "app.subtitle": "专业游戏数据编辑与管理平台",
    "menu.file": "文件",
    "menu.edit": "编辑",
    "menu.view": "视图",
    "menu.tools": "工具",
    "menu.help": "帮助",
    "menu.file.new": "新建",
    "menu.file.open": "打开",
    "menu.file.save": "保存",
    "menu.file.save_as": "另存为",
    "menu.file.export": "导出",
    "menu.file.import": "导入",
    "menu.file.quit": "退出",
    "menu.edit.undo": "撤销",
    "menu.edit.redo": "重做",
    "menu.edit.cut": "剪切",
    "menu.edit.copy": "复制",
    "menu.edit.paste": "粘贴",
    "menu.edit.find": "查找",
    "menu.edit.replace": "替换",
    "menu.view.fullscreen": "全屏",
    "menu.view.toggle_theme": "切换主题",
    "menu.view.zoom_in": "放大",
    "menu.view.zoom_out": "缩小",
    "btn.ok": "确定",
    "btn.cancel": "取消",
    "btn.apply": "应用",
    "btn.reset": "重置",
    "btn.save": "保存",
    "btn.delete": "删除",
    "btn.duplicate": "复制",
    "btn.search": "搜索",
    "btn.export": "导出",
    "btn.import": "导入",
    "btn.refresh": "刷新",
    "tab.data": "数据",
    "tab.planning": "策划",
    "tab.ai_assistant": "AI助手",
    "tab.settings": "设置",
    "label.name": "名称",
    "label.type": "类型",
    "label.description": "描述",
    "label.id": "ID",
    "label.status": "状态",
    "label.created": "创建时间",
    "label.modified": "修改时间",
    "confirm.delete": "确认删除？",
    "confirm.unsaved": "有未保存的更改，是否保存？",
    "error.load_failed": "加载失败",
    "error.save_failed": "保存失败",
    "error.import_failed": "导入失败",
    "error.export_failed": "导出失败",
    "msg.saved": "已保存",
    "msg.imported": "导入完成: {count} 条",
    "msg.exported": "导出完成",
    "tooltip.add_item": "添加新条目",
    "tooltip.remove_item": "删除当前条目",
    "tooltip.search": "搜索数据",
    # ---- 主窗口 ----
    "app.welcome": "欢迎",
    "app.new_project": "新建项目",
    "app.open_project": "打开项目",
    "app.save": "保存",
    "app.save_as": "另存为",
    "app.export": "导出",
    "app.settings": "设置",
    "app.about": "关于",
    "app.exit": "退出",
    "app.current_library": "当前库:",
    "app.agent": "智能体",
    "app.open_file": "打开文件",
    "app.save_file": "保存文件",
    "app.export_game_data": "导出游戏数据",
    "app.unsaved_changes": "有未保存的更改",
    "app.auto_save": "自动保存",
    "app.about_full": "关于墨白编辑器",
    "app.create_failed": "创建失败",
    "app.failed": "失败",
    "app.shortcut_hint": "Ctrl+S保存 Ctrl+Z撤销 Ctrl+Y重做",
    # ---- 策划书 ----
    "ceshu.title": "策划书",
    "ceshu.new": "新建策划书",
    "ceshu.open": "打开策划书",
    "ceshu.delete": "删除策划书",
    "ceshu.export": "导出策划书",
    "ceshu.roadmap": "路线图",
    "ceshu.ai_generate": "AI 一句话生成",
    "ceshu.ai_fill": "AI 帮我填",
    "ceshu.recent": "最近打开",
    "ceshu.all": "全部策划书",
    "ceshu.template": "从模板创建...",
    "ceshu.blank": "空白开始",
    "ceshu.rename": "重命名策划书",
    "ceshu.select_template": "选择模板",
    "ceshu.confirm_delete": "确认删除",
    # ---- 数据 ----
    "data.title": "数据",
    "data.add": "添加",
    "data.edit": "编辑",
    "data.delete": "删除",
    "data.search": "搜索",
    "data.import": "导入",
    "data.export": "导出",
    "data.new": "新建",
    "data.copy": "复制",
    "data.save": "保存",
    "data.type_edit": "编辑类型",
    "data.reference_template": "参考模板",
    "data.reference_planning": "参考策划",
    "data.ai_generate": "AI生成",
    "data.reference": "关联",
    "data.unsaved_changes": "未保存的更改",
    "data.rename": "重命名",
    "data.batch_operation": "批量操作",
    "data.reference_preview": "关联预览",
    "data.relation_graph": "数据关系图",
    "data.select_planning": "选择策划方案",
    "data.select_reference_template": "选择参考模板",
    "data.template_type": "模板类型：",
    "data.select_template_label": "选择具体模板：",
    "data.confirm_select": "确认选择",
    "data.clear_template": "清除模板",
    "data.duplicate": "重复",
    # ---- 通用 ----
    "common.confirm": "确认",
    "common.cancel": "取消",
    "common.ok": "确定",
    "common.error": "错误",
    "common.warning": "警告",
    "common.info": "信息",
    "common.loading": "加载中...",
    "common.save_success": "保存成功",
    "common.save_failed": "保存失败",
    "common.delete_confirm": "确认删除？",
}

_BUILTIN_EN_US = {
    "app.title": "MB Visual Editor",
    "app.subtitle": "Professional Game Data Editor & Manager",
    "menu.file": "File",
    "menu.edit": "Edit",
    "menu.view": "View",
    "menu.tools": "Tools",
    "menu.help": "Help",
    "menu.file.new": "New",
    "menu.file.open": "Open",
    "menu.file.save": "Save",
    "menu.file.save_as": "Save As",
    "menu.file.export": "Export",
    "menu.file.import": "Import",
    "menu.file.quit": "Quit",
    "menu.edit.undo": "Undo",
    "menu.edit.redo": "Redo",
    "menu.edit.cut": "Cut",
    "menu.edit.copy": "Copy",
    "menu.edit.paste": "Paste",
    "menu.edit.find": "Find",
    "menu.edit.replace": "Replace",
    "menu.view.fullscreen": "Fullscreen",
    "menu.view.toggle_theme": "Toggle Theme",
    "menu.view.zoom_in": "Zoom In",
    "menu.view.zoom_out": "Zoom Out",
    "btn.ok": "OK",
    "btn.cancel": "Cancel",
    "btn.apply": "Apply",
    "btn.reset": "Reset",
    "btn.save": "Save",
    "btn.delete": "Delete",
    "btn.duplicate": "Duplicate",
    "btn.search": "Search",
    "btn.export": "Export",
    "btn.import": "Import",
    "btn.refresh": "Refresh",
    "tab.data": "Data",
    "tab.planning": "Planning",
    "tab.ai_assistant": "AI Assistant",
    "tab.settings": "Settings",
    "label.name": "Name",
    "label.type": "Type",
    "label.description": "Description",
    "label.id": "ID",
    "label.status": "Status",
    "label.created": "Created",
    "label.modified": "Modified",
    "confirm.delete": "Confirm deletion?",
    "confirm.unsaved": "Unsaved changes. Save now?",
    "error.load_failed": "Load failed",
    "error.save_failed": "Save failed",
    "error.import_failed": "Import failed",
    "error.export_failed": "Export failed",
    "msg.saved": "Saved",
    "msg.imported": "Imported: {count} items",
    "msg.exported": "Exported",
    "tooltip.add_item": "Add new item",
    "tooltip.remove_item": "Remove current item",
    "tooltip.search": "Search data",
    # ---- Main window ----
    "app.welcome": "Welcome",
    "app.new_project": "New Project",
    "app.open_project": "Open Project",
    "app.save": "Save",
    "app.save_as": "Save As",
    "app.export": "Export",
    "app.settings": "Settings",
    "app.about": "About",
    "app.exit": "Exit",
    "app.current_library": "Library:",
    "app.agent": "Agent",
    "app.open_file": "Open File",
    "app.save_file": "Save File",
    "app.export_game_data": "Export Game Data",
    "app.unsaved_changes": "Unsaved Changes",
    "app.auto_save": "Auto Save",
    "app.about_full": "About MB Editor",
    "app.create_failed": "Create Failed",
    "app.failed": "Failed",
    "app.shortcut_hint": "Ctrl+S Save  Ctrl+Z Undo  Ctrl+Y Redo",
    # ---- GDD ----
    "ceshu.title": "Game Design Document",
    "ceshu.new": "New GDD",
    "ceshu.open": "Open GDD",
    "ceshu.delete": "Delete GDD",
    "ceshu.export": "Export GDD",
    "ceshu.roadmap": "Roadmap",
    "ceshu.ai_generate": "AI Generate",
    "ceshu.ai_fill": "AI Fill",
    "ceshu.recent": "Recent",
    "ceshu.all": "All GDDs",
    "ceshu.template": "From Template...",
    "ceshu.blank": "Blank",
    "ceshu.rename": "Rename GDD",
    "ceshu.select_template": "Select Template",
    "ceshu.confirm_delete": "Confirm Delete",
    # ---- Data ----
    "data.title": "Data",
    "data.add": "Add",
    "data.edit": "Edit",
    "data.delete": "Delete",
    "data.search": "Search",
    "data.import": "Import",
    "data.export": "Export",
    "data.new": "New",
    "data.copy": "Copy",
    "data.save": "Save",
    "data.type_edit": "Edit Type",
    "data.reference_template": "Reference Template",
    "data.reference_planning": "Reference Planning",
    "data.ai_generate": "AI Generate",
    "data.reference": "Reference",
    "data.unsaved_changes": "Unsaved Changes",
    "data.rename": "Rename",
    "data.batch_operation": "Batch Operation",
    "data.reference_preview": "Reference Preview",
    "data.relation_graph": "Data Relation Graph",
    "data.select_planning": "Select Planning",
    "data.select_reference_template": "Select Reference Template",
    "data.template_type": "Template type:",
    "data.select_template_label": "Select template:",
    "data.confirm_select": "Confirm",
    "data.clear_template": "Clear Template",
    "data.duplicate": "Duplicate",
    # ---- Common ----
    "common.confirm": "Confirm",
    "common.cancel": "Cancel",
    "common.ok": "OK",
    "common.error": "Error",
    "common.warning": "Warning",
    "common.info": "Info",
    "common.loading": "Loading...",
    "common.save_success": "Saved successfully",
    "common.save_failed": "Save failed",
    "common.delete_confirm": "Confirm delete?",
}

