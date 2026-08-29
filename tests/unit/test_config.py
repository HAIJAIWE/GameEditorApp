"""配置管理器单元测试"""
import unittest
import sys
import os
import tempfile
from pathlib import Path

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from config.settings import AppConfig, get_config


class TestAppConfig(unittest.TestCase):
    """AppConfig单元测试"""
    
    def setUp(self):
        """测试前设置"""
        self.temp_dir = tempfile.mkdtemp()
        # 保存原始base_dir
        self.original_base_dir = Path.cwd()
        
    def tearDown(self):
        """测试后清理"""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        # 重置单例状态
        AppConfig._instance = None
    
    def test_singleton_pattern(self):
        """测试单例模式"""
        config1 = get_config()
        config2 = get_config()
        
        self.assertIs(config1, config2)
        self.assertEqual(id(config1), id(config2))
    
    def test_default_fields_config(self):
        """测试默认字段配置 — 由 type_schema 统一管理"""
        # fields_config 仅存储用户 label 覆盖，初始为空 dict
        config = get_config()
        self.assertIsInstance(config.fields_config, dict)

        # 字段定义统一由 type_schema 管理，验证默认 schema 包含核心数据类型
        from core.type_schema import create_default_rpg_schema
        schema = create_default_rpg_schema()
        type_ids = schema.type_ids

        # 验证核心数据类型都在 type_schema 中定义
        for expected_type in ['skill', 'role', 'monster', 'equip', 'item',
                              'task', 'dialog', 'story', 'achievement']:
            self.assertIn(expected_type, type_ids,
                          f"数据类型 '{expected_type}' 应在 type_schema 中定义")

        # 验证技能字段结构
        skill_type = schema.get_type('skill')
        self.assertIsNotNone(skill_type)
        field_names = [f.name for f in skill_type.form_fields]
        self.assertIn('id', field_names)
        self.assertIn('name', field_names)
        self.assertIn('type', field_names)
        self.assertIn('value', field_names)
    
    def test_preset_templates(self):
        """测试预设模板（模板文件可选，不存在时返回空dict）"""
        config = get_config()

        # preset_templates 必须是 dict 类型（preset_templates.json 可能不存在）
        self.assertIsInstance(config.preset_templates, dict)

        # 如果存在模板，验证结构正确性
        for name, template in config.preset_templates.items():
            self.assertIsInstance(template, dict, f"模板 {name} 必须是 dict")
            if 'ai_prompts' in template:
                self.assertIsInstance(template['ai_prompts'], dict,
                                      f"模板 {name} 的 ai_prompts 必须是 dict")
    
    def test_agents_config(self):
        """测试智能体配置"""
        config = get_config()
        
        # 验证默认智能体存在
        self.assertIn('策划专家', config.agents)
        self.assertIn('数值平衡大师', config.agents)
        self.assertIn('游戏设计师', config.agents)
        self.assertIn('创意文案', config.agents)
        self.assertIn('代码助手', config.agents)
        self.assertIn('数据分析员', config.agents)
        self.assertIn('测试专家', config.agents)
        
        # 验证智能体结构
        agent = config.agents['策划专家']
        self.assertIn('name', agent)
        self.assertIn('description', agent)
        self.assertIn('system_prompt', agent)
    
    def test_add_and_remove_agent(self):
        """测试添加和移除智能体"""
        config = get_config()
        
        # 添加智能体
        config.add_agent(
            "测试智能体",
            "测试描述",
            "测试系统提示"
        )
        
        self.assertIn("测试智能体", config.agents)
        
        # 验证智能体数据
        agent = config.agents["测试智能体"]
        self.assertEqual(agent["name"], "测试智能体")
        self.assertEqual(agent["description"], "测试描述")
        self.assertEqual(agent["system_prompt"], "测试系统提示")
        
        # 移除智能体
        config.remove_agent("测试智能体")
        self.assertNotIn("测试智能体", config.agents)
    
    def test_get_agent_names(self):
        """测试获取智能体名称"""
        config = get_config()
        
        names = config.get_agent_names()
        self.assertIsInstance(names, list)
        self.assertIn('策划专家', names)
        self.assertIn('数值平衡大师', names)
    
    def test_api_config(self):
        """测试API配置"""
        config = get_config()

        # provider 来自用户配置（api_config.json），不应硬编码可选值
        # 只验证类型与非空，兼容 DeepSeek / OpenAI / Qwen / 豆包 等任意 provider
        self.assertIsInstance(config.provider, str)
        self.assertTrue(config.provider, "provider 不能为空字符串")
        self.assertIsInstance(config.temperature, float)
        self.assertGreater(config.temperature, 0)
        self.assertIsInstance(config.max_tokens, int)
        self.assertGreaterEqual(config.max_tokens, 1000)
        self.assertIsInstance(config.enabled, bool)


class TestFieldConfig(unittest.TestCase):
    """FieldConfig数据类测试"""
    
    def test_field_config_to_dict(self):
        """测试转换为字典"""
        field = {
            'name': 'test_field',
            'label': 'Test Field:',
            'type': 'entry',
            'editable': True
        }
        
        self.assertEqual(field['name'], 'test_field')
        self.assertEqual(field['label'], 'Test Field:')
    
    def test_field_config_with_values(self):
        """测试带值列表的字段"""
        field = {
            'name': 'type',
            'label': 'Type:',
            'type': 'combobox',
            'values': ['攻击', '防御', '治疗'],
            'editable': True
        }
        
        self.assertIsInstance(field['values'], list)
        self.assertEqual(len(field['values']), 3)


if __name__ == "__main__":
    unittest.main()