"""CeshuSkill 各 mixin 的公共基类（仅声明跨 mixin 方法签名）

CeshuSkill 的方法按职责拆分到 ceshu_skill_data / _generate / _prompt / _review
四个 mixin；mixin 之间互相调用时，签名由本类声明，实现仍由各 mixin 提供
（MRO 下真实实现优先）。本类不承载运行时代码。
"""
from __future__ import annotations

from typing import Any


class CeshuSkillState:
    """CeshuSkill 各 mixin 的公共基类（仅声明签名）"""

    # ─ 跨 mixin 方法签名声明（实现见对应 mixin）──
    # STUBS
    @staticmethod
    def _resolve_library(context: dict, params: dict) -> str:
        raise NotImplementedError
    def _get_manager(self, context: dict) -> Any:
        raise NotImplementedError
    def _list(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _get(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _create(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _update(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _delete(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _export(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _import(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _call_llm(self, prompt: str, system_prompt: str, logger) -> tuple:
        raise NotImplementedError
    def _ai_generate_data(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _ai_fill_field(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _ai_fill_chapter(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _ai_generate_full(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    @staticmethod
    def _normalize_user_input(params: dict) -> dict:
        raise NotImplementedError
    @staticmethod
    def _build_chapter_order(include_market: bool, include_risk: bool) -> list:
        raise NotImplementedError
    @staticmethod
    def _build_meta_seed(user_input: dict) -> dict:
        raise NotImplementedError
    @staticmethod
    def _build_chapter_prompts(user_input: dict, chapter_order: list) -> dict:
        raise NotImplementedError
    def _ai_review_full(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _ai_review(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _apply_system_recommendations(self, model, recommended) -> None:
        raise NotImplementedError
    def _apply_preset_systems(self, model, rec_sys_list) -> None:
        raise NotImplementedError
    def _apply_batch_to_model(self, model, chapters, batch_data) -> None:
        raise NotImplementedError
    def _build_result_message(self, model, template_name, analysis, preset) -> str:
        raise NotImplementedError
    def _ai_generate(self, params: dict, context: dict, logger) -> dict:
        raise NotImplementedError
    def _analyze_description(self, description: str, model, logger) -> tuple:
        raise NotImplementedError
    @staticmethod
    def _build_generate_prompt(model, chapters: list, game_name: str, description: str) -> str:
        raise NotImplementedError
    @staticmethod
    def _parse_llm_json(content: str, logger) -> dict:
        raise NotImplementedError
