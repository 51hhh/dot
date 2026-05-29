# Zsh + Oh-My-Zsh 安装配置
log_info "正在安装 Zsh..."
apt-get update -qq
apt-get install -y zsh git curl

log_info "正在安装 Oh-My-Zsh..."
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

log_info "配置 Zsh 主题和插件..."
ZSHRC="$HOME/.zshrc"
sed -i 's/ZSH_THEME=".*"/ZSH_THEME="{{theme}}"/' "$ZSHRC"
sed -i 's/plugins=(.*)/plugins=({{plugins}})/' "$ZSHRC"

log_info "设置 Zsh 为默认 shell..."
chsh -s "$(which zsh)" "$USER" 2>/dev/null || true

log_ok "Zsh 配置完成"
