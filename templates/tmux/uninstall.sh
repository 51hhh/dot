#!/usr/bin/env bash
# 完全卸载 Tmux 及其配置

echo "🗑️  开始卸载 Tmux..."
echo ""

# 1. 杀死所有 tmux 会话
if command -v tmux &>/dev/null; then
  echo "📋 关闭所有 Tmux 会话..."
  tmux kill-server 2>/dev/null || true
  echo "   ✓ 会话已关闭"
fi

# 2. 卸载 tmux 包
echo ""
echo "📦 卸载 Tmux 程序..."

if command -v apt-get &>/dev/null; then
  sudo apt-get remove --purge -y tmux 2>/dev/null && echo "   ✓ apt: tmux 已卸载"
  sudo apt-get autoremove -y 2>/dev/null
elif command -v yum &>/dev/null; then
  sudo yum remove -y tmux 2>/dev/null && echo "   ✓ yum: tmux 已卸载"
elif command -v brew &>/dev/null; then
  brew uninstall tmux 2>/dev/null && echo "   ✓ brew: tmux 已卸载"
fi

# 如果是源码安装，删除二进制文件
if [ -f /usr/local/bin/tmux ]; then
  echo "   发现源码安装的 tmux..."
  sudo rm -f /usr/local/bin/tmux
  sudo rm -f /usr/local/share/man/man1/tmux.1*
  echo "   ✓ 源码安装的 tmux 已删除"
fi

# 3. 删除配置文件
echo ""
echo "🗂️  删除配置文件..."

if [ -f "$HOME/.tmux.conf" ]; then
  rm -f "$HOME/.tmux.conf"
  echo "   ✓ ~/.tmux.conf 已删除"
fi

if [ -f "$HOME/.tmux.conf.local" ]; then
  rm -f "$HOME/.tmux.conf.local"
  echo "   ✓ ~/.tmux.conf.local 已删除"
fi

# 4. 删除插件目录
echo ""
echo "🔌 删除插件目录..."

if [ -d "$HOME/.tmux" ]; then
  rm -rf "$HOME/.tmux"
  echo "   ✓ ~/.tmux/ 已删除（包括 TPM 和所有插件）"
fi

# 5. 清理 socket 文件
echo ""
echo "🧹 清理 socket 文件..."

if [ -d "/tmp/tmux-$(id -u)" ]; then
  rm -rf "/tmp/tmux-$(id -u)"
  echo "   ✓ /tmp/tmux-$(id -u)/ 已删除"
fi

# 6. 清理备份文件
if [ -d "$HOME/.tmux-backup" ]; then
  rm -rf "$HOME/.tmux-backup"
  echo "   ✓ ~/.tmux-backup/ 已删除"
fi

echo ""
echo "✅ Tmux 卸载完成！"
echo ""
echo "已清理："
echo "  - Tmux 程序"
echo "  - 配置文件 (~/.tmux.conf)"
echo "  - 插件目录 (~/.tmux/)"
echo "  - Socket 文件 (/tmp/tmux-*)"
echo "  - 所有会话数据"
