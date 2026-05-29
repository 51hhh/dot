# 前缀键: Ctrl+B (默认)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Prefix: Ctrl+B (default)
set -g prefix C-b
TMUX_CONF
log_info "前缀键使用默认 Ctrl+B"
