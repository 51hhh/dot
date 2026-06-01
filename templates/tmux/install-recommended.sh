# 推荐 Tmux 安装配置（对齐原 Tmux.sh）
log_info "应用推荐 Tmux 安装配置..."

RECOMMENDED_TMUX_CONF="$HOME/.tmux.conf"
RECOMMENDED_TPM_PATH="$HOME/.tmux/plugins"
RECOMMENDED_RESURRECT_DIR="$HOME/.tmux/resurrect"
mkdir -p "$RECOMMENDED_RESURRECT_DIR"

if [[ -f "$RECOMMENDED_TMUX_CONF" ]]; then
  cp "$RECOMMENDED_TMUX_CONF" "${RECOMMENDED_TMUX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  log_info "已备份原有配置"
fi

cat > "$RECOMMENDED_TMUX_CONF" << TMUX_CONF
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Tmux 推荐配置 - 由 dot 自动生成
#  DO NOT EDIT - 重新运行脚本即可覆盖
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# List of plugins
set -g @plugin 'tmux-plugins/tpm'
set-environment -g TMUX_PLUGIN_MANAGER_PATH "$RECOMMENDED_TPM_PATH"
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'christoomey/vim-tmux-navigator'
set -g @plugin 'tmux-plugins/tmux-yank'
set -g @plugin 'jimeh/tmuxifier'
set -g @plugin 'tmux-plugins/tmux-cpu'
set -g @plugin 'tmux-plugins/tmux-battery'
set -g @plugin 'catppuccin/tmux'

# tmux-resurrect: 保存和恢复 tmux 会话
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @resurrect-dir '$RECOMMENDED_RESURRECT_DIR'
set -g @resurrect-capture-pane-contents 'on'
set -g @resurrect-save-shell-history 'on'

# tmux-continuum: 自动定期保存会话
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @continuum-restore 'on'
set -g @continuum-save-interval '15'

# catppuccin theme options (must be set BEFORE TPM runs catppuccin)
set -g @catppuccin_window_status_style "rounded"

# Status line modules
set -g status-right-length 200
set -g status-left-length 200
set -g status-left ""
set -g status-right "#{E:@catppuccin_status_application}"
set -agF status-right "#{E:@catppuccin_status_cpu}"
set -agF status-right "#{E:@catppuccin_status_ram}"
set -ag status-right "#{E:@catppuccin_status_session}"
set -ag status-right "#{E:@catppuccin_status_uptime}"
set -agF status-right "#{E:@catppuccin_status_battery}"

# non-plugin options
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",*256col*:Tc"
set -g base-index 1
set -g pane-base-index 1
set -g renumber-windows on
set -g mouse on

# visual mode
set-window-option -g mode-keys vi
bind-key -T copy-mode-vi v send-keys -X begin-selection
bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle
bind-key -T copy-mode-vi y send-keys -X copy-selection-and-cancel

# keymaps
unbind C-b
set -g prefix C-Space
bind r source-file ~/.tmux.conf \; display "reloaded"

# Initialize TMUX plugin manager (keep this line at the very bottom of tmux.conf)
run '~/.tmux/plugins/tpm/tpm'
TMUX_CONF

log_ok "推荐 Tmux 配置已写入 $RECOMMENDED_TMUX_CONF"
