#!/usr/bin/env bash
# tmux 一键安装与配置脚本
#
# 功能：
#   1. 安装系统依赖（自动识别包管理器：apt / dnf / pacman / zypper）
#   2. 检查 tmux 版本，过低（<3.2）时自动从源码编译 tmux 3.4 装到 /usr/local/bin
#   3. 安装 TPM (~/.tmux/plugins/tpm)
#   4. 下载并安装 JetBrainsMono Nerd Font（已存在则跳过）
#   5. 写入 ~/.tmux.conf（旧文件自动备份）
#   6. 清理旧 tmux socket，避免新旧二进制混用导致崩溃
#
# 完成后：
#   - 终端字体设为 "JetBrainsMono Nerd Font Mono"
#   - 启动 tmux，按 Ctrl+Space 然后 Shift+I 拉取所有插件

set -euo pipefail

readonly REQUIRED_TMUX_VERSION="3.2"
readonly TMUX_BUILD_VERSION="3.4"
readonly TPM_REPO="https://github.com/tmux-plugins/tpm"
readonly NERD_FONT_URL="https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip"
readonly TMUX_SRC_URL="https://github.com/tmux/tmux/releases/download/${TMUX_BUILD_VERSION}/tmux-${TMUX_BUILD_VERSION}.tar.gz"

# GitHub 镜像（国内访问失败时自动尝试）
readonly -a GITHUB_MIRRORS=(
    ""                              # 直连
    "https://ghproxy.com/"
    "https://mirror.ghproxy.com/"
    "https://gh.ddlc.top/"
)

# 命令行选项
SKIP_FONT=0
SKIP_PLUGINS=0

log()  { printf "\033[1;34m[*]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[+]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[!]\033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m[x]\033[0m %s\n" "$*" >&2; exit 1; }

# ------------------------------------------------------------------
# 命令行参数
# ------------------------------------------------------------------
parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --no-font)    SKIP_FONT=1 ;;
            --no-plugins) SKIP_PLUGINS=1 ;;
            -h|--help)
                cat <<EOF
用法: $0 [选项]

选项:
  --no-font       跳过 Nerd Font 下载与安装（已自行装好或服务器无 GUI 时用）
  --no-plugins    跳过 TPM 自动预装插件（首次启动 tmux 后用 <P>+I 手动装）
  -h, --help      显示本帮助
EOF
                exit 0 ;;
            *) die "未知参数：$1（用 --help 查看可用选项）" ;;
        esac
        shift
    done
}

# ------------------------------------------------------------------
# 通用下载（带镜像 fallback 与友好错误提示）
# ------------------------------------------------------------------
test_internet() {
    # 探测 github.com 是否可达，3 秒超时
    curl -sSf --max-time 3 -o /dev/null https://github.com 2>/dev/null
}

download_with_fallback() {
    # 用法: download_with_fallback "https://github.com/.../foo.zip" "/path/to/out"
    # 依次尝试直连和各镜像，全部失败则给出诊断并退出
    local url="$1" out="$2"
    local prefix mirror_url

    for prefix in "${GITHUB_MIRRORS[@]}"; do
        if [ -z "$prefix" ]; then
            mirror_url="$url"
            log "下载（直连）: $url"
        else
            # 镜像规则：prefix + 原 URL（保留 https://）
            mirror_url="${prefix}${url}"
            log "下载（镜像）: $mirror_url"
        fi

        if wget --tries=2 --timeout=20 -q --show-progress -O "$out" "$mirror_url"; then
            ok "下载成功"
            return 0
        fi
        warn "本次下载失败，尝试下一个源..."
        rm -f "$out"
    done

    # 所有源都失败 → 给出诊断
    cat >&2 <<EOF

\033[1;31m[x]\033[0m 所有源均下载失败：$url

可能原因与解决方法：
  1) 网络无法访问 GitHub（国内常见）
     - 检查能否访问：curl -I https://github.com
     - 配置代理：export https_proxy=http://代理:端口
     - 或手动下载文件到 $out 后重新运行脚本（会自动跳过已下载部分）
  2) 镜像站全部宕机或限流
     - 稍后重试，或在脚本顶部 GITHUB_MIRRORS 数组添加可用镜像
  3) 磁盘空间不足
     - 检查：df -h $(dirname "$out")

EOF
    return 1
}

# ------------------------------------------------------------------
# 系统依赖
# ------------------------------------------------------------------
detect_pm() {
    if command -v apt-get >/dev/null 2>&1; then echo apt
    elif command -v dnf    >/dev/null 2>&1; then echo dnf
    elif command -v pacman >/dev/null 2>&1; then echo pacman
    elif command -v zypper >/dev/null 2>&1; then echo zypper
    else echo unknown
    fi
}

install_packages() {
    local pm; pm=$(detect_pm)
    local base="git unzip wget curl fontconfig tmux"
    local clip_x11="xclip"
    local clip_wayland="wl-clipboard"
    local optional="acpi"   # 部分发行版/架构没有此包

    case "$pm" in
        apt)
            log "检测到 apt（Debian/Ubuntu）"
            sudo apt-get update -y
            sudo apt-get install -y $base $clip_x11 $clip_wayland
            sudo apt-get install -y $optional || warn "可选包 acpi 安装失败，跳过"
            ;;
        dnf)
            log "检测到 dnf（Fedora/RHEL）"
            sudo dnf install -y $base $clip_x11 $clip_wayland
            sudo dnf install -y $optional || warn "可选包 acpi 安装失败，跳过"
            ;;
        pacman)
            log "检测到 pacman（Arch）"
            sudo pacman -Sy --noconfirm git unzip wget curl fontconfig tmux xclip wl-clipboard
            sudo pacman -S --noconfirm acpi || warn "可选包 acpi 安装失败，跳过"
            ;;
        zypper)
            log "检测到 zypper（openSUSE）"
            sudo zypper install -y $base $clip_x11 $clip_wayland
            sudo zypper install -y $optional || warn "可选包 acpi 安装失败，跳过"
            ;;
        *)
            warn "未识别的包管理器，跳过系统依赖安装"
            warn "请手动确保已安装：tmux git unzip wget curl xclip 或 wl-clipboard"
            return
            ;;
    esac
    ok "系统依赖就绪"
}

install_build_deps_for_tmux() {
    local pm; pm=$(detect_pm)
    case "$pm" in
        apt)    sudo apt-get install -y libevent-dev libncurses-dev build-essential bison pkg-config ;;
        dnf)    sudo dnf install -y libevent-devel ncurses-devel gcc make bison pkgconfig ;;
        pacman) sudo pacman -S --noconfirm libevent ncurses base-devel bison pkgconf ;;
        zypper) sudo zypper install -y libevent-devel ncurses-devel gcc make bison pkg-config ;;
        *)      die "未知包管理器，无法安装 tmux 编译依赖" ;;
    esac
}

# ------------------------------------------------------------------
# tmux 版本检查 & 源码编译
# ------------------------------------------------------------------
version_ge() {
    # 用法: version_ge "3.4" "3.2" → 0 表示 >=
    [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

current_tmux_version() {
    command -v tmux >/dev/null 2>&1 || { echo "0"; return; }
    tmux -V 2>/dev/null | awk '{print $2}' | sed 's/[^0-9.]//g'
}

ensure_tmux_recent() {
    local v; v=$(current_tmux_version)
    if [ "$v" != "0" ] && version_ge "$v" "$REQUIRED_TMUX_VERSION"; then
        ok "tmux $v 已满足要求 (>= $REQUIRED_TMUX_VERSION)"
        return
    fi

    warn "当前 tmux 版本 = ${v:-未安装}，低于要求的 $REQUIRED_TMUX_VERSION"
    log "从源码编译 tmux $TMUX_BUILD_VERSION..."

    install_build_deps_for_tmux

    local workdir; workdir=$(mktemp -d)
    local tarball="$workdir/tmux-${TMUX_BUILD_VERSION}.tar.gz"

    if ! download_with_fallback "$TMUX_SRC_URL" "$tarball"; then
        rm -rf "$workdir"
        die "tmux 源码下载失败，无法继续"
    fi

    (
        cd "$workdir"
        tar xzf "tmux-${TMUX_BUILD_VERSION}.tar.gz"
        cd "tmux-${TMUX_BUILD_VERSION}"
        ./configure --quiet
        make -j"$(nproc)" >/dev/null
        sudo make install >/dev/null
    )
    rm -rf "$workdir"

    # 移除发行版自带的旧版，避免 PATH 命中老二进制
    if [ -x /usr/bin/tmux ] && [ -x /usr/local/bin/tmux ]; then
        if ! version_ge "$(/usr/bin/tmux -V | awk '{print $2}')" "$REQUIRED_TMUX_VERSION"; then
            warn "移除旧版 /usr/bin/tmux"
            local pm; pm=$(detect_pm)
            case "$pm" in
                apt)    sudo apt-get remove -y tmux ;;
                dnf)    sudo dnf remove -y tmux ;;
                pacman) sudo pacman -R --noconfirm tmux 2>/dev/null || true ;;
                zypper) sudo zypper remove -y tmux ;;
            esac
        fi
    fi

    hash -r
    local newv; newv=$(current_tmux_version)
    version_ge "$newv" "$REQUIRED_TMUX_VERSION" || die "tmux 升级失败，仍是 $newv"
    ok "tmux 已升级到 $newv"
}

# ------------------------------------------------------------------
# TPM
# ------------------------------------------------------------------
install_tpm() {
    local tpm_dir="$HOME/.tmux/plugins/tpm"
    if [ -d "$tpm_dir/.git" ]; then
        ok "TPM 已存在，跳过克隆"
        return
    fi
    log "克隆 TPM 到 $tpm_dir"
    if git clone --depth 1 "$TPM_REPO" "$tpm_dir" 2>/dev/null; then
        ok "TPM 就绪"
        return
    fi
    warn "GitHub 直连克隆失败，尝试镜像..."
    local prefix
    for prefix in "${GITHUB_MIRRORS[@]:1}"; do
        if git clone --depth 1 "${prefix}${TPM_REPO}" "$tpm_dir" 2>/dev/null; then
            ok "TPM 就绪（via ${prefix}）"
            return
        fi
        warn "镜像 ${prefix} 失败，继续..."
    done
    die "无法克隆 TPM，请检查网络或代理后重试"
}

# ------------------------------------------------------------------
# Nerd Font
# ------------------------------------------------------------------
install_font() {
    if [ "$SKIP_FONT" = "1" ]; then
        log "已指定 --no-font，跳过字体安装"
        return
    fi
    if fc-list 2>/dev/null | grep -qi "JetBrainsMono Nerd Font"; then
        ok "JetBrainsMono Nerd Font 已存在，跳过下载"
        return
    fi
    local font_dir="$HOME/.local/share/fonts/JetBrainsMono"
    mkdir -p "$font_dir"
    local tmp_zip; tmp_zip=$(mktemp --suffix=.zip)

    if ! download_with_fallback "$NERD_FONT_URL" "$tmp_zip"; then
        rm -f "$tmp_zip"
        warn "字体下载失败。可改用 --no-font 跳过此步骤，或手动安装："
        warn "  1) 浏览器下载 $NERD_FONT_URL"
        warn "  2) unzip 到 $font_dir"
        warn "  3) fc-cache -f"
        die "字体安装中断"
    fi

    log "解压字体..."
    if ! unzip -oq "$tmp_zip" -d "$font_dir"; then
        rm -f "$tmp_zip"
        die "字体压缩包损坏，请重试"
    fi
    rm -f "$tmp_zip"
    fc-cache -f
    ok "字体安装完成"
}

# ------------------------------------------------------------------
# 写入 ~/.tmux.conf
# ------------------------------------------------------------------
write_tmux_conf() {
    local conf="$HOME/.tmux.conf"
    if [ -f "$conf" ]; then
        local backup="${conf}.bak.$(date +%Y%m%d-%H%M%S)"
        cp "$conf" "$backup"
        warn "已备份原配置到 $backup"
    fi

    cat > "$conf" <<'TMUX_CONF_EOF'
# List of plugins
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'christoomey/vim-tmux-navigator'
set -g @plugin 'tmux-plugins/tmux-yank'
set -g @plugin 'jimeh/tmuxifier'
set -g @plugin 'tmux-plugins/tmux-cpu'
set -g @plugin 'tmux-plugins/tmux-battery'
set -g @plugin 'catppuccin/tmux'

# catppuccin theme options (must be set BEFORE TPM runs catppuccin)
set -g @catppuccin_window_status_style "rounded"

# Status line modules
set -g status-right-length 200
set -g status-left-length 200
set -g status-left ""
set -g status-right "#{E:@catppuccin_status_application}"
set -agF status-right "#{E:@catppuccin_status_cpu}"
set -agF status-right "#{E:@catppuccin_status_ram}"
set -ag status-right "#{E:@catppuccin_status_session}"
set -ag status-right "#{E:@catppuccin_status_uptime}"
set -agF status-right "#{E:@catppuccin_status_battery}"

# non-plugin options
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",*256col*:Tc"
set -g base-index 1
set -g pane-base-index 1
set -g renumber-windows on
set -g mouse on

# visual mode
set-window-option -g mode-keys vi
bind-key -T copy-mode-vi v send-keys -X begin-selection
bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle
bind-key -T copy-mode-vi y send-keys -X copy-selection-and-cancel

# keymaps
unbind C-b
set -g prefix C-Space
bind r source-file ~/.tmux.conf \; display "reloaded"

# Initialize TMUX plugin manager (keep this line at the very bottom of tmux.conf)
run '~/.tmux/plugins/tpm/tpm'
TMUX_CONF_EOF

    ok "已写入 $conf"
}

# ------------------------------------------------------------------
# 清理可能残留的旧 socket
# ------------------------------------------------------------------
clean_stale_sockets() {
    if [ -n "${TMUX:-}" ]; then
        warn "当前 shell 在 tmux 内运行，跳过 socket 清理"
        warn "建议退出所有 tmux 会话后重新运行脚本，或手动执行："
        warn "    tmux kill-server && rm -rf /tmp/tmux-\$(id -u)"
        return
    fi
    if pgrep -u "$USER" -x tmux >/dev/null 2>&1; then
        log "杀掉当前用户的 tmux server"
        tmux kill-server 2>/dev/null || true
    fi
    local sockdir="/tmp/tmux-$(id -u)"
    if [ -d "$sockdir" ]; then
        log "清理 $sockdir"
        rm -rf "$sockdir"
    fi
}

# ------------------------------------------------------------------
# 预装插件（不依赖 <P>+I，可选）
# ------------------------------------------------------------------
preinstall_plugins() {
    if [ "$SKIP_PLUGINS" = "1" ]; then
        log "已指定 --no-plugins，跳过插件预装（启动 tmux 后按 <P>+I 手动安装）"
        return
    fi
    local script="$HOME/.tmux/plugins/tpm/bin/install_plugins"
    [ -x "$script" ] || { warn "TPM 安装脚本不存在，跳过预装"; return; }

    log "通过 TPM 脚本预装插件..."
    if "$script" 2>&1 | tee /tmp/tpm-install.log | tail -10; then
        if grep -qiE "fatal|error|failed" /tmp/tpm-install.log; then
            warn "部分插件可能克隆失败（多见于 GitHub 限速）"
            warn "完整日志：/tmp/tpm-install.log"
            warn "可在 tmux 内按 <P>+I 重试，或配代理后重新运行本脚本"
        else
            ok "插件已就绪"
        fi
    else
        warn "TPM 预装脚本退出异常，请在 tmux 内按 <P>+I 手动重试"
    fi
}

# ------------------------------------------------------------------
# main
# ------------------------------------------------------------------
main() {
    parse_args "$@"
    log "开始安装 tmux 配置环境"

    if ! test_internet; then
        warn "无法访问 github.com（3 秒探测超时）"
        warn "脚本会自动尝试镜像，如全部失败请配置代理后重试："
        warn "  export https_proxy=http://代理:端口"
        warn "  export http_proxy=\$https_proxy"
    fi

    install_packages
    ensure_tmux_recent
    install_tpm
    install_font
    write_tmux_conf
    clean_stale_sockets
    preinstall_plugins

    cat <<'NEXT_STEPS'

============================================================
 安装完成！
------------------------------------------------------------
 1) 把终端字体改为 "JetBrainsMono Nerd Font Mono"
    （否则状态栏图标会显示成方框）

    Ptyxis 用户：
      PROFILE_UUID=$(gsettings get org.gnome.Ptyxis default-profile-uuid | tr -d "'")
      SCHEMA="org.gnome.Ptyxis.Profile:/org/gnome/Ptyxis/Profiles/${PROFILE_UUID}/"
      gsettings set "$SCHEMA" use-system-font false
      gsettings set "$SCHEMA" font 'JetBrainsMono Nerd Font Mono 12'
    然后重开终端窗口。

    GNOME Terminal、Konsole、Alacritty、kitty、WezTerm 用户
    请在各自配置中切换字体。

 2) 启动 tmux：
      tmux

 3) 插件已通过脚本预装，状态栏可直接生效。
    若想手动刷新插件列表：在 tmux 内按  Ctrl+Space  然后  Shift+I

 4) 重载配置（修改 ~/.tmux.conf 后）：Ctrl+Space  然后  r

 享用 tmux！
============================================================
NEXT_STEPS
}

main "$@"
