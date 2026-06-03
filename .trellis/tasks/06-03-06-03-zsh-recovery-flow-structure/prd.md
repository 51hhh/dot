# PRD: 调整 Zsh 恢复流程结构

## Goal

Apply the Studio draft structure change to real source config, not Studio layout overlay:

- Add a `flow` structure connection from `zsh-install` to `zsh-recovery`.
- Keep build, plan, Studio projection, and generated script behavior consistent.

## Requirements

- Modify `configs/dot.yaml` source menu structure.
- Do not write semantic structure changes only to overlay/positions.
- Ensure Zsh install/config/recovery items remain under one Zsh project flow.
- Update tests that assert root/Zsh metadata or plan structure.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Regenerate `dist/dot.sh` and run `bash -n dist/dot.sh`.

## Input Draft

```json
{
  "changedOperations": [
    {
      "action": "add",
      "type": "flow",
      "from": "zsh-install",
      "to": "zsh-recovery"
    }
  ],
  "overlayPatchDraft": { "version": 2 },
  "sourceOnlyOperations": 1
}
```
