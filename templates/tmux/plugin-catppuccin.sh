# 插件: catppuccin/tmux (Catppuccin 主题)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# catppuccin/tmux: 柔和 pastel 风格主题
# 主题插件通常会改写状态栏样式；建议不要同时启用多个主题。
set -g @plugin 'catppuccin/tmux'
set -g @catppuccin_flavor 'mocha'
set -g @catppuccin_window_status_style 'rounded'
TMUX_CONF
log_info "已添加 catppuccin/tmux 主题插件（建议不要与其他主题同时启用）"
