# 安装并配置 fail2ban
log_info "配置 fail2ban SSH 防暴力破解..."

# 检查 apt 可用性
if ! command -v apt-get >/dev/null 2>&1; then
  log_error "未找到 apt-get；请手动安装 fail2ban。"
  return 1
fi

# 幂等：已安装时跳过安装步骤
if command -v fail2ban-client >/dev/null 2>&1; then
  log_info "fail2ban 已安装，跳过 apt 安装。"
else
  if ! dot_sudo apt-get install -y fail2ban; then
    log_error "fail2ban 安装失败。"
    return 1
  fi
  log_ok "fail2ban 安装完成。"
fi

# 写入 jail.local（不修改 jail.conf）
JAIL_LOCAL="/etc/fail2ban/jail.local"
JAIL_CONTENT='[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600'

# 幂等：仅在配置缺失或不完整时写入
if [[ -f "$JAIL_LOCAL" ]] && grep -q '\[sshd\]' "$JAIL_LOCAL" && grep -q 'enabled = true' "$JAIL_LOCAL"; then
  log_info "fail2ban SSH jail 已配置，跳过写入。"
else
  if ! echo "$JAIL_CONTENT" | dot_sudo tee "$JAIL_LOCAL" > /dev/null; then
    log_error "无法写入 ${JAIL_LOCAL}。"
    return 1
  fi
  log_ok "已写入 ${JAIL_LOCAL}。"
fi

# 启用并启动 fail2ban 服务
if ! dot_sudo systemctl enable --now fail2ban; then
  log_warn "fail2ban 服务启动失败，请手动检查: systemctl status fail2ban"
  return 1
fi

# 验证 jail 状态
if dot_sudo fail2ban-client status sshd >/dev/null 2>&1; then
  log_ok "fail2ban SSH jail 已启用并运行。"
else
  log_warn "fail2ban 已启动但 SSH jail 状态未知，请手动检查: sudo fail2ban-client status sshd"
fi
