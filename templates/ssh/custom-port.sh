# 自定义 SSH 端口
SSHD_CONFIG="/etc/ssh/sshd_config"
PORT_VALUE="{{ssh_port}}"

# 如果端口变量为空，使用默认值
if [[ -z "$PORT_VALUE" ]]; then
  PORT_VALUE="2222"
fi

# 幂等检查
if grep -Eq "^[[:space:]]*Port[[:space:]]+${PORT_VALUE}" "$SSHD_CONFIG"; then
  log_info "SSH 端口已设置为 ${PORT_VALUE}，跳过。"
  return 0
fi

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"
log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

dot_sudo sed -i "s/^#\?Port.*/Port ${PORT_VALUE}/" "$SSHD_CONFIG"

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，已恢复备份。"
  dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG"
  return 1
fi

dot_sudo systemctl restart sshd 2>/dev/null || dot_sudo systemctl restart ssh 2>/dev/null
sleep 1
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "SSH 端口已改为 ${PORT_VALUE}"
  log_warn "改端口后请同步更新防火墙和云安全组"
else
  log_warn "SSH 服务重启后未检测到活跃状态，请手动检查: systemctl status ssh"
fi
