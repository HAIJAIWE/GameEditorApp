"""属性系统编辑器 - 集成所有组件（主题自适应）"""
import logging

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QSplitter,
    QVBoxLayout,
    QWidget,
)

from core.attr_system import AttributeSystem, AttrType
from ui.themes import theme_color
from ui.widgets.attr_library import AttrLibraryManager
from ui.widgets.equipment_preview import EquipmentPreviewWidget
from ui.widgets.live_preview import LivePreviewWidget
from ui.widgets.relation_matrix import RelationMatrixEditor


class AttrSystemEditor(QDialog):
    """
    属性系统编辑器主窗口
    
    整合三个核心面板：
    1. 属性库管理（左侧）
    2. 关系矩阵（中间上）
    3. 实时预览（中间下）
    """

    data_changed = pyqtSignal()

    def __init__(self, attr_system: AttributeSystem = None, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        self.attr_system = attr_system or AttributeSystem()
        self.setWindowTitle("属性系统编辑器")
        self.setMinimumSize(1000, 700)
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 顶部标题栏
        header = self._create_header()
        layout.addWidget(header)

        # 主分割器：左右布局
        main_splitter = QSplitter(Qt.Orientation.Horizontal)
        main_splitter.setObjectName("attrEditorMainSplitter")
        main_splitter.setHandleWidth(6)
        main_splitter.setStyleSheet(f"""
            QSplitter#attrEditorMainSplitter::handle {{
                background-color: {theme_color('hint')};
                border-radius: 3px;
            }}
            QSplitter#attrEditorMainSplitter::handle:hover {{
                background-color: {theme_color('secondary_fg')};
            }}
        """)

        # 左侧：属性库管理
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(0)

        left_title = QLabel("  属性库管理")
        left_title.setObjectName("attrEditorSectionTitle")
        left_layout.addWidget(left_title)

        self.library_manager = AttrLibraryManager(self.attr_system)
        self.library_manager.attr_list.itemSelectionChanged.connect(self._on_attr_selected)
        left_layout.addWidget(self.library_manager)

        left_widget.setMinimumWidth(220)
        left_widget.setMaximumWidth(350)
        main_splitter.addWidget(left_widget)

        # 右侧：关系矩阵 + 实时预览
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(0)

        # 右侧分割器：上下布局
        right_splitter = QSplitter(Qt.Orientation.Vertical)
        right_splitter.setObjectName("attrEditorRightSplitter")
        right_splitter.setStyleSheet(f"""
            QSplitter#attrEditorRightSplitter::handle {{
                background-color: {theme_color('hint')};
                border-radius: 3px;
            }}
            QSplitter#attrEditorRightSplitter::handle:hover {{
                background-color: {theme_color('secondary_fg')};
            }}
        """)

        # 关系矩阵
        matrix_container = QWidget()
        matrix_layout = QVBoxLayout(matrix_container)
        matrix_layout.setContentsMargins(0, 0, 0, 0)
        matrix_layout.setSpacing(0)

        matrix_title = QLabel("  关系矩阵")
        matrix_title.setObjectName("attrEditorSectionTitle")
        matrix_layout.addWidget(matrix_title)

        self.relation_matrix = RelationMatrixEditor(self.attr_system)
        matrix_layout.addWidget(self.relation_matrix)

        right_splitter.addWidget(matrix_container)

        # 实时预览
        preview_container = QWidget()
        preview_layout = QVBoxLayout(preview_container)
        preview_layout.setContentsMargins(0, 0, 0, 0)
        preview_layout.setSpacing(0)

        preview_title = QLabel("  实时预览")
        preview_title.setObjectName("attrEditorSectionTitle")
        preview_layout.addWidget(preview_title)

        self.live_preview = LivePreviewWidget(self.attr_system)
        preview_layout.addWidget(self.live_preview)

        right_splitter.addWidget(preview_container)
        right_splitter.setSizes([350, 300])

        right_layout.addWidget(right_splitter)
        main_splitter.addWidget(right_widget)

        main_splitter.setSizes([280, 720])
        layout.addWidget(main_splitter)

        # 底部按钮
        btn_layout = QHBoxLayout()
        btn_layout.setContentsMargins(10, 8, 10, 8)

        export_btn = QPushButton(" 导出JSON")
        export_btn.setObjectName("attrEditorExportBtn")
        export_btn.clicked.connect(self._on_export)
        btn_layout.addWidget(export_btn)

        game_export_btn = QPushButton(" 导出游戏配置")
        game_export_btn.setObjectName("attrEditorGameExportBtn")
        game_export_btn.clicked.connect(self._on_export_game_config)
        btn_layout.addWidget(game_export_btn)

        import_btn = QPushButton("📥 导入JSON")
        import_btn.setObjectName("attrEditorImportBtn")
        import_btn.clicked.connect(self._on_import)
        btn_layout.addWidget(import_btn)

        btn_layout.addStretch()

        cancel_btn = QPushButton("取消")
        cancel_btn.setObjectName("attrEditorCancelBtn")
        cancel_btn.clicked.connect(self.reject)
        btn_layout.addWidget(cancel_btn)

        ok_btn = QPushButton("✅ 确定")
        ok_btn.setObjectName("attrEditorOkBtn")
        ok_btn.clicked.connect(self.accept)
        btn_layout.addWidget(ok_btn)

        layout.addLayout(btn_layout)

    def _create_header(self) -> QFrame:
        """创建顶部标题栏"""
        frame = QFrame()
        frame.setObjectName("attrEditorHeader")
        layout = QHBoxLayout(frame)
        layout.setContentsMargins(12, 8, 12, 8)

        title = QLabel(" RPG 属性系统编辑器")
        title.setObjectName("attrEditorHeaderTitle")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        layout.addWidget(title)

        layout.addStretch()

        # 装备预览按钮
        equip_btn = QPushButton("🛡 装备预览")
        equip_btn.setObjectName("attrEditorEquipBtn")
        equip_btn.clicked.connect(self._open_equipment_preview)
        layout.addWidget(equip_btn)

        stats_label = QLabel(f"属性总数: {len(self.attr_system.attributes)} | 基础: {len(self.attr_system.base_attributes)} | 派生: {len(self.attr_system.derived_attributes)} | 战斗: {len(self.attr_system.combat_attributes)}")
        stats_label.setObjectName("attrEditorStatsLabel")
        layout.addWidget(stats_label)

        return frame

    def _connect_signals(self):
        """连接信号"""
        self.library_manager.attr_added.connect(self._on_attr_added)
        self.library_manager.attr_removed.connect(self._on_attr_removed)
        self.library_manager.attr_renamed.connect(self._on_attr_renamed)
        self.library_manager.attr_modified.connect(self._on_attr_modified)
        self.relation_matrix.relations_changed.connect(self._on_relations_changed)
        self.live_preview.preview_changed.connect(self._on_preview_changed)

    def _on_attr_selected(self):
        """属性选中时加载详情"""
        name = self.library_manager._get_selected_attr_name()
        if name:
            self.library_manager.load_detail(name)

    def _on_attr_added(self, name: str, attr_type: AttrType):
        """属性添加后刷新其他组件"""
        self.relation_matrix._refresh_matrix()
        self._update_header_stats()
        self.data_changed.emit()

    def _on_attr_removed(self, name: str):
        """属性删除后刷新其他组件"""
        self.relation_matrix._refresh_matrix()
        self._update_header_stats()
        self.data_changed.emit()

    def _on_attr_renamed(self, old_name: str, new_name: str):
        """属性重命名后刷新其他组件"""
        self.relation_matrix._refresh_matrix()
        self.data_changed.emit()

    def _on_attr_modified(self, name: str):
        """属性修改后刷新"""
        self.data_changed.emit()

    def _on_relations_changed(self):
        """关系变化后刷新预览"""
        self.live_preview._update_preview()
        self.data_changed.emit()

    def _on_preview_changed(self, results: dict):
        """预览数据变化"""
        pass  # 可以在此处添加额外逻辑

    def _update_header_stats(self):
        """更新顶部统计信息"""
        for child in self.findChildren(QLabel):
            if "属性总数" in child.text():
                child.setText(
                    f"属性总数: {len(self.attr_system.attributes)} | "
                    f"基础: {len(self.attr_system.base_attributes)} | "
                    f"派生: {len(self.attr_system.derived_attributes)} | "
                    f"战斗: {len(self.attr_system.combat_attributes)}"
                )
                break

    def _on_export(self):
        """导出为JSON"""
        from PyQt6.QtWidgets import QFileDialog
        file_path, _ = QFileDialog.getSaveFileName(
            self, "导出属性系统", "", "JSON Files (*.json)"
        )
        if file_path:
            import json
            data = self.attr_system.to_dict()
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            QMessageBox.information(self, "成功", f"已导出到:\n{file_path}")

    def _on_import(self):
        """从JSON导入"""
        from PyQt6.QtWidgets import QFileDialog
        file_path, _ = QFileDialog.getOpenFileName(
            self, "导入属性系统", "", "JSON Files (*.json)"
        )
        if file_path:
            import json
            with open(file_path, encoding='utf-8') as f:
                data = json.load(f)
            self.attr_system = AttributeSystem.from_dict(data)
            self._refresh_all()
            QMessageBox.information(self, "成功", "导入成功！")

    def _on_export_game_config(self):
        """导出游戏引擎可用的配置格式"""
        from PyQt6.QtWidgets import QFileDialog
        file_path, _ = QFileDialog.getSaveFileName(
            self, "导出游戏配置", "", "JSON Files (*.json)"
        )
        if file_path:
            import json
            game_config = self._build_game_config()
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(game_config, f, ensure_ascii=False, indent=2)
            QMessageBox.information(self, "成功", f"游戏配置已导出到:\n{file_path}")

    def _build_game_config(self) -> dict:
        """构建游戏引擎友好的配置格式"""
        base_attrs = []
        for name in self.attr_system.base_attributes:
            attr = self.attr_system.attributes[name]
            base_attrs.append({
                "name": name,
                "display_name": attr.display_name,
                "min": attr.min_value,
                "max": attr.max_value,
                "default": attr.default_value,
            })

        derived_formulas = {}
        for name in self.attr_system.derived_attributes + self.attr_system.combat_attributes:
            attr = self.attr_system.attributes.get(name)
            if not attr:
                continue

            formula_info = {}

            if hasattr(attr.formula, 'config'):
                config = attr.formula.config
                formula_info["type"] = config.formula_type.value
                formula_info["base"] = config.base_value
                formula_info["coefficients"] = {k: v for k, v in config.coefficients.items() if v != 0}

                if config.rate is not None:
                    formula_info["rate"] = config.rate
                if config.pieces is not None and config.formula_type.value == "piecewise":
                    formula_info["pieces"] = config.pieces
                if config.custom_expr is not None and config.formula_type.value == "custom":
                    formula_info["expression"] = config.custom_expr
            else:
                coeffs = {}
                for coeff_name, coeff_value in attr.formula.coefficients.items():
                    if coeff_value != 0:
                        coeffs[coeff_name] = coeff_value
                formula_info["type"] = "linear"
                formula_info["base"] = attr.formula.base_value
                formula_info["coefficients"] = coeffs

            formula_info["min"] = attr.min_value if attr.min_value is not None else None
            formula_info["max"] = attr.max_value if attr.max_value is not None else None

            derived_formulas[name] = formula_info

        try:
            calc_order = self.attr_system._topological_sort()
        except Exception:
            calc_order = []

        return {
            "version": "1.0",
            "base_attributes": base_attrs,
            "derived_formulas": derived_formulas,
            "calculation_order": calc_order,
            "attribute_constraints": {
                name: {
                    "min": attr.min_value if attr.min_value is not None else None,
                    "max": attr.max_value if attr.max_value is not None else None,
                }
                for name, attr in self.attr_system.attributes.items()
            }
        }

    def _refresh_all(self):
        """刷新所有组件"""
        self.library_manager._refresh_list()
        self.relation_matrix._refresh_matrix()
        self._update_header_stats()

    def _open_equipment_preview(self):
        """打开装备预览窗口"""
        import json
        from pathlib import Path

        from config.settings import get_config
        from ui.widgets.equipment_preview import DataItem

        dialog = QDialog(self)
        dialog.setWindowTitle("装备预览")
        dialog.setMinimumSize(900, 650)
        # 不再设置硬编码背景色，让主题QSS生效
        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(0, 0, 0, 0)

        equip_widget = EquipmentPreviewWidget(self.attr_system, dialog)
        equip_widget.set_base_values(self.live_preview._get_base_values())

        equips_data = None
        buffs_data = None

        try:
            config = get_config()
            lm = config.library_manager
            if lm.active_library:
                data_file = Path(lm.active_library.path) / "default.json"
                if data_file.exists():
                    with open(data_file, encoding='utf-8') as f:
                        library_data = json.load(f)
                    equips_data = library_data.get("equips", [])
                    buffs_data = library_data.get("buffs", [])
                    self.logger.info(f"从库「{lm.active_library_name}」加载了 {len(equips_data)} 件装备和 {len(buffs_data)} 个Buff")
                else:
                    self.logger.warning(f"库「{lm.active_library_name}」没有 default.json 文件")
            else:
                self.logger.warning("没有活跃库")
        except Exception as e:
            self.logger.warning(f"加载库装备/Buff数据失败: {e}")

        if equips_data:
            equip_widget.load_from_library(equips_data=equips_data, buffs_data=buffs_data)
        else:
            sample_items = [
                DataItem("wp_001", "精钢剑", "武器", bonuses={"力量": 8}, percentage_bonuses={"物攻": 15}, rarity="优秀", desc="一把精钢打造的利剑"),
                DataItem("wp_002", "魔法杖", "武器", bonuses={"智力": 12}, percentage_bonuses={"魔攻": 20}, rarity="稀有", desc="蕴含魔力的法杖"),
                DataItem("wp_003", "屠龙刀", "武器", bonuses={"力量": 25, "敏捷": 10}, percentage_bonuses={"暴击率": 10}, rarity="传说", desc="传说中的神兵"),
                DataItem("hm_001", "铁盔", "头盔", bonuses={"体质": 5}, rarity="普通", desc="普通的铁制头盔"),
                DataItem("hm_002", "智者之冠", "头盔", bonuses={"智力": 15}, percentage_bonuses={"MP": 20}, rarity="稀有", desc="智慧加冕"),
                DataItem("ch_001", "板甲", "胸甲", bonuses={"体质": 20, "敏捷": -3}, rarity="优秀", desc="坚固但笨重的铠甲"),
                DataItem("ch_002", "龙鳞甲", "胸甲", bonuses={"体质": 30, "力量": 10}, percentage_bonuses={"物防": 25}, rarity="史诗", desc="龙鳞编织的绝世铠甲"),
                DataItem("gl_001", "战斗手套", "手套", bonuses={"力量": 5, "敏捷": 5}, rarity="普通", desc="轻便的战斗手套"),
                DataItem("gl_002", "盗贼手套", "手套", bonuses={"敏捷": 15}, percentage_bonuses={"闪避率": 10}, rarity="稀有", desc="敏捷的化身"),
                DataItem("bt_001", "铁靴", "靴子", bonuses={"敏捷": 8, "速度": 5}, rarity="普通", desc="普通的铁制战靴"),
                DataItem("bt_002", "疾风靴", "靴子", bonuses={"敏捷": 20, "速度": 15}, percentage_bonuses={"闪避率": 5}, rarity="稀有", desc="疾风般的速度"),
                DataItem("ac_001", "生命护符", "饰品", bonuses={"体质": 15}, percentage_bonuses={"HP": 20}, rarity="优秀", desc="蕴含生命之力的护符"),
                DataItem("ac_002", "回春项链", "饰品", bonuses={"精神": 10}, percentage_bonuses={"回血/回合": 30}, rarity="稀有", desc="缓慢回复生命力"),
                DataItem("rg_001", "力量戒指", "戒指", bonuses={"力量": 10}, rarity="普通", desc="力量凝聚的戒指"),
                DataItem("rg_002", "暴击戒指", "戒指", bonuses={"敏捷": 8}, percentage_bonuses={"暴击率": 15, "暴击伤害": 20}, rarity="史诗", desc="致命一击的化身"),
            ]

            for item in sample_items:
                equip_widget.equip_list.add_item(item)

        if not buffs_data:
            sample_buffs = [
                DataItem("bf_001", "力量祝福", "增益", bonuses={"力量": 20}, rarity="普通", desc="暂时提升力量"),
                DataItem("bf_002", "智力光环", "光环", bonuses={"智力": 15}, percentage_bonuses={"MP": 10}, rarity="稀有", desc="提升智力的光环"),
                DataItem("bf_003", "虚弱诅咒", "减益", bonuses={"力量": -15, "敏捷": -10}, rarity="普通", desc="削弱力量的诅咒"),
                DataItem("bf_004", "暴击爆发", "增益", percentage_bonuses={"暴击率": 30, "暴击伤害": 50}, rarity="史诗", desc="大幅提升暴击"),
                DataItem("bf_005", "回复术", "增益", percentage_bonuses={"回血/回合": 50}, rarity="稀有", desc="持续回复生命值"),
                DataItem("bf_006", "减速术", "减益", percentage_bonuses={"速度": -30}, rarity="普通", desc="降低速度"),
            ]

            for buff in sample_buffs:
                equip_widget.buff_list.add_item(buff)

        layout.addWidget(equip_widget)

        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

    def get_attr_system(self) -> AttributeSystem:
        """获取当前属性系统"""
        return self.attr_system
