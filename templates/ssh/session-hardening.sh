# 会话安全加固
SSHD_CONFIG="/etc/ssh/sshd_config"

SETTINGS=(
  "MaxAuthTries 3"
  "LoginGraceTime 30"
  "ClientAliveInterval 300"
  "ClientAliveCountMax 2"
  "MaxSessions 10"
  "MaxStartups 10:30:60"
  "PermitEmptyPasswords no"
  "X11Forwarding no"
  "AllowTcpForwarding no"
)

# 幂等检查：所有设置是否已存在
all_set=1
for setting in "${SETTINGS[@]}"; do
  key="${setting%% *}"
  value="${setting#* }"
  if ! grep -Eq "^[[:space:]]*${key}[[:space:]]+${value}" "$SSHD_CONFIG"; then
    all_set=0
    break
  fi
done

if [[ "$all_set" -eq 1 ]]; then
  log_info "会话安全加固已全部配置，跳过。"
  return 0
fi

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"
log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

for setting in "${SETTINGS[@]}"; do
  key="${setting%% *}"
  value="${setting#* }"
  dot_sudo sed -i "s/^#\?${key}.*/${setting}/" "$SSHD_CONFIG"
done

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，已恢复备份。"
  dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG"
  return 1
fi

dot_sudo systemctl restart sshd 2>/dev/null || dot_sudo systemctl restart ssh 2>/dev/null
sleep 1
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "已应用会话安全加固配置"
else
  log_warn "SSH 服务重启后未检测到活跃状态，请手动检查: systemctl status ssh"
fi
