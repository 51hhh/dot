# Studio 导出结构修改草案

## Goal

让 Studio 支持在 Web 里临时添加/删除语义连线，并导出只包含变更项的说明、overlay v2 patch 草案和给 agent 的提示词。Web 不直接修改 `configs/dot.yaml`，也不把语义变化保存到 `.plan.json`；真实改动仍由 agent 修改源码、补测试并验证生成脚本。

## What I already know

- 当前 Studio 只保存布局坐标，`Save layout` 发送 `patch: { version: 1, positions }`。
- 当前 React Flow 禁止连接节点，`nodesConnectable={false}`。
- 当前删除键被禁用，`deleteKeyCode={null}`。
- Overlay v2 schema 已支持 `dependencies` 和 `ordering`，但 UI 还没有语义编辑入口。
- 用户希望支持添加/删除连线，并且导出时只导出更改，不导出完整 plan。

## Requirements

- Web 允许用户在本地草案中新增连线。
- Web 允许用户删除已有连线或草案连线，并记录删除操作。
- 新增连线必须有明确边类型，不能从坐标推断语义。
- 导出内容只包含本次新增/删除的连线变化。
- 导出内容包含：
  - changed operations
  - overlay v2 patch draft
  - agent prompt
- 导出不调用保存 API，不修改 config，不修改 sidecar overlay。
- `Save layout` 继续只保存 positions。

## Acceptance Criteria

- [ ] Studio Canvas 可以本地添加草案连线。
- [ ] Studio Canvas 可以本地删除连线，并将删除记录为 draft change。
- [ ] Draft changes 可以清空。
- [ ] 导出文本只包含本次变更，不包含完整 plan。
- [ ] 导出文本清楚提示 agent 修改源码、补测试、运行检查。
- [ ] TypeScript typecheck、lint、tests、build 通过。

## Out of Scope

- 不直接从 Web 保存语义修改。
- 不直接编辑 `configs/dot.yaml`。
- 不新增/删除节点。
- 不修改脚本模板。
- 不实现 undo/redo。
- 不做完整语义编辑器。

## Technical Notes

- 预计修改 `src/studio/main.tsx` 和 `src/studio/studio.css`。
- 预计更新 `tests/studio.test.ts` 的源码断言/行为断言。
