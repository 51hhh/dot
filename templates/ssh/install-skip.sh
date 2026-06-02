# 跳过 SSH 安装并检查现有服务
log_info "跳过 apt 安装，检查 SSH 服务状态..."

if ! command -v sshd >/dev/null 2>&1; then
  log_error "未找到 sshd 命令；请返回选择 apt 安装。"
  return 1
fi

if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "SSH 服务已可用且正在运行。"
else
  log_warn "sshd 已安装但服务未运行，可尝试: sudo systemctl start ssh"
fi
