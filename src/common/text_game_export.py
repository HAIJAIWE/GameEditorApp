"""
文字游戏导出工具 - 将对话和剧情数据导出为常用格式
支持多种格式：Twine, Markdown, JSON, XML
"""
import json
from pathlib import Path


class TextGameExporter:
    """文字游戏数据导出器"""

    @staticmethod
    def to_twine_story(story_data: list[dict], dialog_data: list[dict]) -> str:
        """
        导出为Twine故事格式（流行的互动小说工具）
        
        Args:
            story_data: 剧情数据列表
            dialog_data: 对话数据列表
            
        Returns:
            Twine格式的字符串
        """
        lines = []
        lines.append("<tw-storydata name=\"游戏故事\" creator=\"墨白启动器\">")

        # 添加剧情节点
        for story in story_data:
            lines.append("  <tw-passagedata pid=\"{id}\" name=\"{name}\" tags=\"{tags}\">".format(
                id=story.get('id', ''),
                name=story.get('name', '未命名'),
                tags=story.get('tags', '')
            ))
            lines.append(f"    {story.get('content', '')}")
            # 添加链接
            next_story = story.get('next_story', '')
            if next_story:
                lines.append(f"    \n    [[继续|{next_story}]]")
            branches = story.get('branches', '')
            if branches:
                for branch in branches.strip().split('\n'):
                    branch = branch.strip()
                    if branch:
                        lines.append(f"    \n    [[分支|{branch}]]")
            lines.append("  </tw-passagedata>")

        # 添加对话节点
        for dialog in dialog_data:
            lines.append("  <tw-passagedata pid=\"{id}\" name=\"{name}\" tags=\"对话\">".format(
                id=dialog.get('id', ''),
                name=dialog.get('name', '未命名')
            ))
            lines.append(f"    // {dialog.get('speaker', '说话者')} //")
            lines.append(f"    {dialog.get('content', '')}")

            # 添加选项
            options = dialog.get('options', '')
            if options:
                lines.append("")
                for i, option in enumerate(options.strip().split('\n')):
                    option = option.strip()
                    if option:
                        next_dialog = dialog.get('next_dialog', '')
                        if next_dialog:
                            lines.append(f"    [[{option}|{next_dialog}]]")
                        else:
                            lines.append(f"    [[{option}]]")
            lines.append("  </tw-passagedata>")

        lines.append("</tw-storydata>")
        return "\n".join(lines)

    @staticmethod
    def to_markdown(story_data: list[dict], dialog_data: list[dict]) -> str:
        """
        导出为Markdown格式
        
        Args:
            story_data: 剧情数据列表
            dialog_data: List[Dict]
            
        Returns:
            Markdown格式的字符串
        """
        lines = []
        lines.append("# 游戏剧本\n")
        lines.append(f"生成时间：{__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

        lines.append("\n## 剧情流程\n")
        for story in story_data:
            lines.append(f"\n### {story.get('name', '未命名')}\n")
            lines.append(f"类型：{story.get('type', '')} | 顺序：{story.get('order', '')}\n")
            if story.get('scene'):
                lines.append(f"场景：{story.get('scene')}\n")
            lines.append(f"\n{story.get('content', '')}\n")
            if story.get('dialog_ids'):
                lines.append(f"\n关联对话：{story.get('dialog_ids')}\n")
            if story.get('tags'):
                lines.append(f"\n标签：{story.get('tags')}\n")

        lines.append("\n## 对话内容\n")
        for dialog in dialog_data:
            lines.append(f"\n### {dialog.get('name', '未命名')}\n")
            lines.append(f"**{dialog.get('speaker', '说话者')}**: {dialog.get('content', '')}\n")

            options = dialog.get('options', '')
            if options:
                lines.append("\n选择：")
                for option in options.strip().split('\n'):
                    option = option.strip()
                    if option:
                        lines.append(f"- {option}")

        return "\n".join(lines)

    @staticmethod
    def to_json(story_data: list[dict], dialog_data: list[dict]) -> str:
        """
        导出为JSON格式（带结构）
        
        Args:
            story_data: 剧情数据列表
            dialog_data: 对话数据列表
            
        Returns:
            JSON字符串
        """
        data = {
            'game_data': {
                'title': '游戏故事',
                'generated_at': __import__('datetime').datetime.now().isoformat()
            },
            'stories': story_data,
            'dialogs': dialog_data
        }
        return json.dumps(data, ensure_ascii=False, indent=2)

    @staticmethod
    def export_to_file(story_data: list[dict], dialog_data: list[dict], output_path: Path, format: str = 'markdown'):
        """
        导出到文件
        
        Args:
            story_data: 剧情数据列表
            dialog_data: 对话数据列表
            output_path: 输出路径
            format: 格式 (markdown, twine, json)
        """
        content = ""

        if format.lower() == 'markdown':
            content = TextGameExporter.to_markdown(story_data, dialog_data)
            if not output_path.name.endswith('.md'):
                output_path = output_path.parent / (output_path.stem + '.md')
        elif format.lower() == 'twine':
            content = TextGameExporter.to_twine_story(story_data, dialog_data)
            if not output_path.name.endswith('.html'):
                output_path = output_path.parent / (output_path.stem + '.html')
        else:  # json
            content = TextGameExporter.to_json(story_data, dialog_data)
            if not output_path.name.endswith('.json'):
                output_path = output_path.parent / (output_path.stem + '.json')

        output_path.write_text(content, encoding='utf-8')
        return output_path


def export_story_to_markdown(stories: list[dict], dialogs: list[dict], output_path: Path):
    """简单的导出函数"""
    exporter = TextGameExporter()
    return exporter.export_to_file(stories, dialogs, output_path, 'markdown')
