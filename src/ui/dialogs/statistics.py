"""数据统计和分析对话框"""
from typing import Any

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from ui.themes import theme_color

logger = get_logger()


class StatisticsDialog(QDialog):
    """游戏数据统计对话框"""

    def __init__(self, main_window, parent=None):
        """初始化统计对话框
        
        Args:
            main_window: 主窗口实例
            parent: 父窗口
        """
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.main_window = main_window
        self.logger = get_logger()
        self.setup_ui()

    def setup_ui(self):
        """设置UI"""
        self.setWindowTitle("游戏数据统计")
        self.setMinimumSize(600, 400)

        layout = QVBoxLayout(self)

        self.text_edit = QTextEdit()
        self.text_edit.setReadOnly(True)
        layout.addWidget(self.text_edit)

        self._generate_statistics()

    def _generate_statistics(self):
        """生成统计数据"""
        data = self.main_window.data_manager.data
        stats: list[str] = []
        stats.append("游戏数据统计\n")
        stats.append("=" * 40 + "\n")

        type_names = {
            'skills': '技能',
            'roles': '角色',
            'monsters': '怪物',
            'equips': '装备',
            'items': '道具',
            'tasks': '任务',
            'dialogs': '对话',
            'achievements': '成就'
        }

        total = 0
        for key, name in type_names.items():
            count = len(data.get(key, []))
            total += count
            stats.append(f"{name}总数: {count}\n")

        stats.append("\n" + "=" * 40 + "\n")
        stats.append(f"总数据量: {total}\n")

        self.text_edit.setText("".join(stats))


class BalanceAnalysisDialog(QDialog):
    """平衡性分析对话框"""

    def __init__(self, main_window, parent=None):
        """初始化分析对话框
        
        Args:
            main_window: 主窗口实例
            parent: 父窗口
        """
        super().__init__(parent)
        self.main_window = main_window
        self.logger = get_logger()
        self.setup_ui()

    def setup_ui(self):
        """设置UI（包含数据和图表标签页）"""
        self.setWindowTitle("平衡性分析 & 数据可视化")
        self.setMinimumSize(1000, 700)

        main_layout = QVBoxLayout(self)

        # 控制栏
        control_layout = QHBoxLayout()
        control_layout.addWidget(QLabel("分析类型:"))

        self.analysis_type_combo = QComboBox()
        self.analysis_type_combo.addItems(["技能平衡性", "角色平衡性", "怪物难度", "数据概览"])
        control_layout.addWidget(self.analysis_type_combo)

        analyze_btn = QPushButton("开始分析")
        analyze_btn.clicked.connect(self._perform_analysis)
        control_layout.addWidget(analyze_btn)

        main_layout.addLayout(control_layout)

        # 标签页：数据和图表
        self.tab_widget = QTabWidget()

        # 数据标签页
        self.data_widget = QWidget()
        data_layout = QVBoxLayout(self.data_widget)
        self.result_text = QTextEdit()
        self.result_text.setReadOnly(True)
        data_layout.addWidget(self.result_text)
        self.tab_widget.addTab(self.data_widget, "📊 数据")

        # 图表标签页
        self.chart_widget = QWidget()
        chart_layout = QVBoxLayout(self.chart_widget)

        # 图表说明和占位内容
        self.chart_info = QLabel("数据可视化图表\n\n"
                                 "💡 提示：\n"
                                 "1. 选择分析类型后点击「开始分析」\n"
                                 "2. 数据可视化会显示在这个标签页中\n"
                                 "3. 支持的图表：柱状图、折线图、饼图等\n\n"
                                 "🎯 当前状态：等待数据...")
        self.chart_info.setStyleSheet(f"padding: 40px; color: {theme_color('hint')}; font-size: 14px;")
        self.chart_info.setAlignment(Qt.AlignmentFlag.AlignCenter)
        chart_layout.addWidget(self.chart_info)

        # 图片占位区域
        self.chart_label = QLabel("图表将显示在这里")
        self.chart_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.chart_label.setStyleSheet(f"background: {theme_color('input_bg')}; border: 2px dashed {theme_color('border')}; padding: 40px;")
        chart_layout.addWidget(self.chart_label)

        self.tab_widget.addTab(self.chart_widget, "📈 图表")

        main_layout.addWidget(self.tab_widget)

        # 立即执行一次分析
        self._perform_analysis()

    def _perform_analysis(self):
        """执行分析"""
        analysis_type = self.analysis_type_combo.currentText()
        data = self.main_window.data_manager.data
        result: list[str] = []

        try:
            if analysis_type == "技能平衡性":
                self._analyze_skills(data, result)
            elif analysis_type == "角色平衡性":
                self._analyze_roles(data, result)
            elif analysis_type == "怪物难度":
                self._analyze_monsters(data, result)
        except Exception as e:
            self.logger.error(f"分析失败: {e}", exc_info=True)
            result.append(f"分析过程中发生错误: {e}")

        self.result_text.setText("".join(result))

    def _analyze_skills(self, data: dict[str, Any], result: list[str]):
        """分析技能平衡性"""
        skills = data.get('skills', [])
        if not skills:
            result.append("没有技能数据")
            return

        values: list[float] = []
        for skill in skills:
            if 'value' in skill:
                try:
                    values.append(float(skill['value']))
                except (ValueError, TypeError) as e:
                    logger.debug(f"操作失败: {e}")

        if values:
            import statistics
            avg_value = statistics.mean(values)
            std_value = statistics.stdev(values) if len(values) > 1 else 0

            result.append("技能平衡性分析\n")
            result.append("=" * 40 + "\n")
            result.append(f"技能总数: {len(skills)}\n")
            result.append(f"平均数值: {avg_value:.2f}\n")
            result.append(f"标准差: {std_value:.2f}\n")
            result.append(f"数值范围: {min(values):.2f} - {max(values):.2f}\n")

            if std_value < avg_value * 0.3:
                result.append("\n平衡性评估: 良好\n")
                result.append("技能数值分布较为均匀，平衡性良好。")
            else:
                result.append("\n平衡性评估: 需要调整\n")
                result.append("技能数值差异较大，建议调整以提高平衡性。")
        else:
            result.append("没有有效的技能数值数据")

    def _analyze_roles(self, data: dict[str, Any], result: list[str]):
        """分析角色平衡性"""
        roles = data.get('roles', [])
        if not roles:
            result.append("没有角色数据")
            return

        import statistics
        hp_values: list[float] = []
        atk_values: list[float] = []
        def_values: list[float] = []

        for role in roles:
            if 'hp' in role:
                try:
                    hp_values.append(float(role['hp']))
                except (ValueError, TypeError) as e:
                    logger.debug(f"操作失败: {e}")
            if 'atk' in role:
                try:
                    atk_values.append(float(role['atk']))
                except (ValueError, TypeError) as e:
                    logger.debug(f"操作失败: {e}")
            if 'def' in role:
                try:
                    def_values.append(float(role['def']))
                except (ValueError, TypeError) as e:
                    logger.debug(f"操作失败: {e}")

        result.append("角色平衡性分析\n")
        result.append("=" * 40 + "\n")
        result.append(f"角色总数: {len(roles)}\n")

        if hp_values:
            avg_hp = statistics.mean(hp_values)
            result.append(f"平均生命值: {avg_hp:.2f}\n")
        if atk_values:
            avg_atk = statistics.mean(atk_values)
            result.append(f"平均攻击力: {avg_atk:.2f}\n")
        if def_values:
            avg_def = statistics.mean(def_values)
            result.append(f"平均防御力: {avg_def:.2f}\n")

    def _analyze_monsters(self, data: dict[str, Any], result: list[str]):
        """分析怪物难度"""
        monsters = data.get('monsters', [])
        if not monsters:
            result.append("没有怪物数据")
            return

        import statistics
        level_values: list[float] = []
        hp_values: list[float] = []
        atk_values: list[float] = []

        for monster in monsters:
            if 'level' in monster:
                try:
                    level_values.append(float(monster['level']))
                except (ValueError, TypeError) as e:
                    logger.debug(f"操作失败: {e}")
            if 'hp' in monster:
                try:
                    hp_values.append(float(monster['hp']))
                except (ValueError, TypeError) as e:
                    logger.debug(f"操作失败: {e}")
            if 'atk' in monster:
                try:
                    atk_values.append(float(monster['atk']))
                except (ValueError, TypeError) as e:
                    logger.debug(f"操作失败: {e}")

        result.append("怪物难度分析\n")
        result.append("=" * 40 + "\n")
        result.append(f"怪物总数: {len(monsters)}\n")

        if level_values:
            avg_level = statistics.mean(level_values)
            result.append(f"平均等级: {avg_level:.2f}\n")
        if hp_values:
            avg_hp = statistics.mean(hp_values)
            result.append(f"平均生命值: {avg_hp:.2f}\n")
        if atk_values:
            avg_atk = statistics.mean(atk_values)
            result.append(f"平均攻击力: {avg_atk:.2f}\n")

    def _analyze_overview(self, data: dict[str, Any], result: list[str]):
        """数据概览分析"""
        type_names = {
            'skills': '技能',
            'roles': '角色',
            'monsters': '怪物',
            'equips': '装备',
            'items': '道具',
            'tasks': '任务',
            'dialogs': '对话',
            'stories': '剧情',
            'achievements': '成就'
        }

        result.append("📊 完整数据概览\n")
        result.append("=" * 50 + "\n\n")

        total = 0
        counts = []

        for key, name in type_names.items():
            count = len(data.get(key, []))
            counts.append((name, count))
            total += count
            result.append(f"{name}: {count} 项\n")

        result.append("\n" + "=" * 50 + "\n")
        result.append(f"总数据量: {total} 项\n")

        # 数据分布分析
        result.append("\n📈 数据分布:\n")
        for name, count in counts:
            if count > 0:
                percentage = (count / total) * 100 if total > 0 else 0
                result.append(f"  {name}: {count} ({percentage:.1f}%)\n")

        # 更新图表标签页
        self._update_chart_overview(counts, total)

    def _update_chart_overview(self, counts: list[tuple], total: int):
        """更新数据概览图表显示
        
        Args:
            counts: 类型名和数量的list
            total: 总数据量
        """
        # 更新图表信息
        chart_text = "📊 数据可视化图表（占位）\n\n"
        chart_text += "当前已生成：数据概览信息\n\n"
        chart_text += "📊 数据饼图将显示各类型占比\n\n"

        # 添加ASCII艺术图表
        chart_text += "📈 数据概览（ASCII图表）\n"
        chart_text += "=" * 40 + "\n\n"

        max_count = max(count[1] for count in counts) if counts else 0

        for name, count in counts:
            if count > 0:
                # 生成柱状图
                bar_length = int((count / max_count) * 30) if max_count > 0 else 0
                bar = "█" * bar_length
                percentage = (count / total) * 100 if total > 0 else 0
                chart_text += f"{name:10s} | {bar} {count} ({percentage:.1f}%)\n"

        chart_text += "\n" + "=" * 40 + "\n\n"
        chart_text += "💡 提示：\n"
        chart_text += "如需完整的图表功能，可以安装matplotlib库！\n"
        chart_text += "或者使用导出的CSV在Excel中生成图表！"

        self.chart_info.setText(chart_text)
        self.chart_label.setText("📊 图表占位区域\n\n"
                                 "完整的图表生成需要matplotlib\n"
                                 "请使用导出功能在Excel中生成！")

    def _perform_analysis(self):
        """执行分析（重写以支持数据概览）"""
        analysis_type = self.analysis_type_combo.currentText()
        data = self.main_window.data_manager.data
        result: list[str] = []

        try:
            if analysis_type == "技能平衡性":
                self._analyze_skills(data, result)
            elif analysis_type == "角色平衡性":
                self._analyze_roles(data, result)
            elif analysis_type == "怪物难度":
                self._analyze_monsters(data, result)
            elif analysis_type == "数据概览":
                self._analyze_overview(data, result)
        except Exception as e:
            self.logger.error(f"分析失败: {e}", exc_info=True)
            result.append(f"分析过程中发生错误: {e}")

        self.result_text.setText("".join(result))
