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

# 这些测试必须自己设 HOME：字体目录是 $HOME/.local/share/fonts/<包名>，
# 而开发机上那个目录多半真的有字体 —— 不设的话「没装」这一类断言在本机
# 恒假、在 CI 恒真，等于没测。
@test "两个族都在时直接跳过，不发起下载" {
  HOME="$BATS_TEST_TMPDIR/home-both"
  ANS[tmux.font]=jetbrains
  DOWNLOADED=0
  fc-list() { printf 'JetBrainsMono Nerd Font\nJetBrainsMono Nerd Font Mono\n'; }
  download_with_fallback() { DOWNLOADED=1; }
  local out="$BATS_TEST_TMPDIR/font-out"
  local st=0
  step_tmux_font > "$out" 2>&1 || st=$?
  [ "$st" -eq 0 ]
  # 这条断言防的是具体那个 bug：fc-list | grep -q 在 pipefail 下退 141，
  # 「已装好」被读成「没装」，于是每次都重下一遍。
  [ "$DOWNLOADED" -eq 0 ]
  # 「跳过下载」这几个字是 CI 幂等断言 grep 的字符串。改文案就得同时改
  # ci.yml，否则那条断言变成永远失败（或者更糟：永远通过）。
  grep -q '跳过下载' "$out"
  ! grep -q '正在下载' "$out"
}

@test "只装了 Mono 一族（旧版本留下的半装状态）时会补下载" {
  # 上一版脚本只解 *NerdFontMono-*。判据写成「族名子串命中」的话，
  # 「JetBrainsMono Nerd Font Mono」这一行就满足了「JetBrainsMono Nerd Font」，
  # 于是所有已经跑过旧版本的人永远拿不到修好的那一族 —— 修了也送不到。
  HOME="$BATS_TEST_TMPDIR/home-mono"
  ANS[tmux.font]=jetbrains
  DOWNLOADED=0
  fc-list() { printf 'JetBrainsMono Nerd Font Mono\nDejaVu Sans\n'; }
  _ensure_font_deps() { return 0; }
  download_with_fallback() {
    DOWNLOADED=1
    return 1
  }
  local st=0
  step_tmux_font >/dev/null 2>&1 || st=$?
  [ "$DOWNLOADED" -eq 1 ]
}

@test "目录里两种文件名都在时也算已装（不依赖 fontconfig 的族名）" {
  # Meslo 的文件名是 MesloLGS*，族名映射各家不同；文件名是我们自己
  # 用白名单解出来的，最可靠。
  HOME="$BATS_TEST_TMPDIR/home-dir"
  local dir="$HOME/.local/share/fonts/JetBrainsMono"
  mkdir -p "$dir"
  : > "$dir/JetBrainsMonoNerdFontMono-Regular.ttf"
  : > "$dir/JetBrainsMonoNerdFont-Regular.ttf"
  ANS[tmux.font]=jetbrains
  DOWNLOADED=0
  fc-list() { printf 'DejaVu Sans\n'; } # fontconfig 一无所知
  download_with_fallback() { DOWNLOADED=1; }
  local st=0
  step_tmux_font >/dev/null 2>&1 || st=$?
  [ "$st" -eq 0 ]
  [ "$DOWNLOADED" -eq 0 ]
}

@test "字体没装时才下载，下载失败则步骤失败" {
  HOME="$BATS_TEST_TMPDIR/home-none"
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

# ── 字体解压白名单 ───────────────────────────────────────────────
#
# 真正做匹配的是 unzip，CI 里会拿真包跑一遍端到端。这里用真包的文件名清单
# 复算一次白名单，把「哪些文件会被留下」钉在测试里 —— 那个 bug
# （只留 Mono、族名少一个、用户在设置里搜不到）就是白名单写窄了一格。

# unzip 的 include/exclude 语义：先排除，再看有没有 include 命中
font_kept() {
  local name="$1" p
  for p in "${FONT_EXCLUDE[@]}"; do
    [[ "$name" == $p ]] && return 1
  done
  for p in "${FONT_KEEP[@]}"; do
    [[ "$name" == $p ]] && return 0
  done
  return 1
}

# JetBrainsMono.zip 里真实存在的文件名（截取有代表性的一部分）
PKG_FILES=(
  JetBrainsMonoNerdFont-Regular.ttf
  JetBrainsMonoNerdFont-Bold.ttf
  JetBrainsMonoNerdFont-Italic.ttf
  JetBrainsMonoNerdFont-BoldItalic.ttf
  JetBrainsMonoNerdFontMono-Regular.ttf
  JetBrainsMonoNerdFontMono-Bold.ttf
  JetBrainsMonoNerdFontMono-Italic.ttf
  JetBrainsMonoNerdFontMono-BoldItalic.ttf
  JetBrainsMonoNerdFontPropo-Regular.ttf
  JetBrainsMonoNerdFont-Thin.ttf
  JetBrainsMonoNerdFont-ExtraBold.ttf
  JetBrainsMonoNerdFontMono-Medium.ttf
  JetBrainsMonoNerdFontMono-SemiBoldItalic.ttf
  JetBrainsMonoNLNerdFont-Regular.ttf
  JetBrainsMonoNLNerdFontMono-Regular.ttf
  JetBrainsMonoNLNerdFontPropo-Bold.ttf
  OFL.txt
  README.md
)

@test "白名单只留两个族各四个常规字重" {
  local kept=() f
  for f in "${PKG_FILES[@]}"; do
    font_kept "$f" && kept+=("$f")
  done
  # 8 个 ttf + OFL.txt
  [ "${#kept[@]}" -eq 9 ]
  for f in JetBrainsMonoNerdFont-Regular.ttf JetBrainsMonoNerdFontMono-Regular.ttf \
    JetBrainsMonoNerdFontMono-BoldItalic.ttf OFL.txt; do
    printf '%s\n' "${kept[@]}" | grep -qx "$f" || { echo "白名单漏了 $f"; return 1; }
  done
}

@test "白名单里必须同时有 Mono 族和非 Mono 族" {
  # 少了 *NerdFont-* 那一组，设置里搜「JetBrainsMono Nerd Font」就是空的
  font_kept JetBrainsMonoNerdFontMono-Regular.ttf
  font_kept JetBrainsMonoNerdFont-Regular.ttf
}

@test "白名单排除 NL（无连字）副本与 Propo（变宽）副本" {
  ! font_kept JetBrainsMonoNLNerdFont-Regular.ttf
  ! font_kept JetBrainsMonoNLNerdFontMono-Regular.ttf
  ! font_kept JetBrainsMonoNerdFontPropo-Regular.ttf
}

@test "白名单排除常规四档以外的字重" {
  ! font_kept JetBrainsMonoNerdFont-Thin.ttf
  ! font_kept JetBrainsMonoNerdFontMono-Medium.ttf
  ! font_kept JetBrainsMonoNerdFontMono-SemiBoldItalic.ttf
}

@test "白名单对 Meslo 的文件名同样成立（通配符不带族名前缀）" {
  # Meslo 包里的文件叫 MesloLGS*，不是 Meslo* —— 前缀写死就一个都匹配不上
  font_kept MesloLGSNerdFontMono-Regular.ttf
  font_kept MesloLGSNerdFont-Bold.ttf
}

# ── 包管理器 ─────────────────────────────────────────────────────
#
# apt 之外的发行版以前是硬失败，而失败点显示为「安装 tmux」——
# 看起来像 tmux 装不上，其实是脚本不认识 dnf。

@test "detect_pm 按 apt-get / dnf / pacman / zypper 的顺序识别" {
  local bin="$BATS_TEST_TMPDIR/pm"
  mkdir -p "$bin"
  printf '#!/bin/sh\n' > "$bin/dnf"
  chmod +x "$bin/dnf"
  PATH="$bin" run detect_pm
  [ "$status" -eq 0 ]
  [ "$output" = dnf ]
}

@test "detect_pm 四个都没有时失败（而不是回落到 apt-get 然后炸在半路）" {
  local bin="$BATS_TEST_TMPDIR/empty"
  mkdir -p "$bin"
  PATH="$bin" run detect_pm
  [ "$status" -ne 0 ]
  [ -z "$output" ]
}

@test "每个包管理器都有可用的装包命令，且 pacman 带 --needed（幂等）" {
  dot_sudo() { printf '%s\n' "$*"; }
  run pm_install pacman tmux
  [ "$status" -eq 0 ]
  [[ "$output" == *"--needed"* ]]
  [[ "$output" == *"--noconfirm"* ]]
  local pm
  for pm in apt-get dnf zypper; do
    run pm_install "$pm" tmux
    [ "$status" -eq 0 ] || { echo "$pm 没有装包命令"; return 1; }
    [[ "$output" == *tmux* ]] || { echo "$pm 没把包名传下去"; return 1; }
  done
}

@test "未知包管理器时 pm_install / pm_build_deps 都失败" {
  dot_sudo() { printf '%s\n' "$*"; }
  run pm_install brew tmux
  [ "$status" -ne 0 ]
  run pm_build_deps brew
  [ "$status" -ne 0 ]
}

@test "四个包管理器都有卸载命令，未知的失败" {
  dot_sudo() { printf '%s\n' "$*"; }
  local pm
  for pm in apt-get dnf pacman zypper; do
    run pm_remove "$pm" tmux
    [ "$status" -eq 0 ] || { echo "$pm 没有卸载命令"; return 1; }
    [[ "$output" == *tmux* ]] || { echo "$pm 没把包名传下去"; return 1; }
  done
  run pm_remove brew tmux
  [ "$status" -ne 0 ]
}

@test "卸载步骤走包管理器抽象（以前那份 if/elif 副本漏了 zypper）" {
  HOME="$BATS_TEST_TMPDIR/home-uninstall"
  mkdir -p "$HOME"
  detect_pm() { printf zypper; }
  local rec="$BATS_TEST_TMPDIR/removed"
  pm_remove() {
    shift
    printf '%s\n' "$*" > "$rec"
  }
  # 这些桩把这一步关在测试目录里：id 决定 socket 目录（别去动真的 /tmp/tmux-<uid>），
  # dot_sudo 兜住 /usr/local/bin/tmux 那一支，tmux 兜住 kill-server。
  id() { printf 99999; }
  dot_sudo() { :; }
  tmux() { :; }
  step_tmux_uninstall >/dev/null 2>&1
  [ "$(cat "$rec")" = tmux ]
}

@test "四个包管理器的编译依赖都包含编译器、libevent、ncurses、bison" {
  local pm deps
  for pm in apt-get dnf pacman zypper; do
    deps="$(pm_build_deps "$pm")"
    [[ "$deps" == *bison* ]] || { echo "$pm 缺 bison"; return 1; }
    [[ "$deps" == *event* ]] || { echo "$pm 缺 libevent"; return 1; }
    [[ "$deps" == *curses* ]] || { echo "$pm 缺 ncurses"; return 1; }
    # 编译器：apt 走 build-essential，pacman 走 base-devel，其余是 gcc
    [[ "$deps" == *gcc* || "$deps" == *build-essential* || "$deps" == *base-devel* ]] \
      || { echo "$pm 缺编译器"; return 1; }
  done
}

# ── 核心包 / 可选包 ──────────────────────────────────────────────
#
# 整组 install 的语义是「一个包名在这个源里不存在，整组都不装」。
# 把 xclip / wl-clipboard / acpi 混进核心组，等于让一个剪贴板辅助程序
# 有权让 tmux 装不上 —— 而 install 阶段失败会中止后面全部步骤。

@test "核心包一次装完，可选包分开装" {
  local rec="$BATS_TEST_TMPDIR/pm-calls"
  detect_pm() { printf apt-get; }
  pm_refresh() { return 0; }
  pm_install() {
    shift
    printf '%s\n' "$*" >> "$rec"
  }
  tmux_version() { printf 3.4; }
  step_tmux_apt >/dev/null 2>&1
  local core
  core="$(head -1 "$rec")"
  [[ "$core" == *tmux* ]]
  [[ "$core" == *fontconfig* ]]
  # 拆开的证据：可选包不在核心那一行里，而是各自一行
  [[ "$core" != *xclip* ]]
  grep -qx xclip "$rec"
  grep -qx wl-clipboard "$rec"
  grep -qx acpi "$rec"
}

@test "可选包装不上时步骤仍然成功，并说清少了哪些" {
  detect_pm() { printf apt-get; }
  pm_refresh() { return 0; }
  pm_install() {
    shift
    case "$*" in
      xclip | wl-clipboard | acpi) return 1 ;;
    esac
    return 0
  }
  tmux_version() { printf 3.4; }
  run step_tmux_apt
  [ "$status" -eq 0 ]
  [[ "$output" == *"可选包未装上"* ]]
  [[ "$output" == *xclip* ]]
  [[ "$output" == *wl-clipboard* ]]
  [[ "$output" == *acpi* ]]
}

@test "核心包装不上时步骤失败（tmux 没装上不能算成功）" {
  detect_pm() { printf apt-get; }
  pm_refresh() { return 0; }
  pm_install() { return 1; }
  local st=0
  step_tmux_apt >/dev/null 2>&1 || st=$?
  [ "$st" -eq 1 ]
}

# ── socket 清理不能杀掉正在跑的会话 ──────────────────────────────
#
# kill-server 会连带杀掉会话里的所有进程（编译、下载、ssh）。
# $TMUX 只挡「自己在 tmux 里跑」，挡不住 detached 的会话 ——
# 于是从普通终端跑一次安装，能把后台跑着的活儿全带走。

@test "有会话在跑时不清理，也不杀 server" {
  # TMUX 必须显式清空：开发者常常就在 tmux 里跑测试，那时会走
  # 「在 tmux 内」那一支，这个测试就在本机恒过、在 CI 才真的测到东西。
  TMUX=""
  KILLED=0
  id() { printf 99999; }
  tmux() {
    case "$1" in
      list-sessions) printf 'work\nbuild\n' ;;
      kill-server) KILLED=1 ;;
    esac
  }
  local out="$BATS_TEST_TMPDIR/cleanup-out"
  local st=0
  step_tmux_cleanup > "$out" 2>&1 || st=$?
  [ "$st" -eq 0 ]
  [ "$KILLED" -eq 0 ]
  grep -q "正在运行的 tmux 会话" "$out"
  grep -q work "$out"
}

@test "server 在跑但没有会话时才杀（装到一半留下的空 server）" {
  TMUX=""
  KILLED=0
  id() { printf 99999; }
  pgrep() { return 0; }
  tmux() {
    case "$1" in
      list-sessions) return 1 ;;
      kill-server) KILLED=1 ;;
    esac
  }
  step_tmux_cleanup >/dev/null 2>&1
  [ "$KILLED" -eq 1 ]
}

@test "自己就在 tmux 里跑时一步都不动" {
  TMUX=/tmp/tmux-99999/default,1,0
  KILLED=0
  tmux() {
    case "$1" in
      kill-server) KILLED=1 ;;
    esac
  }
  step_tmux_cleanup >/dev/null 2>&1
  [ "$KILLED" -eq 0 ]
}

# ── tmux 版本下限 ────────────────────────────────────────────────
#
# 发行版给的 tmux 低于 3.2 时，catppuccin 的状态栏是空的而不是报错 ——
# 那种「装完了但看起来没生效」最难自查，所以必须在安装那一步就说出来。

@test "version_ge 的真值表（含相等）" {
  version_ge 3.4 3.2
  version_ge 3.2 3.2
  version_ge 3.10 3.9   # 字符串比较会判错，必须是版本比较
  ! version_ge 3.0 3.2
  ! version_ge 2.9 3.2
}

@test "version_ge 不会被 pipefail 判成失败" {
  # 写成 `sort -V | head -1` 时 sort 吃 SIGPIPE，整条管道退 141，
  # 于是任何版本都「不满足」—— 和字体那个 141 是同一种病
  set -o pipefail
  version_ge 3.4 3.2
}

@test "版本低于下限时告警并给出改用源码编译的命令" {
  run warn_if_tmux_too_old 3.0
  [[ "$output" == *"低于插件要求"* ]]
  [[ "$output" == *"tmux.install=source"* ]]
}

@test "版本达标或测不出版本时不告警" {
  run warn_if_tmux_too_old 3.4
  [ -z "$output" ]
  run warn_if_tmux_too_old ""
  [ -z "$output" ]
}

@test "tmux_version 去掉字母后缀（3.5a → 3.5）" {
  tmux() { printf 'tmux 3.5a\n'; }
  run tmux_version
  [ "$output" = 3.5 ]
}

# ── Ptyxis 字体提示 ──────────────────────────────────────────────
#
# 字体装好了、终端里还是方框，是这套流程最后一个真实的坑：
# Ptyxis 的字体是应用级的 font-name，而且 use-system-font 开着时完全不生效。

@test "有 Ptyxis 且键在应用级时，打印 font-name 那一套" {
  gsettings() {
    case "$*" in
      "list-keys org.gnome.Ptyxis") printf 'font-name\nuse-system-font\n' ;;
    esac
  }
  run ptyxis_font_hint "JetBrainsMono Nerd Font"
  [[ "$output" == *"gsettings set org.gnome.Ptyxis use-system-font false"* ]]
  [[ "$output" == *"font-name 'JetBrainsMono Nerd Font Mono 12'"* ]]
}

@test "旧版 Ptyxis（键在 profile 下）时打印 profile 那一套" {
  gsettings() {
    case "$*" in
      "list-keys org.gnome.Ptyxis") printf 'default-profile-uuid\nprofile-uuids\n' ;;
    esac
  }
  run ptyxis_font_hint "JetBrainsMono Nerd Font"
  [[ "$output" == *"default-profile-uuid"* ]]
  [[ "$output" == *"Ptyxis.Profile"* ]]
}

@test "没装 Ptyxis 时什么都不打印（不给用户无效命令）" {
  gsettings() { return 2; }
  run ptyxis_font_hint "JetBrainsMono Nerd Font"
  [ -z "$output" ]
}
