# 限制登录用户
SSHD_CONFIG="/etc/ssh/sshd_config"
USERS="{{allowed_users}}"

# 如果变量为空，跳过
if [[ -z "$USERS" ]]; then
  log_info "未指定允许登录的用户，跳过 AllowUsers 设置。"
  return 0
fi

read -r -a SSH_ALLOWED_USERS <<< "$USERS"
if [[ "${#SSH_ALLOWED_USERS[@]}" -eq 0 ]]; then
  log_info "未指定允许登录的用户，跳过 AllowUsers 设置。"
  return 0
fi

for ssh_allowed_user in "${SSH_ALLOWED_USERS[@]}"; do
  if ! [[ "$ssh_allowed_user" =~ ^[A-Za-z_][A-Za-z0-9_.-]*(@[A-Za-z0-9_.:-]+)?$ ]]; then
    log_error "AllowUsers 条目格式不安全: $ssh_allowed_user"
    log_error "请使用 Linux 用户名，或 user@host 形式。"
    return 1
  fi
done

USERS="${SSH_ALLOWED_USERS[*]}"

if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  SSH_CURRENT_USER="$SUDO_USER"
else
  SSH_CURRENT_USER="${USER:-$(id -un)}"
fi

current_user_allowed=0
for ssh_allowed_user in "${SSH_ALLOWED_USERS[@]}"; do
  ssh_allowed_name="${ssh_allowed_user%@*}"
  if [[ "$ssh_allowed_name" == "$SSH_CURRENT_USER" ]]; then
    current_user_allowed=1
    break
  fi
done

if [[ "$current_user_allowed" -ne 1 && "${DOT_CONFIRM_SSH_ALLOWUSERS_LOCKOUT:-}" != "1" ]]; then
  if [[ -t 0 ]]; then
    log_warn "AllowUsers 不包含当前目标用户 $SSH_CURRENT_USER，可能导致当前用户无法再 SSH 登录。"
    printf '请输入 ALLOWUSERS 继续: '
    read -r confirm_allowusers
    if [[ "$confirm_allowusers" != "ALLOWUSERS" ]]; then
      log_warn "未确认 AllowUsers 锁定风险，已跳过。"
      return 0
    fi
  else
    log_error "AllowUsers 不包含当前目标用户 $SSH_CURRENT_USER；非交互执行需设置 DOT_CONFIRM_SSH_ALLOWUSERS_LOCKOUT=1。"
    return 1
  fi
fi

# 幂等检查：AllowUsers 已设置为相同值
current_allow_users="$(grep -E '^[[:space:]]*AllowUsers[[:space:]]+' "$SSHD_CONFIG" 2>/dev/null | tail -n 1 | sed -E 's/^[[:space:]]*AllowUsers[[:space:]]+//')"
if [[ "$current_allow_users" == "$USERS" ]]; then
  log_info "AllowUsers 已设置为 ${USERS}，跳过。"
  return 0
fi

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
if ! dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"; then
  log_error "备份 sshd_config 失败。"
  return 1
fi
log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

# 移除已有 AllowUsers 行，再追加新行
if ! dot_sudo sed -E -i '/^[[:space:]]*#?[[:space:]]*AllowUsers[[:space:]]+/d' "$SSHD_CONFIG"; then
  log_error "移除旧 AllowUsers 配置失败。"
  return 1
fi
if ! echo "AllowUsers ${USERS}" | dot_sudo tee -a "$SSHD_CONFIG" >/dev/null; then
  log_error "写入 AllowUsers 配置失败。"
  return 1
fi

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，已恢复备份。"
  dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG" || log_error "恢复 sshd_config 备份失败，请手动恢复。"
  return 1
fi

dot_sudo systemctl restart sshd 2>/dev/null || dot_sudo systemctl restart ssh 2>/dev/null
sleep 1
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "已限制 SSH 登录用户为: ${USERS}"
else
  log_warn "SSH 服务重启后未检测到活跃状态，请手动检查: systemctl status ssh"
fi
