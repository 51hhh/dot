# 只更新 zshrc 主题和插件
log_info "只更新 ~/.zshrc 的主题和插件..."

ZSHRC="$HOME/.zshrc"
ZSH_CUSTOM_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
P10K_DIR="$ZSH_CUSTOM_DIR/themes/powerlevel10k"
ZSH_PLUGIN_LIST=(git z extract)
ZSH_ENABLE_P10K=0

dot_zshrc_patch_selected_or_installed() {
  local id="$1" path="$2"
  if [[ "${DOT_SELECTED[$id]:-0}" == "1" ]]; then
    return 0
  fi
  [[ -d "$path" ]]
}

if dot_zshrc_patch_selected_or_installed "zsh-plugin-autosuggestions" "$ZSH_CUSTOM_DIR/plugins/zsh-autosuggestions"; then
  ZSH_PLUGIN_LIST+=("zsh-autosuggestions")
fi
if dot_zshrc_patch_selected_or_installed "zsh-plugin-syntax-highlighting" "$ZSH_CUSTOM_DIR/plugins/zsh-syntax-highlighting"; then
  ZSH_PLUGIN_LIST+=("zsh-syntax-highlighting")
fi
if [[ "${DOT_SELECTED[zsh-powerlevel10k-github]:-0}" == "1" || "${DOT_SELECTED[zsh-powerlevel10k-gitee]:-0}" == "1" || -d "$P10K_DIR" ]]; then
  ZSH_ENABLE_P10K=1
fi

dot_zshrc_patch_line() {
  local pattern="$1" line="$2" tmp
  if ! tmp="$(mktemp 2>/dev/null || mktemp -t dot-zshrc)"; then
    log_error "无法创建临时文件。"
    return 1
  fi
  if ! awk -v pattern="$pattern" '$0 !~ pattern { print }' "$ZSHRC" > "$tmp"; then
    rm -f "$tmp"
    log_error "更新 ~/.zshrc 失败。"
    return 1
  fi
  if ! printf '%s\n' "$line" >> "$tmp"; then
    rm -f "$tmp"
    log_error "写入临时 zshrc 失败。"
    return 1
  fi
  if ! mv "$tmp" "$ZSHRC"; then
    rm -f "$tmp"
    log_error "写回 ~/.zshrc 失败。"
    return 1
  fi
}

if [[ ! -f "$ZSHRC" ]]; then
  log_error "未找到 ~/.zshrc，无法只做补丁更新；请改选推荐或最小配置。"
  return 1
fi

if ! cp "$ZSHRC" "${ZSHRC}.bak.$(date +%Y%m%d%H%M%S)"; then
  log_error "备份 ~/.zshrc 失败。"
  return 1
fi

if [[ "$ZSH_ENABLE_P10K" == "1" ]]; then
  dot_zshrc_patch_line '^[[:space:]]*ZSH_THEME=' 'ZSH_THEME="powerlevel10k/powerlevel10k"' || return 1
else
  log_warn "未选择或检测到 Powerlevel10k，保留现有 ZSH_THEME。"
fi
dot_zshrc_patch_line '^[[:space:]]*plugins=' "plugins=(${ZSH_PLUGIN_LIST[*]})" || return 1

if ! grep -Eq '^[[:space:]]*source[[:space:]]+.*oh-my-zsh\.sh' "$ZSHRC"; then
  log_warn "~/.zshrc 中未找到 Oh My Zsh source 行；本模式只更新主题和插件，不自动追加。"
fi

log_ok "已更新 ~/.zshrc 的主题和插件。"
