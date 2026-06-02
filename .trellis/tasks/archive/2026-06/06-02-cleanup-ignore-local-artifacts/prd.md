# chore: 忽略本地辅助文件并清理备份分支

## 目标

将当前工作树中的本地辅助文件和旧归档目录加入 `.gitignore`，删除历史改写后不再需要的本地备份分支，并推送最新 `master`。

## 已知信息

* 当前未跟踪项包括 `.agents/`、`.codex/`、`Tmux.sh`、`docs/superpowers/` 和旧归档目录。
* 历史提交信息已中文化并推送到 `origin/master`。
* 本地存在历史改写前的备份分支 `backup-before-chinese-commit-messages`。

## 要求

* 更新 `.gitignore`，忽略用户指定的本地辅助项。
* 不删除这些本地文件本身。
* 删除无用本地备份分支。
* 检查工作树和提交信息格式。
* 提交并推送到 `origin/master`。

## 验收标准

* [x] 指定本地辅助项不再出现在普通 `git status --short` 中。
* [x] 本地备份分支已删除。
* [x] `.gitignore` 更新已提交。
* [x] 最新 `master` 已推送到 `origin/master`。
