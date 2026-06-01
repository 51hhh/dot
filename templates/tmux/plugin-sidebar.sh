# 插件: tmux-sidebar (文件树侧边栏)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# tmux-sidebar: 侧边栏文件树与项目导航
set -g @plugin 'tmux-plugins/tmux-sidebar'
TMUX_CONF
log_info "已添加 tmux-sidebar 插件（文件树侧边栏/导航）"
