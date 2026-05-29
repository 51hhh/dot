# Git 配置
log_info "正在配置 Git..."

git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.lg "log --oneline --graph --all"
git config --global alias.last "log -1 HEAD"
git config --global alias.unstage "reset HEAD --"
git config --global core.autocrlf input
git config --global pull.rebase true

log_ok "Git 配置完成"
