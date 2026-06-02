# 自包含交互式 `dot.sh` MVP

## Goal

将 `dot` 从“用户运行 TypeScript CLI 生成安装脚本”的工具，演进为“开发者侧构建自包含安装脚本”的生成器。

最终用户流程应是：

```bash
wget <release-url>/dot.sh -O dot.sh
bash dot.sh
```

执行后进入类似 fishros 的多级菜单，用户先选择安装场景（如 tmux、Rime、zsh），再进入子菜单选择安装方式、插件和自定义配置。所有信息确认后，脚本按依赖顺序拼接执行计划并顺序执行安装。

## Confirmed MVP Requirements

- 生成单个自包含 bash 脚本：`dot.sh`。
- 终端用户运行 `dot.sh` 时不需要 Node.js、npm、TypeScript 或项目源码。
- TypeScript 仅作为开发者侧构建工具：读取 YAML 配置和模板，生成发布用脚本。
- 生成脚本内置纯 bash TUI 菜单：方向键导航、空格多选、回车确认。
- 菜单支持多级结构：主菜单选择场景，子菜单选择安装方式和后续配置。
- 交互阶段只收集选择和自定义参数，不立即安装。
- 确认阶段展示完整执行计划。
- 执行阶段按依赖拓扑顺序拼接脚本片段，并顺序执行。
- 保留现有依赖能力：选中某项时自动加入其依赖项。
- 保留 `post` 能力：需要最后执行的节点在普通节点之后运行。
- 生成脚本必须可用 `bash -n` 做语法校验。

## Execution Flow

```text
开发者侧
  configs/*.yaml
  templates/**/*.sh
    ↓
  dot build --config configs/dot.yaml --output dist/dot.sh
    ↓
  dist/dot.sh
    ↓ 发布 / CI artifact

用户侧
  wget dot.sh && bash dot.sh
    ↓
  bootstrap: 检查 bash、终端能力、基础命令
    ↓
  主菜单：tmux / rime / zsh / git / docker ...
    ↓
  子菜单：安装方式、插件、配置项
    ↓
  参数收集：prefix、镜像地址、用户名等
    ↓
  执行计划预览
    ↓
  确认执行
    ↓
  拓扑排序 + post 分组
    ↓
  拼接并顺序执行脚本片段
    ↓
  汇总成功/失败结果
```

## Decisions

### 1. Generated script is self-contained

**Decision**: `dot.sh` 必须包含运行所需的菜单逻辑、菜单数据、模板脚本片段、依赖信息和执行器。

**Why**: 用户侧只应依赖 `bash`，不应依赖 Node.js 或仓库文件。

### 2. Pure bash TUI

**Decision**: 使用 `read -rsn1` + ANSI 转义码实现方向键导航和 checkbox 多选。

**Why**: 调研显示 omakub 依赖 `gum`，fishros 实际是 Python，chezmoi/linutil 是二进制程序；为了 `wget + bash` 即用，MVP 不引入外部 TUI 依赖。

### 3. Collect before execute

**Decision**: 菜单阶段只收集用户选择和参数，不执行安装。

**Why**: 用户体验更稳定，可以在真正安装前展示完整计划，也便于未来支持 preset、dry-run 和 CI 自动生成。

### 4. Concatenated execution plan

**Decision**: 采用 linutil 类似模式：把最终选择解析为有序脚本片段，拼接为一个执行计划，顺序运行。

**Why**: 多个安装项可以共享执行上下文；比 `source` 全局散落更可控，比 webi 子 shell 更适合连续配置流程。

### 5. No advanced recovery in MVP

**Decision**: MVP 只记录每段成功/失败并继续汇总，不做断点续跑、回滚、并行或自动重试。

**Why**: 先把可生成、可执行、可测试的核心闭环跑通。

### 6. Developer-side editable Plan Canvas

**Decision**: 在开发者侧引入 `InstallationPlan` 中间数据结构，并建设 PinCanvas 类可编辑 Canvas。AI 或开发者先生成 YAML/Plan，再通过 Canvas 查看菜单树、安装路径、依赖边、`flow` 顺序、`post` 后置节点和最终执行计划；允许在 Canvas 中修改流程后再构建发布用 `dot.sh`。

**Why**: 当前安装逻辑、显示顺序、依赖顺序和 post 顺序分散在 YAML 中，复杂场景下难以检查和调整。Plan Canvas 可以作为 AI 生成后的人工审查与修改中间件，降低复杂安装流程维护成本，同时不影响最终用户侧 `wget + bash` 的零依赖体验。

**Scope**: 该 Canvas 属于开发者工具链，不进入最终生成的 `dot.sh` runtime。第一阶段可以直接走 Plan Core + 可编辑 Canvas，但需要将 YAML/Plan 回写、执行顺序解释和校验作为核心设计风险处理。

## Acceptance Criteria

- [x] `npm run build` 后可以生成 `dist/dot.sh`。
- [x] `dist/dot.sh` 是单文件 bash 脚本。
- [x] `bash -n dist/dot.sh` 通过。
- [x] 在 Ubuntu Docker 容器中可执行 `bash dist/dot.sh` 并进入交互菜单。
- [x] 菜单支持多级导航、空格多选、回车确认、返回、退出。
- [x] 选择 tmux 插件时，依赖项自动进入执行计划。
- [x] `post` 节点总是在普通节点之后执行。
- [x] 确认执行前展示完整执行计划。
- [x] 执行完成后输出成功/失败汇总。
- [x] 开发者侧存在 `InstallationPlan` 中间结构，可表达菜单树、依赖边、flow 顺序、post 节点、prompt 和最终执行计划。
- [x] 开发者侧 Canvas 可以加载 Plan，展示并编辑节点、顺序、依赖和 post 信息。
- [x] Canvas 修改后的流程可以保存并重新参与 `dot.sh` 构建。
- [x] Canvas/Plan 能明确区分显示顺序、依赖顺序和最终执行顺序。

## Out of Scope

- GitHub 镜像测速和自动选择。
- 下载失败自动重试。
- 断点续跑和回滚。
- 并行执行安装项。
- 远程模板包管理。
- 插件生态系统。
- 将 Canvas UI 打包进最终用户运行的 `dot.sh`。
- 把最终用户 runtime 改成 Node/Web/桌面应用。
- 非 bash shell 支持。

## Definition of Done

- PRD、架构文档、质量计划完成。
- 项目规范文档补充为 TypeScript CLI/generator 实际约定。
- 后续实现可按文档分解为小步骤：schema 扩展、bash runtime 模板、assembler 重构、测试与 Docker smoke test。
