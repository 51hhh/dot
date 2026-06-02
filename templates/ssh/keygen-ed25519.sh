# 生成 Ed25519 SSH 密钥
KEY_PATH="$HOME/.ssh/id_ed25519"

log_info "生成 Ed25519 SSH 密钥..."

# 幂等：跳过已存在的密钥
if [ -f "$KEY_PATH" ]; then
  log_info "密钥 $KEY_PATH 已存在，跳过生成。"
  log_info "如需重新生成，请先手动删除: rm $KEY_PATH"
  return 0
fi

# 确保 ~/.ssh 目录存在且权限正确
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

KEY_COMMENT="user@$(hostname)-$(date +%Y%m%d)"
if ! ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -C "$KEY_COMMENT" -q; then
  log_error "Ed25519 密钥生成失败。"
  return 1
fi

log_ok "Ed25519 密钥已生成: $KEY_PATH"
log_info "公钥: ${KEY_PATH}.pub"
log_info "如需设置 passphrase，请后续执行: ssh-keygen -p -f $KEY_PATH"
