# 基础配置: 快速重载
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Reload config
bind r source-file ~/.tmux.conf \; display "Config reloaded!"
TMUX_CONF
log_info "已配置 prefix+r 重载配置"
