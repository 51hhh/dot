#!/usr/bin/env bash
# Docker SSH 测试流程
# 用于在真实 SSH 环境中测试 dot 安装脚本（特别是 tmux 主题显示）

set -euo pipefail

# 颜色输出
log()  { printf "\033[1;34m[*]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[+]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[!]\033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m[x]\033[0m %s\n" "$*" >&2; exit 1; }

# 配置
CONTAINER_NAME="dot-ssh-test"
SSH_PORT=2222
SSH_PASSWORD="test123"
SCRIPT_PATH="$(pwd)/dist/dot.sh"

# 检查依赖
check_dependencies() {
    log "检查依赖..."
    command -v docker >/dev/null || die "需要安装 docker"
    command -v sshpass >/dev/null || warn "未安装 sshpass，需要手动输入密码"
    ok "依赖检查完成"
}

# 清理旧容器
cleanup_old_container() {
    log "清理旧容器..."
    if docker ps -a | grep -q "$CONTAINER_NAME"; then
        docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1
        ok "已删除旧容器"
    else
        ok "无旧容器需要清理"
    fi
}

# 构建脚本
build_script() {
    log "构建 dot 安装脚本..."
    npm run build >/dev/null 2>&1

    if [[ ! -f "$SCRIPT_PATH" ]]; then
        die "构建失败：找不到 $SCRIPT_PATH"
    fi

    local size=$(ls -lh "$SCRIPT_PATH" | awk '{print $5}')
    ok "脚本已构建: $SCRIPT_PATH ($size)"
}

# 创建并配置容器
create_container() {
    log "创建 Ubuntu 24.04 容器..."
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "$SSH_PORT:22" \
        -v "$SCRIPT_PATH:/root/dot-setup.sh" \
        ubuntu:24.04 \
        sleep infinity

    ok "容器已创建: $CONTAINER_NAME"

    log "安装 SSH 服务和依赖..."
    docker exec "$CONTAINER_NAME" bash -c "
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y openssh-server sudo git curl wget \
            build-essential libevent-dev libncurses-dev \
            bison autoconf automake pkg-config -qq >/dev/null 2>&1

        # 配置 SSH
        mkdir -p /var/run/sshd
        echo 'root:$SSH_PASSWORD' | chpasswd
        sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
        sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

        # 启动 SSH 服务
        /usr/sbin/sshd
    "

    ok "SSH 服务已配置并启动"
}

# 验证容器状态
verify_container() {
    log "验证容器状态..."

    # 检查容器运行
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        die "容器未运行"
    fi

    # 检查脚本挂载
    if ! docker exec "$CONTAINER_NAME" test -f /root/dot-setup.sh; then
        die "脚本未正确挂载"
    fi

    # 检查 SSH 服务
    if ! docker exec "$CONTAINER_NAME" pgrep sshd >/dev/null; then
        die "SSH 服务未运行"
    fi

    # 检查脚本权限
    docker exec "$CONTAINER_NAME" chmod +x /root/dot-setup.sh

    ok "容器状态正常"
}

# 显示连接信息
show_connection_info() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║          ✅ Docker SSH 测试环境已就绪                     ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    echo "📦 容器信息:"
    echo "  - 容器名称: $CONTAINER_NAME"
    echo "  - SSH 端口: localhost:$SSH_PORT"
    echo "  - 用户名: root"
    echo "  - 密码: $SSH_PASSWORD"
    echo "  - 脚本路径: /root/dot-setup.sh"
    echo ""
    echo "🔑 连接方式 1（推荐 - 自动登录）:"
    if command -v sshpass >/dev/null; then
        echo "  sshpass -p '$SSH_PASSWORD' ssh -p $SSH_PORT -o StrictHostKeyChecking=no root@localhost"
    else
        echo "  # 安装 sshpass: sudo apt-get install sshpass"
        echo "  sshpass -p '$SSH_PASSWORD' ssh -p $SSH_PORT -o StrictHostKeyChecking=no root@localhost"
    fi
    echo ""
    echo "🔑 连接方式 2（手动输入密码）:"
    echo "  ssh -p $SSH_PORT root@localhost"
    echo "  密码: $SSH_PASSWORD"
    echo ""
    echo "📝 登录后执行:"
    echo "  /root/dot-setup.sh"
    echo "  # 或者"
    echo "  bash /root/dot-setup.sh"
    echo ""
    echo "🎯 测试要点:"
    echo "  1. 选择 'Tmux 一键配置' → '安装方式' → '安装推荐tmux安装配置'"
    echo "  2. 安装完成后执行: tmux"
    echo "  3. 验证底栏主题显示是否正确（Catppuccin 配色 + 图标）"
    echo "  4. 验证状态栏模块: CPU、内存、电池、时间等"
    echo "  5. 测试前缀键: Ctrl+Space"
    echo ""
    echo "🧹 测试完成后清理:"
    echo "  docker rm -f $CONTAINER_NAME"
    echo ""
}

# 快速连接函数
quick_connect() {
    if command -v sshpass >/dev/null; then
        log "使用 sshpass 自动连接..."
        sshpass -p "$SSH_PASSWORD" ssh -p "$SSH_PORT" -o StrictHostKeyChecking=no root@localhost
    else
        log "手动连接（输入密码: $SSH_PASSWORD）..."
        ssh -p "$SSH_PORT" -o StrictHostKeyChecking=no root@localhost
    fi
}

# 主函数
main() {
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║       Docker SSH 测试环境 - dot 安装脚本测试工具         ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""

    check_dependencies
    cleanup_old_container
    build_script
    create_container
    verify_container
    show_connection_info

    # 询问是否立即连接
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    read -p "是否立即通过 SSH 连接到容器？(y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        quick_connect
    else
        ok "环境已就绪，随时可以连接测试"
    fi
}

main "$@"
