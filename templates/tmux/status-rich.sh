# 状态栏: 信息丰富风格
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Status bar - rich info
set -g status-position bottom
set -g status-style 'bg=#1e1e2e fg=#cdd6f4'
set -g status-left-length 30
set -g status-right-length 60
set -g status-left '#[fg=#89b4fa,bold] #S #[fg=#585b70]│ #[fg=#a6e3a1]#H #[fg=#585b70]│ '
set -g status-right '#[fg=#f9e2af]CPU:#{cpu_percentage} #[fg=#585b70]│ #[fg=#89b4fa]MEM:#{mem_percentage} #[fg=#585b70]│ #[fg=#a6e3a1]%m-%d %H:%M:%S '
set -g window-status-format ' #I:#W#{?window_zoomed_flag, Z,} '
set -g window-status-current-format '#[fg=#1e1e2e,bg=#89b4fa,bold] #I:#W#[fg=#1e1e2e,bg=#89b4fa]#{?window_zoomed_flag, Z,} '
set -g window-status-separator ''
TMUX_CONF
log_info "状态栏: 信息丰富风格"
