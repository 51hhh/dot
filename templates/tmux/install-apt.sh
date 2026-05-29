# Tmux 包管理器安装
log_info "通过 apt 安装 Tmux..."
apt-get update -qq
apt-get install -y tmux
log_ok "Tmux 安装完成 ($(tmux -V))"
