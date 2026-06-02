# 禁止 root 密码登录
SSHD_CONFIG="/etc/ssh/sshd_config"

# 幂等检查
if grep -Eq '^[[:space:]]*PermitRootLogin[[:space:]]+prohibit-password' "$SSHD_CONFIG"; then
  log_info "PermitRootLogin 已设置为 prohibit-password，跳过。"
  return 0
fi

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"
log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

dot_sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，已恢复备份。"
  dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG"
  return 1
fi

dot_sudo systemctl restart sshd 2>/dev/null || dot_sudo systemctl restart ssh 2>/dev/null
sleep 1
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "已设置 PermitRootLogin prohibit-password"
  log_info "已设置 PermitRootLogin prohibit-password（允许密钥登录 root，完全禁止请手动改为 no）"
else
  log_warn "SSH 服务重启后未检测到活跃状态，请手动检查: systemctl status ssh"
fi
