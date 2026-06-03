# 生成推荐 ~/.ssh/config
SSH_CONFIG="$HOME/.ssh/config"

log_info "配置推荐 ~/.ssh/config ..."

# 确保 ~/.ssh 目录存在且权限正确
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

# 备份已有 config
if [[ -f "$SSH_CONFIG" ]]; then
  cp "$SSH_CONFIG" "${SSH_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
  log_info "已备份原有 ~/.ssh/config"
else
  touch "$SSH_CONFIG"
fi

# 确保全局 Host * 块存在
if ! grep -q '^Host \*' "$SSH_CONFIG"; then
  printf '%s\n' '' 'Host *' >> "$SSH_CONFIG"
fi

# 单次 awk 完成：删除旧的全局设置行，然后在第一个 Host * 块内插入新设置
# 只在第一个 Host * 后插入，不会影响后续的 Host 块
RECOMMENDED_SETTINGS='    ServerAliveInterval 60
    ServerAliveCountMax 3
    AddKeysToAgent yes
    HashKnownHosts yes
    IdentityFile ~/.ssh/id_ed25519'

if ! tmp="$(mktemp 2>/dev/null || mktemp -t dot-ssh-config)"; then
  log_error "无法创建临时文件。"
  return 1
fi
if ! awk -v settings="$RECOMMENDED_SETTINGS" '
  /^Host \*$/ && !seen_host_star {
    print
    seen_host_star = 1
    need_insert = 1
    next
  }
  /^[^ \t]/ && seen_host_star && !printed {
    # 遇到下一个顶级指令时，先输出推荐设置
    printf "%s\n", settings
    printed = 1
  }
  /^[[:space:]]+ServerAlive/ || /^[[:space:]]+AddKeysToAgent/ || /^[[:space:]]+HashKnownHosts/ || /^[[:space:]]+IdentityFile/ {
    # 跳过旧的推荐设置行
    next
  }
  { print }
  END {
    if (need_insert && !printed) {
      printf "%s\n", settings
    }
  }
' "$SSH_CONFIG" > "$tmp"; then
  rm -f "$tmp"
  log_error "生成推荐 ~/.ssh/config 失败。"
  return 1
fi

if ! mv "$tmp" "$SSH_CONFIG"; then
  rm -f "$tmp"
  log_error "写回推荐 ~/.ssh/config 失败。"
  return 1
fi

if ! chmod 600 "$SSH_CONFIG"; then
  log_error "设置 ~/.ssh/config 权限失败。"
  return 1
fi

log_ok "推荐 ~/.ssh/config 已写入（KeepAlive、HashKnownHosts、AddKeysToAgent、IdentityFile）"
