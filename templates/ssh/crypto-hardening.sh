# 现代密码套件（Mozilla Modern）
SSHD_CONFIG="/etc/ssh/sshd_config"

KEX="curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp521,ecdh-sha2-nistp384,ecdh-sha2-nistp256,diffie-hellman-group-exchange-sha256"
CIPHERS="chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr"
MACS="hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,umac-128-etm@openssh.com,hmac-sha2-512,hmac-sha2-256,umac-128@openssh.com"

# 幂等检查
if grep -Eq '^[[:space:]]*KexAlgorithms[[:space:]]+curve25519-sha256' "$SSHD_CONFIG" \
   && grep -Eq '^[[:space:]]*Ciphers[[:space:]]+chacha20-poly1305' "$SSHD_CONFIG" \
   && grep -Eq '^[[:space:]]*MACs[[:space:]]+hmac-sha2-512-etm' "$SSHD_CONFIG"; then
  log_info "现代密码套件已配置，跳过。"
else
  TIMESTAMP="$(date +%Y%m%d%H%M%S)"
  dot_sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.${TIMESTAMP}"
  log_info "已备份 sshd_config -> ${SSHD_CONFIG}.bak.${TIMESTAMP}"

  dot_sudo sed -i '/^#\?KexAlgorithms/d' "$SSHD_CONFIG"
  dot_sudo sed -i '/^#\?Ciphers/d' "$SSHD_CONFIG"
  dot_sudo sed -i '/^#\?MACs/d' "$SSHD_CONFIG"

  cat <<EOF | dot_sudo tee -a "$SSHD_CONFIG" >/dev/null
KexAlgorithms ${KEX}
Ciphers ${CIPHERS}
MACs ${MACS}
EOF

  if ! dot_sudo sshd -t 2>/dev/null; then
    log_error "sshd 配置验证失败，已恢复备份。"
    dot_sudo cp "${SSHD_CONFIG}.bak.${TIMESTAMP}" "$SSHD_CONFIG"
    return 1
  fi
fi

# 过滤弱 DH moduli（< 3071 bit）
MODULI="/etc/ssh/moduli"
if [[ -f "$MODULI" ]]; then
  strong_count=$(awk '$5 >= 3071' "$MODULI" | wc -l)
  if [[ "$strong_count" -gt 0 ]]; then
    dot_sudo awk '$5 >= 3071' "$MODULI" | dot_sudo tee "${MODULI}.safe" >/dev/null
    dot_sudo mv "${MODULI}.safe" "$MODULI"
    log_ok "已过滤弱 DH moduli（保留 >= 3071 bit）"
  else
    log_warn "moduli 文件中无 >= 3071 bit 的条目，请手动替换 moduli 文件"
  fi
else
  log_info "/etc/ssh/moduli 不存在，跳过 DH moduli 过滤"
fi

dot_sudo systemctl restart sshd 2>/dev/null || dot_sudo systemctl restart ssh 2>/dev/null
sleep 1
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  log_ok "已应用 Mozilla Modern 密码套件配置"
else
  log_warn "SSH 服务重启后未检测到活跃状态，请手动检查: systemctl status ssh"
fi
