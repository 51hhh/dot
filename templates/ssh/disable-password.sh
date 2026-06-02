# 禁止密码登录
SSHD_CONFIG="/etc/ssh/sshd_config"

# 运行时检查：必须先有可用的 SSH 密钥
has_key=0
for f in "$HOME"/.ssh/id_*; do
  if [[ -f "$f" && ! "$f" == *.pub ]]; then
    has_key=1
    break
  fi
done
if [[ -f "$HOME/.ssh/authorized_keys" ]] && [[ -s "$HOME/.ssh/authorized_keys" ]]; then
  has_key=1
fi
if [[ "$has_key" -eq 0 ]]; then
  log_error "未检测到任何 SSH 密钥，请先生成密钥或导入授权密钥"
  return 1
fi

# 检查当前状态，幂等跳过
if grep -Eq '^[[:space:]]*PasswordAuthentication[[:space:]]+no' "$SSHD_CONFIG" \
   && grep -Eq '^[[:space:]]*ChallengeResponseAuthentication[[:space:]]+no' "$SSHD_CONFIG" \
   && grep -Eq '^[[:space:]]*KbdInteractiveAuthentication[[:space:]]+no' "$SSHD_CONFIG"; then
  log_info "密码登录已处于禁止状态，跳过。"
  return 0
fi

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"
log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

dot_sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
dot_sudo sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$SSHD_CONFIG"
dot_sudo sed -i 's/^#\?KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' "$SSHD_CONFIG"

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，已恢复备份。"
  dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG"
  return 1
fi

dot_sudo systemctl restart sshd 2>/dev/null || dot_sudo systemctl restart ssh 2>/dev/null
sleep 1
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "已禁止密码登录（PasswordAuthentication=no, ChallengeResponseAuthentication=no, KbdInteractiveAuthentication=no）"
else
  log_warn "SSH 服务重启后未检测到活跃状态，请手动检查: systemctl status ssh"
fi
