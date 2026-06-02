# 跳过 Powerlevel10k 主题安装
P10K_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"

if [[ -d "$P10K_DIR" ]]; then
  log_ok "已选择跳过 Powerlevel10k 安装；当前检测到: $P10K_DIR"
else
  log_warn "已选择跳过 Powerlevel10k 安装；将保留当前 ZSH_THEME。"
fi
