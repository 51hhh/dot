# 查看本机公钥
log_info "扫描 ~/.ssh/*.pub 公钥..."

found_pubkeys=()
for pubfile in "$HOME"/.ssh/*.pub; do
  if [ -f "$pubfile" ]; then
    found_pubkeys+=("$pubfile")
  fi
done

if [[ "${#found_pubkeys[@]}" -eq 0 ]]; then
  log_warn "未找到任何公钥文件 (~/.ssh/*.pub)"
  log_info "请先运行「生成 SSH 密钥」选项。"
  return 0
fi

log_ok "找到 ${#found_pubkeys[@]} 个公钥:"
echo ""
for pubfile in "${found_pubkeys[@]}"; do
  key_type="$(ssh-keygen -l -f "$pubfile" 2>/dev/null | awk '{print $NF}' | tr -d '()')"
  fingerprint="$(ssh-keygen -lf "$pubfile" 2>/dev/null | awk '{print $2}')"
  echo "  文件: $pubfile"
  echo "  类型: ${key_type:-未知}"
  echo "  指纹: ${fingerprint:-未知}"
  echo "  内容: $(cat "$pubfile")"
  echo ""
done
