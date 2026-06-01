# 插件: dracula/tmux (Dracula 主题)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# dracula/tmux: 深色高对比主题
# 主题插件通常会改写状态栏样式；建议不要同时启用多个主题。
set -g @plugin 'dracula/tmux'
set -g @dracula-show-powerline true
set -g @dracula-show-flags true
set -g @dracula-show-left-icon session
TMUX_CONF
log_info "已添加 dracula/tmux 主题插件（建议不要与其他主题同时启用）"
