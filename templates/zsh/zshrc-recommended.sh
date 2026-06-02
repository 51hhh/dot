# 推荐 zshrc 配置
log_info "写入推荐 ~/.zshrc 配置..."

ZSHRC="$HOME/.zshrc"
mkdir -p "$(dirname "$ZSHRC")"

if [[ -f "$ZSHRC" ]]; then
  cp "$ZSHRC" "${ZSHRC}.bak.$(date +%Y%m%d%H%M%S)"
  log_info "已备份原有 ~/.zshrc"
else
  touch "$ZSHRC"
fi

dot_zshrc_insert_before_omz_source() {
  local line="$1" file="$2" tmp
  tmp="$(mktemp 2>/dev/null || mktemp -t dot-zshrc)"
  awk -v line="$line" '
    !inserted && /^[[:space:]]*source[[:space:]]+.*oh-my-zsh\.sh/ {
      print line
      inserted = 1
    }
    { print }
    END {
      if (!inserted) print line
    }
  ' "$file" > "$tmp" && mv "$tmp" "$file"
}

dot_zshrc_set_or_insert() {
  local pattern="$1" line="$2" file="$3" tmp
  tmp="$(mktemp 2>/dev/null || mktemp -t dot-zshrc)"
  awk -v pattern="$pattern" '$0 !~ pattern { print }' "$file" > "$tmp" && mv "$tmp" "$file"
  dot_zshrc_insert_before_omz_source "$line" "$file"
}

dot_zshrc_set_or_insert '^[[:space:]]*export[[:space:]]+ZSH=' 'export ZSH="$HOME/.oh-my-zsh"' "$ZSHRC"
dot_zshrc_set_or_insert '^[[:space:]]*ZSH_THEME=' 'ZSH_THEME="powerlevel10k/powerlevel10k"' "$ZSHRC"
dot_zshrc_set_or_insert '^[[:space:]]*plugins=' 'plugins=(git z extract zsh-autosuggestions zsh-syntax-highlighting)' "$ZSHRC"

if ! grep -Eq '^[[:space:]]*source[[:space:]]+.*oh-my-zsh\.sh' "$ZSHRC"; then
  printf '%s\n' 'source "$ZSH/oh-my-zsh.sh"' >> "$ZSHRC"
fi

if ! grep -Fq '[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh' "$ZSHRC"; then
  printf '%s\n' '[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh' >> "$ZSHRC"
fi

log_ok "推荐 ~/.zshrc 已写入；zsh-syntax-highlighting 已保持在 plugins 列表最后。"
