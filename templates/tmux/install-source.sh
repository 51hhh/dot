# Tmux 源码编译安装（获取最新版本）
log_info "源码编译安装 Tmux..."

apt-get update -qq
apt-get install -y git automake build-essential pkg-config libevent-dev libncurses5-dev libncursesw5-dev

TMUX_VERSION="{{tmux_version:3.4}}"
TMPDIR=$(mktemp -d)

log_info "下载 Tmux ${TMUX_VERSION}..."
cd "$TMPDIR"
curl -fsSL "https://github.com/tmux/tmux/releases/download/${TMUX_VERSION}/tar.xz" -o tmux.tar.xz || \
  git clone --depth 1 --branch "${TMUX_VERSION}" https://github.com/tmux/tmux.git tmux-src

if [ -f tmux.tar.xz ]; then
  tar xf tmux.tar.xz
  cd tmux-*
else
  cd tmux-src
fi

log_info "编译中..."
sh autogen.sh 2>/dev/null || true
./configure --prefix=/usr/local
make -j"$(nproc)"
make install

cd /
rm -rf "$TMPDIR"
log_ok "Tmux ${TMUX_VERSION} 编译安装完成"
