# 插件: tmux-open (快速打开文件/URL)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# tmux-open: 按 o 打开选中的文件/路径，Ctrl+o 打开 URL
set -g @plugin 'tmux-plugins/tmux-open'
TMUX_CONF
log_info "已添加 tmux-open 插件"
