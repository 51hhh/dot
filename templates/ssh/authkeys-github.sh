# 从 GitHub 用户名拉取公钥
GITHUB_USER="{{github_user}}"

if [[ -z "$GITHUB_USER" ]]; then
  log_error "未指定 GitHub 用户名。"
  return 1
fi

GITHUB_KEYS_URL="https://github.com/${GITHUB_USER}.keys"
KEYS_TMPFILE="$(mktemp 2>/dev/null || mktemp -t dot-ssh-github-keys)"

log_info "从 GitHub 下载公钥: $GITHUB_USER ..."

if ! dot_download_with_fallback "$GITHUB_KEYS_URL" "$KEYS_TMPFILE"; then
  rm -f "$KEYS_TMPFILE"
  log_error "GitHub 公钥下载失败: $GITHUB_KEYS_URL"
  log_info "请检查用户名是否正确，或网络是否可达。"
  return 1
fi

# 检查下载内容是否包含有效公钥
if ! grep -q 'ssh-' "$KEYS_TMPFILE" 2>/dev/null; then
  rm -f "$KEYS_TMPFILE"
  log_error "未从 $GITHUB_USER 获取到有效的 SSH 公钥。请确认用户名是否正确。"
  return 1
fi

# 确保 ~/.ssh 目录存在且权限正确
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

AUTH_KEYS="$HOME/.ssh/authorized_keys"
touch "$AUTH_KEYS"

# 提取已有 authorized_keys 的指纹用于去重
EXISTING_FINGERPRINTS="$(mktemp 2>/dev/null || mktemp -t dot-ssh-existing-fp)"
ssh-keygen -lf "$AUTH_KEYS" 2>/dev/null | awk '{print $2}' > "$EXISTING_FINGERPRINTS"

imported=0
skipped=0

while IFS= read -r key_line; do
  [[ -z "$key_line" ]] && continue

  NEW_FP="$(ssh-keygen -lf /dev/stdin 2>/dev/null <<< "$key_line" | awk '{print $2}')" || true

  if [[ -n "$NEW_FP" ]] && grep -qF "$NEW_FP" "$EXISTING_FINGERPRINTS"; then
    skipped=$((skipped + 1))
    continue
  fi

  printf '%s\n' "$key_line" >> "$AUTH_KEYS"
  imported=$((imported + 1))
done < "$KEYS_TMPFILE"

rm -f "$KEYS_TMPFILE" "$EXISTING_FINGERPRINTS"
chmod 600 "$AUTH_KEYS"

log_ok "GitHub ($GITHUB_USER) 导入完成: 新增 ${imported} 个，跳过 ${skipped} 个。"
