# 前缀键: 自定义 ({{custom_prefix:Ctrl+X}})
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Prefix: Custom
unbind C-b
set -g prefix {{custom_prefix:Ctrl+X}}
TMUX_CONF
log_info "前缀键设置为 {{custom_prefix:Ctrl+X}}"
