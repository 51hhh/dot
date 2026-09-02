#!/usr/bin/env bats

setup() {
  H="$BATS_TEST_TMPDIR/home"
  mkdir -p "$H"
  HOME="$H"
  # shellcheck source=../ZSH.sh
  source "$BATS_TEST_DIRNAME/../ZSH.sh"
}

@test "推荐配置生成完整且稳定的计划" {
  ANS=([zsh.profile]=recommended)
  apply_recommended
  build_plan
  [ "${#PLAN[@]}" -eq 9 ]
  [[ " ${PLAN[*]} " == *"zsh.theme|configure"* ]]
  [[ " ${PLAN[*]} " == *"zsh.font|final"* ]]
}

@test "安装项彼此独立，没有 tmux 步骤" {
  ANS=([zsh.profile]=recommended)
  apply_recommended
  build_plan
  [[ "${PLAN[*]}" != *tmux* ]]
}

@test "已有 Git 仓库时克隆步骤幂等跳过" {
  mkdir -p "$H/repo/.git"
  : >"$H/repo/entry.zsh"
  git() { return 99; }
  run clone_repo x/y.git "$H/repo" entry.zsh
  [ "$status" -eq 0 ]
  [[ "$output" == *"已正确安装，跳过"* ]]
}

@test "已有 Git 目录但缺入口文件时不误报成功" {
  mkdir -p "$H/repo/.git"
  run clone_repo x/y.git "$H/repo" entry.zsh
  [ "$status" -ne 0 ]
  [[ "$output" == *"缺少入口文件"* ]]
}

@test "脚本克隆的组件写入所有权标记" {
  git() { mkdir -p "$5/.git"; : >"$5/entry.zsh"; }
  clone_repo x/y.git "$H/repo" entry.zsh
  [ -f "$H/repo/.dot-installed-by-ZSH.sh" ]
}

@test "zshrc 写入前备份并生成要求的主题插件" {
  mkdir -p "$H/.oh-my-zsh"
  : >"$H/.oh-my-zsh/oh-my-zsh.sh"
  printf 'old-user-config\n' >"$H/.zshrc"
  ANS=([zsh.theme]=powerlevel10k [zsh.plugins]="git zsh-autosuggestions z extract zsh-syntax-highlighting")
  step_zsh_zshrc
  grep -q 'ZSH_THEME="powerlevel10k/powerlevel10k"' "$H/.zshrc"
  grep -q 'plugins=(git zsh-autosuggestions z extract zsh-syntax-highlighting)' "$H/.zshrc"
  grep -q 'source "\$HOME/.p10k.zsh"' "$H/.zshrc"
  grep -qh old-user-config "$H"/.zshrc.bak.*
}

@test "四款字体完整时不再下载" {
  local dir="$H/.local/share/fonts/MesloLGS-NF" name
  mkdir -p "$dir"
  for name in "Regular" "Bold" "Italic" "Bold Italic"; do printf font >"$dir/MesloLGS NF $name.ttf"; done
  download_file() { return 99; }
  run step_zsh_font
  [ "$status" -eq 0 ]
  [[ "$output" == *"已安装，跳过"* ]]
}

@test "缺一款字体就补装全部四款" {
  download_file() { printf font >"$2"; }
  fc-cache() { :; }
  step_zsh_font
  [ "$(find "$H/.local/share/fonts/MesloLGS-NF" -name '*.ttf' | wc -l)" -eq 4 ]
}

@test "install 阶段失败后跳过后续步骤" {
  PLAN=("zsh.package|install|安装" "zsh.notes|final|提示")
  step_zsh_package() { return 1; }
  step_zsh_notes() { printf SHOULD_NOT_RUN; }
  run run_plan
  [ "$status" -ne 0 ]
  [[ "$output" != *SHOULD_NOT_RUN* ]]
  [[ "$output" == *"已跳过"* ]]
}

@test "单选答案拒绝未知值" {
  run set_answer zsh.theme=unknown
  [ "$status" -ne 0 ]
  [[ "$output" == *"值无效"* ]]
}

@test "跳过 Oh My Zsh 时先验证已有安装" {
  ANS=([zsh.profile]=custom [zsh.install]=skip [zsh.ohmyzsh]=skip [zsh.theme]=skip [zsh.plugins]="" [zsh.font]=skip [zsh.default_shell]=no)
  build_plan
  [[ "${PLAN[*]}" == *"zsh.ohmyzsh.verify|install"* ]]
  run run_plan
  [ "$status" -ne 0 ]
  [[ "$output" == *"不存在"* ]]
}

@test "zsh 已存在但缺其他依赖时仍调用包管理器补齐" {
  local bin="$BATS_TEST_TMPDIR/bin" calls="$BATS_TEST_TMPDIR/pm-calls" old_path="$PATH"
  mkdir -p "$bin"
  printf '#!/bin/sh\necho zsh 5.9\n' >"$bin/zsh"; chmod +x "$bin/zsh"
  detect_pm() { printf apt-get; }
  pm_install_zsh() { printf '%s' "$1" >"$calls"; }
  PATH="$bin"
  step_zsh_package
  PATH="$old_path"
  [ "$(<"$calls")" = apt-get ]
}

@test "卸载保留安装前已有的 Oh My Zsh 与 p10k 配置" {
  mkdir -p "$H/.oh-my-zsh/.git"
  : >"$H/.p10k.zsh"
  step_zsh_uninstall
  [ -d "$H/.oh-my-zsh" ]
  [ -f "$H/.p10k.zsh" ]
}

@test "卸载只删除带所有权标记的组件" {
  mkdir -p "$H/.oh-my-zsh/custom/themes/powerlevel10k"
  : >"$H/.oh-my-zsh/custom/themes/powerlevel10k/.dot-installed-by-ZSH.sh"
  step_zsh_uninstall
  [ ! -e "$H/.oh-my-zsh/custom/themes/powerlevel10k" ]
  [ -d "$H/.oh-my-zsh" ]
}

@test "结束提示包含进入、向导、字体、登录与恢复动作" {
  ANS=([zsh.theme]=powerlevel10k [zsh.font]=meslo [zsh.default_shell]=yes)
  gsettings() { return 1; }
  run step_zsh_notes
  [ "$status" -eq 0 ]
  [[ "$output" == *"exec zsh"* ]]
  [[ "$output" == *"p10k configure"* ]]
  [[ "$output" == *"MesloLGS NF"* ]]
  [[ "$output" == *"下次登录"* ]]
  [[ "$output" == *"zshrc.bak"* ]]
}

@test "四种包管理器都安装同一组 Zsh 核心依赖" {
  local pm calls="$BATS_TEST_TMPDIR/pm"
  dot_sudo() { printf '%s\n' "$*" >>"$calls"; }
  for pm in apt-get dnf pacman zypper; do
    : >"$calls"
    pm_install_zsh "$pm"
    grep -q zsh "$calls"
    grep -q git "$calls"
    grep -q curl "$calls"
    grep -q ca-certificates "$calls"
    grep -q fontconfig "$calls"
  done
}

@test "修改默认 shell 使用 command -v 得到的 zsh 路径" {
  local called="$BATS_TEST_TMPDIR/chsh" bin="$BATS_TEST_TMPDIR/zsh-bin"
  mkdir -p "$bin"
  printf '#!/bin/sh\nexit 0\n' >"$bin/zsh"
  chmod +x "$bin/zsh"
  PATH="$bin:$PATH"
  getent() { printf 'rick:x:1:1::/tmp:/bin/bash\n'; }
  id() { [[ "$1" == -un ]] && printf rick; }
  chsh() { printf '%s' "$*" >"$called"; }
  step_zsh_default_shell
  [ "$(<"$called")" = "-s $bin/zsh" ]
}

@test "字体下载返回空文件时失败且不污染正式目录" {
  download_file() { : >"$2"; }
  run step_zsh_font
  [ "$status" -ne 0 ]
  [ ! -e "$H/.local/share/fonts/MesloLGS-NF/MesloLGS NF Regular.ttf" ]
}

@test "Zsh TUI 支持方向键语义并用回车确认" {
  exec 7< <(printf '\n')
  DOT_INPUT_FD=7
  open_tty
  ask_one zsh.profile "配置方式" recommended recommended:"推荐" custom:"自定义"
  [ "${ANS[zsh.profile]}" = recommended ]
}
