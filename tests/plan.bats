#!/usr/bin/env bats
#
# build_plan 是纯函数：answers 进，有序步骤列表出。
# 这是整个架构最重要的一层测试 —— 不需要 TTY、不需要网络、不需要 root、不写文件。
# 旧架构要测同样的东西得跑 Node + 解析 YAML + 遍历递归菜单树。

# 必须在文件顶层 source（见 when.bats 的说明）
source "$BATS_TEST_DIRNAME/../TMUX.sh"

setup() {
  ANS=()
  PRESET_APPLIED=()
}

@test "前置条件：ANS 是关联数组" {
  [[ "$(declare -p ANS)" == "declare -A"* ]]
}

plan_of() {
  resolve_presets
  build_plan
  printf '%s' "${PLAN[*]}"
}

# ── 阶段顺序 ─────────────────────────────────────────────────────

@test "阶段顺序恒定：prepare → install → configure → final" {
  ANS[tmux.profile]=recommended
  local got; got="$(plan_of)"
  # 安装必须早于配置，配置必须早于 TPM 初始化
  [[ "$got" == *"tmux.apt"*"tmux.header"*"tmux.tpm.finalize"* ]]
}

@test "header 是 configure 阶段第一个（它截断文件，其余追加）" {
  ANS[tmux.profile]=recommended
  resolve_presets; build_plan
  local first=""
  for id in "${PLAN[@]}"; do
    if [[ "${S[$id.phase]}" == configure ]]; then first="$id"; break; fi
  done
  [ "$first" = "tmux.header" ]
}

@test "tpm.finalize 之后只剩 cleanup 与 notes（run tpm 必须是 conf 最后一行）" {
  ANS[tmux.profile]=recommended
  resolve_presets; build_plan
  local seen=0 tail=()
  for id in "${PLAN[@]}"; do
    (( seen )) && tail+=("$id")
    [[ "$id" == tmux.tpm.finalize ]] && seen=1
  done
  [ "${tail[*]}" = "tmux.cleanup tmux.notes" ]
}

# ── 预设 ─────────────────────────────────────────────────────────

@test "recommended 预设展开为 21 个步骤" {
  ANS[tmux.profile]=recommended
  resolve_presets; build_plan
  [ "${#PLAN[@]}" -eq 21 ]
}

@test "recommended 覆盖全部 8 个插件" {
  ANS[tmux.profile]=recommended
  local got; got="$(plan_of)"
  for p in tpm sensible yank cpu battery catppuccin vim_navigator tmuxifier; do
    [[ "$got" == *"tmux.plugin.$p"* ]] || { echo "缺少插件 $p"; return 1; }
  done
}

@test "recommended 覆盖全部 5 个基础选项" {
  ANS[tmux.profile]=recommended
  local got; got="$(plan_of)"
  for o in mouse vi index split reload; do
    [[ "$got" == *"tmux.opt.$o"* ]] || { echo "缺少选项 $o"; return 1; }
  done
}

@test "预设不覆盖用户已显式给出的答案" {
  ANS[tmux.profile]=recommended
  ANS[tmux.install]=source
  local got; got="$(plan_of)"
  [[ "$got" == *tmux.source* ]]
  [[ "$got" != *tmux.apt* ]]
}

@test "clear_preset_keys 撤销自动套用的值，但保留用户答案" {
  ANS[tmux.profile]=recommended
  ANS[tmux.install]=source
  resolve_presets
  [ -n "${ANS[tmux.plugins]}" ]
  clear_preset_keys
  [ -z "${ANS[tmux.plugins]:-}" ]
  [ "${ANS[tmux.install]}" = source ]
  [ "${ANS[tmux.profile]}" = recommended ]
}

# ── 卸载路径互斥 ─────────────────────────────────────────────────

@test "uninstall 只产生卸载一步，绝不写配置" {
  ANS[tmux.profile]=uninstall
  resolve_presets; build_plan
  [ "${PLAN[*]}" = "tmux.uninstall" ]
}

@test "uninstall 时不会冒出自定义流程的子问题" {
  # 「选 custom 答到一半、回退改成 uninstall」会留下这些答案。
  # 子问题只锁父答案（tmux.install=source）是不够的，必须同时锁 profile。
  ANS[tmux.profile]=uninstall
  ANS[tmux.install]=source
  ANS[tmux.prefix]=custom
  run visible_questions
  [ "${#lines[@]}" -eq 1 ]
  [ "${lines[0]}" = "tmux.profile" ]
}

@test "uninstall 时即使答案里残留插件也不会写配置" {
  # 交互中「先选 custom 答完插件、回退再改成 uninstall」会留下这些答案，
  # 全靠每个配置步骤的 --when tmux.profile!=uninstall 挡住。
  ANS[tmux.profile]=uninstall
  ANS[tmux.plugins]="tpm yank"
  ANS[tmux.options]="mouse"
  ANS[tmux.install]=apt
  resolve_presets; build_plan
  [ "${PLAN[*]}" = "tmux.uninstall" ]
}

# ── 自定义路径 ───────────────────────────────────────────────────

@test "custom 空选择只留基础配置" {
  ANS[tmux.profile]=custom
  resolve_presets; build_plan
  [ "${PLAN[*]}" = "tmux.header tmux.prefix tmux.cleanup tmux.notes" ]
}

@test "只选一个插件就只装一个" {
  ANS[tmux.profile]=custom
  ANS[tmux.plugins]="yank"
  local got; got="$(plan_of)"
  [[ "$got" == *tmux.plugin.yank* ]]
  [[ "$got" != *tmux.plugin.cpu* ]]
  [[ "$got" != *tmux.plugin.tpm* ]]
}

@test "选 tpm 才会有 tpm.finalize" {
  ANS[tmux.profile]=custom
  ANS[tmux.plugins]="yank"
  [[ "$(plan_of)" != *tmux.tpm.finalize* ]]
  ANS[tmux.plugins]="yank tpm"
  [[ "$(plan_of)" == *tmux.tpm.finalize* ]]
}

@test "catppuccin 同时带来插件声明与状态栏两步" {
  ANS[tmux.profile]=custom
  ANS[tmux.plugins]="catppuccin"
  local got; got="$(plan_of)"
  [[ "$got" == *tmux.plugin.catppuccin*tmux.status.catppuccin* ]]
}

# ── 字体 ─────────────────────────────────────────────────────────

@test "recommended 会装 Nerd Font" {
  ANS[tmux.profile]=recommended
  [[ "$(plan_of)" == *tmux.font* ]]
}

@test "font=skip 不产生字体步骤" {
  ANS[tmux.profile]=custom
  ANS[tmux.font]=skip
  [[ "$(plan_of)" != *tmux.font* ]]
}

@test "没答过字体这题时不会去下字体" {
  # tmux.font!=skip 在 key 未设置时是成立的（见 §5 的 != 语义），
  # 所以步骤必须同时要求 tmux.font 非空，否则谁都会被下一遍字体。
  ANS[tmux.profile]=custom
  [[ "$(plan_of)" != *tmux.font* ]]
}

@test "uninstall 不会去装字体" {
  ANS[tmux.profile]=uninstall
  ANS[tmux.font]=jetbrains
  resolve_presets; build_plan
  [ "${PLAN[*]}" = "tmux.uninstall" ]
}

@test "字体步骤在 final 阶段，失败不该中止配置" {
  [ "${S[tmux.font.phase]}" = final ]
  ! has_word "$CRITICAL_PHASES" final
}

@test "install=skip 不产生任何安装步骤" {
  ANS[tmux.profile]=custom
  ANS[tmux.install]=skip
  local got; got="$(plan_of)"
  [[ "$got" != *tmux.apt* ]]
  [[ "$got" != *tmux.source* ]]
  [[ "$got" == *tmux.header* ]]
}

@test "apt 与 source 互斥" {
  ANS[tmux.profile]=custom
  ANS[tmux.install]=apt
  [[ "$(plan_of)" == *tmux.apt* ]]
  ANS[tmux.install]=source
  local got; got="$(plan_of)"
  [[ "$got" == *tmux.source* ]]
  [[ "$got" != *tmux.apt* ]]
}

# ── 问题可见性 ───────────────────────────────────────────────────

@test "recommended 只问一个问题" {
  ANS[tmux.profile]=recommended
  run visible_questions
  [ "${#lines[@]}" -eq 1 ]
  [ "${lines[0]}" = "tmux.profile" ]
}

@test "custom 问 6 个问题（不含条件子问题）" {
  ANS[tmux.profile]=custom
  run visible_questions
  [ "${#lines[@]}" -eq 6 ]
}

@test "source_version 只在选了源码编译时出现" {
  ANS[tmux.profile]=custom
  run visible_questions
  [[ "$output" != *tmux.source_version* ]]
  ANS[tmux.install]=source
  run visible_questions
  [[ "$output" == *tmux.source_version* ]]
}

@test "prefix_custom 只在前缀键选 custom 时出现（条件链）" {
  ANS[tmux.profile]=custom
  ANS[tmux.prefix]=C-a
  run visible_questions
  [[ "$output" != *tmux.prefix_custom* ]]
  ANS[tmux.prefix]=custom
  run visible_questions
  [[ "$output" == *tmux.prefix_custom* ]]
}

# ── 前缀键解析 ───────────────────────────────────────────────────

@test "前缀键默认回落到 C-b" {
  [ "$(tmux_prefix_value)" = "C-b" ]
}

@test "前缀键直选生效" {
  ANS[tmux.prefix]=C-Space
  [ "$(tmux_prefix_value)" = "C-Space" ]
}

@test "前缀键 custom 取自定义值" {
  ANS[tmux.prefix]=custom
  ANS[tmux.prefix_custom]=C-x
  [ "$(tmux_prefix_value)" = "C-x" ]
}

@test "前缀键 custom 但未填写时回落 C-b（不会写出空 prefix）" {
  ANS[tmux.prefix]=custom
  [ "$(tmux_prefix_value)" = "C-b" ]
}

# ── 计划稳定性 ───────────────────────────────────────────────────

@test "同样的答案永远产生同样的计划" {
  ANS[tmux.profile]=recommended
  local a b
  a="$(plan_of)"
  ANS=(); PRESET_APPLIED=(); ANS[tmux.profile]=recommended
  b="$(plan_of)"
  [ "$a" = "$b" ]
}

@test "build_plan 不产生任何输出（保持纯函数）" {
  ANS[tmux.profile]=recommended
  resolve_presets
  run build_plan
  [ -z "$output" ]
}
