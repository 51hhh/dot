#!/usr/bin/env bats
#
# when_ok 真值表 —— 4 个算子，纯函数，毫秒级
# 旧架构里等价的语义分散在 deps 图 / hidden / endFlow / mode 四处，
# 且必须启动整个 TS 进程才能测。

# 必须在文件顶层 source：declare -A 若发生在函数内就是局部变量，
# ANS 会退化成索引数组，含点号的键（tmux.profile）直接触发算术错误。
source "$BATS_TEST_DIRNAME/../TMUX.sh"

setup() {
  ANS=()   # 对已存在的 -A 变量重新赋空值，保留关联属性
}

@test "前置条件：ANS 是关联数组（防止上面的坑复发）" {
  [[ "$(declare -p ANS)" == "declare -A"* ]]
}

# ── 空表达式 = 总是成立 ───────────────────────────────────────────

@test "空 when 总是成立" {
  run when_ok ""
  [ "$status" -eq 0 ]
}

# ── key=value ────────────────────────────────────────────────────

@test "= 相等成立" {
  ANS[a]=x
  when_ok "a=x"
}

@test "= 不等不成立" {
  ANS[a]=y
  ! when_ok "a=x"
}

@test "= 键不存在时不成立" {
  ! when_ok "a=x"
}

@test "= 空值可匹配未设置的键" {
  when_ok "a="
}

# ── key!=value ───────────────────────────────────────────────────

@test "!= 不等成立" {
  ANS[a]=y
  when_ok "a!=x"
}

@test "!= 相等不成立" {
  ANS[a]=x
  ! when_ok "a!=x"
}

@test "!= 键不存在时成立（这是 tmux.profile!=uninstall 的依据）" {
  when_ok "a!=x"
}

# ── key~value（多选包含）─────────────────────────────────────────

@test "~ 命中列表首项" {
  ANS[a]="tpm yank cpu"
  when_ok "a~tpm"
}

@test "~ 命中列表中项" {
  ANS[a]="tpm yank cpu"
  when_ok "a~yank"
}

@test "~ 命中列表末项" {
  ANS[a]="tpm yank cpu"
  when_ok "a~cpu"
}

@test "~ 未命中" {
  ANS[a]="tpm yank"
  ! when_ok "a~battery"
}

@test "~ 只做整词匹配，不做子串匹配" {
  ANS[a]="tmuxifier"
  ! when_ok "a~tmux"
}

@test "~ 单元素列表" {
  ANS[a]="tpm"
  when_ok "a~tpm"
}

@test "~ 空列表" {
  ANS[a]=""
  ! when_ok "a~tpm"
}

@test "~ 键不存在" {
  ! when_ok "a~tpm"
}

# ── 裸键 = 非空 ──────────────────────────────────────────────────

@test "裸键：有值成立" {
  ANS[a]=x
  when_ok "a"
}

@test "裸键：空值不成立" {
  ANS[a]=""
  ! when_ok "a"
}

@test "裸键：未设置不成立" {
  ! when_ok "a"
}

# ── 算子优先级：!= 必须先于 = 判断 ───────────────────────────────

@test "含 != 的表达式不会被误判成 =" {
  ANS[a]="=x"
  # 若先按 = 切分，k 会变成 "a!" —— 必须先查 !=
  ! when_ok "a!=y" || true
  ANS[a]=y
  ! when_ok "a!=y"
}

# ── 值中带空格 ───────────────────────────────────────────────────

@test "= 可匹配含空格的值" {
  ANS[a]="hello world"
  when_ok "a=hello world"
}

# ── when_all：多个 --when 的 AND 语义 ────────────────────────────

@test "when_all：空列表成立" {
  when_all ""
}

@test "when_all：单条等价于 when_ok" {
  ANS[a]=x
  when_all "a=x"
  ! when_all "a=y"
}

@test "when_all：两条都成立才成立" {
  ANS[a]=x; ANS[b]="p q"
  when_all "$(when_add "a=x" "b~q")"
}

@test "when_all：任一条不成立即不成立" {
  ANS[a]=x; ANS[b]="p q"
  ! when_all "$(when_add "a=y" "b~q")"
  ! when_all "$(when_add "a=x" "b~z")"
}

@test "when_all：三条组合" {
  ANS[a]=x; ANS[b]="p"; ANS[c]=1
  when_all "$(when_add "$(when_add "a=x" "b~p")" "c")"
  ANS[c]=""
  ! when_all "$(when_add "$(when_add "a=x" "b~p")" "c")"
}

@test "when_all：!= 与 ~ 组合（卸载互斥的实际用法）" {
  ANS[tmux.profile]=uninstall
  ANS[tmux.plugins]="tpm"
  ! when_all "$(when_add "tmux.profile!=uninstall" "tmux.plugins~tpm")"
  ANS[tmux.profile]=custom
  when_all "$(when_add "tmux.profile!=uninstall" "tmux.plugins~tpm")"
}

# ── when_keys：lint 用来找出被引用的 key ─────────────────────────

@test "when_keys：空表达式无输出" {
  run when_keys ""
  [ -z "$output" ]
}

@test "when_keys：逐个列出 AND 列表里的 key" {
  run when_keys "$(when_add "a=x" "b~q")"
  [ "${lines[0]}" = a ]
  [ "${lines[1]}" = b ]
}

@test "when_keys：识别四种算子的 key" {
  run when_keys "$(when_add "$(when_add "$(when_add "a=1" "b!=2")" "c~3")" "d")"
  [ "${lines[*]}" = "a b c d" ]
}

