#!/usr/bin/env python3
"""
pack_release.py — 为发行版生成“最小”打包：仅包含规则书、工具本体和 `lib/` 目录

用法示例：
  python pack_release.py --bump patch
  python pack_release.py --dry-run --bump patch

设计要点：
- 非交互（脚本/CI 可直接调用）
- 发行包只包含：根目录的 `index.html`（工具本体）、规则书文件（文件名包含关键词）以及 `lib/` 目录
- 不再把 `changelog/`、`README.md`、`pack_release.py` 等开发/文档文件包含到发行包
- 不在发行目录中写入 `release.json` / `version.txt`（脚本仍会在控制台打印元数据并生成 zip）
"""

from __future__ import annotations
import argparse
import shutil
import re
import json
from pathlib import Path
from datetime import datetime
import sys

# ----------------------------- 配置 -----------------------------
INCLUDE_EXT = {'.html', '.htm', '.css', '.js', '.json', '.md', '.txt', '.png', '.jpg', '.jpeg', '.svg', '.gif'}
INCLUDE_DIR_NAMES = {'lib', 'assets', 'static', 'dist', 'changelog'}
EXCLUDE_DIR_NAMES = {'.git', 'node_modules', '__pycache__', '.vscode'}
SCRIPT_NAME = Path(__file__).name

# --------------------------- 辅助函数 ---------------------------

def parse_version(s: str) -> tuple[int, int]:
    """把版本字符串 X.Y 或 vX.Y 解析为 (X, Y)。抛 ValueError 如果格式不对。"""
    s = s.strip()
    if s.startswith('v') or s.startswith('V'):
        s = s[1:]
    m = re.fullmatch(r"(\d+)\.(\d+)", s)
    if not m:
        raise ValueError(f"无效版本格式: {s!r}, 需像 1.2 或 v1.2")
    return int(m.group(1)), int(m.group(2))


def version_to_str(v: tuple[int, int]) -> str:
    return f"v{v[0]}.{v[1]}"


def find_existing_releases(parent: Path) -> dict[str, list[tuple[int, int]]]:
    """扫描 sibling 目录，返回字典: {base_prefix: [ (major, minor), ... ]}
    匹配规则：目录名称末尾包含 v?DIGIT.DIGIT（例如 `斗兽场v1.2` 或 `foo1.2`）
    """
    releases: dict[str, list[tuple[int, int]]] = {}
    for p in parent.iterdir():
        if not p.is_dir():
            continue
        m = re.search(r"(.*?)(?:v)?(\d+)\.(\d+)$", p.name)
        if not m:
            continue
        base = m.group(1).strip().rstrip('-_ ')
        ver = (int(m.group(2)), int(m.group(3)))
        releases.setdefault(base or p.stem, []).append(ver)
    return releases


def pick_release_base(dev_name: str, releases: dict[str, list[tuple[int, int]]]) -> str:
    """选择发布目录的前缀（例如 '斗兽场'）
    优先规则：
      1) 如果存在名为 '斗兽场...'（以 dev_name 的一部分匹配）则使用它
      2) 否则选择出现次数最多的前缀
      3) 否则使用开发目录名称
    """
    # try to find a release base that shares a word with dev_name
    for base in releases:
        if base and (base in dev_name or dev_name in base):
            return base
    if releases:
        # choose the base with the most versions found
        return max(releases.items(), key=lambda kv: len(kv[1]))[0]
    # fallback -> use dev folder name (remove spaces)
    return dev_name.replace(' ', '')


def compute_next_version(current: tuple[int, int] | None, bump: str | None, explicit: tuple[int, int] | None) -> tuple[int, int]:
    if explicit is not None:
        return explicit
    if current is None:
        # default start at 1.0
        current = (1, 0)
    major, minor = current
    if bump in ('patch', 'minor'):
        return major, minor + 1
    if bump == 'major':
        return major + 1, 0
    raise ValueError('必须指定 --bump 或 --set')


def collect_items(dev_dir: Path) -> tuple[list[Path], list[Path]]:
    """仅收集发行版所需的最小文件集合：
    - `index.html`（工具本体）
    - 规则书文件（文件名包含“规则/规则书/rulebook/rule”的任意文件）
    - `lib/` 目录

    其它开发/文档文件（changelog、README、pack_release.py 等）不会被打包。
    """
    files: list[Path] = []
    dirs: list[Path] = []

    # 强制包含工具本体（若存在）
    idx = dev_dir / 'index.html'
    if idx.exists() and idx.is_file():
        files.append(idx)

    # 包含规则书（文件名匹配 — 扩展关键字以包含常见命名）
    for p in dev_dir.iterdir():
        if p.is_file() and re.search(r'规则|规则书|rulebook|rule|DND|斗兽场|怪物', p.name, re.I):
            files.append(p)

    # 包含 lib 目录（若存在）
    libdir = dev_dir / 'lib'
    if libdir.exists() and libdir.is_dir():
        dirs.append(libdir)

    return files, dirs


def copy_into_release(items_files: list[Path], items_dirs: list[Path], target: Path, dry_run: bool = False):
    target.mkdir(parents=True, exist_ok=True)
    copied = {'files': [], 'dirs': []}
    for f in items_files:
        rel = f.relative_to(Path.cwd()) if f.is_relative_to(Path.cwd()) else f.name
        dest = target / f.name
        if dry_run:
            copied['files'].append(str(f))
        else:
            shutil.copy2(f, dest)
            copied['files'].append(str(f))
    for d in items_dirs:
        dest = target / d.name
        if dry_run:
            copied['dirs'].append(str(d))
        else:
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(d, dest)
            copied['dirs'].append(str(d))
    return copied


def find_latest_changelog(dev_dir: Path) -> Path | None:
    """在 `dev_dir/changelog` 中查找最新的变更日志文件（优先按文件名中的版本号，否则按修改时间）。返回源文件路径或 None。"""
    cd = dev_dir / 'changelog'
    if not cd.exists() or not cd.is_dir():
        return None
    versioned: list[tuple[tuple[int, int], Path]] = []
    for f in cd.iterdir():
        if not f.is_file():
            continue
        m = re.search(r"v?(\d+)\.(\d+)", f.name)
        if m:
            try:
                versioned.append((parse_version(m.group(0)), f))
            except Exception:
                continue
    if versioned:
        versioned.sort(key=lambda vf: (vf[0][0], vf[0][1]), reverse=True)
        return versioned[0][1]
    files = [p for p in cd.iterdir() if p.is_file()]
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)

# ------------------------------ 主流程 ------------------------------

def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    parser = argparse.ArgumentParser(description='将开发目录打包为可发放的版本文件夹（非交互）')
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument('--bump', choices=['patch', 'minor', 'major'], help='版本类型：小版本（patch/minor）或大版本（major）')
    g.add_argument('--set', dest='set_version', help='直接设置目标版本，格式 X.Y 或 vX.Y')
    parser.add_argument('--outbase', help='覆盖发布目录前缀（默认为检测到的发布前缀）')
    parser.add_argument('--force', action='store_true', help='若目标目录已存在则覆盖')
    parser.add_argument('--dry-run', action='store_true', help='只显示将要做的事情，不执行复制')
    args = parser.parse_args(argv)

    dev_dir = Path(__file__).resolve().parent
    parent = dev_dir.parent

    releases = find_existing_releases(parent)
    base = args.outbase or pick_release_base(dev_dir.name, releases)

    # 找到当前已有的最高版本（如果有）
    current_versions = releases.get(base, [])
    current = max(current_versions) if current_versions else None

    explicit = None
    if args.set_version:
        explicit = parse_version(args.set_version)

    try:
        new_ver = compute_next_version(current, args.bump, explicit)
    except ValueError as e:
        print('错误：', e, file=sys.stderr)
        return 2

    release_dir_name = f"{base}v{new_ver[0]}.{new_ver[1]}"
    target = parent / release_dir_name

    if target.exists():
        if args.force:
            if args.dry_run:
                print(f"DRY-RUN: 将删除已存在的目标目录 {target}")
            else:
                shutil.rmtree(target)
        else:
            print(f"错误：目标目录已存在：{target}（使用 --force 覆盖）", file=sys.stderr)
            return 3

    files, dirs = collect_items(dev_dir)
    print('打包规则（预览）:')
    for p in files:
        print('  file:', p.name)
    for d in dirs:
        print('  dir :', d.name)

    # 显示最新的更新公告内容（若存在）
    latest_changelog = find_latest_changelog(dev_dir)
    if latest_changelog:
        print('\n最新更新公告：', latest_changelog.name)
        try:
            txt = latest_changelog.read_text(encoding='utf-8')
            for i, line in enumerate(txt.splitlines()[:10], start=1):
                print(f'  {i:2d}: {line}')
        except Exception:
            print('  （无法读取 changelog 内容）')

    copied = copy_into_release(files, dirs, target, dry_run=args.dry_run)

    # write metadata
    metadata = {
        'name': release_dir_name,
        'version': f"{new_ver[0]}.{new_ver[1]}",
        'created_at': datetime.utcnow().isoformat() + 'Z',
        'source_folder': str(dev_dir),
        'files': copied.get('files', []),
        'dirs': copied.get('dirs', []),
    }

    # 最小化发行包：不自动把 changelog 复制到发行目录（只包含 index.html、规则书与 lib/）

    if not args.dry_run:
        # 不把元数据文件写入发行目录；仅生成 zip 压缩包并在控制台显示元数据
        try:
            archive_file = shutil.make_archive(str(target), 'zip', root_dir=str(target))
            metadata['archive'] = archive_file
        except Exception as e:
            print('警告：无法创建压缩包：', e)
        # 在控制台显示元数据（便于 CI/人工验证）
        print('\n-- release metadata --')
        print(json.dumps({k: v for k, v in metadata.items() if k != 'archive'}, ensure_ascii=False, indent=2))

    print('\n结果：')
    if args.dry_run:
        print('  DRY-RUN — 未创建任何文件（使用不带 --dry-run 的命令执行复制）')
        print('  目标目录（示例）:', target)
    else:
        print('  已创建发行目录:', target)
        print('  压缩包:', metadata.get('archive'))
        print('  版本号:', metadata['version'])
        print('  包含文件数:', len(copied.get('files', [])))
        print('  包含目录数:', len(copied.get('dirs', [])))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
