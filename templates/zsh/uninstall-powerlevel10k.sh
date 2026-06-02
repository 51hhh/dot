# 卸载 Powerlevel10k
log_info "卸载 Powerlevel10k（移动到备份目录）..."

ZSH_CUSTOM_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
THEME_BASE="$ZSH_CUSTOM_DIR/themes"
P10K_DIR="$THEME_BASE/powerlevel10k"
BACKUP_DIR="$HOME/.dot-backups/zsh/$(date +%Y%m%d%H%M%S)"

if [[ ! -e "$P10K_DIR" ]]; then
  log_info "Powerlevel10k 未安装，跳过。"
  return 0
fi

case "$P10K_DIR" in
  "$THEME_BASE"/*) ;;
  *)
    log_error "拒绝移动非主题目录: $P10K_DIR"
    return 1
    ;;
esac

if ! mkdir -p "$BACKUP_DIR/themes"; then
  log_error "无法创建备份目录: $BACKUP_DIR/themes"
  return 1
fi

if ! mv "$P10K_DIR" "$BACKUP_DIR/themes/powerlevel10k"; then
  log_error "移动 Powerlevel10k 到备份目录失败。"
  return 1
fi

log_ok "Powerlevel10k 已移动到 $BACKUP_DIR/themes/powerlevel10k"
