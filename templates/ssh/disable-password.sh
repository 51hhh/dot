# 禁止密码登录
SSHD_CONFIG="/etc/ssh/sshd_config"

if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  SSH_TARGET_USER="$SUDO_USER"
else
  SSH_TARGET_USER="${USER:-$(id -un)}"
fi

SSH_TARGET_HOME="$HOME"
if command -v getent >/dev/null 2>&1; then
  ssh_target_home_lookup="$(getent passwd "$SSH_TARGET_USER" 2>/dev/null | awk -F: '{print $6}')"
  if [[ -n "$ssh_target_home_lookup" ]]; then
    SSH_TARGET_HOME="$ssh_target_home_lookup"
  fi
fi

AUTHORIZED_KEYS="${SSH_TARGET_HOME}/.ssh/authorized_keys"
if [[ ! -s "$AUTHORIZED_KEYS" ]]; then
  log_error "未检测到 $SSH_TARGET_USER 的 authorized_keys: $AUTHORIZED_KEYS"
  log_error "禁止密码登录前，请先为目标用户导入可用公钥，并保持一个已验证的 SSH 会话。"
  return 1
fi

if [[ "${DOT_CONFIRM_SSH_DISABLE_PASSWORD:-}" != "1" ]]; then
  if [[ -t 0 ]]; then
    log_warn "即将禁止 SSH 密码登录。请确认 $SSH_TARGET_USER 已可用密钥登录。"
    printf '请输入 DISABLE_PASSWORD 继续: '
    read -r confirm_disable_password
    if [[ "$confirm_disable_password" != "DISABLE_PASSWORD" ]]; then
      log_warn "未确认禁止密码登录，已跳过。"
      return 0
    fi
  else
    log_error "非交互执行禁止密码登录需要设置 DOT_CONFIRM_SSH_DISABLE_PASSWORD=1。"
    return 1
  fi
fi

dot_sshd_set_option() {
  local key="$1" value="$2" file="$3"
  if ! dot_sudo sed -E -i "/^[[:space:]]*#?[[:space:]]*${key}[[:space:]]+/d" "$file"; then
    log_error "更新 $file 中的 $key 失败。"
    return 1
  fi
  if ! printf '%s %s\n' "$key" "$value" | dot_sudo tee -a "$file" >/dev/null; then
    log_error "写入 $file 中的 $key 失败。"
    return 1
  fi
}

# 检查当前状态，幂等跳过
if grep -Eq '^[[:space:]]*PasswordAuthentication[[:space:]]+no' "$SSHD_CONFIG" \
   && grep -Eq '^[[:space:]]*ChallengeResponseAuthentication[[:space:]]+no' "$SSHD_CONFIG" \
   && grep -Eq '^[[:space:]]*KbdInteractiveAuthentication[[:space:]]+no' "$SSHD_CONFIG"; then
  log_info "密码登录已处于禁止状态，跳过。"
  return 0
fi

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
if ! dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"; then
  log_error "备份 sshd_config 失败。"
  return 1
fi
log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

dot_sshd_set_option "PasswordAuthentication" "no" "$SSHD_CONFIG" || return 1
dot_sshd_set_option "ChallengeResponseAuthentication" "no" "$SSHD_CONFIG" || return 1
dot_sshd_set_option "KbdInteractiveAuthentication" "no" "$SSHD_CONFIG" || return 1

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，已恢复备份。"
  dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG" || log_error "恢复 sshd_config 备份失败，请手动恢复。"
  return 1
fi

dot_sudo systemctl restart sshd 2>/dev/null || dot_sudo systemctl restart ssh 2>/dev/null
sleep 1
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "已禁止密码登录（PasswordAuthentication=no, ChallengeResponseAuthentication=no, KbdInteractiveAuthentication=no）"
else
  log_warn "SSH 服务重启后未检测到活跃状态，请手动检查: systemctl status ssh"
fi
