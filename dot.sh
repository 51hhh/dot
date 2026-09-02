#!/usr/bin/env bash
# dot：只负责选择、下载、校验、调度独立安装脚本。

set -uo pipefail

readonly OWNER_REPO="51hhh/dot"
readonly BRANCH="master"
declare -gA FILE=([tmux]="TMUX.sh" [zsh]="ZSH.sh")
declare -gA DESC=([tmux]="安装并配置 tmux" [zsh]="安装并配置 zsh")
declare -gA RESULT=()
ORDER=(tmux zsh)
SELECTED=()
DRY_RUN=0
YES=0
COMMIT=""
TMP_DIR=""
TTY_FD=""
UI_FD=2

log() { printf '[dot] %s\n' "$*"; }
err() { printf '[dot] 错误：%s\n' "$*" >&2; }
cleanup() {
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then rm -rf "$TMP_DIR"; fi
  return 0
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
用法：bash dot.sh [选项]
  --list                    列出现有安装脚本
  --select tmux,zsh         选择脚本（非交互）
  --dry-run                 只显示将下载和执行的内容
  --yes, -y                 给子脚本传入 --preset recommended --yes
  --help                    帮助
EOF
}

list_scripts() {
  local id
  for id in "${ORDER[@]}"; do printf '%-8s %-10s %s\n' "$id" "${FILE[$id]}" "${DESC[$id]}"; done
}

valid_id() { [[ -n "${FILE[$1]:-}" ]]; }

open_tty() {
  if [[ -n "${DOT_INPUT_FD:-}" ]]; then
    [[ "$DOT_INPUT_FD" =~ ^[0-9]+$ ]] || {
      err "DOT_INPUT_FD 必须是数字"
      return 1
    }
    TTY_FD="$DOT_INPUT_FD"
    UI_FD=2
  else
    exec 9<>/dev/tty 2>/dev/null || {
      err "交互模式需要终端；请使用 --select"
      return 1
    }
    TTY_FD=9
    UI_FD=9
  fi
}

read_key() {
  local key rest=""
  IFS= read -rsn1 -u "$TTY_FD" key || return 1
  [[ "$key" == $'\r' ]] && key=""
  if [[ "$key" == $'\033' ]]; then
    IFS= read -rsn2 -t 0.05 -u "$TTY_FD" rest || true
    key+="$rest"
  fi
  printf '%s' "$key"
}

parse_selection() {
  local raw="$1" id
  raw="${raw//,/ }"
  for id in $raw; do
    valid_id "$id" || {
      err "未知安装项：$id"
      return 1
    }
    [[ " ${SELECTED[*]} " == *" $id "* ]] || SELECTED+=("$id")
  done
  ((${#SELECTED[@]})) || {
    err "没有选择任何安装项"
    return 1
  }
}

choose_tui() {
  local chosen=(1 1) index=0 input i id mark pointer
  open_tty || return 1
  while :; do
    printf '\033[2J\033[H\033[1mdot 环境配置\033[0m\n────────────────────────────────────────────────────────────\n\n选择要运行的独立安装脚本\n\n' >&"$UI_FD"
    for i in "${!ORDER[@]}"; do
      id="${ORDER[$i]}"
      mark=" "
      pointer=" "
      ((chosen[i])) && mark="✓"
      ((i == index)) && pointer="❯"
      printf '  %s [%s] %-8s %s\n' "$pointer" "$mark" "$id" "${DESC[$id]}" >&"$UI_FD"
    done
    printf '\n  ↑/↓ 或 j/k 移动 · Space 勾选 · Enter 确认\n' >&"$UI_FD"
    input="$(read_key)" || return 1
    case "$input" in
      $'\033[A' | k) ((index > 0)) && index=$((index - 1)) ;;
      $'\033[B' | j) ((index + 1 < ${#ORDER[@]})) && index=$((index + 1)) ;;
      " ") chosen[index]=$((1 - chosen[index])) ;;
      "")
        SELECTED=()
        for i in "${!ORDER[@]}"; do ((chosen[i])) && SELECTED+=("${ORDER[$i]}"); done
        ((${#SELECTED[@]})) || {
          err "至少选择一个安装脚本"
          continue
        }
        return 0
        ;;
    esac
  done
}

fetch_stdout() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 2 "$url" && return; fi
  command -v wget >/dev/null 2>&1 && wget -qO- "$url"
}

resolve_master() {
  local data
  if command -v git >/dev/null 2>&1; then
    data="$(GIT_TERMINAL_PROMPT=0 git ls-remote "https://github.com/$OWNER_REPO.git" "refs/heads/$BRANCH" 2>/dev/null || true)"
    COMMIT="${data%%[[:space:]]*}"
  fi
  if [[ ! "$COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
    data="$(fetch_stdout "https://api.github.com/repos/$OWNER_REPO/commits/$BRANCH" 2>/dev/null || true)"
    # 一条 sed 在第一次命中后退出，避免 `sed | head/sed` 在 pipefail 下产生 SIGPIPE 141。
    COMMIT="$(sed -n 's/.*"sha": "\([0-9a-f]\{40\}\)".*/\1/p; /"sha":/q' <<<"$data")"
  fi
  [[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || {
    err "无法解析最新 $BRANCH 提交"
    return 1
  }
  log "本次固定到 $BRANCH@$COMMIT"
}

download_to() {
  local url="$1" out="$2"
  if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 2 -o "$out" "$url" && return; fi
  command -v wget >/dev/null 2>&1 && wget -qO "$out" "$url"
}

run_selected() {
  local id file url out rc failed=0
  RESULT=()
  TMP_DIR="$(mktemp -d -t dot.XXXXXX)" || return 1
  for id in "${SELECTED[@]}"; do
    file="${FILE[$id]}"
    url="https://raw.githubusercontent.com/$OWNER_REPO/$COMMIT/$file"
    if ((DRY_RUN)); then
      printf '%-8s %s\n' "$id" "$url"
      continue
    fi
    out="$TMP_DIR/$file"
    log "下载 $file"
    if ! download_to "$url" "$out"; then
      err "$file 下载失败"
      RESULT["$id"]="下载失败"
      failed=1
      continue
    fi
    if ! bash -n "$out"; then
      err "$file 语法检查失败，不执行"
      RESULT["$id"]="校验失败"
      failed=1
      continue
    fi
    log "执行 $file"
    rc=0
    if ((YES)); then bash "$out" --preset recommended --yes || rc=$?; else bash "$out" || rc=$?; fi
    if ((rc == 0)); then
      RESULT["$id"]="成功"
      log "$file 成功"
    else
      RESULT["$id"]="失败（退出码 $rc）"
      err "$file 失败（退出码 $rc）"
      failed=1
    fi
  done
  if ((DRY_RUN == 0)); then
    printf '\n安装结果\n────────────────────────────────────────────────────────────\n'
    for id in "${SELECTED[@]}"; do printf '  %-8s %s\n' "$id" "${RESULT[$id]:-未执行}"; done
  fi
  return "$failed"
}

main() {
  while (($#)); do
    case "$1" in
      --list)
        list_scripts
        exit
        ;;
      --select)
        (($# >= 2)) || {
          err "$1 缺少参数"
          exit 2
        }
        parse_selection "$2" || exit 2
        shift 2
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --yes | -y)
        YES=1
        shift
        ;;
      --help | -h)
        usage
        exit
        ;;
      *)
        err "未知参数：$1"
        usage
        exit 2
        ;;
    esac
  done
  ((${#SELECTED[@]})) || choose_tui || exit 1
  resolve_master || exit 1
  run_selected
}

if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then main "$@"; fi
