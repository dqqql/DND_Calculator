# 新春斗兽场（DND 新春怪物角斗场）

**Latest:** v2.0 — 新增“可选怪物池（玩家在进入时选择）”与大量怪物卡扩充

Released: 2026-02-17 — 已发布 v2.0（包含“福到临头”怪物池及若干文档同步更新）

简要说明：这是一个静态前端小项目（React + Babel），提供“新春怪物角斗场”的交互页面与工具。

## 快速开始
- 直接在浏览器中打开 `index.html`。
- 或在项目根目录启动临时服务器：
  - Python: `python -m http.server 8000`
  - Node: `npx http-server . -p 8000`

## 依赖
- 运行时库已放在 `lib/`（包含 React、ReactDOM、Babel），无需额外安装。

## 发行与打包
- 发行包（zip）采用 “最小化” 策略，仅包含：
  - `index.html`（工具本体）
  - 规则书文件（文件名包含“规则/规则书/rulebook/rule”）
  - `lib/` 目录（运行时依赖）
- 打包脚本：`pack_release.py`
  - 使用示例：`python pack_release.py --bump patch`（或 `--set X.Y`）
  - 默认不会把 `changelog/`、`README.md` 或开发脚本包含到发行包（这些保留在源码中作为参考）。

## 项目文件（开发）
- `index.html` — 入口页面 / 工具本体
- `lib/` — 本地依赖
- `changelog/` — 开发用变更日志（不包含到发行包）
- `pack_release.py` — 生成发行包的脚本（默认行为为最小化发行）

## 已上传分支
- 分支：`feature/add-new-year-arena`（已推送到 `dqqql/DND_Calculator`）

## 贡献 & 许可
- 欢迎发起 Pull Request。请在仓库中添加 `LICENSE`（如需）。
