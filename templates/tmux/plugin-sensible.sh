# 插件: tmux-sensible (合理默认配置)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# tmux-sensible: 一套合理的默认设置
set -g @plugin 'tmux-plugins/tmux-sensible'
TMUX_CONF
log_info "已添加 tmux-sensible 插件"
