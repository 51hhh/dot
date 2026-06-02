# 跳过密钥生成并检查现有密钥
log_info "跳过密钥生成，检查现有 SSH 密钥..."

found_keys=()
for keyfile in "$HOME"/.ssh/id_*; do
  # 排除 .pub 公钥文件
  if [ -f "$keyfile" ] && [[ "$keyfile" != *.pub ]]; then
    found_keys+=("$keyfile")
  fi
done

if [[ "${#found_keys[@]}" -gt 0 ]]; then
  log_ok "检测到 ${#found_keys[@]} 个现有密钥:"
  for k in "${found_keys[@]}"; do
    log_info "  $k"
  done
else
  log_warn "未检测到 ~/.ssh/id_* 私钥文件。"
  log_info "如需生成密钥，请返回选择 Ed25519 或 RSA 4096。"
fi
