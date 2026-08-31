#!/usr/bin/env bats
#
# CLI 契约 + --lint 负例。
# --lint 取代了旧架构的 zod schema：因为坏状态大多已不可表达，
# 剩下需要检查的只有「引用了不存在的东西」这一类。

SH() { bash "$BATS_TEST_DIRNAME/../TMUX.sh" "$@"; }

# 生成一个被 sed 改坏的副本，用来验证 lint 真的会报错
broken() {
  local expr="$1"
  local out="$BATS_TEST_TMPDIR/broken.sh"
  sed "$expr" "$BATS_TEST_DIRNAME/../TMUX.sh" > "$out"
  bash "$out" --lint 2>&1
}

# 模拟 curl | bash：脚本从 stdin 进 bash，参数走 -s --
PIPED() { cat "$BATS_TEST_DIRNAME/../TMUX.sh" | bash -s -- "$@"; }

# ── 基本契约 ─────────────────────────────────────────────────────

@test "语法自检通过" {
  run bash -n "$BATS_TEST_DIRNAME/../TMUX.sh"
  [ "$status" -eq 0 ]
}

# ── curl | bash（主分发路径）─────────────────────────────────────
#
# 管道执行时 BASH_SOURCE[0] 未设置、$0 是 "bash"。文件末尾的执行守卫
# 必须写成 ${BASH_SOURCE[0]:-$0}，否则：set -u 报「未绑定的变量」，
# 或者（无 set -u 时）main 根本不被调用、脚本静默退出 0 什么都不做。

@test "管道执行（curl | bash）会真的跑起来" {
  run PIPED --lint
  [ "$status" -eq 0 ]
  [[ "$output" == *"lint 通过"* ]]
}

@test "管道执行时参数正常传入" {
  run PIPED --preset recommended --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *tmux.tpm.finalize* ]]
}

@test "管道执行不会因 set -u 报未绑定变量" {
  run PIPED --preset recommended --dry-run
  [[ "$output" != *"BASH_SOURCE"* ]]
  [[ "$output" != *"unbound variable"* ]]
  [[ "$output" != *"未绑定的变量"* ]]
}

@test "被 source 时不执行 main" {
  # 若守卫写错方向，source 会触发整套交互/安装
  run bash -c "source '$BATS_TEST_DIRNAME/../TMUX.sh'; echo SOURCED_OK"
  [ "$status" -eq 0 ]
  [ "${lines[-1]}" = "SOURCED_OK" ]
}

@test "--lint 在未改动的脚本上通过" {
  run SH --lint
  [ "$status" -eq 0 ]
  [[ "$output" == *"lint 通过"* ]]
}

@test "--help 退出码为 0 且列出关键选项" {
  run SH --help
  [ "$status" -eq 0 ]
  for f in --preset --answers --save-answers --dry-run --only --lint --list; do
    [[ "$output" == *"$f"* ]] || { echo "帮助里缺少 $f"; return 1; }
  done
}

@test "--list 列出全部问题与步骤" {
  run SH --list
  [ "$status" -eq 0 ]
  [[ "$output" == *tmux.profile* ]]
  [[ "$output" == *tmux.tpm.finalize* ]]
}

@test "--dry-run 不执行任何步骤（不产生 ~/.tmux.conf）" {
  run env HOME="$BATS_TEST_TMPDIR/h" \
    bash "$BATS_TEST_DIRNAME/../TMUX.sh" --preset recommended --dry-run
  [ "$status" -eq 0 ]
  [ ! -e "$BATS_TEST_TMPDIR/h/.tmux.conf" ]
}

# ── 答案文件往返 ─────────────────────────────────────────────────

@test "--answers 读入并复现计划" {
  local f="$BATS_TEST_TMPDIR/a.txt"
  printf 'tmux.profile=custom\ntmux.plugins=tpm yank\n' > "$f"
  run SH --answers "$f" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *tmux.plugin.tpm* ]]
  [[ "$output" == *tmux.plugin.yank* ]]
  [[ "$output" != *tmux.plugin.cpu* ]]
}

@test "答案文件支持注释与空行" {
  local f="$BATS_TEST_TMPDIR/a.txt"
  printf '# 注释\n\n  tmux.profile=custom  \ntmux.plugins=yank # 行尾注释\n' > "$f"
  run SH --answers "$f" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *tmux.plugin.yank* ]]
}

@test "--save-answers 写出的文件可被 --answers 原样读回" {
  local f="$BATS_TEST_TMPDIR/a.txt"
  run SH --preset recommended --dry-run --save-answers "$f"
  [ "$status" -eq 0 ]
  [ -s "$f" ]
  run SH --answers "$f" --dry-run
  [ "$status" -eq 0 ]
  [ "$(grep -c '·' <<< "$output")" -eq 21 ]
}

@test "答案文件格式错误时报错退出" {
  local f="$BATS_TEST_TMPDIR/bad.txt"
  printf 'tmux.install apt\n' > "$f"
  run SH --answers "$f" --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"格式错误"* ]]
}

# ── 答案 key 拼错必须报错，不能静默 ──────────────────────────────
#
# 少个 s 的 tmux.plugin 曾经会被接受、计划里一个插件都没有。
# 这类「什么都没发生」的失败最难自己查出来，所以必须硬报错。

@test "--set 用了未声明的 key 时报错退出" {
  run SH --set tmux.plugin=tpm --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"未声明的答案 key"* ]]
  [[ "$output" == *"tmux.plugin"* ]]
}

@test "答案文件里未声明的 key 也报错退出" {
  local f="$BATS_TEST_TMPDIR/typo.txt"
  printf 'tmux.profile=custom\ntmux.opitons=mouse\n' > "$f"
  run SH --answers "$f" --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"未声明的答案 key"* ]]
}

@test "拼对的 key 不受影响" {
  run SH --set tmux.profile=custom --set tmux.plugins="tpm yank" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *tmux.plugin.tpm* ]]
  [[ "$output" == *tmux.plugin.yank* ]]
}

# ── 答案值拼错也必须报错 ────────────────────────────────────────
#
# key 拼错和值拼错是同一类病：计划安安静静地少做一件事。
# `--set tmux.plugins="tpm yak"` 曾经只是少装一个 yank，没有任何提示。

@test "--set 用了未声明的选项值时报错退出" {
  run SH --set tmux.font=comicsans --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"不接受值"* ]]
  [[ "$output" == *comicsans* ]]
  # 报错里要给出可用值，否则用户只能去读源码
  [[ "$output" == *jetbrains* ]]
}

@test "多选里有一个词拼错就报错，不是静默少装一个" {
  run SH --set tmux.plugins="tpm yak" --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"不接受值"* ]]
  [[ "$output" == *yak* ]]
}

@test "多选空值合法（等于什么都没选）" {
  run SH --set tmux.profile=custom --set tmux.plugins= --dry-run
  [ "$status" -eq 0 ]
}

@test "自由文本题不做值校验" {
  run SH --set tmux.profile=custom --set tmux.install=source \
    --set tmux.source_version=9.9zz --dry-run
  [ "$status" -eq 0 ]
}

@test "答案文件里的值拼错也报错退出" {
  local f="$BATS_TEST_TMPDIR/badval.txt"
  printf 'tmux.profile=custom\ntmux.install=api\n' > "$f"
  run SH --answers "$f" --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"不接受值"* ]]
}

# ── 显式的空答案是答案，不是「没答」──────────────────────────────
#
# 预设按 noclobber 套用。若按「值非空」判断，答案文件里写 tmux.plugins=
# （明确表示不要插件）会被预设悄悄填回 8 个插件 —— 文件说一套、装的是另一套。

@test "预设不会覆盖显式写成空的答案" {
  local f="$BATS_TEST_TMPDIR/empty.txt"
  printf 'tmux.profile=recommended\ntmux.plugins=\n' > "$f"
  run SH --answers "$f" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" != *tmux.plugin.* ]]
  # 其余预设值仍应生效，否则就是把整个预设废掉了
  [[ "$output" == *tmux.apt* ]]
}

@test "--save-answers 保留答成空的题（往返等价）" {
  local f="$BATS_TEST_TMPDIR/rt.txt"
  run SH --set tmux.profile=custom --set tmux.plugins= --dry-run --save-answers "$f"
  [ "$status" -eq 0 ]
  grep -qx 'tmux.plugins=' "$f"
}

# ── 缺少参数值时说人话 ──────────────────────────────────────────

@test "选项缺少参数值时给出可读报错，而不是 set -u 的未绑定变量" {
  local f
  for f in --preset --set --answers --save-answers --only --mirror; do
    run SH "$f"
    [ "$status" -eq 1 ] || { echo "$f 应该退出码 1"; return 1; }
    [[ "$output" == *"需要一个参数值"* ]] || { echo "$f 报错不可读：$output"; return 1; }
    [[ "$output" != *"未绑定的变量"* ]] || { echo "$f 泄漏了 set -u 报错"; return 1; }
    [[ "$output" != *"unbound variable"* ]] || { echo "$f 泄漏了 set -u 报错"; return 1; }
  done
}

# ── 空计划 ──────────────────────────────────────────────────────

@test "计划为空时明确说明，而不是假装装完了" {
  # --only 指定的步骤存在，但它的 when 不成立 → 过滤后计划为空
  run env HOME="$BATS_TEST_TMPDIR/h" \
    bash "$BATS_TEST_DIRNAME/../TMUX.sh" \
    --set tmux.profile=uninstall --only tmux.header
  [ "$status" -eq 0 ]
  [[ "$output" == *"没有需要执行的步骤"* ]]
  [ ! -e "$BATS_TEST_TMPDIR/h/.tmux.conf" ]
}

# ── 非终端输出不带颜色 ───────────────────────────────────────────

@test "输出被重定向时不含 ANSI 转义序列" {
  run SH --preset recommended --dry-run
  [[ "$output" != *$'\033'* ]]
}

@test "答案文件不存在时报错退出" {
  run SH --answers /nonexistent/nope --dry-run
  [ "$status" -eq 1 ]
}

# ── 参数校验 ─────────────────────────────────────────────────────

@test "未知参数报错退出" {
  run SH --bogus
  [ "$status" -eq 1 ]
  [[ "$output" == *"未知参数"* ]]
}

@test "--set 缺少 = 时报错退出" {
  run SH --set foo
  [ "$status" -eq 1 ]
}

@test "--preset 未知名字报错退出" {
  run SH --preset nope
  [ "$status" -eq 1 ]
  [[ "$output" == *"未知预设"* ]]
}

@test "--only 指定不存在的步骤时报错退出" {
  run SH --only nope --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"不存在的步骤"* ]]
}

@test "--set 覆盖 --preset（argv 顺序语义）" {
  run SH --preset recommended --set tmux.install=source --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *tmux.source* ]]
  [[ "$output" != *tmux.apt* ]]
}

@test "--only 保留计划顺序，只留指定步骤" {
  run SH --preset recommended --dry-run --only tmux.notes --only tmux.header
  [ "$status" -eq 0 ]
  [ "$(grep -c '·' <<< "$output")" -eq 2 ]
  # header 在 configure，notes 在 final —— 输出顺序应仍是 header 先
  [[ "$output" == *tmux.header*tmux.notes* ]]
}

# ── 无终端时的行为 ───────────────────────────────────────────────

@test "无终端时交互模式明确报错而不是卡住或静默退出" {
  run setsid bash "$BATS_TEST_DIRNAME/../TMUX.sh" < /dev/null
  [ "$status" -eq 1 ]
  [[ "$output" == *"没有可用的终端"* ]]
  [[ "$output" == *"--preset recommended"* ]]
}

@test "无终端时非交互模式正常工作" {
  run setsid bash "$BATS_TEST_DIRNAME/../TMUX.sh" --preset recommended --dry-run < /dev/null
  [ "$status" -eq 0 ]
}

@test "DOT_INPUT_FD 非数字时报错" {
  DOT_INPUT_FD=abc run SH --lint
  [ "$status" -eq 1 ]
  # 也断言原因：只看退出码的话，任何一种崩溃都能让这个测试「通过」
  [[ "$output" == *"DOT_INPUT_FD"* ]]
}

# ── 语义提醒 ─────────────────────────────────────────────────────

@test "选插件却没选 TPM 时给出告警" {
  run SH --set tmux.plugins=yank --dry-run
  [[ "$output" == *"没选 TPM"* ]]
}

@test "选了 TPM 时不告警" {
  run SH --set tmux.plugins="tpm yank" --dry-run
  [[ "$output" != *"没选 TPM"* ]]
}

# ── lint 负例 ────────────────────────────────────────────────────

@test "lint 抓到 when 引用未声明的 key" {
  run broken 's|--when tmux.profile=custom|--when tmux.typo=custom|'
  [ "$status" -eq 1 ]
  [[ "$output" == *"未声明的 key：tmux.typo"* ]]
}

@test "lint 抓到缺少函数体的步骤" {
  run broken 's|^step tmux.cleanup|step tmux.ghost final\nstep tmux.cleanup|'
  [ "$status" -eq 1 ]
  [[ "$output" == *"缺少函数 step_tmux_ghost"* ]]
}

@test "lint 抓到非法阶段" {
  # 空格数写成 " *" —— 否则 shfmt 重排对齐时这个测试会假失败
  run broken 's|^step tmux\.cleanup  *final|step tmux.cleanup lateish|'
  [ "$status" -eq 1 ]
  [[ "$output" == *"阶段非法：lateish"* ]]
}

@test "lint 抓到重复的步骤 id" {
  run broken 's|^step tmux\.cleanup  *final|step tmux.notes final\nstep tmux.cleanup final|'
  [ "$status" -eq 1 ]
  [[ "$output" == *"步骤 id 重复"* ]]
}

@test "lint 抓到含空格的选项 key（会破坏多选的空格分隔）" {
  run broken 's|  mouse:"鼠标支持"|  "bad key":"含空格"|'
  [ "$status" -eq 1 ]
  [[ "$output" == *"非法字符"* ]]
}

@test "lint 抓到缺少描述的选项" {
  run broken 's|  mouse:"鼠标支持"|  mouse|'
  [ "$status" -eq 1 ]
  [[ "$output" == *"缺少描述"* ]]
}

@test "lint 抓到非法的问题类型" {
  run broken 's|^ask many tmux.options "基础配置"|ask checkbox tmux.options "基础配置"|'
  [ "$status" -eq 1 ]
  [[ "$output" == *"类型非法：checkbox"* ]]
}

@test "lint 抓到预设写入未声明的 key" {
  run broken 's|^  tmux.install=apt|  tmux.instal=apt|'
  [ "$status" -eq 1 ]
  [[ "$output" == *"未声明的 key：tmux.instal"* ]]
}

@test "lint 抓到预设写入非法的选项值" {
  # 值拼错和 key 拼错一样致命，而且只有 lint 能在执行前拦住它
  run broken 's|  tmux.font=jetbrains|  tmux.font=jetbrans|'
  [ "$status" -eq 1 ]
  [[ "$output" == *"不接受值"* ]]
  [[ "$output" == *jetbrans* ]]
}

@test "执行前的 lint 报错只打印一遍" {
  # 预检那次要连 stderr 一起丢掉：log_error 走 stderr，只挡 stdout 的话
  # 每条报错会先漏出来一次、再被第二次完整打印，读起来像出了两个错。
  local out="$BATS_TEST_TMPDIR/dup.sh"
  sed 's|^step tmux.cleanup|step tmux.ghost final\nstep tmux.cleanup|' \
    "$BATS_TEST_DIRNAME/../TMUX.sh" > "$out"
  run env HOME="$BATS_TEST_TMPDIR/h" bash "$out" --preset recommended -y
  [ "$status" -eq 1 ]
  [ "$(grep -c '缺少函数 step_tmux_ghost' <<< "$output")" -eq 1 ]
}

@test "执行前会自动跑一次 lint，声明坏了不会开始安装" {
  local out="$BATS_TEST_TMPDIR/b.sh"
  sed 's|^step tmux.cleanup|step tmux.ghost final\nstep tmux.cleanup|' \
    "$BATS_TEST_DIRNAME/../TMUX.sh" > "$out"
  run env HOME="$BATS_TEST_TMPDIR/h" bash "$out" --preset recommended -y
  [ "$status" -eq 1 ]
  [ ! -e "$BATS_TEST_TMPDIR/h/.tmux.conf" ]
}
