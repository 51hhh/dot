# 分析 Zsh 流程完善与卸载能力

## Goal

对照当前 Tmux 一键配置流程，评估 Zsh 一键配置是否合理完善，识别需要补充的个性化可选项、环境/插件/配置检查能力，以及卸载/恢复能力，为后续实现提供清晰范围。

## Questions

- 当前 Zsh flow 哪些步骤是必选，哪些是可选？
- 相比 Tmux，Zsh 是否缺少推荐配置、检查、卸载、恢复、跳过分支？
- 用户个性化选项应该放在哪里，哪些应做成 single/multi/flow？
- 检查已安装环境、插件和配置应该如何设计？
- 卸载功能应删除哪些内容，哪些必须只提示用户手动确认？

## Implementation Scope

- 已按用户后续指令从纯分析任务升级为实现任务。
- 修正范围包含 Zsh 菜单配置、Zsh shell 模板、生成脚本相关测试和必要规范记录。
- 不修改 SSH 实现逻辑；当前工作区中的 SSH 改动属于并行任务上下文。

## Expected Output

- 当前流程评价。
- 需要新增的菜单结构建议。
- 卸载和检查脚本设计建议。
- 后续实现优先级。

## Implemented Changes

- Zsh 安装 flow 新增环境诊断。
- Oh My Zsh、Powerlevel10k、插件和 zshrc 配置改为可选步骤。
- Zsh 卸载与恢复拆成独立顶层菜单 `zsh-recovery`，避免普通 `zsh` 安装分支包含卸载动作。
- 卸载动作默认移动到 `~/.dot-backups/zsh/`，不直接删除用户目录。
- `apt remove zsh` 增加默认 shell 检查、交互确认和非交互环境变量确认。
- `chsh` 目标用户优先识别 `SUDO_USER`，避免 sudo 下误改 root。
- Oh My Zsh 远程 installer 增加信任提示。
- 推荐 zshrc 写入补强失败检查，并根据已选/已安装插件与主题生成配置。
