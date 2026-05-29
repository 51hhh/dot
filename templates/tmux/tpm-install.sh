# 安装 TPM (Tmux Plugin Manager)
log_info "安装 TPM 插件管理器..."

TPM_DIR="$HOME/.tmux/plugins/tpm"
if [ -d "$TPM_DIR" ]; then
  log_info "TPM 已存在，更新中..."
  cd "$TPM_DIR" && git pull
else
  git clone https://github.com/tmux-plugins/tpm "$TPM_DIR"
fi

# 添加 TPM 声明到 tmux.conf
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# TPM - Tmux Plugin Manager
set -g @plugin 'tmux-plugins/tpm'
set-environment -g TMUX_PLUGIN_MANAGER_PATH '~/.tmux/plugins'
TMUX_CONF

log_ok "TPM 安装完成"
