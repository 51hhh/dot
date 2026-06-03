# 启用 UFW 并放行 SSH 端口
log_info "配置 UFW 防火墙..."

# 检查 apt 可用性
if ! command -v apt-get >/dev/null 2>&1; then
  log_error "未找到 apt-get；请手动安装 UFW。"
  return 1
fi

# 幂等：已安装时跳过安装步骤
if command -v ufw >/dev/null 2>&1; then
  log_info "UFW 已安装，跳过 apt 安装。"
else
  if ! dot_sudo apt-get install -y ufw; then
    log_error "UFW 安装失败。"
    return 1
  fi
  log_ok "UFW 安装完成。"
fi

# 从 sshd_config 读取当前端口，默认 22
SSH_PORT="22"
if [[ -f /etc/ssh/sshd_config ]]; then
  configured_port="$(grep -E '^[[:space:]]*Port[[:space:]]+' /etc/ssh/sshd_config | tail -1 | awk '{print $2}')"
  if [[ -n "$configured_port" ]]; then
    SSH_PORT="$configured_port"
  fi
fi

if ! [[ "$SSH_PORT" =~ ^[0-9]+$ ]] || [[ "${#SSH_PORT}" -gt 5 ]] || [[ "$((10#$SSH_PORT))" -lt 1 || "$((10#$SSH_PORT))" -gt 65535 ]]; then
  log_error "检测到无效 SSH 端口，拒绝写入 UFW 规则: $SSH_PORT"
  return 1
fi
SSH_PORT="$((10#$SSH_PORT))"

# 幂等：检查是否已有该端口的 limit 规则
if dot_sudo ufw status 2>/dev/null | grep -q "${SSH_PORT}/tcp.*LIMIT"; then
  log_info "UFW 已有 SSH 端口 ${SSH_PORT}/tcp 的 limit 规则，跳过添加。"
else
  if ! dot_sudo ufw limit "${SSH_PORT}/tcp" comment 'SSH rate limit'; then
    log_error "添加 UFW limit 规则失败。"
    return 1
  fi
  log_ok "已添加 UFW limit 规则: ${SSH_PORT}/tcp"
fi

# 启用 UFW
if dot_sudo ufw status 2>/dev/null | grep -q "Status: active"; then
  log_info "UFW 已处于启用状态。"
else
  if ! dot_sudo ufw --force enable; then
    log_error "UFW 启用失败。"
    return 1
  fi
  log_ok "UFW 已启用。"
fi

# 验证状态
dot_sudo ufw status verbose 2>/dev/null

log_warn "云端实例可能需要在安全组中同步放行 SSH 端口 ${SSH_PORT}/tcp"
