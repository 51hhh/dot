# 卸载托管 Zsh 插件
log_info "卸载托管 Zsh 插件（移动到备份目录）..."

ZSH_CUSTOM_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
PLUGIN_BASE="$ZSH_CUSTOM_DIR/plugins"
BACKUP_DIR="$HOME/.dot-backups/zsh/$(date +%Y%m%d%H%M%S)"

dot_zsh_move_plugin_backup() {
  local target="$1" name="$2"

  if [[ ! -e "$target" ]]; then
    log_info "$name 未安装，跳过。"
    return 0
  fi

  case "$target" in
    "$PLUGIN_BASE"/*) ;;
    *)
      log_error "拒绝移动非插件目录: $target"
      return 1
      ;;
  esac

  if ! mkdir -p "$BACKUP_DIR/plugins"; then
    log_error "无法创建备份目录: $BACKUP_DIR/plugins"
    return 1
  fi

  if ! mv "$target" "$BACKUP_DIR/plugins/$name"; then
    log_error "移动 $name 到备份目录失败。"
    return 1
  fi

  log_ok "$name 已移动到 $BACKUP_DIR/plugins/$name"
}

dot_zsh_move_plugin_backup "$PLUGIN_BASE/zsh-autosuggestions" "zsh-autosuggestions" || return 1
dot_zsh_move_plugin_backup "$PLUGIN_BASE/zsh-syntax-highlighting" "zsh-syntax-highlighting" || return 1

log_ok "托管 Zsh 插件卸载完成。"
