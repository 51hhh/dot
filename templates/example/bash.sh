# Bash 优化配置
log_info "正在配置 Bash..."

BASHRC="$HOME/.bashrc"

cat >> "$BASHRC" << 'ALIAS_BLOCK'

# ── dot aliases ──
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias ...='cd ../..'
alias grep='grep --color=auto'
alias df='df -h'
alias du='du -h'
alias gs='git status'
alias gd='git diff'
alias gl='git log --oneline --graph'
ALIAS_BLOCK

log_ok "Bash 配置完成"
