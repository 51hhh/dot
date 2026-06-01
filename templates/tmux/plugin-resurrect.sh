# 插件: tmux-resurrect (会话保存/恢复)
RESURRECT_DIR="$HOME/.tmux/resurrect"
mkdir -p "$RESURRECT_DIR"
cat >> "$HOME/.tmux.conf" << TMUX_CONF

# tmux-resurrect: 保存和恢复 tmux 会话
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @resurrect-dir '$RESURRECT_DIR'
set -g @resurrect-capture-pane-contents 'on'
set -g @resurrect-save-shell-history 'on'
TMUX_CONF
log_info "已添加 tmux-resurrect 插件，保存目录: $RESURRECT_DIR"
