# 插件: tmux-cpu (CPU/内存状态栏)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# tmux-cpu: 在状态栏展示 CPU 与内存使用情况
set -g @plugin 'tmux-plugins/tmux-cpu'
TMUX_CONF
log_info "已添加 tmux-cpu 插件（状态栏 CPU/内存统计）"
