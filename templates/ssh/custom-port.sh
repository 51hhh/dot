# 自定义 SSH 端口
SSHD_CONFIG="/etc/ssh/sshd_config"
PORT_VALUE="{{ssh_port}}"

# 如果端口变量为空，使用默认值
if [[ -z "$PORT_VALUE" ]]; then
  PORT_VALUE="2222"
fi

if ! [[ "$PORT_VALUE" =~ ^[0-9]+$ ]]; then
  log_error "SSH 端口必须是数字: $PORT_VALUE"
  return 1
fi

if [[ "${#PORT_VALUE}" -gt 5 ]]; then
  log_error "SSH 端口必须在 1-65535 之间: $PORT_VALUE"
  return 1
fi

PORT_VALUE="$((10#$PORT_VALUE))"
if [[ "$PORT_VALUE" -lt 1 || "$PORT_VALUE" -gt 65535 ]]; then
  log_error "SSH 端口必须在 1-65535 之间: $PORT_VALUE"
  return 1
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

# 幂等检查
if grep -Eq "^[[:space:]]*Port[[:space:]]+${PORT_VALUE}([[:space:]]*(#.*)?)?$" "$SSHD_CONFIG"; then
  log_info "SSH 端口已设置为 ${PORT_VALUE}，跳过。"
  return 0
fi

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
if ! dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"; then
  log_error "备份 sshd_config 失败。"
  return 1
fi
log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

dot_sshd_set_option "Port" "$PORT_VALUE" "$SSHD_CONFIG" || return 1

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，已恢复备份。"
  dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG" || log_error "恢复 sshd_config 备份失败，请手动恢复。"
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
