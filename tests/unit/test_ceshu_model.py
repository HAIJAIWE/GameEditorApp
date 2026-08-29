"""策划书模块基础测试"""
import sys, os, json, tempfile, shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))  # for scripts

def test_model_serialization():
    from core.ceshu import CeshuModel, CHAPTER_KEYS
    m = CeshuModel()
    m.meta['game_name'] = 'UnitTest'
    m.meta['game_type'] = 'RPG'
    m.set_system('battle', True)
    m.set_system('character', True)
    m.set_system('skill', True)  # 满足 battle 的依赖

    d = m.to_dict()
    # v5.0: 版本号从 4.0 升级到 5.0
    assert d['version'] == '5.0', f"期望 5.0, 实际 {d['version']}"
    assert d['meta']['game_name'] == 'UnitTest'
    assert len(d['systems']) == 13
    # v5.0: 18 章结构
    assert len(CHAPTER_KEYS) == 18, f"期望 18 章, 实际 {len(CHAPTER_KEYS)}"

    m2 = CeshuModel.from_dict(d)
    assert m2.meta['game_name'] == 'UnitTest'
    enabled_keys = [e['key'] for e in m2.compute_enabled_editors()]
    assert enabled_keys == ['battle', 'character', 'skill']

    progress = m.chapter_progress()
    assert 0 < progress['total'] <= 1.0
    # v5.0: 18 章 + total = 19
    assert len(progress) == 19, f"期望 19 项, 实际 {len(progress)}"

    errors = m.validate()
    # v5.0: 必填字段检查覆盖 18 章，空模型会有必填字段错误
    # 但不应有依赖缺失错误（battle/character/skill 都已启用）
    dep_errors = [e for e in errors if "依赖缺失" in e]
    assert len(dep_errors) == 0, f"不应有依赖缺失错误: {dep_errors}"

    m.add_system('custom_test', {'enabled': True})
    assert 'custom_test' in m.systems
    m.remove_system('custom_test')
    assert 'custom_test' not in m.systems

def test_manager_crud():
    from core.ceshu import CeshuManager
    tmp = tempfile.mkdtemp()
    mgr = CeshuManager(tmp)
    
    # create
    m = mgr.create_ceshu('test')
    assert m.ceshu_id
    ceshus = mgr.list_ceshu('test')
    assert len(ceshus) == 1
    
    # get
    m2 = mgr.get_ceshu(ceshus[0]['ceshu_id'], 'test')
    assert m2.ceshu_id == m.ceshu_id
    
    # update
    m2.meta['game_name'] = 'Updated'
    mgr.save_ceshu(m2, 'test')
    m3 = mgr.get_ceshu(ceshus[0]['ceshu_id'], 'test')
    assert m3.meta['game_name'] == 'Updated'
    
    # export/import
    ep = os.path.join(tmp, 'test.ceshu')
    mgr.export_ceshu(ceshus[0]['ceshu_id'], 'test', ep)
    assert os.path.exists(ep)
    mgr.import_ceshu(ep, 'test')
    assert len(mgr.list_ceshu('test')) == 2
    
    # delete
    ok = mgr.delete_ceshu(ceshus[0]['ceshu_id'], 'test')
    assert ok
    assert len(mgr.list_ceshu('test')) == 1
    
    shutil.rmtree(tmp)

def test_template():
    from core.ceshu import CeshuTemplate
    tmpl = CeshuTemplate()
    names = tmpl.list_template_names()
    assert len(names) > 0
    t = tmpl.get_template(names[0])
    assert t is not None
    assert 'data' in t
    preview = tmpl.get_template_preview(names[0])
    assert 'game_type' in preview
    cats = tmpl.list_by_category()
    assert len(cats) > 0

def test_agent_router():
    try:
        from core.agent.skills.ceshu_skill import AgentRouter
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装，AgentRouter 测试跳过: {e}")
            return
        raise
    from core.ceshu import CHAPTER_KEYS
    for ch in CHAPTER_KEYS:
        a = AgentRouter.route(ch)
        assert a
        d = AgentRouter.get_display_name(a)
        assert d
        p = AgentRouter.get_agent_prompt(ch)
        assert p

def test_migration():
    from scripts.migrate_planning_to_ceshu import migrate_planning_to_ceshu
    tmp = tempfile.mkdtemp()
    pf = Path(tmp) / 'planning_docs_v3.json'
    with open(pf, 'w', encoding='utf-8') as f:
        json.dump([{
            'id': 'planning_test',
            'name': '测试游戏',
            'game_concept': '战斗+角色RPG',
            'systems': '战斗系统、角色系统',
            'detected_type': 'RPG',
        }], f)
    cd = Path(tmp) / 'ceshu'
    r = migrate_planning_to_ceshu(pf, cd)
    assert r['success']
    assert r['created'] == 1
    with open(cd / 'ceshu_test.json', 'r', encoding='utf-8') as f:
        nd = json.load(f)
    assert nd['meta']['game_type'] == 'RPG'
    assert nd['systems']['battle']['enabled'] == True
    shutil.rmtree(tmp)

if __name__ == '__main__':
    test_model_serialization()
    print('✅ test_model_serialization')
    test_manager_crud()
    print('✅ test_manager_crud')
    test_template()
    print('✅ test_template')
    test_agent_router()
    print('✅ test_agent_router')
    test_migration()
    print('✅ test_migration')
    print('ALL TESTS PASSED')
