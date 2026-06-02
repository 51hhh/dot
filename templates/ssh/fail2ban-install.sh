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
# 只更新 [sshd] 段，保留用户已有的其他 jail 配置
JAIL_LOCAL="/etc/fail2ban/jail.local"
SSHD_JAIL='[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600'

if [[ -f "$JAIL_LOCAL" ]] && grep -q '\[sshd\]' "$JAIL_LOCAL" && grep -q 'enabled = true' "$JAIL_LOCAL"; then
  log_info "fail2ban SSH jail 已配置，跳过写入。"
else
  if [[ -f "$JAIL_LOCAL" ]]; then
    # 已有 jail.local：备份后用 awk 替换或追加 [sshd] 段
    dot_sudo cp "$JAIL_LOCAL" "${JAIL_LOCAL}.bak.$(date +%Y%m%d%H%M%S)"
    # 删除旧的 [sshd] 段（从 [sshd] 到下一个 [ 开头或文件末尾）
    dot_sudo awk '/^\[sshd\]/{found=1; next} /^\[/{found=0} !found' "$JAIL_LOCAL" > "${JAIL_LOCAL}.tmp"
    dot_sudo mv "${JAIL_LOCAL}.tmp" "$JAIL_LOCAL"
    # 追加新的 [sshd] 段
    printf '\n%s\n' "$SSHD_JAIL" | dot_sudo tee -a "$JAIL_LOCAL" >/dev/null
  else
    # 不存在：直接创建
    printf '%s\n' "$SSHD_JAIL" | dot_sudo tee "$JAIL_LOCAL" >/dev/null
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
