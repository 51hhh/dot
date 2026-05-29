# Tmux 配置文件初始化
TMUX_CONF="$HOME/.tmux.conf"

# 备份已有配置
if [ -f "$TMUX_CONF" ]; then
  cp "$TMUX_CONF" "${TMUX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  log_info "已备份原有配置"
fi

# 写入配置头
cat > "$TMUX_CONF" << 'TMUX_CONF_HEADER'
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Tmux 配置 - 由 dot 自动生成
#  DO NOT EDIT - 重新运行脚本即可覆盖
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TMUX_CONF_HEADER

log_info "初始化 tmux.conf"
