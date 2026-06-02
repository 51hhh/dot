# 从本地文件导入公钥到 authorized_keys
PUBKEY_PATH="{{pubkey_path}}"

if [[ -z "$PUBKEY_PATH" ]]; then
  log_error "未指定公钥文件路径。"
  return 1
fi

if [[ ! -f "$PUBKEY_PATH" ]]; then
  log_error "公钥文件不存在: $PUBKEY_PATH"
  return 1
fi

PUBKEY_CONTENT="$(cat "$PUBKEY_PATH")"
if [[ -z "$PUBKEY_CONTENT" ]]; then
  log_error "公钥文件为空: $PUBKEY_PATH"
  return 1
fi

# 提取公钥指纹
FINGERPRINT="$(ssh-keygen -lf "$PUBKEY_PATH" 2>/dev/null | awk '{print $2}')" || true
if [[ -z "$FINGERPRINT" ]]; then
  log_warn "无法读取公钥指纹，跳过去重检查。"
fi

# 确保 ~/.ssh 目录存在且权限正确
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

AUTH_KEYS="$HOME/.ssh/authorized_keys"
touch "$AUTH_KEYS"

# 幂等去重：按指纹比对
if [[ -n "$FINGERPRINT" ]] && [[ -f "$AUTH_KEYS" ]]; then
  for existing in $(ssh-keygen -lf "$AUTH_KEYS" 2>/dev/null | awk '{print $2}'); do
    if [[ "$existing" == "$FINGERPRINT" ]]; then
      log_info "该公钥已存在于 authorized_keys 中（指纹: $FINGERPRINT），跳过。"
      chmod 600 "$AUTH_KEYS"
      return 0
    fi
  done
fi

printf '%s\n' "$PUBKEY_CONTENT" >> "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

log_ok "公钥已导入 authorized_keys（来源: $PUBKEY_PATH）"
