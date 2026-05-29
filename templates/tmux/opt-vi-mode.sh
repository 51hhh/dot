# 基础配置: Vi 模式
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Vi mode for copy mode
setw -g mode-keys vi
bind -T copy-mode-vi v send -X begin-selection
bind -T copy-mode-vi y send -X copy-selection-and-cancel
bind -T copy-mode-vi Escape send -X cancel
TMUX_CONF
log_info "已启用 Vi 模式"
