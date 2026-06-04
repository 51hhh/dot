# 最小 zshrc 配置
log_info "写入最小 ~/.zshrc 配置..."

ZSHRC="$HOME/.zshrc"

dot_zshrc_backup_minimal() {
  if [[ -f "$ZSHRC" ]]; then
    if ! cp "$ZSHRC" "${ZSHRC}.bak.$(date +%Y%m%d%H%M%S)"; then
      log_error "备份 ~/.zshrc 失败。"
      return 1
    fi
    log_info "已备份原有 ~/.zshrc"
  else
    if ! touch "$ZSHRC"; then
      log_error "无法创建 ~/.zshrc。"
      return 1
    fi
  fi
}

dot_zshrc_append_if_missing() {
  local pattern="$1" line="$2"
  if ! grep -Eq "$pattern" "$ZSHRC"; then
    if ! printf '%s\n' "$line" >> "$ZSHRC"; then
      log_error "写入 ~/.zshrc 失败。"
      return 1
    fi
  fi
}

if ! mkdir -p "$(dirname "$ZSHRC")"; then
  log_error "无法创建 zshrc 目录: $(dirname "$ZSHRC")"
  return 1
fi

dot_zshrc_backup_minimal || return 1
dot_zshrc_append_if_missing '^[[:space:]]*export[[:space:]]+ZSH=' 'export ZSH="$HOME/.oh-my-zsh"' || return 1
dot_zshrc_append_if_missing '^[[:space:]]*plugins=' 'plugins=(git)' || return 1
dot_zshrc_append_if_missing '^[[:space:]]*source[[:space:]]+.*oh-my-zsh\.sh' '[[ -f "$ZSH/oh-my-zsh.sh" ]] && source "$ZSH/oh-my-zsh.sh"' || return 1

log_ok "最小 ~/.zshrc 已写入。"
