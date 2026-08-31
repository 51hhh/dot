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

# ── 基本契约 ─────────────────────────────────────────────────────

@test "语法自检通过" {
  run bash -n "$BATS_TEST_DIRNAME/../TMUX.sh"
  [ "$status" -eq 0 ]
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
  HOME="$BATS_TEST_TMPDIR/h" run env HOME="$BATS_TEST_TMPDIR/h" \
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
  [ "$(grep -c '·' <<< "$output")" -eq 20 ]
}

@test "答案文件格式错误时报错退出" {
  local f="$BATS_TEST_TMPDIR/bad.txt"
  printf 'tmux.install apt\n' > "$f"
  run SH --answers "$f" --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"格式错误"* ]]
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

@test "执行前会自动跑一次 lint，声明坏了不会开始安装" {
  local out="$BATS_TEST_TMPDIR/b.sh"
  sed 's|^step tmux.cleanup|step tmux.ghost final\nstep tmux.cleanup|' \
    "$BATS_TEST_DIRNAME/../TMUX.sh" > "$out"
  run env HOME="$BATS_TEST_TMPDIR/h" bash "$out" --preset recommended -y
  [ "$status" -eq 1 ]
  [ ! -e "$BATS_TEST_TMPDIR/h/.tmux.conf" ]
}
