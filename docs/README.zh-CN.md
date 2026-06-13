<p align="center">
  <img src="banner.svg" alt="dot Banner" width="600">
</p>

<p align="center">
  <strong>交互式系统配置生成器 — 一键生成你的 dotfiles 安装脚本</strong>
</p>

<p align="center">
  <a href="https://github.com/51hhh/dot/actions">
    <img src="https://github.com/51hhh/dot/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://dot.techvista.eu.org/dot.sh">
    <img src="https://img.shields.io/badge/download-dot.sh-blue" alt="Download">
  </a>
  <a href="https://github.com/51hhh/dot/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/51hhh/dot" alt="License">
  </a>
</p>

<p align="center">
  <a href="../README.md">English</a> | <a href="README.zh-CN.md">中文</a>
</p>

---

dot 将 YAML 菜单定义转换为单个自包含的交互式 Bash 脚本。生成脚本在目标机器上无需 Node.js、npm 或项目文件，只需要 `bash`。

```bash
curl -fsSL https://dot.techvista.eu.org/dot.sh | bash
```

使用 **TypeScript + Vite + React Flow** 构建规划工作室，生成的安装器为纯 **Bash**。

## 工作原理

```text
YAML 配置 + Shell 模板
         │
         ▼
   ┌─────────────┐
   │  dot plan    │  → 检查和审查已解析的计划图
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  dot build   │  → 生成单个自包含 bash 脚本
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  bash dot.sh │  → 交互式 TUI → 在支持 bash 的系统上执行
   └─────────────┘
```

生成的 `dot.sh` 将所有模板、菜单逻辑、依赖解析和交互式提示嵌入单个文件。运行时是纯 Bash；用户选择的具体模板步骤仍可能按流程调用 `apt`、`git`、`curl` 或 `wget` 等系统工具。

## 亮点

- **零 Node/npm 运行时** — 生成的 `dot.sh` 只依赖 bash；具体模板步骤可能调用系统包管理工具
- **三个内置流程** — Tmux、Zsh、SSH 一键配置，80+ 可组合的 shell 模板，主要面向 Debian/Ubuntu 风格环境
- **交互式 TUI 菜单** — 方向键导航、多选、基于流程的向导，带进度追踪
- **GitHub 镜像加速** — 内置测速镜像选择，适合受限网络环境
- **Plan Canvas (Studio)** — React Flow 可视化工作台，用于检查解析后的计划图、保存布局位置、导出给 agent 执行的语义修改草案
- **Sidecar 覆盖层** — 调整标签、隐藏节点、覆盖安全显示字段，并表达受限的 v2 依赖/排序补丁，无需修改 shell 模板
- **模板变量** — `{{variable}}` 替换与默认值，运行时提示（文本、数字、按键捕获）
- **依赖图** — 声明 `deps: [...]` 和 `post: true` 自动控制执行顺序
- **试运行模式** — `--dry-run-plan` 渲染完整执行计划而不实际运行

## 安装

直接运行安装器：

```bash
curl -fsSL https://dot.techvista.eu.org/dot.sh | bash
```

或先下载再检查：

```bash
curl -fsSL https://dot.techvista.eu.org/dot.sh -o dot.sh
cat dot.sh  # 运行前检查脚本内容
bash dot.sh
```

## 快速开始（从源码）

```bash
npm install
npm run build
bash dist/dot.sh
```

## 主要命令

### `dot build`

构建自包含的发布产物。

```bash
dot build --config configs/dot.yaml --output dist/dot.sh --quiet
```

- `--config <path>` — 必需，接受 YAML 或 JSON
- `--output <path>` — 默认为 `dist/dot.sh`
- 自动加载 sidecar 覆盖层（`configs/dot.plan.json`）
- 写入前使用 `bash -n` 验证输出

### `dot plan`

渲染已解析的安装计划。

```bash
dot plan --config configs/dot.yaml              # 人类可读的树形格式
dot plan --config configs/dot.yaml --format json # 机器可读的 JSON
```

### `dot studio`

启动本地 Plan Canvas 可视化编辑器。

```bash
dot studio --config configs/dot.yaml --port 5177
```

可视化计划图，拖拽节点保存布局位置，切换依赖边显示，并导出用于源码级结构修改的 agent 提示词草案。

## 配置参考

最小配置结构：

```yaml
name: "dot 安装器"
version: "1.0"
description: "选择要安装/配置的工具"
menuMode: "single"

output:
  filename: "dot.sh"
  dir: "dist"

menu:
  - id: "tmux"
    label: "Tmux"
    mode: "flow"
    children:
      - id: "tmux-install"
        label: "安装 tmux"
        script: "../templates/tmux/install-apt.sh"
      - id: "tmux-configure"
        label: "配置 tmux"
        script: "../templates/tmux/header.sh"
        deps: ["tmux-install"]
      - id: "tmux-final-notes"
        label: "收尾提示"
        script: "../templates/tmux/final-notes.sh"
        post: true
```

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `id` | 是 | 稳定唯一标识（字母、数字、`_`、`-`） |
| `label` | 是 | 菜单显示文本 |
| `description` | 否 | 附加说明文本 |
| `script` | 否 | Shell 片段路径，相对于配置文件解析 |
| `vars` | 否 | `{{variable}}` 替换的模板变量 |
| `deps` | 否 | 必须在此节点之前运行的 id |
| `children` | 否 | 嵌套菜单项 |
| `mode` | 否 | `single`、`multi` 或 `flow` |
| `prompt` | 否 | 运行时提示（text、number、key、key-compose） |
| `hidden` | 否 | 从菜单隐藏，仍参与依赖 |
| `post` | 否 | 在普通步骤之后运行 |
| `endFlow` | 否 | 结束当前流程并进入计划预览 |

## Sidecar 计划覆盖层

对于 `configs/dot.yaml`，覆盖层路径为 `configs/dot.plan.json`：

```json
{
  "version": 1,
  "positions": { "tmux": { "x": 120, "y": 80 } },
  "disabled": ["tmux-plugin-dracula"],
  "overrides": {
    "tmux-install": { "label": "安装 Tmux", "hidden": false }
  }
}
```

- `positions` — 仅用于 Studio，不影响构建输出
- `overrides` — 仅限 `label`、`description`、`hidden`、`post` 和非根 `mode`
- `disabled` — 强制节点为 `hidden: true`，优先于 `hidden: false`
- v2 覆盖层还支持受限的依赖和排序补丁；Studio 中的语义连线草案会导出给源码修改流程，而不是直接作为布局保存。

## 模板安全

`script` 文件是受信任的可执行 shell。生成器将渲染后的内容嵌入发布脚本，因此不应用于读取不受信任来源的任意本地文件。当前构建接受配置目录本身或相邻 `templates/` 目录下的片段。

## GitHub 镜像信任

Tmux 安装器可使用第三方 GitHub 镜像前缀来改善受限网络下的连接性。镜像被视为网络信任根：它们可以观察请求的 URL 并提供下载内容。生成的脚本会在选择或使用镜像路径时发出警告。

当前策略：保留直连 GitHub 访问，保留镜像支持，依赖 HTTPS 到所选端点。项目尚未对镜像内容固定校验和或验证签名。

## 项目结构

```text
src/
├── index.ts              # CLI 入口
├── loader/               # 配置解析、Zod schema、验证
├── generator/            # 模板渲染、独立 Bash 组装
├── planner/              # 安装计划图、覆盖层、渲染器
└── studio/               # React Flow Plan Canvas

configs/                  # YAML 配置文件
templates/                # Shell 模板（tmux、zsh、ssh）
docs/                     # 架构和发布说明
dist/                     # 构建产物和生成的 dot.sh
```

## 开发

```bash
npm run typecheck         # TypeScript 类型检查
npm run lint              # ESLint
npm test                  # Vitest（161 个测试）
npm run build             # 完整构建：CLI + Studio + dot.sh
npm run test:docker       # Docker 冒烟测试
```

## 贡献

欢迎贡献。请先开 issue 讨论重大变更。

1. Fork → 分支（`git checkout -b feat/my-feature`）
2. 提交（`git commit -m 'feat: add feature'`）
3. Push → PR

## 许可证

[MIT](../LICENSE)
