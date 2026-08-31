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
