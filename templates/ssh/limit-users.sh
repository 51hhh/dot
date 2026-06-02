# 限制登录用户
SSHD_CONFIG="/etc/ssh/sshd_config"
USERS="{{allowed_users}}"

# 如果变量为空，跳过
if [[ -z "$USERS" ]]; then
  log_info "未指定允许登录的用户，跳过 AllowUsers 设置。"
  return 0
fi

# 幂等检查：AllowUsers 已设置为相同值
if grep -Eq "^[[:space:]]*AllowUsers[[:space:]]+${USERS}" "$SSHD_CONFIG"; then
  log_info "AllowUsers 已设置为 ${USERS}，跳过。"
  return 0
fi

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"
log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

# 移除已有 AllowUsers 行，再追加新行
dot_sudo sed -i '/^#\?AllowUsers/d' "$SSHD_CONFIG"
echo "AllowUsers ${USERS}" | dot_sudo tee -a "$SSHD_CONFIG" >/dev/null

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，已恢复备份。"
  dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG"
  return 1
fi

dot_sudo systemctl restart sshd 2>/dev/null || dot_sudo systemctl restart ssh 2>/dev/null
sleep 1
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "已限制 SSH 登录用户为: ${USERS}"
else
  log_warn "SSH 服务重启后未检测到活跃状态，请手动检查: systemctl status ssh"
fi
