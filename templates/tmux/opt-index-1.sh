# 基础配置: 窗口和面板索引从 1 开始
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Index from 1
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
TMUX_CONF
log_info "窗口索引从 1 开始"
