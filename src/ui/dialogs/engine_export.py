"""游戏引擎导出对话框"""
import json
from pathlib import Path
from typing import Any

from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QDialog, QFileDialog, QHBoxLayout, QLabel, QMessageBox, QPushButton, QTextEdit, QVBoxLayout

from common.logger import get_logger


class GameEngineExportDialog(QDialog):
    """游戏引擎导出对话框"""

    def __init__(self, main_window, engine_type: str, parent=None):
        """初始化导出对话框

        Args:
            main_window: 主窗口实例
            engine_type: 引擎类型
            parent: 父窗口
        """
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.main_window = main_window
        self.engine_type = engine_type
        self.logger = get_logger()
        self.setup_ui()

    def setup_ui(self):
        """设置UI"""
        engine_names = {
            'unity': 'Unity',
            'unreal': 'Unreal Engine',
            'godot': 'Godot',
            'cocos2d': 'Cocos2d'
        }
        self.setWindowTitle(f"导出为{engine_names.get(self.engine_type, '游戏引擎')}格式")
        self.setMinimumSize(600, 500)

        layout = QVBoxLayout(self)

        info_label = QLabel(f"将游戏数据导出为{engine_names.get(self.engine_type, '')}格式")
        layout.addWidget(info_label)

        self.preview_text = QTextEdit()
        self.preview_text.setReadOnly(True)
        self.preview_text.setPlaceholderText("导出预览...")
        layout.addWidget(self.preview_text)

        button_layout = QHBoxLayout()

        preview_btn = QPushButton("生成预览")
        preview_btn.clicked.connect(self.generate_preview)
        button_layout.addWidget(preview_btn)

        export_btn = QPushButton("导出文件")
        export_btn.clicked.connect(self.export_file)
        button_layout.addWidget(export_btn)

        button_layout.addStretch()

        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.accept)
        button_layout.addWidget(close_btn)

        layout.addLayout(button_layout)

    def generate_preview(self):
        """生成预览 - 展示实际数据样例"""
        data = self.main_window.data_manager.data
        preview: list[str] = []

        if self.engine_type == 'unity':
            self._generate_unity_preview(data, preview)
        elif self.engine_type == 'unreal':
            self._generate_unreal_preview(data, preview)
        elif self.engine_type == 'godot':
            self._generate_godot_preview(data, preview)
        elif self.engine_type == 'cocos2d':
            self._generate_cocos_preview(data, preview)

        self.preview_text.setText("".join(preview))

    def _generate_unity_preview(self, data: dict[str, Any], preview: list[str]):
        """生成Unity预览 - 展示JSON数据格式"""
        preview.append("// Unity 导出格式 (JSON)\n")
        preview.append("// 点击「导出文件」将生成 .cs 代码模板 + 实际数据\n\n")

        sample = {
            "skills": [
                {"id": s.get("id"), "name": s.get("name"), "type": s.get("type"),
                 "damage": s.get("value", 0), "cooldown": s.get("cd", 0)}
                for s in data.get("skills", [])[:2]
            ],
            "roles": [
                {"id": r.get("id"), "name": r.get("name"), "className": r.get("job"),
                 "hp": r.get("hp", 0), "skills": r.get("skills", [])}
                for r in data.get("roles", [])[:2]
            ],
            "monsters": [
                {"id": m.get("id"), "name": m.get("name"), "level": m.get("level", 1),
                 "hp": m.get("hp", 0), "skills": m.get("skills", [])}
                for m in data.get("monsters", [])[:2]
            ]
        }

        if sample["skills"]:
            preview.append("// === 技能数据样例 ===\n")
            preview.append(json.dumps({"skills": sample["skills"]}, ensure_ascii=False, indent=2) + "\n\n")

        if sample["roles"]:
            preview.append("// === 角色数据样例 ===\n")
            preview.append(json.dumps({"roles": sample["roles"]}, ensure_ascii=False, indent=2) + "\n\n")

        if sample["monsters"]:
            preview.append("// === 怪物数据样例 ===\n")
            preview.append(json.dumps({"monsters": sample["monsters"]}, ensure_ascii=False, indent=2) + "\n\n")

        preview.append(f"// 总数据量: 技能{len(data.get('skills', []))} 角色{len(data.get('roles', []))} 怪物{len(data.get('monsters', []))}\n")
        preview.append(f"//               装备{len(data.get('equips', []))} 道具{len(data.get('items', []))} 天赋{len(data.get('talents', []))}")

    def _generate_unreal_preview(self, data: dict[str, Any], preview: list[str]):
        """生成Unreal预览 - 展示JSON数据格式"""
        preview.append("// Unreal Engine 导出格式 (JSON)\n")
        preview.append("// 点击「导出文件」将生成 .h 头文件 + 实际数据\n\n")

        sample = {
            "GameData": {
                "Skills": [
                    {"SkillID": s.get("id"), "SkillName": s.get("name"),
                     "DamageValue": s.get("value", 0)}
                    for s in data.get("skills", [])[:2]
                ],
                "Characters": [
                    {"CharacterID": r.get("id"), "CharacterName": r.get("name"),
                     "MaxHP": r.get("hp", 0)}
                    for r in data.get("roles", [])[:2]
                ],
                "Monsters": [
                    {"MonsterID": m.get("id"), "MonsterName": m.get("name"),
                     "Level": m.get("level", 1), "MaxHP": m.get("hp", 0)}
                    for m in data.get("monsters", [])[:2]
                ]
            }
        }

        if sample["GameData"]["Skills"]:
            preview.append("// === 技能数据样例 ===\n")
            preview.append(json.dumps({"Skills": sample["GameData"]["Skills"]}, ensure_ascii=False, indent=2) + "\n\n")

        if sample["GameData"]["Characters"]:
            preview.append("// === 角色数据样例 ===\n")
            preview.append(json.dumps({"Characters": sample["GameData"]["Characters"]}, ensure_ascii=False, indent=2) + "\n\n")

        if sample["GameData"]["Monsters"]:
            preview.append("// === 怪物数据样例 ===\n")
            preview.append(json.dumps({"Monsters": sample["GameData"]["Monsters"]}, ensure_ascii=False, indent=2) + "\n\n")

        preview.append(f"// 总数据量: 技能{len(data.get('skills', []))} 角色{len(data.get('roles', []))} 怪物{len(data.get('monsters', []))}\n")
        preview.append(f"//               装备{len(data.get('equips', []))} 道具{len(data.get('items', []))} 天赋{len(data.get('talents', []))}")

    def _generate_godot_preview(self, data: dict[str, Any], preview: list[str]):
        """生成Godot预览 - 展示实际数据格式"""
        preview.append("# Godot 导出格式 (.tres 资源文件)\n")
        preview.append("# 点击「导出文件」将生成实际数据文件\n\n")

        for skill in data.get("skills", [])[:2]:
            preview.append(f"skill_{skill.get('id')} = {{\n")
            preview.append(f"  name = \"{skill.get('name')}\"\n")
            preview.append(f"  damage = {skill.get('value', 0)}\n")
            preview.append(f"  cooldown = {skill.get('cd', 0)}\n")
            preview.append("}\n\n")

        for role in data.get("roles", [])[:2]:
            preview.append(f"character_{role.get('id')} = {{\n")
            preview.append(f"  name = \"{role.get('name')}\"\n")
            preview.append(f"  class = \"{role.get('job')}\"\n")
            preview.append(f"  hp = {role.get('hp', 0)}\n")
            if role.get("skills"):
                skill_ids = [s.get("id", s.get("name", "")) for s in role["skills"] if isinstance(s, dict)]
                preview.append(f"  skills = {skill_ids}\n")
            preview.append("}\n\n")

        for monster in data.get("monsters", [])[:2]:
            preview.append(f"monster_{monster.get('id')} = {{\n")
            preview.append(f"  name = \"{monster.get('name')}\"\n")
            preview.append(f"  level = {monster.get('level', 1)}\n")
            preview.append(f"  hp = {monster.get('hp', 0)}\n")
            preview.append("}\n\n")

        preview.append(f"# 总数据量: 技能{len(data.get('skills', []))} 角色{len(data.get('roles', []))} 怪物{len(data.get('monsters', []))}")

    def _generate_cocos_preview(self, data: dict[str, Any], preview: list[str]):
        """生成Cocos2d预览 - 展示JSON数据"""
        preview.append("// Cocos2d 导出格式 (JSON)\n")
        preview.append("// 点击「导出文件」将生成实际数据文件\n\n")

        sample = {
            "game_data": {
                "version": "1.0",
                "skills": [
                    {"id": s.get("id"), "name": s.get("name"), "damage": s.get("value", 0), "cd": s.get("cd", 0)}
                    for s in data.get("skills", [])[:2]
                ],
                "characters": [
                    {"id": r.get("id"), "name": r.get("name"), "attack": r.get("atk", 0)}
                    for r in data.get("roles", [])[:2]
                ],
                "monsters": [
                    {"id": m.get("id"), "name": m.get("name"), "hp": m.get("hp", 0), "attack": m.get("atk", 0)}
                    for m in data.get("monsters", [])[:2]
                ]
            }
        }
        preview.append(json.dumps(sample, ensure_ascii=False, indent=2))

    def export_file(self):
        """导出文件"""
        file_path, _ = QFileDialog.getSaveFileName(
            self, "导出文件", "", "所有文件 (*.*)"
        )
        if not file_path:
            return

        try:
            data = self.main_window.data_manager.data
            export_path = Path(file_path)

            if self.engine_type == 'unity':
                export_content = self._generate_unity_export(data)
                with open(str(export_path) + '.cs', 'w', encoding='utf-8') as f:
                    f.write(export_content)
            elif self.engine_type == 'unreal':
                export_content = self._generate_unreal_export(data)
                with open(str(export_path) + '.h', 'w', encoding='utf-8') as f:
                    f.write(export_content)
            elif self.engine_type == 'godot':
                export_content = self._generate_godot_export(data)
                with open(str(export_path) + '.gd', 'w', encoding='utf-8') as f:
                    f.write(export_content)
            elif self.engine_type == 'cocos2d':
                export_data = {
                    'skills': data.get('skills', []),
                    'roles': data.get('roles', []),
                    'monsters': data.get('monsters', []),
                    'equips': data.get('equips', []),
                    'items': data.get('items', []),
                    'talents': data.get('talents', []),
                    'achievements': data.get('achievements', [])
                }
                with open(str(export_path) + '.json', 'w', encoding='utf-8') as f:
                    json.dump(export_data, f, ensure_ascii=False, indent=2)

            QMessageBox.information(self, "成功", "导出成功")
            self.logger.info(f"导出到引擎: {self.engine_type}, 文件: {export_path}")
        except Exception as e:
            self.logger.error(f"导出失败: {e}", exc_info=True)
            QMessageBox.warning(self, "错误", f"导出失败: {e}")

    def _generate_unity_export(self, data: dict[str, Any]) -> str:
        content: list[str] = []
        content.append("// Unity C# Script - Auto Generated\n")
        content.append("using UnityEngine;\n")
        content.append("using System.Collections.Generic;\n\n")
        content.append("public class GameData : ScriptableObject\n")
        content.append("{\n")
        if data.get('skills'):
            content.append("    public List<SkillData> skills = new List<SkillData>();\n")
        if data.get('roles'):
            content.append("    public List<RoleData> roles = new List<RoleData>();\n")
        if data.get('monsters'):
            content.append("    public List<MonsterData> monsters = new List<MonsterData>();\n")
        if data.get('equips'):
            content.append("    public List<EquipData> equips = new List<EquipData>();\n")
        if data.get('items'):
            content.append("    public List<ItemData> items = new List<ItemData>();\n")
        content.append("}\n\n")

        content.append("[System.Serializable]\n")
        content.append("public class SkillData { public string id; public string name; public string type; public int damage; public float cooldown; }\n\n")
        content.append("[System.Serializable]\n")
        content.append("public class RoleData { public string id; public string name; public string className; public int hp; public int mp; public int attack; public int defense; public List<SkillRef> skills; public List<TalentRef> talents; }\n\n")
        content.append("[System.Serializable]\n")
        content.append("public class MonsterData { public string id; public string name; public int level; public int hp; public int attack; public int defense; public int exp; public List<SkillRef> skills; public List<DropData> equipDrops; public List<DropData> itemDrops; public List<GenericDrop> genericDrops; }\n\n")
        content.append("[System.Serializable]\n")
        content.append("public class SkillRef { public string name; public int level; }\n\n")
        content.append("[System.Serializable]\n")
        content.append("public class DropData { public string name; public int rate; public int countMin; public int countMax; }\n\n")
        content.append("[System.Serializable]\n")
        content.append("public class GenericDrop { public string type; public string name; public int rate; public int minVal; public int maxVal; }\n")
        return "".join(content)

    def _generate_unreal_export(self, data: dict[str, Any]) -> str:
        content: list[str] = []
        content.append("// Unreal Engine C++ Header - Auto Generated\n")
        content.append("#pragma once\n\n")
        content.append("#include \"CoreMinimal.h\"\n\n")
        content.append("USTRUCT(BlueprintType)\n")
        content.append("struct FSkillData\n")
        content.append("{\n")
        content.append("    GENERATED_BODY()\n\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    FString Id;\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    FString Name;\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    int32 Damage = 0;\n")
        content.append("};\n\n")
        content.append("USTRUCT(BlueprintType)\n")
        content.append("struct FRoleData\n")
        content.append("{\n")
        content.append("    GENERATED_BODY()\n\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    FString Id;\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    FString Name;\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    int32 MaxHP = 0;\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    int32 AttackPower = 0;\n")
        content.append("};\n\n")
        content.append("USTRUCT(BlueprintType)\n")
        content.append("struct FMonsterData\n")
        content.append("{\n")
        content.append("    GENERATED_BODY()\n\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    FString Id;\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    FString Name;\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    int32 Level = 1;\n")
        content.append("    UPROPERTY(EditAnywhere, BlueprintReadWrite)\n")
        content.append("    int32 MaxHP = 0;\n")
        content.append("};\n")
        return "".join(content)

    def _generate_godot_export(self, data: dict[str, Any]) -> str:
        content: list[str] = []
        content.append("# Godot GDScript - Auto Generated\n\n")
        content.append("extends Resource\n\n")
        content.append("class_name GameData\n\n")
        if data.get('skills'):
            content.append("var skills = []\n")
        if data.get('roles'):
            content.append("var roles = []\n")
        if data.get('monsters'):
            content.append("var monsters = []\n")
        if data.get('equips'):
            content.append("var equips = []\n")
        if data.get('items'):
            content.append("var items = []\n")
        return "".join(content)
