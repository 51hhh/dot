# 前缀键: Ctrl+A (screen 风格)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Prefix: Ctrl+A (screen style)
unbind C-b
set -g prefix C-a
bind C-a send-prefix
TMUX_CONF
log_info "前缀键设置为 Ctrl+A"
