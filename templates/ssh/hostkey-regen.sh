# 重新生成 Host Key
log_info "重新生成 SSH Host Key..."

BACKUP_DIR="/etc/ssh/backup"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"

# 备份现有 host key
if ls /etc/ssh/ssh_host_* >/dev/null 2>&1; then
  if ! dot_sudo mkdir -p "$BACKUP_DIR"; then
    log_error "无法创建备份目录 $BACKUP_DIR"
    return 1
  fi

  for keyfile in /etc/ssh/ssh_host_*; do
    if ! dot_sudo cp "$keyfile" "${BACKUP_DIR}/$(basename "$keyfile").${TIMESTAMP}"; then
      log_error "备份 Host Key 失败: $keyfile"
      return 1
    fi
  done
  log_ok "已备份现有 Host Key 到 $BACKUP_DIR"
fi

# 移除将要重新生成的强密钥，避免 ssh-keygen 交互式询问是否覆盖
for existing_key in \
  /etc/ssh/ssh_host_ed25519_key \
  /etc/ssh/ssh_host_ed25519_key.pub \
  /etc/ssh/ssh_host_rsa_key \
  /etc/ssh/ssh_host_rsa_key.pub; do
  if [[ -e "$existing_key" ]]; then
    if ! dot_sudo rm -f "$existing_key"; then
      log_error "移除旧 Host Key 失败: $existing_key"
      return 1
    fi
  fi
done

# 删除旧的弱密钥（DSA、RSA-1024、ECDSA）
for weak_key in /etc/ssh/ssh_host_dsa_key* /etc/ssh/ssh_host_ecdsa_key*; do
  if [ -f "$weak_key" ]; then
    if ! dot_sudo rm -f "$weak_key"; then
      log_error "删除弱密钥失败: $weak_key"
      return 1
    fi
    log_info "已删除弱密钥: $weak_key"
  fi
done

# 重新生成 ed25519 host key
if ! dot_sudo ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N "" -q; then
  log_error "ed25519 Host Key 生成失败。"
  return 1
fi
log_ok "已生成 ed25519 Host Key"

# 重新生成 RSA-4096 host key
if ! dot_sudo ssh-keygen -t rsa -b 4096 -f /etc/ssh/ssh_host_rsa_key -N "" -q; then
  log_error "RSA-4096 Host Key 生成失败。"
  return 1
fi
log_ok "已生成 RSA-4096 Host Key"

# 设置正确权限
if ! dot_sudo chmod 600 /etc/ssh/ssh_host_ed25519_key /etc/ssh/ssh_host_rsa_key; then
  log_error "设置 Host Key 私钥权限失败。"
  return 1
fi
if ! dot_sudo chmod 644 /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_rsa_key.pub; then
  log_error "设置 Host Key 公钥权限失败。"
  return 1
fi

if ! dot_sudo sshd -t 2>/dev/null; then
  log_error "sshd 配置验证失败，请检查 Host Key 和 sshd_config。"
  return 1
fi

dot_sudo systemctl restart sshd 2>/dev/null || dot_sudo systemctl restart ssh 2>/dev/null
sleep 1
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "SSH 服务已使用新 Host Key 重启"
else
  log_warn "SSH 服务重启后未检测到活跃状态，请手动检查: systemctl status ssh"
fi

log_warn "Host Key 已重新生成！客户端再次连接时会看到 host key 变更提示。"
log_info "请在确认新连接正常后，删除旧的 known_hosts 条目或执行:"
log_info "  ssh-keygen -R <服务器IP>"
