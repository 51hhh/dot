# 插件: tmux-battery (电池状态栏)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# tmux-battery: 在状态栏展示电池电量与充电状态
set -g @plugin 'tmux-plugins/tmux-battery'
TMUX_CONF
log_info "已添加 tmux-battery 插件（笔记本/移动设备电池状态）"
