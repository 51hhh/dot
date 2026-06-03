# fix: 优化 Studio 全量展开布局

## Goal

Keep Plan Canvas fully expanded by default while making large tool graphs readable. The user wants all nodes visible, but the display logic should avoid long single-column option stacks, node intermixing, and local branches occupying the same visual space as the next flow step.

## Problem

The previous attempt incorrectly moved toward focus-based collapsing. The desired behavior is the opposite:

- Show the full plan graph.
- Improve automatic distribution and spacing.
- Check layout overlap/crossing risks through tests.
- Arrange large terminal option groups into multiple local columns when they do not need to lead to further flow nodes.

## Requirements

- Do not collapse top-level tools or focused subtrees by default.
- Keep `buildStudioGraph(plan, { showDependencies, expandedNodeIds })` as the Studio projection call.
- Keep the existing full visible graph semantics.
- Increase main flow spacing enough that local option columns do not collide with the next flow column.
- Wrap large terminal single/multi/post option groups into multiple local columns.
- Preserve module vertical band separation and no-node-overlap checks.
- Add/update tests for multi-column terminal option groups and branch-column clearance.

## Acceptance Criteria

- [ ] Zsh recovery options render in more than one local column.
- [ ] SSH hardening options render in more than one local column.
- [ ] Local branches remain clear of the next primary flow column.
- [ ] Primary flow edges do not cross unrelated local branch edges in projection tests.
- [ ] Root-level modules still occupy separate vertical bands.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.

## Out of Scope

- Collapsing focused tools by default.
- A new graph layout engine.
- Canvas virtualization.
- Changing YAML structure, plan semantics, generator output, or save API behavior.
