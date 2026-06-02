# SSH 配置完成后的提示
cat <<'SSH_FINAL_NOTES'

============================================================
 SSH 配置流程已结束
------------------------------------------------------------
  1) 请在新终端测试 SSH 连接后再关闭此会话：
       ssh -p <端口> <用户名>@<服务器IP>

  2) 为密钥设置 passphrase（推荐）：
       ssh-keygen -p -f ~/.ssh/id_ed25519

  3) 如果修改了 SSH 端口，请确保防火墙和云安全组已同步放行。

  4) 如果启用了 fail2ban，可查看封禁状态：
       sudo fail2ban-client status sshd

  5) 如果启用了 UFW，可查看防火墙状态：
       sudo ufw status verbose

  6) 如果修改了 Host Key，客户端需要清理旧记录：
       ssh-keygen -R <服务器IP>
============================================================
SSH_FINAL_NOTES

log_ok "SSH 后续操作提示已显示"
