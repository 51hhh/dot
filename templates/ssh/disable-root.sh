# 禁止 root 密码登录
SSHD_CONFIG="/etc/ssh/sshd_config"

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

# 幂等检查
if grep -Eq '^[[:space:]]*PermitRootLogin[[:space:]]+prohibit-password' "$SSHD_CONFIG"; then
  log_info "PermitRootLogin 已设置为 prohibit-password，跳过。"
  return 0
fi

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
if ! dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"; then
  log_error "备份 sshd_config 失败。"
  return 1
fi
log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

dot_sshd_set_option "PermitRootLogin" "prohibit-password" "$SSHD_CONFIG" || return 1

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，已恢复备份。"
  dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG" || log_error "恢复 sshd_config 备份失败，请手动恢复。"
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
