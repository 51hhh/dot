# 插件: tmux-continuum (自动保存/恢复)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# tmux-continuum: 自动定期保存会话
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @continuum-restore 'on'
set -g @continuum-save-interval '15'
TMUX_CONF
log_info "已添加 tmux-continuum 插件 (每15分钟自动保存)"
