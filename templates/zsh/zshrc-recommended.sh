# 推荐 zshrc 配置
log_info "写入推荐 ~/.zshrc 配置..."

ZSHRC="$HOME/.zshrc"
ZSH_CUSTOM_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
P10K_DIR="$ZSH_CUSTOM_DIR/themes/powerlevel10k"
ZSH_PLUGIN_LIST=(git z extract)
ZSH_ENABLE_P10K=0

dot_zsh_selected_or_installed() {
  local id="$1" path="$2"
  if [[ "${DOT_SELECTED[$id]:-0}" == "1" ]]; then
    return 0
  fi
  [[ -d "$path" ]]
}

dot_zsh_append_plugin() {
  local plugin="$1" existing
  for existing in "${ZSH_PLUGIN_LIST[@]}"; do
    if [[ "$existing" == "$plugin" ]]; then
      return 0
    fi
  done
  ZSH_PLUGIN_LIST+=("$plugin")
}

if dot_zsh_selected_or_installed "zsh-plugin-autosuggestions" "$ZSH_CUSTOM_DIR/plugins/zsh-autosuggestions"; then
  dot_zsh_append_plugin "zsh-autosuggestions"
fi
if dot_zsh_selected_or_installed "zsh-plugin-syntax-highlighting" "$ZSH_CUSTOM_DIR/plugins/zsh-syntax-highlighting"; then
  dot_zsh_append_plugin "zsh-syntax-highlighting"
fi
if [[ "${DOT_SELECTED[zsh-powerlevel10k-github]:-0}" == "1" || "${DOT_SELECTED[zsh-powerlevel10k-gitee]:-0}" == "1" || -d "$P10K_DIR" ]]; then
  ZSH_ENABLE_P10K=1
fi

ZSH_PLUGINS_LINE="plugins=(${ZSH_PLUGIN_LIST[*]})"

if ! mkdir -p "$(dirname "$ZSHRC")"; then
  log_error "无法创建 zshrc 目录: $(dirname "$ZSHRC")"
  return 1
fi

if [[ -f "$ZSHRC" ]]; then
  if ! cp "$ZSHRC" "${ZSHRC}.bak.$(date +%Y%m%d%H%M%S)"; then
    log_error "备份 ~/.zshrc 失败，已停止写入。"
    return 1
  fi
  log_info "已备份原有 ~/.zshrc"
else
  if ! touch "$ZSHRC"; then
    log_error "无法创建 ~/.zshrc。"
    return 1
  fi
fi

dot_zshrc_insert_before_omz_source() {
  local line="$1" file="$2" tmp
  if ! tmp="$(mktemp 2>/dev/null || mktemp -t dot-zshrc)"; then
    log_error "无法创建临时文件。"
    return 1
  fi
  if ! awk -v line="$line" '
    !inserted && /^[[:space:]]*source[[:space:]]+.*oh-my-zsh\.sh/ {
      print line
      inserted = 1
    }
    { print }
    END {
      if (!inserted) print line
    }
  ' "$file" > "$tmp"; then
    rm -f "$tmp"
    log_error "更新 ~/.zshrc 失败。"
    return 1
  fi
  if ! mv "$tmp" "$file"; then
    rm -f "$tmp"
    log_error "写回 ~/.zshrc 失败。"
    return 1
  fi
}

dot_zshrc_set_or_insert() {
  local pattern="$1" line="$2" file="$3" tmp
  if ! tmp="$(mktemp 2>/dev/null || mktemp -t dot-zshrc)"; then
    log_error "无法创建临时文件。"
    return 1
  fi
  if ! awk -v pattern="$pattern" '$0 !~ pattern { print }' "$file" > "$tmp"; then
    rm -f "$tmp"
    log_error "更新 ~/.zshrc 失败。"
    return 1
  fi
  if ! mv "$tmp" "$file"; then
    rm -f "$tmp"
    log_error "写回 ~/.zshrc 失败。"
    return 1
  fi
  dot_zshrc_insert_before_omz_source "$line" "$file"
}

dot_zshrc_set_or_insert '^[[:space:]]*export[[:space:]]+ZSH=' 'export ZSH="$HOME/.oh-my-zsh"' "$ZSHRC" || return 1
if [[ "$ZSH_ENABLE_P10K" == "1" ]]; then
  dot_zshrc_set_or_insert '^[[:space:]]*ZSH_THEME=' 'ZSH_THEME="powerlevel10k/powerlevel10k"' "$ZSHRC" || return 1
else
  log_warn "未选择或检测到 Powerlevel10k，保留现有 ZSH_THEME。"
fi
dot_zshrc_set_or_insert '^[[:space:]]*plugins=' "$ZSH_PLUGINS_LINE" "$ZSHRC" || return 1

if ! grep -Eq '^[[:space:]]*source[[:space:]]+.*oh-my-zsh\.sh' "$ZSHRC"; then
  if ! printf '%s\n' 'source "$ZSH/oh-my-zsh.sh"' >> "$ZSHRC"; then
    log_error "追加 Oh My Zsh source 行失败。"
    return 1
  fi
fi

if [[ "$ZSH_ENABLE_P10K" == "1" ]] && ! grep -Fq '[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh' "$ZSHRC"; then
  if ! printf '%s\n' '[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh' >> "$ZSHRC"; then
    log_error "追加 Powerlevel10k 配置 source 行失败。"
    return 1
  fi
fi

log_ok "推荐 ~/.zshrc 已写入；当前插件列表: $ZSH_PLUGINS_LINE"
