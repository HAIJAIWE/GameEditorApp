from __future__ import annotations

from common.logger import get_logger
from core.agent.model_registry import ModelRegistry, ModelType
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params

logger = get_logger()


class ModelSkill(BaseSkill):
    name = "system.model"
    description = "模型管理: 查看/切换文本模型/视觉模型/生图模型"
    version = "1.0.0"
    parameters = [
        {"name": "action", "required": True, "type": "string",
         "enum": ["list", "recommend", "switch", "info"],
         "description": "list=当前配置, recommend=推荐模型, switch=切换模型, info=详情"},
        {"name": "model_type", "required": False, "type": "string",
         "enum": ["text", "vision", "image"],
         "description": "text=文本模型, vision=视觉模型, image=生图模型"},
        {"name": "model_name", "required": False, "type": "string",
         "description": "模型名 (switch时使用, 如 gpt-4o, deepseek-chat)"},
        {"name": "provider", "required": False, "type": "string",
         "description": "提供商 (switch时可选)"},
        {"name": "base_url", "required": False, "type": "string",
         "description": "API地址 (switch时可选)"},
    ]
    tags = ["model", "config", "api", "switch"]

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        self._logger = get_logger()
        action = params.get("action", "list")
        mt_raw = params.get("model_type", "")

        try:
            mt = ModelType(mt_raw) if mt_raw else None
        except ValueError:
            mt = None

        reg = ModelRegistry.get_instance()
        config_obj = context.get("config")
        if config_obj:
            reg.sync_from_app_config(config_obj)

        try:
            if action == "list":
                return self._do_list(reg)
            elif action == "recommend":
                return self._do_recommend(reg, mt)
            elif action == "switch":
                return self._do_switch(reg, params, config_obj, context)
            elif action == "info":
                return self._do_info(reg, mt)
            else:
                return {"success": False, "error": f"未知 action: {action}", "message": ""}
        except Exception as e:
            self._logger.error(f"ModelSkill 异常: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    def _do_list(self, reg) -> dict:
        models = reg.list_models()
        lines = ["## 当前模型配置\n"]
        for m in models:
            status = "✓" if m["enabled"] else "✗"
            lines.append(
                f"- **{m['type']}** ({status}): {m['model']} @ {m['provider']} "
                f"(temp={m['temperature']})"
            )
        return {"success": True, "message": "\n".join(lines), "data": {"models": models}}

    def _do_recommend(self, reg, mt) -> dict:
        recommended = reg.list_recommended(mt)
        lines = ["## 推荐模型\n"]

        if mt:
            lines.append(f"### {mt.value} 模型\n")
            for r in recommended:
                current = " 当前" if r["name"] == reg.get_model_name(mt) else ""
                lines.append(f"- {r['name']} ({r['provider']}) — {r['desc']} {current}")
        else:
            for model_type in [ModelType.TEXT, ModelType.VISION, ModelType.IMAGE]:
                items = [r for r in recommended if r.get("type") == model_type.value]
                lines.append(f"### {model_type.value}\n")
                for r in items:
                    lines.append(f"- {r['name']} ({r['provider']}) — {r.get('desc', '')}")

        return {"success": True, "message": "\n".join(lines), "data": {"recommended": recommended}}

    def _do_switch(self, reg, params, config_obj, context) -> dict:
        mt_raw = params.get("model_type", "")
        model_name = params.get("model_name", "")

        if not mt_raw:
            return {"success": False, "error": "缺少 model_type (text/vision/image)", "message": ""}
        if not model_name:
            return {"success": False, "error": "缺少 model_name", "message": ""}

        try:
            mt = ModelType(mt_raw)
        except ValueError:
            return {"success": False, "error": f"无效 model_type: {mt_raw}", "message": ""}

        provider = params.get("provider", "")
        base_url = params.get("base_url", "")

        old_model = reg.get_model_name(mt)
        reg.set_model(mt, model_name)
        if provider:
            reg.set_provider(mt, provider)
        if base_url:
            reg.set_base_url(mt, base_url)

        if config_obj:
            prefix_map = {"text": "", "vision": "vision_", "image": "image_"}
            prefix = prefix_map.get(mt_raw, "")
            if prefix:
                setattr(config_obj, f"{prefix}model", model_name)
            else:
                config_obj.model = model_name
            if provider and prefix:
                setattr(config_obj, f"{prefix}provider", provider)
            if base_url and prefix:
                setattr(config_obj, f"{prefix}base_url", base_url)
            try:
                config_obj.save_api_config()
            except Exception as e:
                logger.warning(f"操作失败: {e}")

        self._logger.info(f"[Model] {mt_raw} 模型切换: {old_model} → {model_name}")
        return {"success": True,
                "message": f"已切换 {mt_raw} 模型: {old_model} → {model_name}",
                "data": {"type": mt_raw, "old_model": old_model, "new_model": model_name}}

    def _do_info(self, reg, mt) -> dict:
        if not mt:
            return {"success": False, "error": "缺少 model_type", "message": ""}
        cfg = reg.get_config(mt)
        rec = reg.list_recommended(mt)

        lines = [
            f"## {mt.value} 模型详情\n",
            f"- 当前模型: {cfg['model']}",
            f"- 提供商: {cfg['provider']}",
            f"- API: {cfg['base_url']}",
            f"- 状态: {'启用' if cfg['enabled'] else '未启用'}",
            f"- Temperature: {cfg['temperature']}",
            "",
            "### 推荐替代\n",
        ]
        for r in rec[:6]:
            lines.append(f"- {r['name']} — {r.get('desc', '')}")

        return {"success": True, "message": "\n".join(lines),
                "data": {"config": cfg, "recommended": rec}}
