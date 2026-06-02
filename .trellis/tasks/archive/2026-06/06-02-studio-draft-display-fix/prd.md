# 修复 Studio 草案显示文案

## Goal

修复 Studio 新增草案功能的显示问题：空状态不应常驻显示英文说明；草案相关控件和状态应使用简洁中文，并保持“只导出变更、不保存语义”的行为不变。

## Requirements

- 不再常驻显示 `0 draft changes` 和英文说明。
- 草案相关按钮、标签、状态信息改成中文。
- 没有草案变更时，导出按钮不可用或给出清晰中文状态。
- 保持删除/新增连线只进入本地 draft。
- 保持 `Save layout` 只保存 positions。

## Acceptance Criteria

- [ ] 空草案状态不再显示整块说明。
- [ ] 草案计数显示为简洁中文。
- [ ] Studio 测试更新。
- [ ] typecheck、lint、测试、构建通过。

## Out of Scope

- 不改 overlay 保存 API。
- 不改 YAML 结构。
- 不改 agent prompt 的数据格式。
