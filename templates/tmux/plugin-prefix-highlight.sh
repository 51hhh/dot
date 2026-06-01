# 插件: tmux-prefix-highlight (前缀键状态提示)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# tmux-prefix-highlight: 在状态栏显示 prefix 键是否激活
set -g @plugin 'tmux-plugins/tmux-prefix-highlight'
set -g @prefix_highlight_show_copy_mode 'on'
set -g @prefix_highlight_copy_mode_attr 'fg=colour11,bold'
TMUX_CONF
log_info "已添加 tmux-prefix-highlight 插件（状态栏显示前缀键激活状态）"
