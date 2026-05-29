# TPM 初始化（必须放在 tmux.conf 最后）
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Initialize TPM (keep at the bottom of tmux.conf)
run '~/.tmux/plugins/tpm/tpm'
TMUX_CONF

# 安装所有插件
log_info "安装 Tmux 插件..."
"$HOME/.tmux/plugins/tpm/bin/install_plugins" 2>/dev/null || true
log_ok "插件安装完成"
