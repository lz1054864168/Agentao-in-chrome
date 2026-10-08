"""Fix mojibake in project source files — handles both directions.

Two types of mojibake exist in this project:

1. GBK-as-UTF8: GBK-encoded Chinese was decoded as UTF-8.
   Fix: text → UTF-8 encode → GBK decode.

2. UTF-8-as-GBK: UTF-8-encoded text (em dashes, etc.) was decoded as GBK.
   Fix: text → GBK encode → UTF-8 decode.
   This requires processing entire lines (not just non-ASCII runs) to
   preserve byte alignment across multi-byte sequences.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

EXTENSIONS = {
    ".js", ".py", ".css", ".html", ".json", ".bat", ".sh",
    ".command", ".yml", ".yaml", ".toml", ".spec", ".template",
}
SKIP_DIRS = {
    ".git", "__pycache__", "node_modules", "build",
    ".agentao", "tool-outputs", "scratch",
}

# Common Chinese chars/punctuation indicating successful GBK decode
CLEAN_CHINESE = set(
    "，。：；！？、（）《》【】""''…—·"
    "的了一是在我有和不人这中大为上个国"
    "来以到说他她你们也都能好自己这那"
    "里就去会看要做想开而什么没把给让"
    "从被带队如已工方进行新用过又来对"
    "电高动数据此本其起加只下与或但"
    "而要因所成全部前后些两个多月年日"
    "时分行秒个十百千万亿元角"
    "设置配置模型权限工作目录供应商扩展"
    "宿主原生消息连接状态发送接收请求响应"
    "服务侧边栏面板选项页面用户输入输出"
    "错误警告提示保存加载删除创建编辑"
    "点击按钮选择确认取消提交返回关闭打开"
    "协议类型字段名称版本默认激活停用"
    "聊天对话回合取消停止开始完成"
    "截图导航执行点击读取写入"
    "事件工具结果状态描述参数"
    "安装注册清单目录路径文件"
    "当前活动会话历史记录"
    "主题语言英文中文"
    "权限模式只读工作区完全计划"
    "导入导出构造初始化"
    "技能记忆子智能体"
    "附件解析图片表格文本"
    "构建发布下载安装"
    "如果否则返回循环"
    "功能设计参考架构"
    "契约消息存储字段"
    "绑定协议版本实例"
    "连接断开重连心跳"
    "转发驱动执行绑定"
    "线程锁超时阻塞"
    "编码解码序列化"
    "截图格式质量"
    "选择器表达式"
    "工作区根目录"
    "权限确认超时拒绝"
    "流式输出渲染"
    "折叠展开切换"
    "图标样式主题"
    "步骤断点边界"
    "检查验证守护"
    "镜像同步两侧"
    "下载拉取列表"
    "采样温度最大"
    "内置扫描"
    "注入上下文"
    "懒加载符号"
    "读写循环"
    "构造注入"
    "纯注入式"
    "失败关闭"
)

REPLACEMENT = "\ufffd"


def count_clean(text: str) -> int:
    return sum(1 for ch in text if ch in CLEAN_CHINESE)


def count_rare_cjk(text: str) -> int:
    """Count chars in U+9200-U+9FFF range (common in mojibake, rare in real Chinese)."""
    return sum(1 for ch in text if 0x9200 <= ord(ch) <= 0x9FFF)


def try_fix_gbk_as_utf8(run: str) -> tuple[str, bool]:
    """Direction 1: GBK text was decoded as UTF-8.
    Fix: encode run as UTF-8 bytes, decode as GBK.
    """
    try:
        raw = run.encode("utf-8")
        decoded = raw.decode("gbk")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return run, False
    if REPLACEMENT in decoded:
        return run, False
    orig_clean = count_clean(run)
    dec_clean = count_clean(decoded)
    orig_rare = count_rare_cjk(run)
    dec_rare = count_rare_cjk(decoded)
    if dec_clean > orig_clean and dec_rare <= orig_rare:
        return decoded, True
    if orig_clean == 0 and dec_clean > 0 and orig_rare > 0:
        return decoded, True
    return run, False


def try_fix_utf8_as_gbk(line: str) -> tuple[str, bool]:
    """Direction 2: UTF-8 text was decoded as GBK.
    Fix: encode entire line as GBK bytes, decode as UTF-8.

    This handles cases like em dash (—) where UTF-8 bytes E2 80 94
    were decoded as GBK, producing 鈥? etc.
    """
    # Quick check: does the line have chars that look like UTF-8-as-GBK mojibake?
    # These are CJK chars in the U+9200-U+93FF range that result from
    # UTF-8 continuation byte pairs being decoded as GBK.
    has_suspect = False
    for ch in line:
        cp = ord(ch)
        if 0x9200 <= cp <= 0x93FF:
            has_suspect = True
            break
    if not has_suspect:
        return line, False

    try:
        gbk_bytes = line.encode("gbk")
    except (UnicodeEncodeError, ValueError):
        return line, False

    try:
        decoded = gbk_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return line, False

    if REPLACEMENT in decoded:
        return line, False

    # Only accept if the result is "better":
    # - Has fewer rare CJK chars
    # - Has same or more clean Chinese markers
    orig_rare = count_rare_cjk(line)
    dec_rare = count_rare_cjk(decoded)
    orig_clean = count_clean(line)
    dec_clean = count_clean(decoded)

    if dec_rare < orig_rare and dec_clean >= orig_clean:
        return decoded, True

    return line, False


def fix_line(line: str) -> tuple[str, int]:
    """Fix mojibake in a single line. Returns (fixed_line, fixes_applied)."""
    if not any(ord(ch) > 127 for ch in line):
        return line, 0

    fixes = 0

    # Direction 2: try UTF-8-as-GBK fix on the entire line first
    # (must be done before Direction 1 because it needs byte alignment)
    line2, fixed2 = try_fix_utf8_as_gbk(line)
    if fixed2:
        fixes += 1
        line = line2

    # Direction 1: try GBK-as-UTF8 fix on non-ASCII runs
    result = []
    parts = re.split(r"([^\x00-\x7f]+)", line)
    for part in parts:
        if part and any(ord(ch) > 127 for ch in part):
            fixed, was_fixed = try_fix_gbk_as_utf8(part)
            if was_fixed:
                fixes += 1
            result.append(fixed)
        else:
            result.append(part)
    line = "".join(result)

    return line, fixes


def fix_file(filepath: Path, dry_run: bool = False) -> tuple[bool, int]:
    """Fix mojibake in a file. Returns (changed, lines_changed)."""
    if filepath.name == "fix_mojibake.py":
        return False, 0

    try:
        content = filepath.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return False, 0

    if not any(ord(ch) > 127 for ch in content):
        return False, 0

    lines = content.split("\n")
    changed_count = 0
    new_lines = []
    for line in lines:
        fixed, fixes = fix_line(line)
        if fixes > 0:
            changed_count += 1
        new_lines.append(fixed)

    if changed_count > 0 and not dry_run:
        filepath.write_text("\n".join(new_lines), encoding="utf-8")

    return changed_count > 0, changed_count


def main() -> int:
    dry_run = "--dry-run" in sys.argv

    files_to_check = []
    for filepath in PROJECT_ROOT.rglob("*"):
        if not filepath.is_file():
            continue
        if filepath.suffix not in EXTENSIONS:
            continue
        rel = filepath.relative_to(PROJECT_ROOT)
        parts = set(rel.parts)
        if parts & SKIP_DIRS:
            continue
        files_to_check.append(filepath)

    total_changed = 0
    total_lines = 0
    report = []

    for filepath in sorted(files_to_check):
        changed, lines_changed = fix_file(filepath, dry_run)
        if changed:
            total_changed += 1
            total_lines += lines_changed
            rel = str(filepath.relative_to(PROJECT_ROOT))
            report.append((rel, lines_changed))

    mode = "DRY RUN" if dry_run else "FIXED"
    print(f"\n{mode}: {total_changed} files, {total_lines} lines changed\n")
    for rel, count in sorted(report, key=lambda x: -x[1]):
        print(f"  {rel:60s} {count:>5d} lines")

    return 0


if __name__ == "__main__":
    sys.exit(main())
