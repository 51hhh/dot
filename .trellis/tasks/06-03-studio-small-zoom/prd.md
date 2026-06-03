# fix: 支持 Studio 更小缩放倍率

## Goal

Allow Plan Canvas to zoom out further so the fully expanded graph can be inspected as a whole.

## Requirements

- Keep full graph layout and semantics unchanged.
- Lower the React Flow minimum zoom enough to view large expanded graphs.
- Make initial `fitView` use a small enough zoom when the graph is wide.
- Preserve existing node dragging, edge drafting, save layout, and tree focus behavior.
- Add/update Studio tests for the zoom props.

## Acceptance Criteria

- [x] Studio React Flow sets a smaller `minZoom`.
- [x] Studio `fitView` behavior supports large full-graph overview.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.

## Out of Scope

- Replacing the layout engine.
- Adding a minimap redesign.
- Changing graph semantics or saved layout format.
