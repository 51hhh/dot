# 恢复 zshrc 备份
log_info "恢复最近的 ~/.zshrc 备份..."

ZSHRC="$HOME/.zshrc"
BACKUP_ROOT="$HOME/.dot-backups/zsh"
backups=()
latest_backup=""

shopt -s nullglob
backups+=("$HOME"/.zshrc.bak.*)
backups+=("$BACKUP_ROOT"/zshrc.*)
shopt -u nullglob

for backup in "${backups[@]}"; do
  [[ -f "$backup" ]] || continue
  if [[ -z "$latest_backup" || "$backup" -nt "$latest_backup" ]]; then
    latest_backup="$backup"
  fi
done

if [[ -z "$latest_backup" ]]; then
  log_warn "未找到可恢复的 zshrc 备份。"
  return 0
fi

if [[ -f "$ZSHRC" ]]; then
  if ! cp "$ZSHRC" "${ZSHRC}.bak.before-restore.$(date +%Y%m%d%H%M%S)"; then
    log_error "恢复前备份当前 ~/.zshrc 失败。"
    return 1
  fi
fi

if ! cp "$latest_backup" "$ZSHRC"; then
  log_error "恢复失败: $latest_backup -> $ZSHRC"
  return 1
fi

log_ok "已恢复 zshrc 备份: $latest_backup"
