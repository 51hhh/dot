# PRD: 禁止 Studio Canvas 本地删除

## 背景

Review 当前 Studio Canvas 修复时发现：虽然本地连线创建已经通过 `nodesConnectable={false}` 禁用，但 `onNodesChange` / `onEdgesChange` 仍直接应用 React Flow 的 `remove` change。用户可能通过删除键让节点或边在本地临时消失，而保存接口仍只持久化布局位置，容易造成“视觉语义已修改”的误解。

## 目标

- 禁止 Canvas 通过键盘删除节点或边。
- 即使 React Flow 发出 `remove` change，也不应用到本地 nodes/edges 状态。
- 保留节点拖拽布局能力和普通 selection/position change。
- 用测试锁定禁用本地删除的行为约束。

## 非目标

- 不实现语义边编辑。
- 不改变保存 API，仍只保存 layout positions。
- 不禁用节点拖拽布局。

## 验收标准

- [x] `src/studio/main.tsx` 过滤 node/edge `remove` changes。
- [x] `ReactFlow` 显式设置 `deleteKeyCode={null}`。
- [x] Studio 测试断言本地删除禁用入口存在。
- [x] `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 通过。
