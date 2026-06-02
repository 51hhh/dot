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

# set_or_insert：删除已有匹配行，再追加配置块
ssh_config_set_or_insert() {
  local pattern="$1" line="$2" file="$3" tmp
  tmp="$(mktemp 2>/dev/null || mktemp -t dot-ssh-config)"
  awk -v pattern="$pattern" '$0 !~ pattern { print }' "$file" > "$tmp" && mv "$tmp" "$file"
  printf '%s\n' "$line" >> "$file"
}

# 确保全局 Host * 块存在
if ! grep -q '^Host \*$' "$SSH_CONFIG"; then
  printf '%s\n' '' 'Host *' >> "$SSH_CONFIG"
fi

ssh_config_set_or_insert '^\s+ServerAliveInterval' '    ServerAliveInterval 60' "$SSH_CONFIG"
ssh_config_set_or_insert '^\s+ServerAliveCountMax' '    ServerAliveCountMax 3' "$SSH_CONFIG"
ssh_config_set_or_insert '^\s+AddKeysToAgent' '    AddKeysToAgent yes' "$SSH_CONFIG"
ssh_config_set_or_insert '^\s+HashKnownHosts' '    HashKnownHosts yes' "$SSH_CONFIG"
ssh_config_set_or_insert '^\s+IdentityFile' '    IdentityFile ~/.ssh/id_ed25519' "$SSH_CONFIG"

chmod 600 "$SSH_CONFIG"

log_ok "推荐 ~/.ssh/config 已写入（KeepAlive、HashKnownHosts、AddKeysToAgent、IdentityFile）"
