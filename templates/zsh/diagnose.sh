# Zsh 环境诊断
log_info "检查当前 Zsh 环境..."

ZSH_TARGET_USER="${USER:-$(id -un)}"
if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  ZSH_TARGET_USER="$SUDO_USER"
fi

ZSHRC="$HOME/.zshrc"
OH_MY_ZSH_DIR="${ZSH:-$HOME/.oh-my-zsh}"
ZSH_CUSTOM_DIR="${ZSH_CUSTOM:-$OH_MY_ZSH_DIR/custom}"
P10K_DIR="$ZSH_CUSTOM_DIR/themes/powerlevel10k"
AUTOSUGGESTIONS_DIR="$ZSH_CUSTOM_DIR/plugins/zsh-autosuggestions"
SYNTAX_HIGHLIGHTING_DIR="$ZSH_CUSTOM_DIR/plugins/zsh-syntax-highlighting"

dot_zsh_diag_ok() {
  printf ' [OK] %s\n' "$1"
}

dot_zsh_diag_warn() {
  printf ' [WARN] %s\n' "$1"
}

dot_zsh_diag_missing() {
  printf ' [MISSING] %s\n' "$1"
}

dot_zsh_diag_command() {
  local command_name="$1" label="$2" version_command="${3:-}"
  local command_path version_output

  if ! command_path="$(command -v "$command_name" 2>/dev/null)"; then
    dot_zsh_diag_missing "$label: 未找到 $command_name"
    return 0
  fi

  if [[ -n "$version_command" ]]; then
    version_output="$($version_command 2>/dev/null | head -n 1 || true)"
    if [[ -n "$version_output" ]]; then
      dot_zsh_diag_ok "$label: $version_output ($command_path)"
      return 0
    fi
  fi

  dot_zsh_diag_ok "$label: $command_path"
}

printf '%s\n' "────────────────────────────────────────"
dot_zsh_diag_command "zsh" "Zsh" "zsh --version"
dot_zsh_diag_command "git" "Git" "git --version"
dot_zsh_diag_command "curl" "curl" "curl --version"

if command -v dpkg >/dev/null 2>&1; then
  if dpkg -s ca-certificates >/dev/null 2>&1; then
    dot_zsh_diag_ok "ca-certificates: apt 包已安装"
  else
    dot_zsh_diag_warn "ca-certificates: apt 包状态未知或未安装"
  fi
elif [[ -f /etc/ssl/certs/ca-certificates.crt ]]; then
  dot_zsh_diag_ok "ca-certificates: 找到系统证书文件"
else
  dot_zsh_diag_warn "ca-certificates: 无法确认系统证书状态"
fi

if [[ -f "$OH_MY_ZSH_DIR/oh-my-zsh.sh" ]]; then
  dot_zsh_diag_ok "Oh My Zsh: $OH_MY_ZSH_DIR"
else
  dot_zsh_diag_missing "Oh My Zsh: $OH_MY_ZSH_DIR/oh-my-zsh.sh"
fi

if [[ -d "$P10K_DIR/.git" ]]; then
  dot_zsh_diag_ok "Powerlevel10k: $P10K_DIR"
elif [[ -e "$P10K_DIR" ]]; then
  dot_zsh_diag_warn "Powerlevel10k: $P10K_DIR 存在但不是 git 仓库"
else
  dot_zsh_diag_missing "Powerlevel10k: $P10K_DIR"
fi

for plugin_dir in "$AUTOSUGGESTIONS_DIR" "$SYNTAX_HIGHLIGHTING_DIR"; do
  plugin_name="$(basename "$plugin_dir")"
  if [[ -d "$plugin_dir/.git" ]]; then
    dot_zsh_diag_ok "插件 $plugin_name: $plugin_dir"
  elif [[ -e "$plugin_dir" ]]; then
    dot_zsh_diag_warn "插件 $plugin_name: $plugin_dir 存在但不是 git 仓库"
  else
    dot_zsh_diag_missing "插件 $plugin_name: $plugin_dir"
  fi
done

if [[ -f "$ZSHRC" ]]; then
  dot_zsh_diag_ok "zshrc: $ZSHRC"
  if grep -Eq '^[[:space:]]*ZSH_THEME=' "$ZSHRC"; then
    dot_zsh_diag_ok "zshrc 主题: $(grep -E '^[[:space:]]*ZSH_THEME=' "$ZSHRC" | tail -n 1)"
  else
    dot_zsh_diag_warn "zshrc 主题: 未找到 ZSH_THEME 行"
  fi
  if grep -Eq '^[[:space:]]*plugins=' "$ZSHRC"; then
    dot_zsh_diag_ok "zshrc 插件: $(grep -E '^[[:space:]]*plugins=' "$ZSHRC" | tail -n 1)"
  else
    dot_zsh_diag_warn "zshrc 插件: 未找到 plugins 行"
  fi
  if grep -Eq '^[[:space:]]*source[[:space:]]+.*oh-my-zsh\.sh' "$ZSHRC"; then
    dot_zsh_diag_ok "zshrc source: 已加载 Oh My Zsh"
  else
    dot_zsh_diag_warn "zshrc source: 未找到 Oh My Zsh source 行"
  fi
  if grep -Fq '.p10k.zsh' "$ZSHRC"; then
    dot_zsh_diag_ok "zshrc Powerlevel10k: 已引用 ~/.p10k.zsh"
  else
    dot_zsh_diag_warn "zshrc Powerlevel10k: 未引用 ~/.p10k.zsh"
  fi
else
  dot_zsh_diag_missing "zshrc: $ZSHRC"
fi

ZSH_PATH="$(command -v zsh 2>/dev/null || true)"
LOGIN_SHELL="${SHELL:-}"
if command -v getent >/dev/null 2>&1; then
  LOGIN_SHELL="$(getent passwd "$ZSH_TARGET_USER" 2>/dev/null | awk -F: '{print $7}')"
fi

if [[ -n "$LOGIN_SHELL" ]]; then
  if [[ -n "$ZSH_PATH" && "$LOGIN_SHELL" == "$ZSH_PATH" ]]; then
    dot_zsh_diag_ok "$ZSH_TARGET_USER 默认 shell: $LOGIN_SHELL"
  else
    dot_zsh_diag_warn "$ZSH_TARGET_USER 默认 shell: $LOGIN_SHELL"
  fi
else
  dot_zsh_diag_warn "$ZSH_TARGET_USER 默认 shell: 无法识别"
fi

if [[ -n "$ZSH_PATH" && -f /etc/shells ]]; then
  if grep -qx "$ZSH_PATH" /etc/shells; then
    dot_zsh_diag_ok "/etc/shells: 已包含 $ZSH_PATH"
  else
    dot_zsh_diag_warn "/etc/shells: 未包含 $ZSH_PATH"
  fi
fi
printf '%s\n' "────────────────────────────────────────"

log_ok "Zsh 环境检查完成"
