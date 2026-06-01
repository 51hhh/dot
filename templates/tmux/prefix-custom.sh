# 前缀键: 自定义 ({{custom_prefix:C-x}})
CUSTOM_PREFIX="{{custom_prefix:C-x}}"
cat >> "$HOME/.tmux.conf" << TMUX_CONF

# Prefix: Custom
unbind C-b
set -g prefix $CUSTOM_PREFIX
TMUX_CONF
log_info "前缀键设置为 $CUSTOM_PREFIX"
