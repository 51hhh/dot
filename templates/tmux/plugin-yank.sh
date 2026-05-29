# 插件: tmux-yank (系统剪贴板集成)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# tmux-yank: 复制内容同步到系统剪贴板
set -g @plugin 'tmux-plugins/tmux-yank'
set -g @yank_selection_mouse 'clipboard'
TMUX_CONF
log_info "已添加 tmux-yank 插件"
