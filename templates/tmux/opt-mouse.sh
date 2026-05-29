# 基础配置: 鼠标支持
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Mouse support
set -g mouse on
TMUX_CONF
log_info "已启用鼠标支持"
