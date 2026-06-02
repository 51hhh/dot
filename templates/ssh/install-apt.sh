# SSH 服务安装 (apt)
log_info "通过 apt 安装 OpenSSH 服务..."

if ! command -v apt-get >/dev/null 2>&1; then
  log_error "未找到 apt-get；请手动使用当前发行版包管理器安装 openssh-server。"
  return 1
fi

# 幂等：已安装时跳过 apt，只确认服务
if command -v sshd >/dev/null 2>&1; then
  log_info "openssh-server 已安装，跳过 apt 安装。"
else
  if ! dot_sudo apt-get update -qq; then
    log_error "apt-get update 失败；请检查网络、软件源或 sudo/root 权限。"
    return 1
  fi

  if ! dot_sudo apt-get install -y openssh-server; then
    log_error "openssh-server 安装失败。"
    return 1
  fi

  hash -r
  log_ok "openssh-server 安装完成。"
fi

# 启用并启动 SSH 服务
if ! dot_sudo systemctl enable --now ssh; then
  # Debian 12+ / Ubuntu 22.04+ 可能使用 ssh.service
  if ! dot_sudo systemctl enable --now sshd 2>/dev/null; then
    log_warn "无法启用 ssh 服务，请手动检查 systemctl 状态。"
  fi
fi

# 确认服务正在运行
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "SSH 服务已启动并运行。"
else
  log_warn "SSH 服务可能未完全启动，请手动检查: systemctl status ssh"
fi
