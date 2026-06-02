export function generateRuntimeGithub(): string {
  return `readonly -a DOT_GITHUB_MIRRORS=(
  ''
  'https://gh.ddlc.top/'
  'https://gh.llkk.cc/'
  'https://ghfast.top/'
  'https://gh-proxy.com/'
  'https://ghproxy.net/'
  'https://hub.gitmirror.com/'
  'https://ghproxy.cc/'
  'https://ghproxy.cn/'
  'https://ghproxy.com/'
  'https://mirror.ghproxy.com/'
)
DOT_GITHUB_SELECTED_PREFIX=""
DOT_GITHUB_ORDERED_PREFIXES=()
DOT_GITHUB_MIRROR_TESTED=0
DOT_GITHUB_MIRROR_TRUST_WARNED=0

dot_warn_github_mirror_trust() {
  if [[ "@{DOT_GITHUB_MIRROR_TRUST_WARNED:-0}" == "1" ]]; then
    return 0
  fi
  log_warn "GitHub 第三方镜像会成为下载/克隆内容的信任来源；当前脚本未校验镜像内容签名或校验和。"
  DOT_GITHUB_MIRROR_TRUST_WARNED=1
}

dot_sudo() {
  if [[ "@{EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return $?
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi

  log_error "需要 root 权限执行: $*"
  log_error "请以 root 运行，或先安装 sudo 并授予当前用户权限。"
  return 1
}

dot_github_ordered_prefixes() {
  local prefix existing seen
  local ordered=()

  if [[ -n "@{DOT_GITHUB_SELECTED_PREFIX:-}" ]]; then
    ordered+=("$DOT_GITHUB_SELECTED_PREFIX")
  fi

  for prefix in "@{DOT_GITHUB_ORDERED_PREFIXES[@]:-}"; do
    seen=0
    for existing in "@{ordered[@]:-}"; do
      if [[ "$existing" == "$prefix" ]]; then seen=1; fi
    done
    if [[ "$seen" == "0" ]]; then ordered+=("$prefix"); fi
  done

  for prefix in "@{DOT_GITHUB_MIRRORS[@]}"; do
    seen=0
    for existing in "@{ordered[@]:-}"; do
      if [[ "$existing" == "$prefix" ]]; then seen=1; fi
    done
    if [[ "$seen" == "0" ]]; then ordered+=("$prefix"); fi
  done

  printf '%s\n' "@{ordered[@]}"
}

dot_github_url() {
  local prefix="$1" url="$2"
  if [[ -z "$prefix" ]]; then
    printf '%s' "$url"
  else
    printf '%s%s' "$prefix" "$url"
  fi
}

dot_download_from_url() {
  local url="$1" out="$2"
  local downloader

  if command -v wget >/dev/null 2>&1; then
    downloader="wget"
  elif command -v curl >/dev/null 2>&1; then
    downloader="curl"
  else
    log_error "下载失败：系统中未找到 wget 或 curl。"
    return 1
  fi

  mkdir -p "$(dirname "$out")"
  if [[ "$downloader" == "wget" ]]; then
    wget --tries=2 --timeout=30 -q -O "$out" "$url"
  else
    curl -fL --connect-timeout 10 --max-time 180 -o "$out" "$url"
  fi
}

dot_download_with_fallback() {
  local url="$1" out="$2"
  local prefix candidate downloader

  if command -v wget >/dev/null 2>&1; then
    downloader="wget"
  elif command -v curl >/dev/null 2>&1; then
    downloader="curl"
  else
    log_error "下载失败：系统中未找到 wget 或 curl。"
    return 1
  fi

  mkdir -p "$(dirname "$out")"
  while IFS= read -r prefix; do
    candidate="$(dot_github_url "$prefix" "$url")"
    if [[ -z "$prefix" ]]; then
      log_info "下载（直连）: $url"
    else
      dot_warn_github_mirror_trust
      log_info "下载（镜像）: $candidate"
    fi

    if [[ "$downloader" == "wget" ]]; then
      if wget --tries=2 --timeout=30 -q -O "$out" "$candidate"; then
        log_ok "下载成功"
        return 0
      fi
    else
      if curl -fL --connect-timeout 10 --max-time 180 -o "$out" "$candidate"; then
        log_ok "下载成功"
        return 0
      fi
    fi

    rm -f "$out"
    log_warn "本次下载失败，尝试下一个源..."
  done < <(dot_github_ordered_prefixes)

  log_error "所有下载源均失败: $url"
  log_warn "如 GitHub 不可达，请配置 https_proxy/http_proxy 后重试，或手动下载到目标路径。"
  return 1
}

dot_git_clone_with_fallback() {
  local repo="$1" dest="$2"
  shift 2
  local prefix candidate
  local extra_args=("$@")

  if ! command -v git >/dev/null 2>&1; then
    log_error "克隆失败：系统中未找到 git。"
    return 1
  fi

  mkdir -p "$(dirname "$dest")"
  while IFS= read -r prefix; do
    candidate="$(dot_github_url "$prefix" "$repo")"
    if [[ -z "$prefix" ]]; then
      log_info "克隆（直连）: $repo"
    else
      dot_warn_github_mirror_trust
      log_info "克隆（镜像）: $candidate"
    fi

    if git clone "@{extra_args[@]}" "$candidate" "$dest"; then
      log_ok "克隆成功"
      return 0
    fi

    if [[ ! -d "$dest/.git" ]]; then
      rm -rf "$dest"
    fi
    log_warn "本次克隆失败，尝试下一个源..."
  done < <(dot_github_ordered_prefixes)

  log_error "所有 GitHub 克隆源均失败: $repo"
  return 1
}

dot_git_pull_with_fallback() {
  local repo_dir="$1" repo="$2"
  local original candidate prefix updated=0

  original="$(git -C "$repo_dir" remote get-url origin 2>/dev/null || printf '%s' "$repo")"
  while IFS= read -r prefix; do
    candidate="$(dot_github_url "$prefix" "$repo")"
    if [[ -z "$prefix" ]]; then
      log_info "更新 TPM（直连）: $candidate"
    else
      dot_warn_github_mirror_trust
      log_info "更新 TPM（镜像）: $candidate"
    fi

    if git -C "$repo_dir" remote set-url origin "$candidate" && git -C "$repo_dir" pull --ff-only; then
      updated=1
      break
    fi
    log_warn "本次 TPM 更新失败，尝试下一个源..."
  done < <(dot_github_ordered_prefixes)

  git -C "$repo_dir" remote set-url origin "$original" 2>/dev/null || true
  [[ "$updated" == "1" ]]
}`;
}
