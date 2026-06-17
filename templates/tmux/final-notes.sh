# Tmux 安装完成后的提示
cat <<'TMUX_FINAL_NOTES'

============================================================
 ✅ Tmux 配置完成！
------------------------------------------------------------
 📋 已完成的工作：
   ✅ Tmux 已安装/升级
   ✅ TPM 插件管理器已安装
   ✅ 配置文件已写入：~/.tmux.conf
   ✅ 插件已自动安装完成（8个）

 🎨 已安装的插件：
   • tpm                  - 插件管理器
   • tmux-sensible        - 合理默认配置
   • vim-tmux-navigator   - Vim/Neovim 窗格导航
   • tmux-yank            - 系统剪贴板同步
   • tmuxifier            - 布局管理
   • tmux-cpu             - CPU/内存状态
   • tmux-battery         - 电池状态
   • catppuccin/tmux      - Catppuccin 主题

 🚀 开始使用：
   1) 启动 tmux：
        tmux

   2) 前缀键：Ctrl+Space（不是 Ctrl+B）

   3) 常用快捷键：
        Ctrl+Space + c       新建窗口
        Ctrl+Space + ,       重命名窗口
        Ctrl+Space + %       垂直分割
        Ctrl+Space + "       水平分割
        Ctrl+Space + r       重载配置

 💡 重要提示：
   ⚠️  插件已自动安装，无需手动按 Ctrl+Space + I
   📝 如需重新安装插件：Ctrl+Space 然后 Shift+I
   🔄 如需更新插件：Ctrl+Space 然后 Shift+U

 🎨 主题显示：
   - 配色：Catppuccin 柔和粉紫色系
   - 状态栏：右侧显示 CPU、内存、会话、时间、电池
   - 字体：需要 Nerd Font 才能正确显示图标
     （终端设置：JetBrainsMono Nerd Font Mono）

 📖 配置文件位置：~/.tmux.conf
============================================================
TMUX_FINAL_NOTES

log_ok "Tmux 配置完成"
