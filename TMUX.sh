#!/usr/bin/env bash
#
# TMUX.sh — Tmux 交互式安装与配置
#
# 架构：ask → answers → plan → run
#
#   ask    交互提问（唯一需要 TTY 的部分）
#   ANS    答案表，纯数据，可存盘 / 可手写 / 可 diff
#   plan   answers → 有序步骤列表（纯函数，无副作用，可秒级测试）
#   run    按计划执行
#
# 四个声明原语：recipe / ask / step / preset  —— 见 §8
# 步骤顺序由 4 个阶段决定：prepare → install → configure → final
# 没有依赖图、没有拓扑排序、没有递归菜单。
#
# 调试：
#   ./TMUX.sh --save-answers a.txt    交互一次并存盘
#   ./TMUX.sh --answers a.txt          之后一条命令无限复现
#   ./TMUX.sh --answers a.txt --dry-run   只看计划，不执行
#
# 用 --help 查看全部选项。

# ══════════════════════════════════════════════════════════════════
# §1 core
# ══════════════════════════════════════════════════════════════════

set -uo pipefail

# 需要 bash 4.2：关联数组（4.0）+ declare -g（4.2）。
# declare -g 让本文件被 source 时数组仍落在全局作用域，
# 因此 when_ok / build_plan 这些纯函数可以被测试框架直接调用。
if [[ -z "${BASH_VERSINFO:-}" ]] \
  || ((BASH_VERSINFO[0] < 4)) \
  || ((BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 2)); then
  echo "TMUX.sh 需要 bash 4.2 及以上，当前为 ${BASH_VERSION:-未知}。" >&2
  echo "macOS 自带 bash 3.2，请先 brew install bash。" >&2
  exit 1
fi

# stdout 不是终端时一律不上色：否则 `curl … | bash | tee log`、
# 重定向和测试框架抓到的输出里会混进转义序列。
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[1;33m'
  CYAN=$'\033[0;36m'
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  NC=$'\033[0m'
else
  RED='' GREEN='' YELLOW='' CYAN='' BOLD='' DIM='' NC=''
fi

log_info() { printf '%b[*]%b %s\n' "$CYAN" "$NC" "$*"; }
log_ok() { printf '%b[+]%b %s\n' "$GREEN" "$NC" "$*"; }
log_warn() { printf '%b[!]%b %s\n' "$YELLOW" "$NC" "$*" >&2; }
log_error() { printf '%b[x]%b %s\n' "$RED" "$NC" "$*" >&2; }
die() {
  log_error "$*"
  exit 1
}

# 单元分隔符：用于在单个字符串里安全地拼接含空格的字段
US=$'\x1f'

# 特权提升：已是 root 则直接执行
dot_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    log_error "需要 root 权限但未找到 sudo：$*"
    return 1
  fi
}

# ══════════════════════════════════════════════════════════════════
# §2 tty
# ══════════════════════════════════════════════════════════════════

# 输入源：测试时用 DOT_INPUT_FD 注入按键，交互时用 /dev/tty
# （用 /dev/tty 而非 stdin，因此 curl | bash 也能交互）
#
# 注意：不能用 [[ -r /dev/tty ]] 判断——setsid 等没有控制终端的场景下
# 权限位是可读的，但 open 会失败。必须真的打开一次。
if [[ -n "${DOT_INPUT_FD:-}" ]]; then
  [[ "$DOT_INPUT_FD" =~ ^[0-9]+$ ]] || die "DOT_INPUT_FD 必须是数字文件描述符"
  TTY_FD="$DOT_INPUT_FD"
elif (: </dev/tty) 2>/dev/null; then
  exec 9</dev/tty
  TTY_FD=9
else
  TTY_FD=""
fi

has_input() { [[ -n "$TTY_FD" ]]; }

read_key() {
  local key="" seq=""
  has_input || return 1
  IFS= read -rsn1 -u "$TTY_FD" key || return 1
  # 解析 ESC 序列（方向键等）
  if [[ "$key" == $'\e' ]]; then
    while :; do
      IFS= read -rsn1 -t 0.05 -u "$TTY_FD" seq 2>/dev/null || break
      key+="$seq"
      [[ "$seq" == [A-Za-z~] ]] && break
    done
  fi
  printf '%s' "$key"
}

read_line() {
  local line=""
  has_input || return 1
  IFS= read -r -u "$TTY_FD" line || return 1
  printf '%s' "$line"
}

is_back_key() {
  case "$1" in
    $'\e[D' | $'\eOD' | b | B) return 0 ;;
    *) return 1 ;;
  esac
}

# 所有转义序列都只在 stdout 是终端时输出，
# 否则会污染管道/重定向的内容（例如测试框架的 TAP 输出）。
clear_screen() {
  [[ -t 1 ]] && printf '\033[2J\033[H'
  return 0
}
hide_cursor() {
  [[ -t 1 ]] && printf '\033[?25l'
  return 0
}
show_cursor() {
  [[ -t 1 ]] && printf '\033[?25h'
  return 0
}
# 光标恢复的 trap 在 main 里安装，不在 source 时安装：
# 否则会覆盖宿主环境（如测试框架）自己的 EXIT trap。

RULE='────────────────────────────────────────────────────────'

render_head() {
  local pos="$1" total="$2" label="$3"
  clear_screen
  hide_cursor
  printf '%b%s%b\n' "$BOLD" "${RECIPE_NAME:-TMUX.sh}" "$NC"
  printf '%b第 %s/%s 步 · %s%b\n' "$DIM" "$pos" "$total" "$label" "$NC"
  printf '%s\n' "$RULE"
}

render_foot() {
  printf '%s\n' "$RULE"
  printf '%b%s%b\n' "$DIM" "$1" "$NC"
}

# ══════════════════════════════════════════════════════════════════
# §3 registry
# ══════════════════════════════════════════════════════════════════
#
# 三个关联数组，复合键。加字段 = 注册器加一行，runtime 不动。
#   Q[<id>.kind|.label|.opts|.when|.default]
#   S[<id>.phase|.when|.label]
#   ANS[<key>] = 答案

declare -gA Q=()
declare -gA S=()
declare -gA ANS=()
declare -gA PRESETS=()
declare -gA PRESET_WHEN=()
QIDS=()
SIDS=()
PNAMES=()
PHASES=(prepare install configure final)
# prepare/install 失败即中止；configure/final 失败仅告警继续
CRITICAL_PHASES=" prepare install "

RECIPE_NAME=""
RECIPE_DESC=""

recipe() {
  RECIPE_NAME="$1"
  RECIPE_DESC="${2:-}"
}

# ask <kind> <id> <label> [key:描述 ...] [--when EXPR] [--default V]
#   kind ∈ one | many | text | number
ask() {
  local kind="$1" id="$2" label="$3"
  shift 3
  Q["$id.kind"]="$kind"
  Q["$id.label"]="$label"
  Q["$id.when"]=""
  Q["$id.default"]=""
  local opts=()
  while (($#)); do
    case "$1" in
      --when)
        Q["$id.when"]="$(when_add "${Q["$id.when"]}" "$2")"
        shift 2
        ;;
      --default)
        Q["$id.default"]="$2"
        shift 2
        ;;
      *)
        opts+=("$1")
        shift
        ;;
    esac
  done
  local IFS="$US"
  Q["$id.opts"]="${opts[*]}"
  QIDS+=("$id")
}

# step <id> <phase> [--when EXPR] [--label TEXT]
#   函数体约定：step_<id 中 . 和 - 换成 _>
step() {
  local id="$1" phase="$2"
  shift 2
  S["$id.phase"]="$phase"
  S["$id.when"]=""
  S["$id.label"]="$id"
  while (($#)); do
    case "$1" in
      --when)
        S["$id.when"]="$(when_add "${S["$id.when"]}" "$2")"
        shift 2
        ;;
      --label)
        S["$id.label"]="$2"
        shift 2
        ;;
      *) die "step $id: 未知参数 $1" ;;
    esac
  done
  SIDS+=("$id")
}

# preset <名字> [--when EXPR] <key>=<值> ...
#   预设只是往 ANS 写值 —— 引擎不需要为它增加任何功能。
#   带 --when 的预设会在答案收集完后自动套用（不覆盖用户已给的答案）。
preset() {
  local name="$1"
  shift
  local when="" kvs=()
  while (($#)); do
    case "$1" in
      --when)
        when="$(when_add "$when" "$2")" # 与 ask/step 一致：可重复，语义是 AND
        shift 2
        ;;
      *)
        kvs+=("$1")
        shift
        ;;
    esac
  done
  local IFS="$US"
  PRESETS["$name"]="${kvs[*]}"
  PRESET_WHEN["$name"]="$when"
  PNAMES+=("$name")
}

# --when 可重复给出，语义是 AND。用 US 拼接，仍然不嵌套、无优先级、无解析器。
when_add() {
  if [[ -z "$1" ]]; then printf '%s' "$2"; else printf '%s%s%s' "$1" "$US" "$2"; fi
}
# 仅供展示：把 US 分隔的 when 列表渲染成人能读的形式
when_show() {
  if [[ -z "$1" ]]; then printf '（总是）'; else printf '%s' "${1//$US/ 且 }"; fi
}

step_fn() { printf 'step_%s' "${1//[.-]/_}"; }
ans() { printf '%s' "${ANS[$1]:-}"; }
has_word() { [[ " $1 " == *" $2 "* ]]; }

opts_of() {
  local id="$1"
  local -n _out="$2"
  IFS="$US" read -r -a _out <<<"${Q["$id.opts"]}"
}

# apply_preset <名字> [noclobber]
PRESET_APPLIED=()

apply_preset() {
  local name="$1" mode="${2:-clobber}"
  [[ -n "${PRESETS[$name]:-}" ]] || {
    log_error "未知预设：$name"
    return 1
  }
  local items=() kv k
  IFS="$US" read -r -a items <<<"${PRESETS[$name]}"
  for kv in "${items[@]}"; do
    k="${kv%%=*}"
    if [[ "$mode" == noclobber ]]; then
      [[ -n "${ANS[$k]:-}" ]] && continue
      PRESET_APPLIED+=("$k")
    fi
    ANS["$k"]="${kv#*=}"
  done
}

# 声明式套用：凡 --when 命中的预设自动生效，不覆盖用户显式给出的答案
resolve_presets() {
  local name
  for name in ${PNAMES[@]+"${PNAMES[@]}"}; do
    [[ -z "${PRESET_WHEN[$name]}" ]] && continue
    when_all "${PRESET_WHEN[$name]}" && apply_preset "$name" noclobber
  done
  return 0 # 「没有预设命中」不是错误
}

# 交互中可回退重选，因此每一轮先撤销上一轮自动套用的预设值
clear_preset_keys() {
  local k
  for k in ${PRESET_APPLIED[@]+"${PRESET_APPLIED[@]}"}; do
    unset "ANS[$k]"
  done
  PRESET_APPLIED=()
}

# ══════════════════════════════════════════════════════════════════
# §4 ask —— 一个导航循环，靠 history 栈而非索引
# ══════════════════════════════════════════════════════════════════

HIST=()

in_hist() {
  local x="$1" h
  for h in ${HIST[@]+"${HIST[@]}"}; do
    [[ "$h" == "$x" ]] && return 0
  done
  return 1
}

# vis 中第一个尚未问过的问题
first_unvisited() {
  local id
  for id in "$@"; do
    in_hist "$id" || {
      printf '%s' "$id"
      return 0
    }
  done
  return 1
}

# 可见问题列表随答案变化会伸缩，因此不用索引导航：
# HIST 管「已问过什么」，vis 管「现在哪些相关」，回退 = 出栈。
run_ask() {
  local vis=() cur
  while :; do
    mapfile -t vis < <(visible_questions)
    cur="$(first_unvisited ${vis[@]+"${vis[@]}"})" || return 0
    ask_question "$cur" "$((${#HIST[@]} + 1))" "${#vis[@]}"
    case $? in
      0) HIST+=("$cur") ;;
      2)
        ((${#HIST[@]} == 0)) && return 2
        HIST=("${HIST[@]:0:$((${#HIST[@]} - 1))}")
        ;;
      *) return 1 ;;
    esac
  done
}

ask_question() {
  local id="$1" pos="$2" total="$3"
  case "${Q["$id.kind"]}" in
    one) ask_kind_one "$id" "$pos" "$total" ;;
    many) ask_kind_many "$id" "$pos" "$total" ;;
    text) ask_kind_line "$id" "$pos" "$total" text ;;
    number) ask_kind_line "$id" "$pos" "$total" number ;;
    *) die "问题 $id: 未知类型 ${Q["$id.kind"]}" ;;
  esac
}

ask_kind_one() {
  local id="$1" pos="$2" total="$3"
  local opts=()
  opts_of "$id" opts
  local cur=0 i key k d prev
  prev="$(ans "$id")"
  [[ -z "$prev" ]] && prev="${Q["$id.default"]}"
  for i in "${!opts[@]}"; do
    [[ "${opts[i]%%:*}" == "$prev" ]] && cur="$i"
  done

  while :; do
    render_head "$pos" "$total" "${Q["$id.label"]}"
    for i in "${!opts[@]}"; do
      k="${opts[i]%%:*}"
      d="${opts[i]#*:}"
      if ((i == cur)); then
        printf '  %b❯%b %b%-14s%b %b%s%b\n' "$CYAN" "$NC" "$BOLD" "$k" "$NC" "$DIM" "$d" "$NC"
      else
        printf '    %-14s %b%s%b\n' "$k" "$DIM" "$d" "$NC"
      fi
    done
    render_foot '↑/↓ 选择   Enter 确认   ←/b 上一步   q 退出'

    key="$(read_key)" || return 1
    case "$key" in
      $'\e[A' | $'\eOA' | k) ((cur > 0)) && cur=$((cur - 1)) ;;
      $'\e[B' | $'\eOB' | j) ((cur < ${#opts[@]} - 1)) && cur=$((cur + 1)) ;;
      '')
        ANS["$id"]="${opts[cur]%%:*}"
        return 0
        ;;
      q | Q) return 1 ;;
      *) is_back_key "$key" && return 2 ;;
    esac
  done
}

ask_kind_many() {
  local id="$1" pos="$2" total="$3"
  local opts=()
  opts_of "$id" opts
  local cur=0 i key k d mark sel
  sel=" $(ans "$id") "
  [[ "$sel" == "  " ]] && sel=" ${Q["$id.default"]} "

  while :; do
    render_head "$pos" "$total" "${Q["$id.label"]}"
    for i in "${!opts[@]}"; do
      k="${opts[i]%%:*}"
      d="${opts[i]#*:}"
      mark=' '
      has_word "$sel" "$k" && mark='x'
      if ((i == cur)); then
        printf '  %b❯%b [%b%s%b] %b%-14s%b %b%s%b\n' \
          "$CYAN" "$NC" "$GREEN" "$mark" "$NC" "$BOLD" "$k" "$NC" "$DIM" "$d" "$NC"
      else
        printf '    [%b%s%b] %-14s %b%s%b\n' "$GREEN" "$mark" "$NC" "$k" "$DIM" "$d" "$NC"
      fi
    done
    render_foot '↑/↓ 移动   Space 勾选   Enter 确认   ←/b 上一步   q 退出'

    key="$(read_key)" || return 1
    case "$key" in
      $'\e[A' | $'\eOA' | k) ((cur > 0)) && cur=$((cur - 1)) ;;
      $'\e[B' | $'\eOB' | j) ((cur < ${#opts[@]} - 1)) && cur=$((cur + 1)) ;;
      ' ')
        k="${opts[cur]%%:*}"
        if has_word "$sel" "$k"; then
          sel="${sel// $k / }"
        else
          sel="$sel$k "
        fi
        ;;
      '')
        # 规范化：去掉多余空格（用独立变量，别覆盖 opts）
        local chosen=()
        read -r -a chosen <<<"$sel"
        ANS["$id"]="${chosen[*]-}"
        return 0
        ;;
      q | Q) return 1 ;;
      *) is_back_key "$key" && return 2 ;;
    esac
  done
}

ask_kind_line() {
  local id="$1" pos="$2" total="$3" kind="$4"
  local def value
  def="$(ans "$id")"
  [[ -z "$def" ]] && def="${Q["$id.default"]}"

  while :; do
    render_head "$pos" "$total" "${Q["$id.label"]}"
    printf '  %b默认：%s%b\n' "$DIM" "${def:-（无）}" "$NC"
    render_foot '直接回车用默认值   输入 :b 上一步   输入 :q 退出'
    show_cursor
    printf '  > '

    value="$(read_line)" || return 1
    case "$value" in
      :b) return 2 ;;
      :q) return 1 ;;
      '') value="$def" ;;
    esac
    if [[ "$kind" == number && ! "$value" =~ ^[0-9]+$ ]]; then
      log_warn "需要一个数字，收到：$value"
      sleep 1
      continue
    fi
    ANS["$id"]="$value"
    return 0
  done
}

confirm_plan() {
  clear_screen
  printf '%b执行计划%b\n' "$BOLD" "$NC"
  printf '%s\n' "$RULE"
  print_plan
  render_foot 'Enter 开始执行   ←/b 返回修改   q 退出'
  local key
  key="$(read_key)" || return 1
  case "$key" in
    '') return 0 ;;
    q | Q) return 1 ;;
    # 确认页只有三种出路，误按任何其他键都回到改答案，比原地卡住友好
    *) return 2 ;;
  esac
}

# ══════════════════════════════════════════════════════════════════
# §5 plan  —— 纯函数：不读 TTY、不碰文件、不联网
# ══════════════════════════════════════════════════════════════════
#
# when 表达式只有 4 种形式，不嵌套、无优先级、无解析器：
#   key=value    相等
#   key!=value   不等
#   key~value    多选包含
#   key          非空

when_ok() {
  local e="$1" k v
  [[ -z "$e" ]] && return 0
  if [[ "$e" == *'!='* ]]; then
    k="${e%%!=*}"
    v="${e#*!=}"
    [[ "$(ans "$k")" != "$v" ]]
  elif [[ "$e" == *'~'* ]]; then
    k="${e%%\~*}"
    v="${e#*\~}"
    has_word "$(ans "$k")" "$v"
  elif [[ "$e" == *'='* ]]; then
    k="${e%%=*}"
    v="${e#*=}"
    [[ "$(ans "$k")" == "$v" ]]
  else
    [[ -n "$(ans "$e")" ]]
  fi
}

# 多个 when 全部成立才算成立（AND）
when_all() {
  local joined="$1" e exprs=()
  [[ -z "$joined" ]] && return 0
  IFS="$US" read -r -a exprs <<<"$joined"
  for e in "${exprs[@]}"; do
    when_ok "$e" || return 1
  done
  return 0
}

PLAN=()

build_plan() {
  PLAN=()
  local ph id
  for ph in "${PHASES[@]}"; do
    for id in "${SIDS[@]}"; do
      [[ "${S["$id.phase"]}" == "$ph" ]] || continue
      when_all "${S["$id.when"]}" && PLAN+=("$id")
    done
  done
  return 0 # 「最后一个步骤不命中」不是错误，否则 set -e 下会误判失败
}

# 答案层面的语义提醒。刻意放在 build_plan 之外：
# build_plan 保持纯函数（无输出、无副作用），提醒是独立的一层。
warn_answers() {
  local plugins
  plugins="$(ans tmux.plugins)"
  if [[ -n "$plugins" ]] && ! has_word " $plugins " tpm; then
    log_warn "选了插件却没选 TPM：@plugin 声明会写进配置，但没有插件管理器去安装它们。"
    log_warn "建议同时勾选 tpm，或手动运行 prefix + I。"
  fi
  if [[ "$(ans tmux.prefix)" == custom && -z "$(ans tmux.prefix_custom)" ]]; then
    log_warn "前缀键选了 custom 但没填 tmux.prefix_custom，将回落到 C-b。"
  fi
  if [[ "$(ans tmux.install)" == skip ]] && ! command -v tmux >/dev/null 2>&1; then
    log_warn "选择了跳过安装，但当前 PATH 中找不到 tmux；配置会写入但无法启动。"
  fi
}

visible_questions() {
  local id
  for id in "${QIDS[@]}"; do
    when_all "${Q["$id.when"]}" && printf '%s\n' "$id"
  done
  return 0 # 同 build_plan：末项不可见不代表失败
}

# ══════════════════════════════════════════════════════════════════
# §6 run
# ══════════════════════════════════════════════════════════════════

declare -gA RESULT=()

print_plan() {
  if ((${#PLAN[@]} == 0)); then
    printf '  %b（没有需要执行的步骤）%b\n' "$DIM" "$NC"
    return
  fi
  local ph id shown
  for ph in "${PHASES[@]}"; do
    shown=0
    for id in "${PLAN[@]}"; do
      [[ "${S["$id.phase"]}" == "$ph" ]] || continue
      ((shown == 0)) && printf '  %b%s%b\n' "$CYAN" "$ph" "$NC" && shown=1
      printf '    · %s %b(%s)%b\n' "${S["$id.label"]}" "$DIM" "$id" "$NC"
    done
  done
}

run_plan() {
  local id fn ph aborted=0
  for id in "${PLAN[@]}"; do
    ph="${S["$id.phase"]}"
    if ((aborted)); then
      RESULT["$id"]=skipped
      continue
    fi
    fn="$(step_fn "$id")"
    printf '\n%b▶ %s%b\n' "$BOLD" "${S["$id.label"]}" "$NC"
    if "$fn"; then
      RESULT["$id"]=ok
    else
      RESULT["$id"]=failed
      log_error "步骤失败：${S["$id.label"]} ($id)"
      if has_word "$CRITICAL_PHASES" "$ph"; then
        log_error "$ph 阶段失败，中止后续步骤。"
        aborted=1
      else
        log_warn "继续执行后续步骤。"
      fi
    fi
  done

  printf '\n%b执行结果%b\n%s\n' "$BOLD" "$NC" "$RULE"
  local st fail=0
  for id in "${PLAN[@]}"; do
    st="${RESULT[$id]:-未执行}"
    case "$st" in
      ok) printf ' %b✓%b %s\n' "$GREEN" "$NC" "${S["$id.label"]}" ;;
      skipped) printf ' %b-%b %s（已跳过）\n' "$YELLOW" "$NC" "${S["$id.label"]}" ;;
      *)
        printf ' %b✗%b %s（%s）\n' "$RED" "$NC" "${S["$id.label"]}" "$st"
        fail=1
        ;;
    esac
  done
  return "$fail"
}

# ══════════════════════════════════════════════════════════════════
# §7 net —— GitHub 下载/克隆，带镜像回退
# ══════════════════════════════════════════════════════════════════
#
# 镜像是网络信任根：它能看到请求的 URL，也能决定返回的字节。
# 本脚本不校验校验和或签名，只依赖到所选端点的 HTTPS。
# 默认直连；用 --mirror <前缀> 或 DOT_GITHUB_MIRRORS 覆盖。

DOT_GITHUB_MIRRORS="${DOT_GITHUB_MIRRORS:-}"

github_prefixes() {
  printf '%s\n' ''
  local p
  for p in $DOT_GITHUB_MIRRORS; do
    printf '%s\n' "$p"
  done
}

download_with_fallback() {
  local url="$1" out="$2" prefix target
  while read -r prefix; do
    target="${prefix}${url}"
    if [[ -n "$prefix" ]]; then
      log_warn "使用镜像下载（第三方信任根）：$target"
    else
      log_info "下载：$target"
    fi
    if command -v curl >/dev/null 2>&1; then
      curl -fSL --connect-timeout 10 --retry 2 -o "$out" "$target" && return 0
    elif command -v wget >/dev/null 2>&1; then
      wget -q --tries=2 --timeout=20 -O "$out" "$target" && return 0
    else
      log_error "既没有 curl 也没有 wget，无法下载。"
      return 1
    fi
    rm -f "$out"
    log_warn "下载失败，尝试下一个源..."
  done < <(github_prefixes)
  log_error "所有源均下载失败：$url"
  log_error "可设置代理后重试：export https_proxy=http://主机:端口"
  return 1
}

git_clone_with_fallback() {
  local repo="$1" dest="$2" prefix
  while read -r prefix; do
    [[ -n "$prefix" ]] && log_warn "使用镜像克隆（第三方信任根）：${prefix}${repo}"
    if git clone --depth 1 "${prefix}${repo}" "$dest" 2>/dev/null; then
      return 0
    fi
    rm -rf "$dest"
    log_warn "克隆失败，尝试下一个源..."
  done < <(github_prefixes)
  log_error "所有源均克隆失败：$repo"
  return 1
}

# ══════════════════════════════════════════════════════════════════
# §8 declare —— tmux recipe（声明区，只有数据，没有逻辑）
# ══════════════════════════════════════════════════════════════════

recipe "Tmux 一键配置" "安装方式、前缀键、插件、基础选项"

ask one tmux.profile "配置方式" \
  recommended:"推荐配置（8 插件 + Catppuccin + Ctrl+Space，一步到位）" \
  custom:"自定义（逐项选择）" \
  uninstall:"完全卸载 tmux 及其配置"

# 预设：仅仅是往 ANS 写值。旧架构用 4 条假 deps + endFlow 模拟这件事。
# --when 让「选了推荐配置」和「命令行 --preset recommended」走同一条路径。
preset recommended --when tmux.profile=recommended \
  tmux.install=apt \
  tmux.prefix=C-Space \
  tmux.plugins="tpm sensible yank cpu battery catppuccin vim-navigator tmuxifier" \
  tmux.options="mouse vi index split reload"

ask one tmux.install "安装方式" --when tmux.profile=custom \
  apt:"包管理器安装（快，版本可能偏旧）" \
  source:"源码编译（最新版，需编译环境）" \
  skip:"已装好，跳过安装"

# 子问题必须同时锁 profile=custom，不能只锁父答案：
# 交互中「选 custom 答到一半、回退改成 uninstall」会留下 tmux.install=source，
# 只锁父答案的话，卸载流程里会冒出「要编译的 tmux 版本」这种无意义的问题。
ask text tmux.source_version "要编译的 tmux 版本" \
  --when tmux.profile=custom --when tmux.install=source --default 3.4

ask one tmux.prefix "前缀键" --when tmux.profile=custom --default C-b \
  C-Space:"Ctrl+Space（推荐配置同款）" \
  C-a:"Ctrl+A（screen 风格）" \
  C-b:"Ctrl+B（tmux 默认）" \
  custom:"自定义（下一步输入）"

# 条件链：上一题选 custom 才出现。旧架构为此需要一层嵌套 flow。
# 同上，profile 也要锁住（否则残留的 tmux.prefix=custom 会污染卸载流程）。
ask text tmux.prefix_custom "自定义前缀键（tmux 语法，如 C-x）" \
  --when tmux.profile=custom --when tmux.prefix=custom --default C-x

ask many tmux.plugins "插件（需 TPM）" --when tmux.profile=custom \
  tpm:"TPM 插件管理器（其他插件的前提）" \
  sensible:"tmux-sensible 合理默认" \
  yank:"tmux-yank 系统剪贴板" \
  cpu:"tmux-cpu CPU/内存状态栏" \
  battery:"tmux-battery 电池状态栏" \
  catppuccin:"catppuccin/tmux 柔和主题" \
  vim-navigator:"vim-tmux-navigator 窗格导航" \
  tmuxifier:"tmuxifier 会话布局管理"

ask many tmux.options "基础配置" --when tmux.profile=custom \
  mouse:"鼠标支持" \
  vi:"Vi 复制模式" \
  index:"窗口/面板索引从 1 开始" \
  split:"直觉化分割键（| 与 -）" \
  reload:"prefix+r 重载配置"

# ── 步骤：阶段决定顺序，阶段内按声明顺序 ────────────────────────
# configure 阶段的顺序即 ~/.tmux.conf 的写入顺序：
# header 先截断文件，其余追加，TPM 初始化留到 final 阶段的最后。

step tmux.uninstall prepare --when tmux.profile=uninstall \
  --label "完全卸载 tmux 及配置"

step tmux.apt install --when tmux.profile!=uninstall --when tmux.install=apt --label "通过 apt 安装 tmux"
step tmux.source install --when tmux.profile!=uninstall --when tmux.install=source --label "源码编译安装 tmux"

step tmux.header configure --when tmux.profile!=uninstall --label "初始化 ~/.tmux.conf"
step tmux.prefix configure --when tmux.profile!=uninstall --label "设置前缀键"
step tmux.opt.mouse configure --when tmux.profile!=uninstall --when tmux.options~mouse --label "启用鼠标支持"
step tmux.opt.vi configure --when tmux.profile!=uninstall --when tmux.options~vi --label "启用 Vi 复制模式"
step tmux.opt.index configure --when tmux.profile!=uninstall --when tmux.options~index --label "索引从 1 开始"
step tmux.opt.split configure --when tmux.profile!=uninstall --when tmux.options~split --label "直觉化分割键"
step tmux.opt.reload configure --when tmux.profile!=uninstall --when tmux.options~reload --label "prefix+r 重载配置"

step tmux.plugin.tpm configure --when tmux.profile!=uninstall --when tmux.plugins~tpm --label "安装 TPM 插件管理器"
step tmux.plugin.sensible configure --when tmux.profile!=uninstall --when tmux.plugins~sensible --label "声明 tmux-sensible"
step tmux.plugin.yank configure --when tmux.profile!=uninstall --when tmux.plugins~yank --label "声明 tmux-yank"
step tmux.plugin.cpu configure --when tmux.profile!=uninstall --when tmux.plugins~cpu --label "声明 tmux-cpu"
step tmux.plugin.battery configure --when tmux.profile!=uninstall --when tmux.plugins~battery --label "声明 tmux-battery"
step tmux.plugin.catppuccin configure --when tmux.profile!=uninstall --when tmux.plugins~catppuccin --label "声明 catppuccin/tmux"
step tmux.plugin.vim_navigator configure --when tmux.profile!=uninstall --when tmux.plugins~vim-navigator --label "声明 vim-tmux-navigator"
step tmux.plugin.tmuxifier configure --when tmux.profile!=uninstall --when tmux.plugins~tmuxifier --label "声明 tmuxifier"
step tmux.status.catppuccin configure --when tmux.profile!=uninstall --when tmux.plugins~catppuccin --label "配置 Catppuccin 状态栏"

step tmux.tpm.finalize final --when tmux.profile!=uninstall --when tmux.plugins~tpm --label "TPM 初始化并预装插件"
step tmux.cleanup final --when tmux.profile!=uninstall --label "清理旧 tmux socket"
step tmux.notes final --when tmux.profile!=uninstall --label "显示后续提示"

# ══════════════════════════════════════════════════════════════════
# §9 steps —— 每个 step 一个函数；失败返回非 0（不要 exit）
# ══════════════════════════════════════════════════════════════════

TMUX_CONF="$HOME/.tmux.conf"

conf_append() { cat >>"$TMUX_CONF"; }

# 解析最终生效的前缀键
tmux_prefix_value() {
  local p
  p="$(ans tmux.prefix)"
  [[ "$p" == custom ]] && p="$(ans tmux.prefix_custom)"
  printf '%s' "${p:-C-b}"
}

step_tmux_apt() {
  log_info "通过 apt 安装 tmux 与常用依赖..."
  if ! command -v apt-get >/dev/null 2>&1; then
    log_error "未找到 apt-get；请改选源码编译，或用本机包管理器手动安装 tmux。"
    return 1
  fi
  if ! dot_sudo apt-get update -qq; then
    log_error "apt-get update 失败；请检查网络、软件源或 sudo 权限。"
    return 1
  fi
  local pkgs=(tmux git unzip wget curl fontconfig xclip wl-clipboard)
  if ! dot_sudo apt-get install -y "${pkgs[@]}"; then
    log_error "apt-get install 失败；tmux 未安装。"
    return 1
  fi
  dot_sudo apt-get install -y acpi \
    || log_warn "可选包 acpi 安装失败，已跳过（电池插件可能缺少电量信息）。"

  hash -r
  local v
  v="$(tmux -V 2>/dev/null || true)"
  if [[ -z "$v" ]]; then
    log_error "安装结束后仍无法执行 tmux -V。"
    return 1
  fi
  log_ok "tmux 安装完成（$v）"
}

step_tmux_source() {
  local version
  version="$(ans tmux.source_version)"
  version="${version:-3.4}"
  log_info "源码编译安装 tmux $version..."

  if ! command -v apt-get >/dev/null 2>&1; then
    log_error "源码编译当前仅自动支持 apt 系统；请手动安装编译依赖后重试。"
    return 1
  fi
  dot_sudo apt-get update -qq || {
    log_error "apt-get update 失败。"
    return 1
  }
  local deps=(git automake build-essential pkg-config libevent-dev
    libncurses-dev bison wget curl ca-certificates)
  if ! dot_sudo apt-get install -y "${deps[@]}"; then
    log_error "安装编译依赖失败。"
    return 1
  fi

  local workdir tarball url status
  workdir="$(mktemp -d)"
  tarball="$workdir/tmux-$version.tar.gz"
  url="https://github.com/tmux/tmux/releases/download/$version/tmux-$version.tar.gz"

  if ! download_with_fallback "$url" "$tarball"; then
    rm -rf "$workdir"
    return 1
  fi

  (
    set -e
    cd "$workdir"
    tar xzf "$tarball"
    cd "tmux-$version"
    log_info "配置编译参数..."
    ./configure --prefix=/usr/local --quiet
    log_info "编译中（可能需要几分钟）..."
    make -j"$(nproc 2>/dev/null || printf 1)" >/dev/null
    log_info "安装到 /usr/local..."
    dot_sudo make install >/dev/null
  )
  status=$?
  rm -rf "$workdir"
  if ((status != 0)); then
    log_error "tmux $version 编译或安装失败。"
    return "$status"
  fi

  hash -r
  local v
  v="$(tmux -V 2>/dev/null || true)"
  if [[ "$v" != *"$version"* ]]; then
    log_error "版本校验失败，期望 $version，实际：${v:-未知}"
    log_error "可能 PATH 命中了发行版自带的旧版 tmux（/usr/bin/tmux）。"
    return 1
  fi
  log_ok "tmux $version 编译安装完成（$v）"
}

step_tmux_header() {
  if [[ -f "$TMUX_CONF" ]]; then
    local bak
    bak="$TMUX_CONF.bak.$(date +%Y%m%d-%H%M%S)"
    if ! cp "$TMUX_CONF" "$bak"; then
      log_error "备份原配置失败：$TMUX_CONF"
      return 1
    fi
    log_warn "已备份原配置到 $bak"
  fi
  cat >"$TMUX_CONF" <<'EOF'
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Tmux 配置 —— 由 TMUX.sh 生成
#  请勿手工编辑：重新运行 TMUX.sh 会覆盖本文件
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 终端与颜色
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",*256col*:Tc"
EOF
  log_ok "已初始化 $TMUX_CONF"
}

step_tmux_prefix() {
  local p
  p="$(tmux_prefix_value)"
  conf_append <<EOF

# 前缀键
unbind C-b
set -g prefix $p
bind $p send-prefix
EOF
  log_ok "前缀键设置为 $p"
}

step_tmux_opt_mouse() {
  conf_append <<'EOF'

# 鼠标支持
set -g mouse on
EOF
  log_ok "已启用鼠标支持"
}

step_tmux_opt_vi() {
  conf_append <<'EOF'

# Vi 复制模式
setw -g mode-keys vi
bind -T copy-mode-vi v send -X begin-selection
bind -T copy-mode-vi C-v send -X rectangle-toggle
bind -T copy-mode-vi y send -X copy-selection-and-cancel
bind -T copy-mode-vi Escape send -X cancel
EOF
  log_ok "已启用 Vi 复制模式"
}

step_tmux_opt_index() {
  conf_append <<'EOF'

# 索引从 1 开始
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
EOF
  log_ok "窗口/面板索引从 1 开始"
}

step_tmux_opt_split() {
  conf_append <<'EOF'

# 直觉化分割：| 水平，- 垂直；Alt+方向键切换面板
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
unbind '"'
unbind %
bind -n M-Left  select-pane -L
bind -n M-Right select-pane -R
bind -n M-Up    select-pane -U
bind -n M-Down  select-pane -D
EOF
  log_ok "已配置直觉化分割键"
}

step_tmux_opt_reload() {
  conf_append <<'EOF'

# 重载配置
bind r source-file ~/.tmux.conf \; display "配置已重载"
EOF
  log_ok "已配置 prefix+r 重载"
}

step_tmux_plugin_tpm() {
  log_info "安装 TPM 插件管理器..."
  local dir="$HOME/.tmux/plugins/tpm"
  local repo="https://github.com/tmux-plugins/tpm"

  mkdir -p "$(dirname "$dir")"
  if [[ -d "$dir/.git" ]]; then
    log_info "TPM 已存在，跳过克隆。"
  elif [[ -e "$dir" ]]; then
    log_error "TPM 路径已存在但不是 git 仓库：$dir"
    log_error "请备份或删除该目录后重试。"
    return 1
  elif ! git_clone_with_fallback "$repo" "$dir"; then
    return 1
  fi

  local installer="$dir/bin/install_plugins"
  if [[ ! -x "$installer" ]]; then
    chmod +x "$installer" 2>/dev/null || true
  fi
  if [[ ! -x "$installer" ]]; then
    log_error "TPM install_plugins 缺失或不可执行：$installer"
    return 1
  fi

  conf_append <<EOF

# ── 插件列表（TPM）────────────────────────────────
set -g @plugin 'tmux-plugins/tpm'
set-environment -g TMUX_PLUGIN_MANAGER_PATH "$HOME/.tmux/plugins"
EOF
  log_ok "TPM 安装完成"
}

_declare_plugin() {
  local spec="$1" note="$2"
  conf_append <<EOF
set -g @plugin '$spec'
EOF
  log_ok "已声明插件 $spec（$note）"
}

step_tmux_plugin_sensible() { _declare_plugin 'tmux-plugins/tmux-sensible' '合理默认'; }
step_tmux_plugin_yank() { _declare_plugin 'tmux-plugins/tmux-yank' '系统剪贴板'; }
step_tmux_plugin_cpu() { _declare_plugin 'tmux-plugins/tmux-cpu' 'CPU/内存'; }
step_tmux_plugin_battery() { _declare_plugin 'tmux-plugins/tmux-battery' '电池状态'; }
step_tmux_plugin_vim_navigator() { _declare_plugin 'christoomey/vim-tmux-navigator' '窗格导航'; }
step_tmux_plugin_tmuxifier() { _declare_plugin 'jimeh/tmuxifier' '布局管理'; }

step_tmux_plugin_catppuccin() {
  conf_append <<'EOF'
set -g @plugin 'catppuccin/tmux'
# 主题选项必须在 TPM 运行 catppuccin 之前设置
set -g @catppuccin_flavor 'mocha'
set -g @catppuccin_window_status_style 'rounded'
EOF
  log_ok "已声明插件 catppuccin/tmux（柔和主题）"
  log_warn "状态栏图标需要 Nerd Font 才能正确显示（建议 JetBrainsMono Nerd Font Mono）。"
}

step_tmux_status_catppuccin() {
  conf_append <<'EOF'

# Catppuccin 状态栏
set -g status-left-length 200
set -g status-right-length 200
set -g status-left ""
set -g status-right "#{E:@catppuccin_status_application}"
set -agF status-right "#{E:@catppuccin_status_cpu}"
set -agF status-right "#{E:@catppuccin_status_ram}"
set -ag  status-right "#{E:@catppuccin_status_session}"
set -ag  status-right "#{E:@catppuccin_status_uptime}"
set -agF status-right "#{E:@catppuccin_status_battery}"
EOF
  log_ok "已配置 Catppuccin 状态栏"
}

step_tmux_tpm_finalize() {
  # 必须是 tmux.conf 的最后一行
  conf_append <<'EOF'

# 初始化 TPM（必须保持在 tmux.conf 最末）
run '~/.tmux/plugins/tpm/tpm'
EOF

  local installer="$HOME/.tmux/plugins/tpm/bin/install_plugins"
  if [[ ! -x "$installer" ]]; then
    log_warn "找不到 TPM install_plugins，跳过预装；启动 tmux 后按 prefix + I 手动安装。"
    return 0
  fi

  log_info "预装插件（可能需要一两分钟）..."
  # 用 mktemp 而不是固定的 /tmp/tpm-install.log：
  # /tmp 是所有用户可写的，固定名字可被他人预先建成符号链接，
  # 写日志时就会跟着链接去覆盖别的文件。
  local log
  log="$(mktemp -t tpm-install.XXXXXX)" || {
    log_warn "无法创建临时日志文件，跳过插件预装；请在 tmux 内按 prefix + I。"
    return 0
  }
  if "$installer" >"$log" 2>&1; then
    if grep -qiE 'fatal|error|failed' "$log"; then
      log_warn "部分插件可能克隆失败（多见于 GitHub 限速）。完整日志：$log"
      log_warn "可在 tmux 内按 prefix + I 重试。"
    else
      log_ok "插件已就绪"
    fi
  else
    tail -5 "$log" >&2 || true
    log_warn "TPM 预装脚本异常退出，请在 tmux 内按 prefix + I 手动重试。日志：$log"
  fi
}

step_tmux_cleanup() {
  if [[ -n "${TMUX:-}" ]]; then
    log_warn "当前 shell 正在 tmux 内，跳过 socket 清理。"
    log_warn "如遇新旧 tmux 二进制混用问题，退出所有会话后手动执行："
    log_warn "  tmux kill-server && rm -rf /tmp/tmux-\$(id -u)"
    return 0
  fi
  if command -v tmux >/dev/null 2>&1 && pgrep -u "$(id -u)" -x tmux >/dev/null 2>&1; then
    log_info "停止当前用户的 tmux server..."
    tmux kill-server 2>/dev/null || log_warn "kill-server 未成功，继续清理 socket。"
  fi
  local sockdir
  sockdir="/tmp/tmux-$(id -u)"
  if [[ -d "$sockdir" ]]; then
    log_info "清理 $sockdir"
    rm -rf "$sockdir" || {
      log_error "清理失败：$sockdir"
      return 1
    }
  fi
  log_ok "socket 清理完成"
}

step_tmux_notes() {
  local p
  p="$(tmux_prefix_value)"
  cat <<EOF

$RULE
 ${GREEN}✅ Tmux 配置完成${NC}
$RULE
 配置文件：$TMUX_CONF
 前缀键：  $p

 1) 启动 tmux：
      tmux

 2) 常用操作（前缀键 = $p）：
      $p c    新建窗口
      $p |    水平分割        $p -    垂直分割
      $p r    重载配置        $p I    重新安装插件

 3) 若状态栏图标显示成方框，把终端字体改为 Nerd Font：
      JetBrainsMono Nerd Font Mono
$RULE
EOF
  log_ok "全部完成"
}

step_tmux_uninstall() {
  log_warn "开始完全卸载 tmux 及其配置..."

  if command -v tmux >/dev/null 2>&1; then
    tmux kill-server 2>/dev/null || true
    log_info "已关闭所有 tmux 会话"
  fi

  if command -v apt-get >/dev/null 2>&1; then
    dot_sudo apt-get remove --purge -y tmux >/dev/null 2>&1 \
      && log_info "apt: tmux 已卸载"
    dot_sudo apt-get autoremove -y >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1; then
    dot_sudo dnf remove -y tmux >/dev/null 2>&1 && log_info "dnf: tmux 已卸载"
  elif command -v pacman >/dev/null 2>&1; then
    dot_sudo pacman -R --noconfirm tmux >/dev/null 2>&1 && log_info "pacman: tmux 已卸载"
  fi

  if [[ -f /usr/local/bin/tmux ]]; then
    dot_sudo rm -f /usr/local/bin/tmux
    dot_sudo rm -f /usr/local/share/man/man1/tmux.1* 2>/dev/null || true
    log_info "已删除源码安装的 /usr/local/bin/tmux"
  fi

  local f
  for f in "$HOME/.tmux.conf" "$HOME/.tmux.conf.local"; do
    [[ -f "$f" ]] && rm -f "$f" && log_info "已删除 $f"
  done

  local d
  for d in "$HOME/.tmux" "$HOME/.tmux-backup" "/tmp/tmux-$(id -u)"; do
    [[ -d "$d" ]] && rm -rf "$d" && log_info "已删除 $d/"
  done

  log_ok "tmux 卸载完成（备份文件 ~/.tmux.conf.bak.* 已保留）"
}

# ══════════════════════════════════════════════════════════════════
# §10 lint —— 取代 zod：坏状态大多已不可表达，只查剩下这几项
# ══════════════════════════════════════════════════════════════════

when_key() {
  local e="$1"
  [[ -z "$e" ]] && return 1
  if [[ "$e" == *'!='* ]]; then
    printf '%s' "${e%%!=*}"
  elif [[ "$e" == *'~'* ]]; then
    printf '%s' "${e%%\~*}"
  elif [[ "$e" == *'='* ]]; then
    printf '%s' "${e%%=*}"
  else
    printf '%s' "$e"
  fi
}

# 一个 when 列表里引用的所有 key，每行一个
when_keys() {
  local joined="$1" e exprs=()
  [[ -z "$joined" ]] && return 0
  IFS="$US" read -r -a exprs <<<"$joined"
  for e in "${exprs[@]}"; do
    when_key "$e" && printf '\n'
  done
}

is_question() {
  local target="$1" id
  for id in "${QIDS[@]}"; do
    [[ "$id" == "$target" ]] && return 0
  done
  return 1
}

run_lint() {
  local errors=0
  err() {
    log_error "lint: $*"
    errors=$((errors + 1))
  }

  # 1. 问题 id 唯一、类型合法、选项 key 无空格
  local id seen=" " kind opts=() o
  for id in "${QIDS[@]}"; do
    has_word "$seen" "$id" && err "问题 id 重复：$id"
    seen="$seen$id "
    kind="${Q["$id.kind"]}"
    case "$kind" in
      one | many | text | number) ;;
      *) err "问题 $id 的类型非法：$kind" ;;
    esac
    if [[ "$kind" == one || "$kind" == many ]]; then
      opts_of "$id" opts
      ((${#opts[@]} == 0)) && err "问题 $id（$kind）没有选项"
      for o in ${opts[@]+"${opts[@]}"}; do
        [[ "$o" == *:* ]] || err "问题 $id 的选项缺少描述：$o"
        [[ "${o%%:*}" =~ ^[A-Za-z0-9_-]+$ ]] \
          || err "问题 $id 的选项 key 含非法字符（多选值以空格分隔）：${o%%:*}"
      done
    fi
  done

  # 2. 步骤 id 唯一、阶段合法、函数存在
  local sseen=" " ph
  for id in "${SIDS[@]}"; do
    has_word "$sseen" "$id" && err "步骤 id 重复：$id"
    sseen="$sseen$id "
    ph="${S["$id.phase"]}"
    has_word " ${PHASES[*]} " "$ph" || err "步骤 $id 的阶段非法：$ph"
    declare -F "$(step_fn "$id")" >/dev/null \
      || err "步骤 $id 缺少函数 $(step_fn "$id")"
  done

  # 3. 所有 when 引用的 key 必须是已声明的问题（--when 可重复，逐个查）
  local k
  for id in "${QIDS[@]}"; do
    while read -r k; do
      [[ -n "$k" ]] && ! is_question "$k" && err "问题 $id 的 when 引用了未声明的 key：$k"
    done < <(when_keys "${Q["$id.when"]}")
  done
  for id in "${SIDS[@]}"; do
    while read -r k; do
      [[ -n "$k" ]] && ! is_question "$k" && err "步骤 $id 的 when 引用了未声明的 key：$k"
    done < <(when_keys "${S["$id.when"]}")
  done

  # 4. 预设的 when 与写入的 key 都必须是已声明的问题
  local name items=() kv
  for name in "${!PRESET_WHEN[@]}"; do
    while read -r k; do
      [[ -n "$k" ]] && ! is_question "$k" && err "预设 $name 的 when 引用了未声明的 key：$k"
    done < <(when_keys "${PRESET_WHEN[$name]}")
  done
  for name in "${!PRESETS[@]}"; do
    IFS="$US" read -r -a items <<<"${PRESETS[$name]}"
    for kv in "${items[@]}"; do
      is_question "${kv%%=*}" || err "预设 $name 写入了未声明的 key：${kv%%=*}"
    done
  done

  if ((errors == 0)); then
    log_ok "lint 通过：${#QIDS[@]} 个问题，${#SIDS[@]} 个步骤，${#PRESETS[@]} 个预设"
    return 0
  fi
  log_error "lint 发现 $errors 个问题"
  return 1
}

# ══════════════════════════════════════════════════════════════════
# §11 cli
# ══════════════════════════════════════════════════════════════════

usage() {
  cat <<EOF
用法: TMUX.sh [选项]

交互模式（默认）：
  TMUX.sh                        逐步提问，确认后执行

非交互模式：
  --preset <名字>                套用预设（可用：${!PRESETS[*]}）
  --set <key>=<值>               直接设置答案，可重复
  --answers <文件>               从文件读取答案（每行 key=值）

调试与检查：
  --dry-run                      只打印执行计划，不执行任何步骤
  --save-answers <文件>          把最终答案写入文件，便于之后复现
  --only <步骤id>                只执行指定步骤，可重复
  --lint                         检查声明是否自洽
  --list                         列出所有问题与步骤

其他：
  --mirror <前缀>                GitHub 镜像前缀，可重复（第三方信任根）
  -y, --yes                      跳过执行前确认
  -h, --help                     显示本帮助

调试示例：
  TMUX.sh --save-answers a.txt          交互一次并存盘
  TMUX.sh --answers a.txt --dry-run     复现当时的计划
  TMUX.sh --preset recommended -y       一键安装推荐配置
EOF
}

list_declarations() {
  printf '%b%s%b — %s\n\n' "$BOLD" "$RECIPE_NAME" "$NC" "$RECIPE_DESC"
  printf '%b问题%b\n' "$BOLD" "$NC"
  local id
  for id in "${QIDS[@]}"; do
    printf '  %-22s %-7s %b%s%b\n' "$id" "${Q["$id.kind"]}" \
      "$DIM" "$(when_show "${Q["$id.when"]}")" "$NC"
  done
  printf '\n%b步骤%b\n' "$BOLD" "$NC"
  local ph
  for ph in "${PHASES[@]}"; do
    printf '  %b%s%b\n' "$CYAN" "$ph" "$NC"
    for id in "${SIDS[@]}"; do
      [[ "${S["$id.phase"]}" == "$ph" ]] || continue
      printf '    %-30s %b%s%b\n' "$id" "$DIM" "$(when_show "${S["$id.when"]}")" "$NC"
    done
  done
}

# 答案 key 必须是已声明的问题。
# 少了这道检查，`--set tmux.plugin=tpm`（漏个 s）会被静默接受、
# 计划里一个插件都没有，而这正是最难自己发现的一类问题。
require_question_key() {
  local k="$1" src="$2"
  is_question "$k" && return 0
  log_error "$src：未声明的答案 key「$k」"
  log_error "用 --list 查看全部可用 key。"
  return 1
}

load_answers() {
  local file="$1" line k v n=0
  [[ -r "$file" ]] || {
    log_error "读不到答案文件：$file"
    return 1
  }
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" ]] && continue
    [[ "$line" == *=* ]] || {
      log_error "答案文件第 $((n + 1)) 行格式错误：$line"
      return 1
    }
    k="${line%%=*}"
    v="${line#*=}"
    require_question_key "$k" "$file 第 $((n + 1)) 行" || return 1
    ANS["$k"]="$v"
    n=$((n + 1))
  done <"$file"
  log_info "已从 $file 载入 $n 条答案"
}

save_answers() {
  local file="$1" id
  : >"$file" || {
    log_error "无法写入 $file"
    return 1
  }
  {
    printf '# TMUX.sh 答案文件 —— %s\n' "$(date '+%F %T')"
    printf '# 复现：TMUX.sh --answers %s\n' "$file"
    for id in "${QIDS[@]}"; do
      [[ -n "${ANS[$id]:-}" ]] && printf '%s=%s\n' "$id" "${ANS[$id]}"
    done
  } >>"$file"
  log_ok "答案已保存到 $file"
}

main() {
  trap show_cursor EXIT INT TERM

  local do_lint=0 do_list=0 dry_run=0 assume_yes=0 interactive=1
  local save_to="" only=()

  while (($#)); do
    case "$1" in
      --preset)
        apply_preset "$2" || exit 1
        interactive=0
        shift 2
        ;;
      --set)
        [[ "$2" == *=* ]] || die "--set 需要 key=值 形式，收到：$2"
        require_question_key "${2%%=*}" "--set" || exit 1
        ANS["${2%%=*}"]="${2#*=}"
        interactive=0
        shift 2
        ;;
      --answers)
        load_answers "$2" || exit 1
        interactive=0
        shift 2
        ;;
      --save-answers)
        save_to="$2"
        shift 2
        ;;
      --only)
        only+=("$2")
        interactive=0
        shift 2
        ;;
      --mirror)
        DOT_GITHUB_MIRRORS="${DOT_GITHUB_MIRRORS} $2"
        shift 2
        ;;
      --dry-run)
        dry_run=1
        shift
        ;;
      --lint)
        do_lint=1
        shift
        ;;
      --list)
        do_list=1
        shift
        ;;
      -y | --yes)
        assume_yes=1
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        log_error "未知参数：$1"
        usage >&2
        exit 1
        ;;
    esac
  done

  ((do_lint)) && {
    run_lint
    exit $?
  }
  ((do_list)) && {
    list_declarations
    exit 0
  }

  # 声明自洽性是执行前提，始终先查一遍
  run_lint >/dev/null || {
    run_lint
    exit 1
  }

  if ((interactive)); then
    if ! has_input; then
      log_error "当前环境没有可用的终端，无法交互提问。"
      log_error "请改用非交互方式，例如："
      log_error "  TMUX.sh --preset recommended -y"
      log_error "  TMUX.sh --answers my.answers"
      exit 1
    fi
    while :; do
      clear_preset_keys
      run_ask
      case $? in
        0) ;;
        2) continue ;;
        *)
          clear_screen
          log_info "已取消。"
          exit 0
          ;;
      esac
      resolve_presets
      build_plan
      if ((assume_yes || dry_run)); then
        break
      fi
      confirm_plan
      case $? in
        0) break ;;
        2)
          HIST=()
          continue
          ;;
        *)
          clear_screen
          log_info "已取消。"
          exit 0
          ;;
      esac
    done
  else
    resolve_presets
    build_plan
  fi

  # --only 过滤：在完整计划里保留指定步骤，顺序不变
  if ((${#only[@]})); then
    local filtered=() id o found
    for id in "${PLAN[@]}"; do
      for o in "${only[@]}"; do
        [[ "$id" == "$o" ]] && filtered+=("$id") && break
      done
    done
    for o in "${only[@]}"; do
      found=0
      for id in "${SIDS[@]}"; do [[ "$id" == "$o" ]] && found=1 && break; done
      ((found)) || die "--only 指定了不存在的步骤：$o"
    done
    PLAN=(${filtered[@]+"${filtered[@]}"})
  fi

  [[ -n "$save_to" ]] && { save_answers "$save_to" || exit 1; }
  warn_answers

  if ((dry_run)); then
    clear_screen
    printf '%b执行计划（--dry-run，不会执行）%b\n%s\n' "$BOLD" "$NC" "$RULE"
    print_plan
    printf '%s\n' "$RULE"
    exit 0
  fi

  if ((${#PLAN[@]} == 0)); then
    log_warn "没有需要执行的步骤。用 --list 查看可用步骤，或检查答案是否正确。"
    exit 0
  fi

  clear_screen
  run_plan
}

# 被 source 时不执行（测试可直接调用 when_ok / build_plan 等纯函数）。
#
# ${BASH_SOURCE[0]:-$0} 里的回落不是防御性冗余，它是 curl | bash 能跑起来的唯一原因：
#   直接执行  BASH_SOURCE[0]=./TMUX.sh  $0=./TMUX.sh  → 相等，执行
#   管道执行  BASH_SOURCE[0] 未设置      $0=bash       → 回落后相等，执行
#   被 source BASH_SOURCE[0]=TMUX.sh    $0=bash/bats  → 不等，不执行
# 少了这个回落，set -u 会在管道场景直接报「未绑定的变量」。
if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then
  main "$@"
fi
