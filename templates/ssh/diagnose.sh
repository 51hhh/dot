# 诊断 SSH 配置
log_info "开始 SSH 配置诊断..."
echo ""

issues=0

# 1. sshd 配置语法检查
echo "=== sshd 配置语法检查 ==="
if command -v sshd >/dev/null 2>&1; then
  if dot_sudo sshd -t 2>/dev/null; then
    log_ok "sshd 配置语法正确"
  else
    log_error "sshd 配置存在语法错误！请检查 /etc/ssh/sshd_config"
    issues=$((issues + 1))
  fi
else
  log_warn "未找到 sshd 命令，跳过配置语法检查"
fi
echo ""

# 2. ~/.ssh 目录权限
echo "=== ~/.ssh 目录权限 ==="
SSH_DIR="$HOME/.ssh"
if [ -d "$SSH_DIR" ]; then
  ssh_perms="$(stat -c '%a' "$SSH_DIR" 2>/dev/null || stat -f '%A' "$SSH_DIR" 2>/dev/null)"
  if [[ "$ssh_perms" == "700" ]]; then
    log_ok "~/.ssh 权限正确 (700)"
  else
    log_warn "~/.ssh 权限为 $ssh_perms，建议改为 700"
    issues=$((issues + 1))
  fi
else
  log_warn "~/.ssh 目录不存在"
fi
echo ""

# 3. authorized_keys 权限
echo "=== authorized_keys 权限 ==="
AUTH_KEYS="$HOME/.ssh/authorized_keys"
if [ -f "$AUTH_KEYS" ]; then
  ak_perms="$(stat -c '%a' "$AUTH_KEYS" 2>/dev/null || stat -f '%A' "$AUTH_KEYS" 2>/dev/null)"
  if [[ "$ak_perms" == "600" ]]; then
    log_ok "authorized_keys 权限正确 (600)"
  else
    log_warn "authorized_keys 权限为 $ak_perms，建议改为 600"
    issues=$((issues + 1))
  fi
else
  log_info "authorized_keys 文件不存在（不影响密钥登录，但需要先添加公钥）"
fi
echo ""

# 4. Host Key 权限
echo "=== Host Key 权限 ==="
if [ -d /etc/ssh ]; then
  for hostkey in /etc/ssh/ssh_host_*_key; do
    if [ -f "$hostkey" ]; then
      hk_perms="$(stat -c '%a' "$hostkey" 2>/dev/null || stat -f '%A' "$hostkey" 2>/dev/null)"
      if [[ "$hk_perms" == "600" ]]; then
        log_ok "$(basename "$hostkey") 权限正确 (600)"
      else
        log_warn "$(basename "$hostkey") 权限为 $hk_perms，建议改为 600"
        issues=$((issues + 1))
      fi
    fi
  done
else
  log_warn "/etc/ssh 目录不存在"
fi
echo ""

# 5. 监听端口
echo "=== 监听端口 ==="
if command -v ss >/dev/null 2>&1; then
  ssh_listeners="$(ss -tlnp 2>/dev/null | grep ssh || true)"
  if [[ -n "$ssh_listeners" ]]; then
    log_ok "SSH 监听端口:"
    echo "$ssh_listeners" | while IFS= read -r line; do
      echo "  $line"
    done
  else
    log_warn "未检测到 SSH 监听端口"
    issues=$((issues + 1))
  fi
else
  log_info "未找到 ss 命令，跳过端口检查"
fi
echo ""

# 6. 服务状态
echo "=== SSH 服务状态 ==="
if systemctl is-active --quiet ssh 2>/dev/null; then
  log_ok "SSH 服务 (ssh) 正在运行"
elif systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "SSH 服务 (sshd) 正在运行"
else
  log_warn "SSH 服务未运行"
  issues=$((issues + 1))
fi
echo ""

# 诊断摘要
echo "==============================="
if [[ "$issues" -eq 0 ]]; then
  log_ok "SSH 诊断完成，未发现问题。"
else
  log_warn "SSH 诊断完成，发现 $issues 个潜在问题，请参考上方提示修复。"
fi
