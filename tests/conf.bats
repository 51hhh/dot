#!/usr/bin/env bats
#
# 生成的 ~/.tmux.conf 内容。所有步骤都在临时 HOME 里跑，
# 不联网、不装包（apt / TPM 步骤不在这些测试的 --only 列表里）。

CONF_STEPS=(
  --only tmux.header --only tmux.prefix
  --only tmux.opt.mouse --only tmux.opt.vi --only tmux.opt.index
  --only tmux.opt.split --only tmux.opt.reload
  --only tmux.plugin.sensible --only tmux.plugin.yank --only tmux.plugin.cpu
  --only tmux.plugin.battery --only tmux.plugin.catppuccin
  --only tmux.plugin.vim_navigator --only tmux.plugin.tmuxifier
  --only tmux.status.catppuccin
)

setup() {
  H="$BATS_TEST_TMPDIR/home"
  mkdir -p "$H"
  CONF="$H/.tmux.conf"
}

gen() {
  env HOME="$H" bash "$BATS_TEST_DIRNAME/../TMUX.sh" "$@" >/dev/null 2>&1
}

# ── 结构 ─────────────────────────────────────────────────────────

@test "header 写出生成标记与终端设置" {
  gen --preset recommended --only tmux.header
  grep -q '由 TMUX.sh 生成' "$CONF"
  grep -q 'default-terminal "tmux-256color"' "$CONF"
  grep -q 'terminal-overrides' "$CONF"
}

@test "header 截断已存在的文件，不会累积" {
  printf 'set -g stale yes\n' > "$CONF"
  gen --preset recommended --only tmux.header
  ! grep -q 'stale' "$CONF"
}

@test "header 会备份已存在的配置" {
  printf 'set -g old yes\n' > "$CONF"
  gen --preset recommended --only tmux.header
  local baks=( "$CONF".bak.* )
  [ -f "${baks[0]}" ]
  grep -q 'old yes' "${baks[0]}"
}

@test "内容没变时不再新建备份（反复跑不攒一堆一样的 .bak）" {
  # 生成是幂等的，所以「改个插件再跑一遍」很正常；每次都留一个内容
  # 完全相同的 .bak.<时间戳> 就只是攒垃圾。
  gen --preset recommended "${CONF_STEPS[@]}"
  gen --preset recommended "${CONF_STEPS[@]}"
  local baks=( "$CONF".bak.* )
  [ "${#baks[@]}" -eq 1 ]
  gen --preset recommended "${CONF_STEPS[@]}"
  baks=( "$CONF".bak.* )
  [ "${#baks[@]}" -eq 1 ]
}

@test "内容变了就照旧备份（判据不是「有生成标记」，那样会吃掉手改）" {
  gen --preset recommended "${CONF_STEPS[@]}"
  gen --preset recommended "${CONF_STEPS[@]}"   # 备份 #1
  printf 'set -g my-own-edit yes\n' >> "$CONF"  # 用户在生成之后手改
  gen --preset recommended "${CONF_STEPS[@]}"   # 备份 #2：手改必须留下来
  local baks=( "$CONF".bak.* )
  [ "${#baks[@]}" -eq 2 ]
  grep -qh 'my-own-edit' "${baks[@]}"
}

@test "重复运行两次结果一致（幂等）" {
  gen --preset recommended "${CONF_STEPS[@]}"
  cp "$CONF" "$BATS_TEST_TMPDIR/first"
  gen --preset recommended "${CONF_STEPS[@]}"
  diff "$BATS_TEST_TMPDIR/first" "$CONF"
}

# ── 前缀键 ───────────────────────────────────────────────────────

@test "前缀键写出 unbind + set + send-prefix 三行" {
  gen --set tmux.prefix=C-Space --only tmux.header --only tmux.prefix
  grep -q '^unbind C-b$' "$CONF"
  grep -q '^set -g prefix C-Space$' "$CONF"
  grep -q '^bind C-Space send-prefix$' "$CONF"
}

@test "自定义前缀键生效" {
  gen --set tmux.prefix=custom --set tmux.prefix_custom=C-x \
      --only tmux.header --only tmux.prefix
  grep -q '^set -g prefix C-x$' "$CONF"
}

@test "前缀键 custom 未填写时不会写出空 prefix" {
  gen --set tmux.prefix=custom --only tmux.header --only tmux.prefix
  ! grep -qE '^set -g prefix *$' "$CONF"
  grep -q '^set -g prefix C-b$' "$CONF"
}

@test "自定义前缀键不合法时回落 C-b，而不是写出 tmux 会忽略的行" {
  # 实测 tmux 3.6：`set -g prefix foo bar` 不报错，prefix 仍是 C-b。
  # 也就是说照原样写进去 = 配置里说一套、实际生效另一套，用户毫无线索。
  gen --set tmux.prefix=custom --set tmux.prefix_custom="foo bar" \
    --only tmux.header --only tmux.prefix
  grep -q '^set -g prefix C-b$' "$CONF"
  ! grep -q 'foo bar' "$CONF"
}

@test "不合法的自定义前缀在 --dry-run 阶段就告警" {
  run env HOME="$H" bash "$BATS_TEST_DIRNAME/../TMUX.sh" \
    --set tmux.prefix=custom --set tmux.prefix_custom="foo bar" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"不是合法的 tmux 键名"* ]]
}

# ── 写不进去必须报失败 ───────────────────────────────────────────

@test "配置写不进去时步骤失败，不会报成功" {
  # 写不进去曾经能跑出一屏「✓ 已配置」加退出码 0，而文件一个字节都没有：
  # 重定向失败时 cat 根本不执行，返回 1 却没人看。
  #
  # 用「把 .tmux.conf 占成目录」制造失败，而不是 chmod 555 的 HOME：
  # 权限位对 root 无效，而 CI / docker 里的测试正是以 root 跑的 ——
  # 那种写法在本机红、在 CI 绿，等于没测。EISDIR 谁都绕不过。
  mkdir -p "$CONF"
  run env HOME="$H" bash "$BATS_TEST_DIRNAME/../TMUX.sh" \
    --set tmux.profile=custom --set tmux.options=mouse \
    --only tmux.header --only tmux.opt.mouse --yes
  [ "$status" -ne 0 ]
  [[ "$output" == *"写入"*"失败"* ]]
  [[ "$output" != *"已初始化"* ]]
}

@test "追加写不进去时步骤失败，不会报成功" {
  # header 之后每一步都是追加。单独测一次追加路径：
  # conf_append 的返回值必须被每个调用点 `|| return 1` 接住。
  gen --set tmux.profile=custom --only tmux.header
  rm -f "$CONF"
  mkdir -p "$CONF"
  run env HOME="$H" bash "$BATS_TEST_DIRNAME/../TMUX.sh" \
    --set tmux.profile=custom --set tmux.options=mouse \
    --only tmux.opt.mouse --yes
  [ "$status" -ne 0 ]
  [[ "$output" == *"写入"*"失败"* ]]
}

# ── 推荐配置内容 ─────────────────────────────────────────────────

@test "推荐配置包含全部 8 个插件声明" {
  gen --preset recommended "${CONF_STEPS[@]}"
  for p in tmux-plugins/tmux-sensible tmux-plugins/tmux-yank \
           tmux-plugins/tmux-cpu tmux-plugins/tmux-battery \
           catppuccin/tmux christoomey/vim-tmux-navigator jimeh/tmuxifier; do
    grep -qF "@plugin '$p'" "$CONF" || { echo "缺少 $p"; return 1; }
  done
}

@test "推荐配置包含 5 项基础设置" {
  gen --preset recommended "${CONF_STEPS[@]}"
  grep -q 'set -g mouse on' "$CONF"
  grep -q 'mode-keys vi' "$CONF"
  grep -q 'set -g base-index 1' "$CONF"
  grep -q 'split-window -h' "$CONF"
  grep -q 'bind r source-file' "$CONF"
}

@test "catppuccin 主题选项写在其状态栏引用之前" {
  gen --preset recommended "${CONF_STEPS[@]}"
  local flavor status
  flavor=$(grep -n '@catppuccin_flavor' "$CONF" | cut -d: -f1)
  status=$(grep -n 'catppuccin_status_application' "$CONF" | cut -d: -f1)
  [ "$flavor" -lt "$status" ]
}

@test "只选部分插件时不会写入未选的" {
  gen --set tmux.plugins="yank" --only tmux.header --only tmux.plugin.yank
  grep -qF 'tmux-plugins/tmux-yank' "$CONF"
  ! grep -qF 'catppuccin' "$CONF"
}

@test "不选任何选项时只有 header 内容" {
  gen --set tmux.profile=custom --only tmux.header
  ! grep -q '@plugin' "$CONF"
  ! grep -q 'mouse on' "$CONF"
}

# ── 与遗留 Tmux.sh 的推荐配置对齐 ─────────────────────────────────

@test "推荐配置的插件集合与遗留脚本一致（7 条非 TPM 声明）" {
  # tpm 步骤要联网，不在 CONF_STEPS 里；它自己会另写一行 @plugin 'tmux-plugins/tpm'
  gen --preset recommended "${CONF_STEPS[@]}"
  [ "$(grep -c "@plugin '" "$CONF")" -eq 7 ]
}

@test "状态栏 6 段与遗留脚本一致" {
  gen --preset recommended "${CONF_STEPS[@]}"
  [ "$(grep -c 'status-right' "$CONF")" -eq 7 ]  # 1 个 length + 6 段
}

# ── 卸载不写配置 ─────────────────────────────────────────────────

@test "卸载路径不会创建 ~/.tmux.conf" {
  gen --set tmux.profile=uninstall --dry-run
  [ ! -e "$CONF" ]
}
