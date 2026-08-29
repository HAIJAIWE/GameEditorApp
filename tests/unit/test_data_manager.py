"""数据管理器单元测试"""
import unittest
import sys
import os
import tempfile
from pathlib import Path

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from core.data_manager import OptimizedDataManager


class TestOptimizedDataManager(unittest.TestCase):
    """OptimizedDataManager单元测试"""
    
    def setUp(self):
        """测试前设置"""
        self.temp_dir = tempfile.mkdtemp()
        self.temp_file = Path(self.temp_dir) / "test_data.json"
        self.data_manager = OptimizedDataManager()
        self.data_manager.clear_all()  # 清空预加载的示例数据
        
    def tearDown(self):
        """测试后清理"""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_initialization(self):
        """测试初始化"""
        self.assertIsNotNone(self.data_manager)
        self.assertIsNotNone(self.data_manager.data)
        # 至少包含9种数据类型（可能更多，取决于type_schema）
        self.assertGreaterEqual(len(self.data_manager.data.keys()), 9)
    
    def test_generate_id(self):
        """测试生成ID"""
        skill_id = self.data_manager.generate_id("skill")
        self.assertIsNotNone(skill_id)
        self.assertTrue(skill_id.startswith("SKILL"))
        
        role_id = self.data_manager.generate_id("role")
        self.assertTrue(role_id.startswith("ROLE"))
        
        # 测试ID递增
        id1 = self.data_manager.generate_id("skill")
        id2 = self.data_manager.generate_id("skill")
        self.assertNotEqual(id1, id2)
    
    def test_add_item(self):
        """测试添加项目"""
        skill_data = {
            "name": "测试技能",
            "type": "攻击",
            "value": 100,
            "cd": 5
        }
        
        item_id = self.data_manager.add_item("skills", skill_data)
        self.assertIsNotNone(item_id)
        
        # 验证数据已添加
        item = self.data_manager.get_item("skills", item_id)
        self.assertIsNotNone(item)
        self.assertEqual(item["name"], "测试技能")
        self.assertEqual(item["type"], "攻击")
    
    def test_get_item(self):
        """测试获取项目"""
        # 添加测试数据
        skill_data = {"name": "测试技能"}
        item_id = self.data_manager.add_item("skills", skill_data)
        
        # 获取数据
        item = self.data_manager.get_item("skills", item_id)
        self.assertIsNotNone(item)
        self.assertEqual(item["name"], "测试技能")
        
        # 获取不存在的数据
        not_found = self.data_manager.get_item("skills", "nonexistent_id")
        self.assertIsNone(not_found)
    
    def test_update_item(self):
        """测试更新项目"""
        # 添加测试数据
        skill_data = {"name": "测试技能", "value": 100}
        item_id = self.data_manager.add_item("skills", skill_data)
        
        # 更新数据
        updated_data = {"id": item_id, "name": "更新后的技能", "value": 200}
        result = self.data_manager.update_item("skills", item_id, updated_data)
        self.assertTrue(result)
        
        # 验证更新成功
        item = self.data_manager.get_item("skills", item_id)
        self.assertEqual(item["name"], "更新后的技能")
        self.assertEqual(item["value"], 200)
        
        # 更新不存在的数据
        result = self.data_manager.update_item("skills", "nonexistent", {})
        self.assertFalse(result)
    
    def test_delete_item(self):
        """测试删除项目"""
        # 添加测试数据
        skill_data = {"name": "测试技能"}
        item_id = self.data_manager.add_item("skills", skill_data)
        
        # 验证数据存在
        self.assertIsNotNone(self.data_manager.get_item("skills", item_id))
        
        # 删除数据
        result = self.data_manager.delete_item("skills", item_id)
        self.assertTrue(result)
        
        # 验证数据已删除
        self.assertIsNone(self.data_manager.get_item("skills", item_id))
        
        # 删除不存在的数据
        result = self.data_manager.delete_item("skills", "nonexistent")
        self.assertFalse(result)
    
    def test_search_items(self):
        """测试搜索功能"""
        # 添加测试数据
        self.data_manager.add_item("skills", {"name": "火焰箭", "type": "攻击", "desc": "发射火焰"})
        self.data_manager.add_item("skills", {"name": "冰霜新星", "type": "攻击", "desc": "冰系魔法"})
        self.data_manager.add_item("skills", {"name": "治疗术", "type": "治疗", "desc": "恢复生命"})
        
        # 测试搜索
        results = self.data_manager.search_items("skills", "攻击")
        self.assertEqual(len(results), 2)
        
        results = self.data_manager.search_items("skills", "火焰")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "火焰箭")
        
        # 空搜索返回全部
        results = self.data_manager.search_items("skills", "")
        self.assertEqual(len(results), 3)
    
    def test_save_and_open_file(self):
        """测试保存和打开文件"""
        # 添加测试数据
        self.data_manager.add_item("skills", {"name": "测试技能", "type": "攻击"})
        
        # 保存文件
        result = self.data_manager.save_file(self.temp_file)
        self.assertTrue(result)
        self.assertTrue(self.temp_file.exists())
        
        # 创建新的数据管理器并打开文件
        new_manager = OptimizedDataManager()
        result = new_manager.open_file(self.temp_file)
        self.assertTrue(result)
        
        # 验证数据已加载
        skills = new_manager.data.get("skills", [])
        self.assertEqual(len(skills), 1)
        self.assertEqual(skills[0]["name"], "测试技能")
    
    def test_clear_all(self):
        """测试清空所有数据"""
        # 添加测试数据
        self.data_manager.add_item("skills", {"name": "技能1"})
        self.data_manager.add_item("roles", {"name": "角色1"})
        
        # 验证数据存在
        self.assertEqual(len(self.data_manager.data["skills"]), 1)
        self.assertEqual(len(self.data_manager.data["roles"]), 1)
        
        # 清空数据
        result = self.data_manager.clear_all()
        self.assertTrue(result)
        
        # 验证数据已清空
        for key in self.data_manager.data.keys():
            self.assertEqual(len(self.data_manager.data[key]), 0)
    
    def test_cache_functionality(self):
        """测试缓存功能"""
        # 添加测试数据
        skill_data = {"name": "测试技能", "type": "攻击"}
        item_id = self.data_manager.add_item("skills", skill_data)
        
        # 获取数据（应该缓存）
        item1 = self.data_manager.get_item("skills", item_id)
        item2 = self.data_manager.get_item("skills", item_id)
        
        # 验证缓存命中（引用相同）
        self.assertEqual(item1["name"], item2["name"])
        
        # 更新数据后缓存应失效
        updated_data = {"id": item_id, "name": "更新技能", "type": "防御"}
        self.data_manager.update_item("skills", item_id, updated_data)
        
        # 获取更新后的数据
        item3 = self.data_manager.get_item("skills", item_id)
        self.assertEqual(item3["name"], "更新技能")


class TestDataManagerEdgeCases(unittest.TestCase):
    """数据管理器边界情况测试"""
    
    def setUp(self):
        """测试前设置"""
        self.data_manager = OptimizedDataManager()
        self.data_manager.clear_all()  # 清空预加载数据
    
    def test_empty_name(self):
        """测试空名称"""
        skill_data = {"name": ""}
        item_id = self.data_manager.add_item("skills", skill_data)
        self.assertIsNotNone(item_id)
        
        item = self.data_manager.get_item("skills", item_id)
        self.assertEqual(item["name"], "")
    
    def test_large_value(self):
        """测试大数值"""
        skill_data = {
            "name": "超强技能",
            "value": 999999
        }
        item_id = self.data_manager.add_item("skills", skill_data)
        item = self.data_manager.get_item("skills", item_id)
        self.assertEqual(item["value"], 999999)
    
    def test_special_characters(self):
        """测试特殊字符"""
        skill_data = {
            "name": "技能名称@#$%^&*()",
            "desc": "描述包含中文、English和特殊符号!@#$"
        }
        item_id = self.data_manager.add_item("skills", skill_data)
        item = self.data_manager.get_item("skills", item_id)
        self.assertEqual(item["name"], "技能名称@#$%^&*()")


if __name__ == "__main__":
    unittest.main()