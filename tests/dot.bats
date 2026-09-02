#!/usr/bin/env bats

setup() {
  # shellcheck source=../dot.sh
  source "$BATS_TEST_DIRNAME/../dot.sh"
  TMP_DIR=""
}

teardown() { cleanup; }

@test "注册表列出两个完全独立的脚本" {
  run list_scripts
  [ "$status" -eq 0 ]
  [[ "$output" == *"TMUX.sh"* ]]
  [[ "$output" == *"ZSH.sh"* ]]
}

@test "只选择 zsh 时不会自动加入 tmux" {
  parse_selection zsh
  [ "${#SELECTED[@]}" -eq 1 ]
  [ "${SELECTED[0]}" = zsh ]
}

@test "未知选择立即报错" {
  run parse_selection docker
  [ "$status" -ne 0 ]
  [[ "$output" == *"未知安装项"* ]]
}

@test "一次运行只使用一个已解析提交" {
  SELECTED=(tmux zsh)
  COMMIT=0123456789012345678901234567890123456789
  DRY_RUN=1
  run run_selected
  [ "$status" -eq 0 ]
  [ "$(grep -c "$COMMIT" <<<"$output")" -eq 2 ]
  [[ "$output" == *"/TMUX.sh"* ]]
  [[ "$output" == *"/ZSH.sh"* ]]
}

@test "下载后先 bash -n，再执行选中的脚本" {
  SELECTED=(zsh)
  COMMIT=0123456789012345678901234567890123456789
  download_to() { printf '#!/usr/bin/env bash\nexit 0\n' >"$2"; }
  run run_selected
  [ "$status" -eq 0 ]
  [[ "$output" == *"ZSH.sh 成功"* ]]
}

@test "语法错误的下载内容不会执行" {
  SELECTED=(zsh)
  COMMIT=0123456789012345678901234567890123456789
  download_to() { printf 'if broken\n' >"$2"; }
  run run_selected
  [ "$status" -ne 0 ]
  [[ "$output" == *"语法检查失败"* ]]
}

@test "一个脚本失败后仍继续下一个并汇总失败" {
  SELECTED=(tmux zsh)
  COMMIT=0123456789012345678901234567890123456789
  download_to() {
    if [[ "$2" == *TMUX.sh ]]; then printf '#!/usr/bin/env bash\nexit 7\n' >"$2"; else printf '#!/usr/bin/env bash\nexit 0\n' >"$2"; fi
  }
  run run_selected
  [ "$status" -ne 0 ]
  [[ "$output" == *"TMUX.sh 失败"* ]]
  [[ "$output" == *"ZSH.sh 成功"* ]]
  [[ "$output" == *"安装结果"* ]]
  [[ "$output" == *"tmux"*"失败（退出码 7）"* ]]
  [[ "$output" == *"zsh"*"成功"* ]]
}

@test "重复选择同一安装器只执行一次" {
  parse_selection zsh,zsh
  [ "${#SELECTED[@]}" -eq 1 ]
}

@test "dot TUI 用空格取消选中且不会补依赖" {
  exec 7< <(printf 'j \n')
  DOT_INPUT_FD=7
  choose_tui
  [ "${#SELECTED[@]}" -eq 1 ]
  [ "${SELECTED[0]}" = tmux ]
}
