# 跳过 Oh My Zsh 安装
OH_MY_ZSH_DIR="${ZSH:-$HOME/.oh-my-zsh}"

if [[ -f "$OH_MY_ZSH_DIR/oh-my-zsh.sh" ]]; then
  log_ok "已选择跳过 Oh My Zsh 安装；当前检测到: $OH_MY_ZSH_DIR"
else
  log_warn "已选择跳过 Oh My Zsh 安装，但未检测到 $OH_MY_ZSH_DIR/oh-my-zsh.sh。"
  log_warn "后续 zshrc 配置如引用 Oh My Zsh，请先手动安装或返回选择安装。"
fi
