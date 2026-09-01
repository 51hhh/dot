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
  # 终端会把回车转成换行（ICRNL），read 于是把它当行分隔符、返回空串——
  # 这是 '' 分支代表 Enter 的原因。但从普通 fd 喂进来的输入没有这层转换，
  # 回车会以 \r 原样抵达，不归一化就表现为「按了回车什么都没发生」。
  [[ "$key" == $'\r' ]] && key=""
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
  printf '%s' "${line%$'\r'}" # 同上：CRLF 输入不该把 \r 带进答案
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

# 把 <id> 的选项读进调用者的数组。
# 用 read -r -a "$2" 而不是 local -n：nameref 是 bash 4.3 才有的语法，
# 而 §1 的版本闸门是 4.2（declare -g）。read 的目标数组名本来就可以是变量，
# 靠动态作用域写回调用者的 local 数组，效果一样，少一条版本要求。
opts_of() {
  IFS="$US" read -r -a "$2" <<<"${Q["$1.opts"]}"
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
      # 判「有没有这个键」而不是「值是不是非空」：多选题答成「什么都不选」
      # 是一个正当答案，值就是空串。按非空判的话，答案文件里写
      # tmux.plugins=（明确表示不要插件）会被预设悄悄填回 8 个插件。
      [[ -n "${ANS[$k]+x}" ]] && continue
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
  local pc
  pc="$(ans tmux.prefix_custom)"
  if [[ "$(ans tmux.prefix)" == custom ]]; then
    if [[ -z "$pc" ]]; then
      log_warn "前缀键选了 custom 但没填 tmux.prefix_custom，将回落到 C-b。"
    elif ! valid_prefix_key "$pc"; then
      # 在 --dry-run 阶段就说，别等真写完配置才发现前缀根本没生效
      log_warn "自定义前缀「$pc」不是合法的 tmux 键名，将回落到 C-b。"
    fi
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

# 同一个源上先 curl 再 wget。写成 if/elif（谁装了用谁）是不够的：
# curl 装着却用不了是常见情形（缺 CA 证书、代理只对 wget 生效），
# 那时候一个装好的 wget 就在旁边，没有理由不试。
fetch_url() {
  local target="$1" out="$2" progress=()
  # 进度条只在 stderr 是终端时开。否则 `curl … | tee log`、CI 日志里
  # 会塞进一整屏用回车拼出来的乱码 —— 字体包有 100 MB 以上，这段特别长。
  if command -v curl >/dev/null 2>&1; then
    [[ -t 2 ]] || progress=(-s)
    curl -fSL "${progress[@]}" --connect-timeout 10 --retry 2 -o "$out" "$target" \
      && return 0
  fi
  progress=()
  if command -v wget >/dev/null 2>&1; then
    [[ -t 2 ]] && progress=(--show-progress)
    wget -q "${progress[@]}" --tries=2 --timeout=20 -O "$out" "$target" && return 0
  fi
  return 1
}

download_with_fallback() {
  local url="$1" out="$2" prefix target
  # 工具缺失和下载失败是两种病，别让前者伪装成「所有源都失败」
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    log_error "既没有 curl 也没有 wget，无法下载：$url"
    return 1
  fi
  while read -r prefix; do
    target="${prefix}${url}"
    if [[ -n "$prefix" ]]; then
      log_warn "使用镜像下载（第三方信任根）：$target"
    else
      log_info "下载：$target"
    fi
    fetch_url "$target" "$out" && return 0
    rm -f "$out"
    log_warn "下载失败，尝试下一个源..."
  done < <(github_prefixes)
  log_error "所有源均下载失败：$url"
  log_error "可设置代理后重试：export https_proxy=http://主机:端口"
  return 1
}

git_clone_with_fallback() {
  local repo="$1" dest="$2" prefix
  # 没装 git 时逐个镜像失败一遍、最后报「所有源均克隆失败」是误导性诊断
  if ! command -v git >/dev/null 2>&1; then
    log_error "需要 git 才能克隆 $repo，但当前 PATH 中没有 git。"
    log_error "请先安装 git（如 sudo apt-get install -y git）后重试。"
    return 1
  fi
  local errlog
  errlog="$(mktemp -t git-clone.XXXXXX)" || errlog=""
  while read -r prefix; do
    [[ -n "$prefix" ]] && log_warn "使用镜像克隆（第三方信任根）：${prefix}${repo}"
    # GIT_TERMINAL_PROMPT=0：镜像返回 401 时 git 会跳出来问用户名密码，
    # 那会让一次无人值守的安装停在一个没人预料到的提示上。让它直接失败、
    # 交给下一个源。stderr 存起来而不是丢掉：三个源全失败时得说出原因。
    if GIT_TERMINAL_PROMPT=0 git clone --depth 1 "${prefix}${repo}" "$dest" \
      2>"${errlog:-/dev/null}"; then
      [[ -n "$errlog" ]] && rm -f "$errlog"
      return 0
    fi
    rm -rf "$dest"
    log_warn "克隆失败，尝试下一个源..."
  done < <(github_prefixes)
  log_error "所有源均克隆失败：$repo"
  if [[ -s "${errlog:-}" ]]; then
    log_error "最后一次的 git 报错："
    tail -3 "$errlog" >&2
  fi
  [[ -n "$errlog" ]] && rm -f "$errlog"
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
  tmux.font=jetbrains \
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

# 状态栏图标（尤其 Catppuccin）离了 Nerd Font 就是一排方框，
# 所以字体不是「顺带提一句」的事，而是一道要么装、要么明确跳过的问题。
ask one tmux.font "Nerd Font（状态栏图标需要）" --when tmux.profile=custom --default jetbrains \
  jetbrains:"JetBrainsMono Nerd Font（推荐，自动下载安装，需下载上百 MB）" \
  meslo:"MesloLGS Nerd Font（Powerlevel10k 同款）" \
  skip:"不安装（已装好，或用不到图标）"

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

# 答案值仍叫 apt（答案文件是对外契约，改了旧文件就读不回来了），
# 但实现认 apt-get / dnf / pacman / zypper，所以标签不写死 apt。
step tmux.apt install --when tmux.profile!=uninstall --when tmux.install=apt --label "通过包管理器安装 tmux"
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

# 字体放 final 而不是 install：它不写 tmux.conf，而且要下载几十 MB。
# install 阶段失败会中止后续，让一次 GitHub 限速把整套配置作废；
# final 阶段失败只告警继续 —— 配置照样生效，用户回头自己装字体就行。
# 两个 --when 都需要：单写 !=skip 的话，key 未设置时 != 成立（见 §5），
# 没答过这题的流程也会去下字体。
step tmux.font final --when tmux.profile!=uninstall \
  --when tmux.font --when tmux.font!=skip \
  --label "下载安装 Nerd Font"

step tmux.tpm.finalize final --when tmux.profile!=uninstall --when tmux.plugins~tpm --label "TPM 初始化并预装插件"
step tmux.cleanup final --when tmux.profile!=uninstall --label "清理旧 tmux socket"
step tmux.notes final --when tmux.profile!=uninstall --label "显示后续提示"

# ══════════════════════════════════════════════════════════════════
# §9 steps —— 每个 step 一个函数；失败返回非 0（不要 exit）
# ══════════════════════════════════════════════════════════════════

TMUX_CONF="$HOME/.tmux.conf"

# ── 包管理器 ─────────────────────────────────────────────────────
#
# 抽象只有「刷新索引」「装包」「编译依赖的包名」三条 —— 脚本对包管理器的
# 全部需求就这些。硬写 apt-get 的话，Fedora / Arch 上跑到这一步直接失败，
# 而失败点是「安装 tmux」，看起来像 tmux 装不上，而不是「不认识 dnf」。
detect_pm() {
  local pm
  for pm in apt-get dnf pacman zypper; do
    if command -v "$pm" >/dev/null 2>&1; then
      printf '%s' "$pm"
      return 0
    fi
  done
  return 1
}

pm_refresh() {
  case "$1" in
    apt-get) dot_sudo apt-get update -qq ;;
    pacman) dot_sudo pacman -Sy --noconfirm ;;
    # dnf / zypper 装包时自己会按需刷元数据，多刷一遍只是白等
    *) return 0 ;;
  esac
}

pm_install() {
  local pm="$1"
  shift
  case "$pm" in
    apt-get) dot_sudo apt-get install -y "$@" ;;
    dnf) dot_sudo dnf install -y "$@" ;;
    # --needed：已装的包不重新下载，让这一步幂等
    pacman) dot_sudo pacman -S --needed --noconfirm "$@" ;;
    zypper) dot_sudo zypper install -y "$@" ;;
    *) return 1 ;;
  esac
}

# 卸载。-Rs / autoremove 是为了把只被 tmux 拉进来的依赖也带走 ——
# 「完全卸载」这个选项的字面意思。
pm_remove() {
  local pm="$1"
  shift
  case "$pm" in
    apt-get) dot_sudo apt-get remove --purge -y "$@" ;;
    dnf) dot_sudo dnf remove -y "$@" ;;
    pacman) dot_sudo pacman -Rs --noconfirm "$@" ;;
    zypper) dot_sudo zypper remove -y --clean-deps "$@" ;;
    *) return 1 ;;
  esac
}

# 运行时依赖（tmux git unzip … xclip wl-clipboard）四家包名恰好一致，
# 只有编译依赖不一样，所以只有这一张表。
pm_build_deps() {
  case "$1" in
    apt-get) printf '%s\n' git automake build-essential pkg-config libevent-dev libncurses-dev bison ;;
    dnf) printf '%s\n' git automake gcc make pkgconf-pkg-config libevent-devel ncurses-devel bison ;;
    pacman) printf '%s\n' git base-devel libevent ncurses bison pkgconf ;;
    zypper) printf '%s\n' git automake gcc make pkg-config libevent-devel ncurses-devel bison ;;
    *) return 1 ;;
  esac
}

# 插件下限：catppuccin/tmux 用了 3.2 才有的 %{E:} 与 -F 语法。
# 低于这个版本装完不报错，但状态栏是空的或一串没展开的字面量。
TMUX_MIN_VERSION=3.2

# a >= b。不写 `sort -V | head -1`：head 读够就退出，sort 吃 SIGPIPE，
# 在 §1 的 pipefail 下整条管道判成 141 —— 和字体那个 bug 是同一种。
version_ge() {
  local sorted
  sorted="$(printf '%s\n%s\n' "$1" "$2" | sort -V)"
  [[ "${sorted%%$'\n'*}" == "$2" ]]
}

# tmux -V 是 "tmux 3.5a" 这种；去掉字母后缀才能交给 sort -V
tmux_version() {
  local v
  v="$(tmux -V 2>/dev/null || true)"
  v="${v#tmux }"
  printf '%s' "${v//[^0-9.]/}"
}

warn_if_tmux_too_old() {
  local v="$1"
  [[ -n "$v" ]] || return 0
  version_ge "$v" "$TMUX_MIN_VERSION" && return 0
  log_warn "发行版给的是 tmux $v，低于插件要求的 $TMUX_MIN_VERSION。"
  log_warn "状态栏（尤其 Catppuccin）会显示不全或空白。改用源码编译："
  log_warn "  bash TMUX.sh --set tmux.profile=custom --set tmux.install=source"
}

# 写不进去必须是失败。重定向失败时 cat 根本不会执行、返回 1，
# 但调用方原先紧接着就 log_ok —— 只读的 HOME 或写满的磁盘于是能跑出
# 一屏「✓ 已配置」加退出码 0，而 ~/.tmux.conf 一个字节都没有。
conf_append() {
  if ! cat >>"$TMUX_CONF"; then
    log_error "写入 $TMUX_CONF 失败（检查权限与磁盘空间）。"
    return 1
  fi
}

# 截断写入（只有 header 用）。和 conf_append 分开是因为 > 和 >> 语义不同，
# 但要检查的东西一样：重定向失败时 cat 不会执行，返回 1 必须被看见。
conf_write() {
  if ! cat >"$TMUX_CONF"; then
    log_error "写入 $TMUX_CONF 失败（检查权限与磁盘空间）。"
    return 1
  fi
}

# 当前配置和最近一次备份逐字节相同 ⇒ 再备份一次只是攒垃圾。
# 生成本身是幂等的，所以反复跑（很正常：改个插件再跑一遍）会留下一串
# 内容完全一样的 .bak.<时间戳>。
#
# 判据故意是「与最近的备份相同」，不是「文件里有 TMUX.sh 的生成标记」：
# 后者会把用户在生成之后手改的内容直接覆盖掉，一份备份都不留。
# 时间戳格式 %Y%m%d-%H%M%S 的字典序就是时间序，所以 glob 的最后一个最新。
backup_is_redundant() {
  local newest="" bak
  for bak in "$TMUX_CONF".bak.*; do
    [[ -f "$bak" ]] && newest="$bak"
  done
  [[ -n "$newest" ]] || return 1
  # cmp 在 diffutils 里，精简容器上可能没有；那时它退 127，等于「不确定」，
  # 于是照旧备份 —— 这个方向的错只是多一个文件，反过来会丢数据。
  cmp -s "$TMUX_CONF" "$newest" 2>/dev/null || return 1
  log_info "配置与最近的备份一致，跳过备份：$newest"
}

# tmux 键名。留白、引号、分号都会让 tmux 静默忽略整行配置：
# 实测 tmux 3.6 对 `set -g prefix foo bar` 不报错，prefix 仍是 C-b。
valid_prefix_key() { [[ "$1" =~ ^[A-Za-z0-9-]+$ ]]; }

# 解析最终生效的前缀键
tmux_prefix_value() {
  local p
  p="$(ans tmux.prefix)"
  [[ "$p" == custom ]] && p="$(ans tmux.prefix_custom)"
  # 自定义前缀是自由文本。不校验的话，写进去的是 foo bar、生效的是 C-b，
  # 而「设置前缀键」这一步和结束提示都在说 foo bar —— 用户没有任何线索。
  if [[ -n "$p" ]] && ! valid_prefix_key "$p"; then
    log_warn "前缀键「$p」不是合法的 tmux 键名（如 C-x / M-a / F1），回落到 C-b。"
    p=""
  fi
  printf '%s' "${p:-C-b}"
}

step_tmux_apt() {
  local pm
  if ! pm="$(detect_pm)"; then
    log_error "未识别的包管理器（认识 apt-get / dnf / pacman / zypper）。"
    log_error "请手动安装：tmux git unzip wget curl fontconfig xclip 或 wl-clipboard。"
    return 1
  fi
  log_info "通过 $pm 安装 tmux 与常用依赖..."
  if ! pm_refresh "$pm"; then
    log_error "$pm 刷新软件源失败；请检查网络、软件源或 sudo 权限。"
    return 1
  fi
  # 这几个是真的缺一不可：没有 tmux 谈不上配置，unzip / fontconfig 是字体那步的前提
  local pkgs=(tmux git unzip wget curl fontconfig)
  if ! pm_install "$pm" "${pkgs[@]}"; then
    log_error "$pm 安装失败；tmux 未安装。"
    return 1
  fi
  # 可选包逐个装，而不是拼进上面那一组。整组 install 的语义是「一个包名在
  # 这个发行版的源里不存在，整组都不装」—— 于是一个剪贴板辅助程序就能让
  # tmux 装不上，而失败信息只说「安装失败」。四家包名是否都叫这个，
  # CI 只证到 apt-get / dnf，pacman / zypper 上不该由这里赌。
  #
  # xclip 与 wl-clipboard 都装：tmux-yank 按会话环境二选一，X11 与 Wayland
  # 在同一台机器上都可能出现（GNOME 下 Xwayland 应用就是 X11 剪贴板）。
  # acpi 只有 tmux-battery 在台式机上用得到。
  local opt failed=()
  for opt in xclip wl-clipboard acpi; do
    # 输出丢掉：三次 install 的正常刷屏没有信息量，失败原因下面统一说
    pm_install "$pm" "$opt" >/dev/null 2>&1 || failed+=("$opt")
  done
  if ((${#failed[@]})); then
    log_warn "可选包未装上：${failed[*]}"
    log_warn "（xclip / wl-clipboard 关系到 tmux-yank 能否写系统剪贴板，acpi 关系到电池插件的电量）"
  fi

  hash -r
  local v
  v="$(tmux_version)"
  if [[ -z "$v" ]]; then
    log_error "安装结束后仍无法执行 tmux -V。"
    return 1
  fi
  log_ok "tmux 安装完成（$v）"
  warn_if_tmux_too_old "$v"
}

step_tmux_source() {
  local version
  version="$(ans tmux.source_version)"
  version="${version:-3.4}"
  log_info "源码编译安装 tmux $version..."

  local pm
  if ! pm="$(detect_pm)"; then
    log_error "未识别的包管理器；请手动安装编译依赖（libevent / ncurses 的 dev 包、"
    log_error "编译器、make、bison、pkg-config）后重试。"
    return 1
  fi
  pm_refresh "$pm" || {
    log_error "$pm 刷新软件源失败。"
    return 1
  }
  local deps=()
  mapfile -t deps < <(pm_build_deps "$pm")
  # 这三个各家包名一致，不进 pm_build_deps 的表
  deps+=(wget curl ca-certificates)
  if ! pm_install "$pm" "${deps[@]}"; then
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
  if [[ -f "$TMUX_CONF" ]] && ! backup_is_redundant; then
    # 时间戳只到秒。同一秒内跑两次（脚本跑得比一秒快）会算出同一个文件名，
    # 直接 cp 就把刚才那份备份覆盖掉了 —— 备份的意义正好在这里落空。
    # 同秒的序号会打乱 backup_is_redundant 的「最近一份」判断（.10 排在 .2 前），
    # 但那个方向的错只是多留一个备份文件。
    local bak base n=1
    base="$TMUX_CONF.bak.$(date +%Y%m%d-%H%M%S)"
    bak="$base"
    while [[ -e "$bak" ]]; do
      bak="$base.$n"
      n=$((n + 1))
    done
    if ! cp "$TMUX_CONF" "$bak"; then
      log_error "备份原配置失败：$TMUX_CONF"
      return 1
    fi
    log_warn "已备份原配置到 $bak"
  fi
  conf_write <<'EOF' || return 1
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
  conf_append <<EOF || return 1

# 前缀键
unbind C-b
set -g prefix $p
bind $p send-prefix
EOF
  log_ok "前缀键设置为 $p"
}

step_tmux_opt_mouse() {
  conf_append <<'EOF' || return 1

# 鼠标支持
set -g mouse on
EOF
  log_ok "已启用鼠标支持"
}

step_tmux_opt_vi() {
  conf_append <<'EOF' || return 1

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
  conf_append <<'EOF' || return 1

# 索引从 1 开始
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
EOF
  log_ok "窗口/面板索引从 1 开始"
}

step_tmux_opt_split() {
  conf_append <<'EOF' || return 1

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
  conf_append <<'EOF' || return 1

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

  conf_append <<EOF || return 1

# ── 插件列表（TPM）────────────────────────────────
set -g @plugin 'tmux-plugins/tpm'
set-environment -g TMUX_PLUGIN_MANAGER_PATH "$HOME/.tmux/plugins"
EOF
  log_ok "TPM 安装完成"
}

_declare_plugin() {
  local spec="$1" note="$2"
  conf_append <<EOF || return 1
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
  conf_append <<'EOF' || return 1
set -g @plugin 'catppuccin/tmux'
# 主题选项必须在 TPM 运行 catppuccin 之前设置
set -g @catppuccin_flavor 'mocha'
set -g @catppuccin_window_status_style 'rounded'
EOF
  log_ok "已声明插件 catppuccin/tmux（柔和主题）"
  log_warn "状态栏图标需要 Nerd Font 才能正确显示（建议 JetBrainsMono Nerd Font Mono）。"
}

step_tmux_status_catppuccin() {
  conf_append <<'EOF' || return 1

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

# 字体名 → 「发行包名|字体族名」。zip 名不带版本号，所以 releases/latest
# 这里是安全的（和 CI 里必须钉死版本的 shfmt 相反：那边文件名带版本，
# latest/download/ 会 404）。
declare -gA NERD_FONTS=(
  [jetbrains]="JetBrainsMono|JetBrainsMono Nerd Font"
  [meslo]="Meslo|MesloLGS Nerd Font"
)

# 解压白名单。整包解出来 200 MB 以上：每个字重（Thin…ExtraBold 共 9 档）
# 都有 Mono / Propo / 变宽三套，再乘无连字（NL）副本 —— 96 个 ttf。
# 只留常规四个字重，且两个族名都要留：
#   *NerdFontMono-*  →「X Nerd Font Mono」  终端真正该选的那个（spacing=100）
#   *NerdFont-*      →「X Nerd Font」        所有文档和字体搜索框里用的名字
# 只留 Mono 的话，用户在设置里搜「JetBrainsMono Nerd Font」什么都搜不到，
# 会合理地以为字体没装上 —— 这是实际收到的反馈，不是假想。
# 通配符故意不带族名前缀：Meslo 那边的文件名是 MesloLGS* 而不是 Meslo*。
declare -ga FONT_KEEP=(
  '*NerdFontMono-Regular.ttf' '*NerdFontMono-Bold.ttf'
  '*NerdFontMono-Italic.ttf' '*NerdFontMono-BoldItalic.ttf'
  '*NerdFont-Regular.ttf' '*NerdFont-Bold.ttf'
  '*NerdFont-Italic.ttf' '*NerdFont-BoldItalic.ttf'
  '*OFL*' '*LICENSE*'
)

# NL = no ligatures。它只是又两个几乎同名的族，在字体选择框里紧挨着正版，
# 挑错了不会报错、只是连字没了 —— 与其解释，不如不装。
declare -ga FONT_EXCLUDE=('*NL*')

# 幂等判断：已经装齐了就别再下一遍上百 MB。
#
# 「装齐」= 两个族都在。只判一个族名（`fc-list | grep -qiF "X Nerd Font"`）会被
# 「X Nerd Font Mono」这一行满足 —— 而那恰好是上一版脚本（只解 *NerdFontMono-*）
# 留下的半装状态：跑新版本会被判成「已装好」直接跳过，于是那个「设置里搜不到
# X Nerd Font」的 bug 修了也到不了已经装过的人手里。
#
# 两条判据，命中任一即可：
#   ① 自己装的那个目录里两种文件名都有 —— 与解压白名单一一对应，
#      不依赖 fontconfig 把文件名映射成什么族名（Meslo 那边就不同名）。
#   ② fontconfig 里两个族名都在 —— 覆盖「系统级装过 / 装在别的目录」。
# 都不成立就重新装一遍：多下一次是浪费，判错方向则是那个 bug 复发。
font_installed() {
  local family="$1" dir="$2" fams
  if [[ -n "$(find "$dir" -name '*NerdFontMono-Regular.ttf' -print -quit 2>/dev/null)" ]] \
    && [[ -n "$(find "$dir" -name '*NerdFont-Regular.ttf' -print -quit 2>/dev/null)" ]]; then
    return 0
  fi
  command -v fc-list >/dev/null 2>&1 || return 1
  # 先接进变量再匹配，不写 fc-list | grep -q：grep -q 命中就退出，
  # fc-list 吃到 SIGPIPE 死掉，§1 的 pipefail 于是把整条管道判成 141 ——
  # 「已经装好了」会被读成「还没装」，每次都重下一遍。
  fams="$(fc-list --format '%{family[0]}\n' 2>/dev/null || true)"
  [[ -n "$fams" ]] || return 1
  # 整行精确匹配（-x）：族名之间是前缀关系，子串匹配区分不了
  grep -qxF "$family" <<<"$fams" && grep -qxF "$family Mono" <<<"$fams"
}

# 装字体要 unzip + fontconfig，而这两个在「跳过 tmux 安装」的流程里不会被装上，
# 所以这里自己补一次，补不上就明确说清楚缺什么。
_ensure_font_deps() {
  local missing=()
  command -v unzip >/dev/null 2>&1 || missing+=(unzip)
  command -v fc-cache >/dev/null 2>&1 || missing+=(fontconfig)
  ((${#missing[@]} == 0)) && return 0
  local pm
  if pm="$(detect_pm)"; then
    log_info "安装字体依赖：${missing[*]}"
    pm_refresh "$pm" && pm_install "$pm" "${missing[@]}" && return 0
  fi
  # fontconfig 缺失只影响缓存刷新，unzip 缺失则完全没法装
  if ! command -v unzip >/dev/null 2>&1; then
    log_error "安装字体需要 unzip，且自动安装失败；请手动安装 unzip 后重试。"
    return 1
  fi
  log_warn "未找到 fc-cache（fontconfig），字体文件仍会安装，但可能要重启终端才生效。"
  return 0
}

step_tmux_font() {
  local choice spec pkg family dir zip
  choice="$(ans tmux.font)"
  spec="${NERD_FONTS[$choice]:-}"
  if [[ -z "$spec" ]]; then
    log_error "未知字体选项：$choice（可用：${!NERD_FONTS[*]}）"
    return 1
  fi
  pkg="${spec%%|*}"
  family="${spec#*|}"
  dir="$HOME/.local/share/fonts/$pkg"

  if font_installed "$family" "$dir"; then
    log_ok "$family 与 $family Mono 已安装，跳过下载。"
    return 0
  fi

  _ensure_font_deps || return 1

  zip="$(mktemp -t nerd-font.XXXXXX)" || {
    log_error "无法创建临时文件，字体安装中止。"
    return 1
  }
  local url="https://github.com/ryanoasis/nerd-fonts/releases/latest/download/$pkg.zip"
  # nerd-fonts 只按字体族发包，下载量（100 MB 上下）没法挑，说清楚比让人干等好
  log_info "正在下载 $pkg.zip（上百 MB，只解出终端要用的那几款）"
  if ! download_with_fallback "$url" "$zip"; then
    rm -f "$zip"
    log_error "$family 下载失败。"
    return 1
  fi

  mkdir -p "$dir"
  unzip -oq "$zip" "${FONT_KEEP[@]}" -x "${FONT_EXCLUDE[@]}" -d "$dir" 2>/dev/null
  # 故意不看 unzip 的退出码：只要有一个模式没匹配上它就退 1（warning），
  # 而 keep 里的许可证名各家不一样，本来就允许落空。
  # 真正该判断的是「到底有没有解出字体文件」—— 没有才说明上游改了命名，
  # 那时退回整包解压：装大了总比装不上好。
  # -print -quit 而不是 `| head -1`：后者在 pipefail 下让 find 吃 SIGPIPE、
  # 管道退 141。这里只取 stdout 所以还不至于出错，但同一个写法在别处已经
  # 咬过一次，索性统一成不带管道的那种。
  if [[ -z "$(find "$dir" \( -name '*.ttf' -o -name '*.otf' \) -print -quit)" ]]; then
    log_warn "字体包里没有预期的 Mono 变体，改为整包解压（会占用较多空间）。"
    if ! unzip -oq "$zip" -d "$dir"; then
      rm -f "$zip"
      log_error "$pkg.zip 解压失败（可能下载不完整）。"
      return 1
    fi
  fi
  rm -f "$zip"

  if command -v fc-cache >/dev/null 2>&1; then
    fc-cache -f "$dir" >/dev/null 2>&1 \
      || log_warn "fc-cache 刷新失败；字体已在 $dir，重启终端后应可生效。"
  fi
  log_ok "$family 安装完成：$dir"
  # 把 fontconfig 真正认到的族名打出来，而不是让用户去猜文件名对应什么名字。
  # 「装好了但设置里搜不到」几乎都是搜错名字，或者应用启动早于安装。
  local fams=""
  if command -v fc-list >/dev/null 2>&1; then
    fams="$(fc-list --format '%{family[0]}\n' 2>/dev/null | sort -u | grep -iF "$family" || true)"
  fi
  if [[ -n "$fams" ]]; then
    log_info "终端设置里可选的字体名（照抄，别自己改写）："
    # 族名自带空格，不能靠 printf 的参数循环去逐行打印
    local f
    while IFS= read -r f; do printf '      %s\n' "$f"; done <<<"$fams"
  fi
  log_warn "还要手动把终端的字体设为「$family Mono」，图标才会显示出来。"
  log_warn "如果设置里搜不到：先关掉再重开终端/设置（应用只在启动时读一次字体列表）。"
}

step_tmux_tpm_finalize() {
  # 必须是 tmux.conf 的最后一行
  conf_append <<'EOF' || return 1

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
  # 有会话在跑就一个都不动。kill-server 会连带杀掉会话里所有进程（编译、
  # 下载、ssh 全在里面），而这一步的目的只是「别让旧二进制的 socket 留下来」——
  # 远远不值这个代价。删 socket 目录同样会把还活着的会话弄成孤儿，所以
  # 两件事一起跳过。$TMUX 只挡「自己在 tmux 里跑」，挡不住 detached 的会话。
  local sessions=""
  if command -v tmux >/dev/null 2>&1; then
    sessions="$(tmux list-sessions -F '#{session_name}' 2>/dev/null || true)"
  fi
  if [[ -n "$sessions" ]]; then
    log_warn "检测到正在运行的 tmux 会话，不做清理（kill-server 会杀掉里面的进程）："
    local s
    while IFS= read -r s; do printf '        %s\n' "$s" >&2; done <<<"$sessions"
    log_warn "新配置对新建的会话立即生效；旧会话里按 prefix + r 重载。"
    log_warn "确实要清理时，退出全部会话后执行："
    log_warn "  tmux kill-server && rm -rf /tmp/tmux-\$(id -u)"
    return 0
  fi
  # 没有会话但 server 还在（比如上一次装到一半）：这时候杀掉是安全的
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

# Ptyxis（Ubuntu 24.10 起的 GNOME 默认终端）的字体不在 profile 里，而是
# 应用级的 font-name，且 use-system-font 开着时它整个不生效 —— 于是
# 「字体明明装好了，终端里还是方框」。把两条命令直接打出来，不代跑：
# 改用户的桌面设置得他自己按回车。
#
# 键的位置在版本间换过（旧版在 profile 的 font / use-system-font 下），
# 所以先问 gsettings 有哪些键，再决定打哪一套。
ptyxis_font_hint() {
  local family="$1" keys
  command -v gsettings >/dev/null 2>&1 || return 0
  keys="$(gsettings list-keys org.gnome.Ptyxis 2>/dev/null || true)"
  [[ -n "$keys" ]] || return 0
  printf '\n Ptyxis（当前终端）可直接执行：\n'
  if grep -qx 'font-name' <<<"$keys"; then
    printf "      gsettings set org.gnome.Ptyxis use-system-font false\n"
    printf "      gsettings set org.gnome.Ptyxis font-name '%s Mono 12'\n" "$family"
  else
    # 引号闭合的 heredoc：这里在**打印给人抄的命令**，$P 不能在这里展开
    cat <<'EOF'
      P=$(gsettings get org.gnome.Ptyxis default-profile-uuid | tr -d "'")
      S="org.gnome.Ptyxis.Profile:/org/gnome/Ptyxis/Profiles/$P/"
      gsettings set "$S" use-system-font false
EOF
    printf "      gsettings set \"\$S\" font '%s Mono 12'\n" "$family"
  fi
  printf ' 其他终端（GNOME Terminal / kitty / Alacritty / WezTerm）在各自设置里改。\n'
}

step_tmux_notes() {
  local p font_note choice spec
  p="$(tmux_prefix_value)"

  # 字体这一步只能装文件，改终端配置得用户自己来，所以最后一定要再说一遍
  choice="$(ans tmux.font)"
  spec="${NERD_FONTS[$choice]:-}"
  local family=""
  if [[ -n "$spec" ]]; then
    family="${spec#*|}"
    font_note="已安装 $family，把终端字体设为「$family Mono」"
  else
    font_note="未安装 Nerd Font；图标显示成方框时装一个再设为终端字体"
  fi

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

 3) 终端字体：
      $font_note
EOF
  [[ -n "$family" ]] && ptyxis_font_hint "$family"
  printf '%s\n' "$RULE"
  log_ok "全部完成"
}

step_tmux_uninstall() {
  log_warn "开始完全卸载 tmux 及其配置..."

  if command -v tmux >/dev/null 2>&1; then
    tmux kill-server 2>/dev/null || true
    log_info "已关闭所有 tmux 会话"
  fi

  # 走 §9 的包管理器抽象，不再自己写一遍 if/elif：那份副本漏了 zypper，
  # 于是「安装认四家、卸载只认三家」——同一个脚本对同一台机器两种认知。
  local pm
  if pm="$(detect_pm)"; then
    if pm_remove "$pm" tmux >/dev/null 2>&1; then
      log_info "$pm: tmux 已卸载"
    else
      log_info "$pm 未卸载 tmux（可能本来就不是包管理器装的）"
    fi
    [[ "$pm" == apt-get ]] && dot_sudo apt-get autoremove -y >/dev/null 2>&1
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

# 选项 key 的集合，前后各留一个空格，便于 has_word
option_keys() {
  local id="$1" opts=() o keys=" "
  opts_of "$id" opts
  for o in ${opts[@]+"${opts[@]}"}; do keys="$keys${o%%:*} "; done
  printf '%s' "$keys"
}

# 同一份清单，去掉给 has_word 用的首尾空格，用于报错信息
option_keys_human() {
  local keys
  keys="$(option_keys "$1")"
  keys="${keys# }"
  printf '%s' "${keys% }"
}

# 值也必须是声明过的选项。key 拼错已经是硬报错，值拼错是同一类病：
# `--set tmux.plugins="tpm yak"` 今天会安安静静地少装一个插件，
# 而「少装了一个」是用户最不可能自己看出来的失败。
# text / number 不校验 —— 它们本来就是自由输入。
require_answer_value() {
  local k="$1" v="$2" src="$3" kind keys words=() w
  kind="${Q["$k.kind"]}"
  [[ "$kind" == one || "$kind" == many ]] || return 0
  keys="$(option_keys "$k")"
  # 单选不接受空值。has_word 拿空串去查恒真（清单里到处是空格），于是
  # `--set tmux.install=` 会被静默接受，然后所有 tmux.install=... 的 when
  # 都不成立 —— 计划里安安静静地少一步。多选的空值是正当答案（什么都不选）。
  if [[ "$kind" == one && -z "$v" ]]; then
    log_error "$src：$k 需要一个值（单选题不接受空值）"
    log_error "可用值：$(option_keys_human "$k")"
    return 1
  fi
  # 多选拆成词逐个查；单选整体就是一个词
  if [[ "$kind" == many ]]; then
    read -r -a words <<<"$v"
  else
    words=("$v")
  fi
  for w in ${words[@]+"${words[@]}"}; do
    has_word "$keys" "$w" && continue
    log_error "$src：$k 不接受值「$w」"
    log_error "可用值：$(option_keys_human "$k")"
    return 1
  done
  return 0
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
      if ! is_question "${kv%%=*}"; then
        err "预设 $name 写入了未声明的 key：${kv%%=*}"
        continue
      fi
      # 值也要查：把 tmux.font=jetbrains 敲成 jetbrans，计划照样生成，
      # 要等跑到那一步才炸。lint 是唯一能提前拦住它的地方。
      # 这里直接计数而不套 err，是为了保留 require_answer_value 打出的可用值清单。
      require_answer_value "${kv%%=*}" "${kv#*=}" "预设 $name" \
        || errors=$((errors + 1))
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

  # 把下载源也列出来：镜像是第三方信任根，用户应该有一条命令能看清
  # 「我这次会去谁那里取字节、按什么顺序」，而不是只能去读 §7 的代码。
  printf '\n%b下载源%b（按尝试顺序）\n' "$BOLD" "$NC"
  local p
  while read -r p; do
    if [[ -z "$p" ]]; then
      printf '    %s\n' "直连 GitHub"
    else
      printf '    %s %b%s%b\n' "$p" "$DIM" "（镜像：第三方信任根）" "$NC"
    fi
  done < <(github_prefixes)
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
  # n 数「载入了几条答案」，lineno 数「读到第几行」。用同一个变量兼两职时，
  # 注释和空行不计数，报错就会指到一个错的行号 —— 而这行号的唯一用途
  # 就是让人去文件里找那一行。
  local file="$1" line k v n=0 lineno=0
  [[ -r "$file" ]] || {
    log_error "读不到答案文件：$file"
    return 1
  }
  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" ]] && continue
    [[ "$line" == *=* ]] || {
      log_error "答案文件第 $lineno 行格式错误：$line"
      return 1
    }
    k="${line%%=*}"
    v="${line#*=}"
    require_question_key "$k" "$file 第 $lineno 行" || return 1
    require_answer_value "$k" "$v" "$file 第 $lineno 行" || return 1
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
    # 同上：答过但答成空的题也要写出来，否则「一个插件都不要」这个答案
    # 在文件里表现为「没答过」，回放时又被预设填满 —— 往返就不再等价了。
    for id in "${QIDS[@]}"; do
      [[ -n "${ANS[$id]+x}" ]] && printf '%s=%s\n' "$id" "${ANS[$id]}"
    done
  } >>"$file"
  log_ok "答案已保存到 $file"
}

# 需要参数值的选项少了值时，说人话，而不是抛出 set -u 的
# 「$2: 未绑定的变量」加一串行号。传 $# 而不是 "${2-}"：
# 后者会把「没给」和「给了空串」抹成同一件事。
need_arg() {
  (($2 >= 2)) || die "$1 需要一个参数值"
}

main() {
  trap show_cursor EXIT
  # Ctrl-C 必须真的退出。只挂 show_cursor 的话 bash 会跑完 trap 接着往下走 ——
  # 装到一半按 Ctrl-C 会继续装下一个步骤，而用户以为自己已经停下了。
  trap 'show_cursor; printf "\n"; log_warn "已中断。"; exit 130' INT TERM

  local do_lint=0 do_list=0 dry_run=0 assume_yes=0 interactive=1
  local save_to="" only=()

  while (($#)); do
    case "$1" in
      --preset)
        need_arg "$1" $#
        apply_preset "$2" || exit 1
        interactive=0
        shift 2
        ;;
      --set)
        need_arg "$1" $#
        [[ "$2" == *=* ]] || die "--set 需要 key=值 形式，收到：$2"
        require_question_key "${2%%=*}" "--set" || exit 1
        require_answer_value "${2%%=*}" "${2#*=}" "--set" || exit 1
        ANS["${2%%=*}"]="${2#*=}"
        interactive=0
        shift 2
        ;;
      --answers)
        need_arg "$1" $#
        load_answers "$2" || exit 1
        interactive=0
        shift 2
        ;;
      --save-answers)
        need_arg "$1" $#
        save_to="$2"
        shift 2
        ;;
      --only)
        need_arg "$1" $#
        only+=("$2")
        interactive=0
        shift 2
        ;;
      --mirror)
        need_arg "$1" $#
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

  # 声明自洽性是执行前提，始终先查一遍。
  # 第一遍连 stderr 一起丢掉：log_error 走的是 stderr，只挡 stdout 的话
  # 每条 lint 报错都会被打印两遍（先漏出来一次，再由第二遍完整打印）。
  run_lint >/dev/null 2>&1 || {
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
