# Fcitx5 输入法安装
log_info "正在安装 Fcitx5..."
apt-get update -qq
apt-get install -y fcitx5 fcitx5-chinese-addons fcitx5-frontend-gtk3 fcitx5-frontend-gtk4

log_info "配置输入法环境变量..."
PROFILE="$HOME/.profile"
grep -q "GTK_IM_MODULE=fcitx" "$PROFILE" 2>/dev/null || cat >> "$PROFILE" << 'IM_BLOCK'

# Fcitx5 输入法
export GTK_IM_MODULE=fcitx
export QT_IM_MODULE=fcitx
export XMODIFIERS=@im=fcitx
export SDL_IM_MODULE=fcitx
IM_BLOCK

log_ok "Fcitx5 输入法配置完成"
