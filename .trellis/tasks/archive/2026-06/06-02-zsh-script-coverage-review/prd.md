# 补充 Zsh 脚本覆盖 review

## 背景

`Zsh 一键配置` 已加入主安装菜单，并新增了一组 `templates/zsh/` 脚本。当前测试已经覆盖主流程、关键安装脚本、Oh My Zsh、Powerlevel10k、插件配置、zshrc 写入和最终提示。

本任务用于复核新增脚本的测试覆盖，补齐漏掉的脚本内容断言，并运行项目质量检查，确认新增脚本可被生成、语法检查和 dry-run 覆盖。

## 范围

- Review `configs/dot.yaml` 中的 Zsh flow 结构。
- Review `templates/zsh/` 新增脚本是否被生成脚本测试覆盖。
- 补充缺失的 CLI 生成脚本断言。
- 运行 typecheck、lint、test、build、生成脚本语法检查和 dry-run smoke。

## 非目标

- 不修改 Zsh 安装流程和脚本行为。
- 不调整 Studio 可视化实现。
- 不引入新的运行时依赖。

## 验收

- 所有新增 Zsh 脚本在测试中至少有菜单/生成结构覆盖或脚本内容覆盖。
- `install-skip.sh` 和 `chsh-skip.sh` 的关键输出/命令被生成脚本测试断言覆盖。
- 完整项目检查通过。
