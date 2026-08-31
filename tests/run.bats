#!/usr/bin/env bats
#
# §6 失败策略 与 §7 镜像回落。
#
# 这两层以前没有测试，而它们恰好是「出事最贵」的两层：
#   §6 决定一个步骤失败之后还会不会继续动这台机器；
#   §7 决定字节从哪个第三方那里来。
#
# 两者都能在不联网、不装包、不写文件的前提下测：
# source 进来之后，把 step_* 和 fetch_url 换成假的就行。

source "$BATS_TEST_DIRNAME/../TMUX.sh"

# ── §6 失败策略 ──────────────────────────────────────────────────
#
# 造四个假步骤，每个阶段一个。FAILING 里列到的步骤返回 1。
# 真步骤一个都不碰，所以这些测试不会装包也不会写 ~/.tmux.conf。

fails() { ! has_word "$FAILING" "$1"; }

step_f_prep() { fails f.prep; }
step_f_inst() { fails f.inst; }
step_f_conf() { fails f.conf; }
step_f_fin() { fails f.fin; }

setup() {
  ANS=()
  RESULT=()
  FAILING=" "
  step f.prep prepare --label prep
  step f.inst install --label inst
  step f.conf configure --label conf
  step f.fin final --label fin
  # 直接给 PLAN 赋值，不走 build_plan：否则真步骤（tmux.header 等）
  # 会因为 tmux.profile 未设置、!=uninstall 成立而一起混进来。
  PLAN=(f.prep f.inst f.conf f.fin)
}

# run_plan 会改 RESULT，所以既不能用 bats 的 run，也不能包在 $( ) 里 ——
# 两者都开子 shell，RESULT 的改动带不回来。退出码另存到 ST。
run_fake_plan() {
  ST=0
  run_plan >/dev/null 2>&1 || ST=$?
}

@test "全部成功：每一步都是 ok，退出码 0" {
  run_fake_plan
  [ "$ST" -eq 0 ]
  [ "${RESULT[f.prep]}" = ok ]
  [ "${RESULT[f.fin]}" = ok ]
}

@test "install 阶段失败：中止后续，且后续状态是 skipped 而不是 ok" {
  FAILING=" f.inst "
  run_fake_plan
  [ "$ST" -eq 1 ]
  [ "${RESULT[f.prep]}" = ok ]
  [ "${RESULT[f.inst]}" = failed ]
  [ "${RESULT[f.conf]}" = skipped ]
  [ "${RESULT[f.fin]}" = skipped ]
}

@test "prepare 阶段失败：一步都不往下走" {
  FAILING=" f.prep "
  run_fake_plan
  [ "$ST" -eq 1 ]
  [ "${RESULT[f.prep]}" = failed ]
  [ "${RESULT[f.inst]}" = skipped ]
}

@test "configure 阶段失败：只告警，后续照常执行" {
  FAILING=" f.conf "
  run_fake_plan
  [ "$ST" -eq 1 ]
  [ "${RESULT[f.conf]}" = failed ]
  [ "${RESULT[f.fin]}" = ok ]
}

@test "final 阶段失败：不影响任何已完成的步骤" {
  FAILING=" f.fin "
  run_fake_plan
  [ "$ST" -eq 1 ]
  [ "${RESULT[f.conf]}" = ok ]
  [ "${RESULT[f.fin]}" = failed ]
}

@test "失败会出现在结果汇总里（不是只写进 RESULT 就算了）" {
  FAILING=" f.conf "
  run run_plan
  [[ "$output" == *"步骤失败"* ]]
  [[ "$output" == *"执行结果"* ]]
}

@test "阶段分类与 §3 的声明一致（改了 CRITICAL_PHASES 这些测试才该重写）" {
  has_word "$CRITICAL_PHASES" prepare
  has_word "$CRITICAL_PHASES" install
  ! has_word "$CRITICAL_PHASES" configure
  ! has_word "$CRITICAL_PHASES" final
}

# ── §7 镜像回落 ──────────────────────────────────────────────────

@test "默认不带镜像：只有直连一个源" {
  DOT_GITHUB_MIRRORS=""
  local out=()
  mapfile -t out < <(github_prefixes)
  [ "${#out[@]}" -eq 1 ]
  [ -z "${out[0]}" ]
}

@test "直连永远排在镜像前面（镜像是显式 opt-in，不是默认路径）" {
  DOT_GITHUB_MIRRORS="https://m1.example/ https://m2.example/"
  local out=()
  mapfile -t out < <(github_prefixes)
  [ "${#out[@]}" -eq 3 ]
  [ -z "${out[0]}" ]
  [ "${out[1]}" = "https://m1.example/" ]
  [ "${out[2]}" = "https://m2.example/" ]
}

# 把 fetch_url 换成假的：记录被试过的 URL，不联网。
@test "下载失败会依次退到每个镜像，全失败才报错" {
  DOT_GITHUB_MIRRORS="https://m1.example/ https://m2.example/"
  TRIED=()
  fetch_url() {
    TRIED+=("$1")
    return 1
  }
  local st=0
  download_with_fallback "https://github.com/x/y.zip" \
    "$BATS_TEST_TMPDIR/o" >/dev/null 2>&1 || st=$?
  [ "$st" -eq 1 ]
  [ "${#TRIED[@]}" -eq 3 ]
  [ "${TRIED[0]}" = "https://github.com/x/y.zip" ]
  [ "${TRIED[1]}" = "https://m1.example/https://github.com/x/y.zip" ]
  [ "${TRIED[2]}" = "https://m2.example/https://github.com/x/y.zip" ]
}

@test "直连成功时一个镜像都不碰（不会把 URL 交给第三方）" {
  DOT_GITHUB_MIRRORS="https://m1.example/"
  TRIED=()
  fetch_url() {
    TRIED+=("$1")
    return 0
  }
  download_with_fallback "https://github.com/x/y.zip" \
    "$BATS_TEST_TMPDIR/o" >/dev/null 2>&1
  [ "${#TRIED[@]}" -eq 1 ]
  [ "${TRIED[0]}" = "https://github.com/x/y.zip" ]
}

@test "直连失败、镜像成功时返回成功" {
  DOT_GITHUB_MIRRORS="https://m1.example/"
  TRIED=()
  fetch_url() {
    TRIED+=("$1")
    [[ "$1" == https://m1.example/* ]]
  }
  download_with_fallback "https://github.com/x/y.zip" \
    "$BATS_TEST_TMPDIR/o" >/dev/null 2>&1
  [ "${#TRIED[@]}" -eq 2 ]
}

@test "--mirror 追加到 DOT_GITHUB_MIRRORS 而不是替换它" {
  run env DOT_GITHUB_MIRRORS="https://env.example/" \
    bash "$BATS_TEST_DIRNAME/../TMUX.sh" --mirror https://cli.example/ --list
  [ "$status" -eq 0 ]
  [[ "$output" == *"https://env.example/"* ]]
  [[ "$output" == *"https://cli.example/"* ]]
  # 直连必须仍然排在两个镜像前面
  [[ "$output" == *"直连 GitHub"*"https://env.example/"*"https://cli.example/"* ]]
}

@test "--list 默认只显示直连，不凭空冒出镜像" {
  run env DOT_GITHUB_MIRRORS= bash "$BATS_TEST_DIRNAME/../TMUX.sh" --list
  [ "$status" -eq 0 ]
  [[ "$output" == *"直连 GitHub"* ]]
  [[ "$output" != *"第三方信任根"* ]]
}

# ── 字体步骤 ─────────────────────────────────────────────────────
#
# 真下载有上百 MB，测不了也不该测。能测、也值得测的是「要不要下载」这个判断：
# 它一错就是每次重装都白拉一遍整个字体包。
# fc-list / download_with_fallback / _ensure_font_deps 全部换成假的，不联网。

@test "字体已装时直接跳过，不发起下载" {
  ANS[tmux.font]=jetbrains
  DOWNLOADED=0
  fc-list() { printf '%s: JetBrainsMono Nerd Font Mono:style=Regular\n' /f/x.ttf; }
  download_with_fallback() { DOWNLOADED=1; }
  local st=0
  step_tmux_font >/dev/null 2>&1 || st=$?
  [ "$st" -eq 0 ]
  # 这条断言防的是具体那个 bug：fc-list | grep -q 在 pipefail 下退 141，
  # 「已装好」被读成「没装」，于是每次都重下一遍。
  [ "$DOWNLOADED" -eq 0 ]
}

@test "字体没装时才下载，下载失败则步骤失败" {
  ANS[tmux.font]=jetbrains
  DOWNLOADED=0
  fc-list() { printf 'DejaVu Sans:style=Book\n'; }
  _ensure_font_deps() { return 0; }
  download_with_fallback() {
    DOWNLOADED=1
    return 1
  }
  local st=0
  step_tmux_font >/dev/null 2>&1 || st=$?
  [ "$st" -eq 1 ]
  [ "$DOWNLOADED" -eq 1 ]
}

@test "字体选项未知时报错并列出可用值" {
  ANS[tmux.font]=comicsans
  run step_tmux_font
  [ "$status" -eq 1 ]
  [[ "$output" == *jetbrains* ]]
}
