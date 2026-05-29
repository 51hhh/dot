# 状态栏: 简洁风格
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Status bar - minimal
set -g status-position bottom
set -g status-style 'bg=#1a1a2e fg=#e0e0e0'
set -g status-left-length 20
set -g status-right-length 40
set -g status-left '#[fg=#89b4fa,bold] #S #[fg=#45475a]│ '
set -g status-right '#[fg=#45475a]│ #[fg=#a6e3a1]%H:%M '
set -g window-status-format ' #I:#W '
set -g window-status-current-format '#[fg=#1a1a2e,bg=#89b4fa,bold] #I:#W '
TMUX_CONF
log_info "状态栏: 简洁风格"
