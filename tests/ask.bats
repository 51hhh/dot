#!/usr/bin/env bats
#
# 交互导航：用 DOT_INPUT_FD 喂按键，断言最终 ANS。
# 重点是「回退后改答案导致问题列表伸缩」这一类 —— 旧架构用 index±1 导航，
# 这正是它最容易错的地方。

SH() {
  local keys="$1"; shift
  local kf="$BATS_TEST_TMPDIR/keys.bin"
  printf '%b' "$keys" > "$kf"
  exec 7< "$kf"
  DOT_INPUT_FD=7 bash "$BATS_TEST_DIRNAME/../TMUX.sh" "$@" >/dev/null 2>&1
  local st=$?
  exec 7<&-
  return "$st"
}

# 走完交互后把答案存盘，再读回来断言
answers_after() {
  local keys="$1"; shift
  local out="$BATS_TEST_TMPDIR/ans.txt"
  SH "$keys" --dry-run --save-answers "$out" "$@" || true
  grep -v '^#' "$out" 2>/dev/null || true
}

get() { grep "^$1=" <<< "$2" | cut -d= -f2-; }

DOWN='\033[B'
UP='\033[A'
LEFT='\033[D'
CR='\n'
SP=' '

# ── 单选 ─────────────────────────────────────────────────────────

@test "单选：直接回车取第一项" {
  local a; a="$(answers_after "$CR")"
  [ "$(get tmux.profile "$a")" = recommended ]
}

@test "单选：下移一次选到 custom" {
  local a; a="$(answers_after "$DOWN$CR$CR$CR$CR$CR$CR")"
  [ "$(get tmux.profile "$a")" = custom ]
}

@test "单选：下移两次选到 uninstall，且后续问题全部消失" {
  local a; a="$(answers_after "$DOWN$DOWN$CR")"
  [ "$(get tmux.profile "$a")" = uninstall ]
  [ -z "$(get tmux.install "$a")" ]
}

@test "单选：j/k 与方向键等价" {
  local a; a="$(answers_after "j$CR$CR$CR$CR$CR$CR")"
  [ "$(get tmux.profile "$a")" = custom ]
}

@test "单选：上移不会越过第一项" {
  local a; a="$(answers_after "$UP$UP$UP$CR")"
  [ "$(get tmux.profile "$a")" = recommended ]
}

@test "单选：下移不会越过最后一项" {
  local a; a="$(answers_after "$DOWN$DOWN$DOWN$DOWN$DOWN$CR")"
  [ "$(get tmux.profile "$a")" = uninstall ]
}

@test "单选：默认值决定初始高亮（前缀键默认 C-b，第三项）" {
  # custom → install(apt) → prefix 直接回车 → 应得默认 C-b
  local a; a="$(answers_after "$DOWN$CR$CR$CR$CR$CR$CR")"
  [ "$(get tmux.prefix "$a")" = C-b ]
}

# ── 多选 ─────────────────────────────────────────────────────────

@test "多选：空格勾选第一项" {
  local a; a="$(answers_after "$DOWN$CR$CR$CR$SP$CR$CR$CR")"
  [ "$(get tmux.plugins "$a")" = tpm ]
}

@test "多选：勾选多项后按声明顺序规范化" {
  # 插件列表：tpm sensible yank cpu ...  勾第 1、3 项
  local a; a="$(answers_after "$DOWN$CR$CR$CR$SP$DOWN$DOWN$SP$CR$CR$CR")"
  [ "$(get tmux.plugins "$a")" = "tpm yank" ]
}

@test "多选：重复空格取消勾选" {
  local a; a="$(answers_after "$DOWN$CR$CR$CR$SP$SP$CR$CR$CR")"
  [ -z "$(get tmux.plugins "$a")" ]
  # 光断言「插件为空」是不够的：脚本整个崩掉时它也成立
  # （answers_after 用 || true 吞掉了失败）。所以同时断言流程真的走完了。
  [ "$(get tmux.profile "$a")" = custom ]
}

@test "多选：全不选也能确认" {
  local a; a="$(answers_after "$DOWN$CR$CR$CR$CR$CR$CR")"
  [ -z "$(get tmux.plugins "$a")" ]
  [ "$(get tmux.profile "$a")" = custom ]
}

# ── 字体 ─────────────────────────────────────────────────────────

@test "字体题：直接回车取默认 jetbrains" {
  local a; a="$(answers_after "$DOWN$CR$CR$CR$CR$CR$CR")"
  [ "$(get tmux.font "$a")" = jetbrains ]
}

@test "字体题：下移两次选 skip" {
  # 顺序：profile custom → install → prefix → plugins → font → options
  local a; a="$(answers_after "$DOWN$CR$CR$CR$CR$DOWN$DOWN$CR$CR")"
  [ "$(get tmux.font "$a")" = skip ]
}

# ── 回退（history 栈，而非 index±1）────────────────────────────────

@test "回退：在第二题按左方向键回到第一题" {
  # custom → 到 install → 回退 → 上移到 recommended → 确认
  local a; a="$(answers_after "$DOWN$CR$LEFT$UP$CR")"
  [ "$(get tmux.profile "$a")" = recommended ]
}

@test "回退：b 键与左方向键等价" {
  local a; a="$(answers_after "${DOWN}${CR}b${UP}$CR")"
  [ "$(get tmux.profile "$a")" = recommended ]
}

@test "回退后改答案：问题列表收缩，多余的问题不再被问" {
  # 先选 custom（会问 5 题），回退改成 recommended（只问 1 题）
  # 若导航靠 index±1，这里会读到错位的问题或多读按键
  local a; a="$(answers_after "$DOWN$CR$LEFT$UP$CR")"
  [ "$(get tmux.profile "$a")" = recommended ]
  # recommended 由预设填出全部答案
  [ "$(get tmux.install "$a")" = apt ]
  [ "$(get tmux.prefix "$a")" = C-Space ]
}

@test "回退后改答案：问题列表扩张，新出现的问题会被问到" {
  # prefix 选 custom（第 4 项）会新增 prefix_custom 一题
  local a; a="$(answers_after "$DOWN$CR$CR$DOWN$DOWN$DOWN$CR""C-y$CR$CR$CR$CR")"
  [ "$(get tmux.prefix "$a")" = custom ]
  [ "$(get tmux.prefix_custom "$a")" = C-y ]
}

@test "在第一题按回退键 = 重新问第一题（不是退出）" {
  # run_ask 返回 2 → main 里 continue → 可见列表重算 → 又问第一题。
  # 退出只有 q 一条路（见下面的 q 测试），回退到底不会把人踢出去。
  local a; a="$(answers_after "$LEFT$CR")"
  [ "$(get tmux.profile "$a")" = recommended ]
}

@test "回退不会丢掉已答的其他问题" {
  # custom → install=apt → prefix 回退 → install 改 source → 继续
  local a; a="$(answers_after "$DOWN$CR$CR$LEFT$DOWN$CR""$CR$CR$CR$CR$CR")"
  [ "$(get tmux.profile "$a")" = custom ]
  [ "$(get tmux.install "$a")" = source ]
}

# ── 文本输入 ─────────────────────────────────────────────────────

@test "文本题：直接回车取默认值" {
  # custom → install=source → source_version 回车 → 默认 3.4
  local a; a="$(answers_after "$DOWN$CR$DOWN$CR$CR$CR$CR$CR$CR")"
  [ "$(get tmux.install "$a")" = source ]
  [ "$(get tmux.source_version "$a")" = 3.4 ]
}

@test "文本题：可输入自定义值" {
  local a; a="$(answers_after "$DOWN$CR$DOWN$CR""3.5a$CR$CR$CR$CR$CR")"
  [ "$(get tmux.source_version "$a")" = 3.5a ]
}

@test "文本题：:b 回退上一题" {
  # :b 是整行输入，必须自带换行；回退后把 install 从 source 改回 apt
  local a; a="$(answers_after "$DOWN$CR$DOWN$CR"":b$CR""$UP$CR$CR$CR$CR$CR")"
  [ "$(get tmux.install "$a")" = apt ]
  # install=apt 后 source_version 这一题应当消失
  [ -z "$(get tmux.source_version "$a")" ]
}

# ── number 题（§8 目前没用到这个类型，靠这里保证它不烂掉）────────

number_answer() {
  source "$BATS_TEST_DIRNAME/../TMUX.sh"
  ask number t.num "一个数字" --default 8
  printf '%b' "$1" > "$BATS_TEST_TMPDIR/n.bin"
  exec 8< "$BATS_TEST_TMPDIR/n.bin"
  TTY_FD=8
  ask_kind_line t.num 1 1 number >/dev/null 2>&1
  local st=$?
  exec 8<&-
  ((st == 0)) && printf '%s' "${ANS[t.num]}"
  return "$st"
}

@test "number 题：接受数字" {
  run number_answer "42$CR"
  [ "$status" -eq 0 ]
  [ "$output" = 42 ]
}

@test "number 题：非数字会被打回重输" {
  # 先给 abc（应被拒绝），再给 7 —— 拿到 7 就说明它真的重问了一次
  run number_answer "abc${CR}7$CR"
  [ "$status" -eq 0 ]
  [ "$output" = 7 ]
}

@test "number 题：直接回车取默认值" {
  run number_answer "$CR"
  [ "$status" -eq 0 ]
  [ "$output" = 8 ]
}

# ── 退出 ─────────────────────────────────────────────────────────

@test "q 退出：不写任何配置，退出码 0" {
  local h="$BATS_TEST_TMPDIR/h"; mkdir -p "$h"
  local kf="$BATS_TEST_TMPDIR/q.bin"; printf 'q' > "$kf"
  exec 7< "$kf"
  run env HOME="$h" DOT_INPUT_FD=7 bash "$BATS_TEST_DIRNAME/../TMUX.sh"
  exec 7<&-
  [ "$status" -eq 0 ]
  [ ! -e "$h/.tmux.conf" ]
}

# ── 确认页返回码契约（直接单元测试，不启动整条流程）──────────────

confirm_with() {
  source "$BATS_TEST_DIRNAME/../TMUX.sh"
  ANS[tmux.profile]=custom
  resolve_presets
  build_plan
  printf '%b' "$1" > "$BATS_TEST_TMPDIR/c.bin"
  exec 8< "$BATS_TEST_TMPDIR/c.bin"
  TTY_FD=8
  confirm_plan >/dev/null 2>&1
  local st=$?
  exec 8<&-
  return "$st"
}

@test "确认页：回车返回 0（开始执行）" {
  run confirm_with "$CR"
  [ "$status" -eq 0 ]
}

@test "确认页：左方向键返回 2（回去改答案）" {
  run confirm_with "$LEFT"
  [ "$status" -eq 2 ]
}

@test "确认页：b 返回 2" {
  run confirm_with "b"
  [ "$status" -eq 2 ]
}

@test "确认页：q 返回 1（退出）" {
  run confirm_with "q"
  [ "$status" -eq 1 ]
}
