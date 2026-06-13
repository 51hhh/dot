# implement: Studio step frames replace flow nodes

## Goal

Make Studio workflow visualization use named flow frames instead of showing flow containers as ordinary flow-step cards. A flow container should frame its visible workflow steps and those steps' local option nodes; `single` and `multi` steps should not become frames solely because they own choices.

## Requirements

- Keep YAML and generated script runtime unchanged.
- Keep option/action nodes visible and draggable.
- Render flow containers with `data.stepFrame` as large frame nodes.
- Show the step/flow name in the frame header.
- Place visible workflow steps plus their local single/multi/post option nodes inside the nearest flow frame.
- Keep `single` and `multi` steps as ordinary nodes; do not frame them just because they own options.
- Hide the flow-frame root-to-first-step containment edge instead of drawing it as a normal flow line inside the frame.
- Preserve layout save by converting frame-node visual positions back to logical plan positions.
- Preserve draft export behavior.

## Acceptance Criteria

- [x] Flow-frame nodes render as frames, not small flow cards.
- [x] Frame headers display the flow label/name, flow step count, and option counts.
- [x] Option nodes remain inside the enclosing flow frame.
- [x] Single/multi steps do not render as frames solely because they own choices.
- [x] Root-to-first-step containment edges inside a flow frame are not rendered as normal flow lines.
- [x] Dragging/saving step frames stores logical plan positions, not shifted frame top-left positions.
- [x] Studio tests cover frame positioning and save/drag helpers.
- [x] Typecheck, lint, tests, build, and `bash -n dist/dot.sh` pass.

## Out of Scope

- Runtime scenario branching.
- New YAML schema for workflow/action/precheck.
- Direct semantic YAML editing from Studio.

## Technical Notes

- Built on the previous `data.stepFrame` projection.
- Main work is in `src/studio/main.tsx` and `src/studio/studio.css`.
