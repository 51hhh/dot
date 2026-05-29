# Tmux 安装配置
log_info "正在安装 Tmux..."
apt-get update -qq
apt-get install -y tmux

log_info "正在配置 Tmux..."
cat > "$HOME/.tmux.conf" << 'TMUX_CONF'
# Prefix
set -g prefix C-a
unbind C-b

# Mouse
set -g mouse on

# Index from 1
set -g base-index 1
setw -g pane-base-index 1

# Split
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"

# Reload
bind r source-file ~/.tmux.conf \; display "Reloaded!"

# Status bar
set -g status-style 'bg=#333333 fg=#5eacd3'
set -g status-left '#[fg=green]#S '
set -g status-right '#[fg=yellow]%Y-%m-%d %H:%M'
TMUX_CONF

log_ok "Tmux 配置完成"
