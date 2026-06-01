# 插件: vim-tmux-navigator (Vim/Neovim 与 tmux 无缝导航)
cat >> "$HOME/.tmux.conf" << 'TMUX_CONF'

# vim-tmux-navigator: 在 Vim/Neovim 与 tmux pane 间使用一致快捷键导航
set -g @plugin 'christoomey/vim-tmux-navigator'
TMUX_CONF
log_info "已添加 vim-tmux-navigator 插件（Vim/Neovim-tmux pane 导航）"
