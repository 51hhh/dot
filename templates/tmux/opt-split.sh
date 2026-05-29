# 基础配置: 直觉化分割快捷键
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# Split with | and -
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
unbind '"'
unbind %

# Navigate panes with Alt+Arrow
bind -n M-Left select-pane -L
bind -n M-Right select-pane -R
bind -n M-Up select-pane -U
bind -n M-Down select-pane -D
TMUX_CONF
log_info "已配置直觉化分割快捷键"
