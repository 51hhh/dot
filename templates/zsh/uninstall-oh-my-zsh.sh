# 卸载 Oh My Zsh
log_info "卸载 Oh My Zsh（移动到备份目录）..."

OH_MY_ZSH_DIR="${ZSH:-$HOME/.oh-my-zsh}"
BACKUP_DIR="$HOME/.dot-backups/zsh/$(date +%Y%m%d%H%M%S)"

if [[ ! -e "$OH_MY_ZSH_DIR" ]]; then
  log_info "Oh My Zsh 未安装，跳过。"
  return 0
fi

case "$OH_MY_ZSH_DIR" in
  "$HOME/.oh-my-zsh") ;;
  *)
    log_error "拒绝自动移动非默认 Oh My Zsh 目录: $OH_MY_ZSH_DIR"
    log_error "如需卸载自定义 ZSH 目录，请手动确认后处理。"
    return 1
    ;;
esac

if ! mkdir -p "$BACKUP_DIR"; then
  log_error "无法创建备份目录: $BACKUP_DIR"
  return 1
fi

if ! mv "$OH_MY_ZSH_DIR" "$BACKUP_DIR/oh-my-zsh"; then
  log_error "移动 Oh My Zsh 到备份目录失败。"
  return 1
fi

log_ok "Oh My Zsh 已移动到 $BACKUP_DIR/oh-my-zsh"
log_warn "如果 ~/.zshrc 仍 source Oh My Zsh，请选择恢复 zshrc 备份或手动编辑。"
