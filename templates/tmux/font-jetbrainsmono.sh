# 安装 JetBrainsMono Nerd Font
log_info "Catppuccin 状态栏建议安装 JetBrainsMono Nerd Font。"

NERD_FONT_URL="https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip"
FONT_DIR="$HOME/.local/share/fonts/JetBrainsMono"
FONT_ZIP="$(mktemp --suffix=.zip 2>/dev/null || mktemp)"

if command -v fc-list >/dev/null 2>&1 && fc-list 2>/dev/null | grep -qi "JetBrainsMono Nerd Font"; then
  log_ok "JetBrainsMono Nerd Font 已安装，跳过。"
  rm -f "$FONT_ZIP"
  return 0
fi

if command -v apt-get >/dev/null 2>&1; then
  missing_font_deps=()
  command -v unzip >/dev/null 2>&1 || missing_font_deps+=(unzip)
  command -v fc-cache >/dev/null 2>&1 || missing_font_deps+=(fontconfig)
  command -v wget >/dev/null 2>&1 || command -v curl >/dev/null 2>&1 || missing_font_deps+=(wget curl)
  if [[ "${#missing_font_deps[@]}" -gt 0 ]]; then
    log_info "安装字体依赖: ${missing_font_deps[*]}"
    if ! dot_sudo apt-get update -qq || ! dot_sudo apt-get install -y "${missing_font_deps[@]}"; then
      rm -f "$FONT_ZIP"
      log_error "安装字体依赖失败。"
      return 1
    fi
  fi
fi

if ! command -v unzip >/dev/null 2>&1; then
  rm -f "$FONT_ZIP"
  log_error "安装字体需要 unzip；请先安装 unzip 后重试。"
  return 1
fi

if ! command -v wget >/dev/null 2>&1 && ! command -v curl >/dev/null 2>&1; then
  rm -f "$FONT_ZIP"
  log_error "下载字体需要 wget 或 curl。"
  return 1
fi

mkdir -p "$FONT_DIR"
if ! dot_download_with_fallback "$NERD_FONT_URL" "$FONT_ZIP"; then
  rm -f "$FONT_ZIP"
  log_error "JetBrainsMono Nerd Font 下载失败。"
  return 1
fi

if ! unzip -oq "$FONT_ZIP" -d "$FONT_DIR"; then
  rm -f "$FONT_ZIP"
  log_error "JetBrainsMono 字体压缩包解压失败。"
  return 1
fi
rm -f "$FONT_ZIP"

if command -v fc-cache >/dev/null 2>&1; then
  fc-cache -f "$FONT_DIR" || log_warn "fc-cache 刷新失败；字体文件已安装到 $FONT_DIR。"
else
  log_warn "未找到 fc-cache；字体文件已安装，但可能需要安装 fontconfig 或重启终端后生效。"
fi

log_ok "JetBrainsMono Nerd Font 安装完成: $FONT_DIR"
