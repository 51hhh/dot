# 配置 SSH Agent 自动启动
log_info "配置 SSH Agent 自动启动..."

# 检测 shell 并选择 rc 文件
RC_FILE=""
if [[ -f "$HOME/.zshrc" ]] || [[ "$(basename "${SHELL:-}")" == "zsh" ]]; then
  RC_FILE="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]] || [[ "$(basename "${SHELL:-}")" == "bash" ]]; then
  RC_FILE="$HOME/.bashrc"
else
  log_warn "未检测到 .zshrc 或 .bashrc，请手动在 shell 配置中添加 SSH Agent 自动启动。"
  return 1
fi

if [[ ! -f "$RC_FILE" ]]; then
  touch "$RC_FILE"
fi

# 幂等：检查是否已有 SSH Agent 自动启动配置
if grep -q 'SSH_AUTH_SOCK' "$RC_FILE" 2>/dev/null; then
  log_info "$RC_FILE 中已存在 SSH Agent 配置，跳过。"
  return 0
fi

# 备份 rc 文件
cp "$RC_FILE" "${RC_FILE}.bak.$(date +%Y%m%d%H%M%S)"
log_info "已备份 $RC_FILE"

# 追加自动启动逻辑
cat >> "$RC_FILE" << 'SSH_AGENT_EOF'

# SSH Agent auto-start (added by dot)
if [ -z "$SSH_AUTH_SOCK" ]; then
    eval "$(ssh-agent -s)" > /dev/null 2>&1
fi
SSH_AGENT_EOF

log_ok "SSH Agent 自动启动已添加到 $RC_FILE"
