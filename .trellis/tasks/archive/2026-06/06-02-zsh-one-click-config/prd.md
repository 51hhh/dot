# PRD: 添加 Zsh 一键配置流程

## 背景

项目当前已有 `dot > Tmux 一键配置` flow，用户希望新增 `dot > Zsh 一键配置`，用于安装 zsh、Oh My Zsh、Powerlevel10k、常用插件，并写入推荐 `.zshrc`。

用户给定目标流程：

- `sudo apt update`
- `sudo apt install zsh`
- 安装 Oh My Zsh
- 安装 Powerlevel10k，可选 GitHub 或 Gitee 源
- 可选执行 `chsh -s $(which zsh)`
- 安装 `zsh-autosuggestions` 和 `zsh-syntax-highlighting`
- 修改 `~/.zshrc`
- 最后提示用户手动进入 zsh、source 或运行 `p10k configure`

## 目标

- 在 `configs/dot.yaml` 中新增顶层 `Zsh 一键配置` flow。
- 新增 Zsh 安装和配置脚本模板。
- 调用 Oh My Zsh installer 时使用非交互方式，避免自动切换 shell 或强制修改默认 shell。
- Powerlevel10k 支持 GitHub 和 Gitee 下载源。
- 插件安装幂等：已存在目录时跳过或提示。
- `.zshrc` 写入幂等，包含 Oh My Zsh 基础 block、Powerlevel10k 主题、插件列表和 `.p10k.zsh` source。
- 默认 shell 修改作为独立可选步骤，不在推荐流程里静默执行。
- 最后只显示手动执行提示，不在 bash 运行时 `source ~/.zshrc` 或 `exec zsh`。
- Studio Plan Canvas 在新增第二个顶层 flow 后仍不能出现默认布局节点重叠。
- 增加测试覆盖菜单、模板、生成脚本内容和 standalone build。

## 非目标

- 不实现跨发行版包管理器支持，首版只做 apt。
- 不安装具体 Nerd Font 文件，仅输出字体/Powerlevel10k 提示。
- 不自动运行 `p10k configure`。
- 不从非官方镜像安装 zsh 插件，除 Powerlevel10k Gitee 选项外保持 GitHub 源。

## 验收标准

- [x] `dot > Zsh 一键配置` 出现在生成计划和脚本中。
- [x] Zsh flow 至少包含 apt 安装、Oh My Zsh、Powerlevel10k 源选择、插件安装、`.zshrc` 推荐配置、默认 shell 可选修改、最终提示。
- [x] Oh My Zsh 安装脚本使用 `RUNZSH=no CHSH=no` 和 unattended 参数。
- [x] `.zshrc` 配置脚本不会在 bash 中 source `.zshrc`。
- [x] `zsh-syntax-highlighting` 在 plugins 列表最后。
- [x] Studio 默认和展开布局在新增 Zsh 顶层 flow 后不重叠。
- [x] `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 通过。
- [x] 重新生成 `dist/dot.sh` 后通过 `bash -n` 和 dry-run smoke。
