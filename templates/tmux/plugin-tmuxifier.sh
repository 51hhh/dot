# 安装 tmuxifier 插件
log_info "添加 tmuxifier 插件（会话与窗口布局管理）..."
echo "set -g @plugin 'jimeh/tmuxifier'" >> "$TMUX_CONF"
log_ok "已添加 jimeh/tmuxifier 插件"
