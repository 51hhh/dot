# PRD: 修复剩余风险并清理旧工作树

## 背景

5 月底到 6 月初的架构、Studio、overlay、生成脚本和协作流程改动已经合入主分支。收束 review 后仍有四个剩余风险需要关闭：

- 旧 worktree 和对应本地分支仍挂在仓库中，容易误导后续状态检查。
- Studio 静态资源路径用 `startsWith` 判断目录边界，存在前缀路径误判风险。
- Overlay v2 schema 已接受 `ordering.flow` 和 `ordering.post`，但实际应用只处理 `ordering.children`。
- Studio Canvas 允许本地连线，但保存 API 只持久化布局，会让用户误以为语义边已保存。

## 目标

- 清理已经被主线吸收的旧 worktree 和本地任务分支。
- Studio 静态资源服务必须用 `path.relative` 做目录边界判断，并只提供文件资源。
- Overlay v2 的 ordering patch 需要对 `children`、`flow`、`post` 三类顺序都形成行为闭环。
- Plan Canvas 在语义边编辑实现前禁用本地连线交互，避免不可保存的假状态。
- 添加回归测试，确保上述风险不会重新出现。

## 非目标

- 不实现完整 Canvas 语义编辑器。
- 不从节点坐标推导依赖或顺序。
- 不修改生成脚本运行时行为，除非测试发现已有行为被破坏。
- 不合并或恢复旧 worktree 中未进入主线的过期实现。

## 验收标准

- [x] `src/studio/server.ts` 的静态资源边界使用 `path.relative`，拒绝目录穿越和相邻前缀目录。
- [x] `src/planner/overlay.ts` 对 `ordering.flow` 和 `ordering.post` 有实际应用逻辑。
- [x] `ordering.flow` 只重排直接子节点中的可见非 post 子集；不完整或不匹配时不应用。
- [x] `ordering.post` 只重排直接子节点中的 post 子集；不完整或不匹配时不应用。
- [x] Studio Canvas 不再允许用户创建本地临时连线。
- [x] 回归测试覆盖静态资源路径边界、flow/post ordering、Canvas 禁用连线。
- [x] 旧 `.worktrees/` 和 `.claude/worktrees/` 工作树及对应本地分支已清理。
- [x] `git diff --check`、`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、生成脚本构建、`bash -n dist/dot.sh` 和 dry-run smoke 全部通过。
