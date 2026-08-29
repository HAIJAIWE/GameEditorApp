import os

os.environ['QT_API'] = 'pyqt6'
from qtawesome import icon as _fa_icon
from qtpy.QtGui import QIcon

_FALLBACK = {
    'file': 'fa5s.file',
    'folder': 'fa5s.folder',
    'save': 'fa5s.save',
    'open': 'fa5s.folder-open',
    'edit': 'fa5s.edit',
    'copy': 'fa5s.copy',
    'paste': 'fa5s.paste',
    'delete': 'fa5s.trash-alt',
    'add': 'fa5s.plus',
    'remove': 'fa5s.minus',
    'search': 'fa5s.search',
    'settings': 'fa5s.cog',
    'export': 'fa5s.file-export',
    'import': 'fa5s.file-import',
    'backup': 'fa5s.archive',
    'close': 'fa5s.times',
    'refresh': 'fa5s.sync-alt',
    'info': 'fa5s.info-circle',
    'warning': 'fa5s.exclamation-triangle',
    'error': 'fa5s.times-circle',
    'check': 'fa5s.check',
    'user': 'fa5s.user',
    'users': 'fa5s.users',
    'chart': 'fa5s.chart-bar',
    'table': 'fa5s.table',
    'link': 'fa5s.link',
    'code': 'fa5s.code',
    'terminal': 'fa5s.terminal',
    'home': 'fa5s.home',
    'undo': 'fa5s.undo',
    'redo': 'fa5s.redo',
    'ai': 'fa5s.robot',
    'play': 'fa5s.play',
    'stop': 'fa5s.stop',
    'filter': 'fa5s.filter',
    'sort': 'fa5s.sort',
    'more': 'fa5s.ellipsis-h',
    'tools': 'fa5s.tools',
    'gamepad': 'fa5s.gamepad',
    'shield': 'fa5s.shield-alt',
    'star': 'fa5s.star',
    'heart': 'fa5s.heart',
    'lock': 'fa5s.lock',
    'unlock': 'fa5s.unlock',
}

def get_icon(name, color=None, scale_factor=1.0):
    key = _FALLBACK.get(name)
    if key is None:
        key = name
    kw = {}
    if color:
        kw['color'] = color
    if scale_factor != 1.0:
        kw['scale_factor'] = scale_factor
    try:
        return _fa_icon(key, **kw)
    except Exception:
        return QIcon()
