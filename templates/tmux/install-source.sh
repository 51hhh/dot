# Tmux 源码编译安装
log_info "源码编译安装 Tmux..."

if ! command -v apt-get >/dev/null 2>&1; then
  log_error "源码编译安装当前仅自动支持 apt-get 系统。请手动安装编译依赖后重试。"
  return 1
fi

if ! dot_sudo apt-get update -qq; then
  log_error "apt-get update 失败；无法安装 tmux 编译依赖。"
  return 1
fi

TMUX_BUILD_DEPS=(git automake build-essential pkg-config libevent-dev libncurses-dev libncurses5-dev libncursesw5-dev bison wget curl ca-certificates)
if ! dot_sudo apt-get install -y "${TMUX_BUILD_DEPS[@]}"; then
  log_error "安装 tmux 编译依赖失败。"
  return 1
fi

TMUX_VERSION="{{tmux_version:3.4}}"
TMUX_URL="https://github.com/tmux/tmux/releases/download/${TMUX_VERSION}/tmux-${TMUX_VERSION}.tar.gz"
TMUX_TMPDIR="$(mktemp -d)"
TMUX_TARBALL="$TMUX_TMPDIR/tmux-${TMUX_VERSION}.tar.gz"

cleanup_tmux_build() {
  rm -rf "$TMUX_TMPDIR"
}

log_info "下载 Tmux ${TMUX_VERSION} 源码..."
if ! dot_download_with_fallback "$TMUX_URL" "$TMUX_TARBALL"; then
  cleanup_tmux_build
  log_error "tmux 源码下载失败。"
  return 1
fi

(
  set -e
  cd "$TMUX_TMPDIR" || exit 1
  tar xzf "$TMUX_TARBALL"
  cd "tmux-${TMUX_VERSION}" || exit 1
  log_info "配置编译参数..."
  ./configure --prefix=/usr/local
  log_info "编译中..."
  make -j"$(nproc 2>/dev/null || printf '1')"
  log_info "安装到 /usr/local..."
  dot_sudo make install
)
build_status=$?
cleanup_tmux_build
if [[ "$build_status" -ne 0 ]]; then
  log_error "Tmux ${TMUX_VERSION} 编译或安装失败。"
  return "$build_status"
fi

hash -r
if ! command -v tmux >/dev/null 2>&1; then
  log_error "源码安装结束后仍找不到 tmux 命令。"
  return 1
fi

TMUX_VERSION_OUTPUT="$(tmux -V 2>/dev/null || true)"
if [[ -z "$TMUX_VERSION_OUTPUT" || "$TMUX_VERSION_OUTPUT" != *"$TMUX_VERSION"* ]]; then
  log_error "tmux 版本验证失败，期望 ${TMUX_VERSION}，实际：${TMUX_VERSION_OUTPUT:-unknown}"
  return 1
fi

log_ok "Tmux ${TMUX_VERSION} 编译安装完成 (${TMUX_VERSION_OUTPUT})"
