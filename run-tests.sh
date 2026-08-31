#!/usr/bin/env bash
#
# 测试入口。本机有 shellcheck / shfmt / bats 就直接用，没有就退回 docker。
#
#   ./run-tests.sh          静态检查 + 全部 bats
#   ./run-tests.sh lint     只跑静态检查
#   ./run-tests.sh bats     只跑 bats
#   ./run-tests.sh fmt      用 shfmt 就地格式化

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'
say() { printf '\n%b── %s%b\n' "$CYAN" "$*" "$NC"; }
pass() { printf '%b✓ %s%b\n' "$GREEN" "$*" "$NC"; }
fail() {
  printf '%b✗ %s%b\n' "$RED" "$*" "$NC"
  FAILED=1
}
FAILED=0

# 一律写成 if/then/else，不写 cmd && pass || fail：
# 后者在 pass 自身失败时会连 fail 一起跑（shellcheck SC2015）。
check() {
  local label="$1"
  shift
  if "$@"; then pass "$label"; else fail "$label"; fi
}

have() { command -v "$1" >/dev/null 2>&1; }
docker_ok() { have docker && docker info >/dev/null 2>&1; }

# 自己也一起查：shfmt 两个文件都管，shellcheck 只管一个的话，
# 这个脚本就成了仓库里唯一没人看的 bash 文件。
SH_FILES=(TMUX.sh run-tests.sh)

run_shellcheck() {
  say "shellcheck（-S style，最严档）"
  if have shellcheck; then
    check shellcheck shellcheck -s bash -S style "${SH_FILES[@]}"
  elif docker_ok; then
    check "shellcheck (docker)" \
      docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable \
      -s bash -S style "${SH_FILES[@]/#//mnt/}"
  else
    fail "shellcheck 不可用（装 shellcheck 或启动 docker）"
  fi
}

run_shfmt() {
  say "shfmt --diff"
  local args=(-i 2 -ci -bn -d "${SH_FILES[@]}") rc=0
  # 这里不用 check：修复提示只该在失败时出现，成功时挂着它很怪
  if have shfmt; then
    shfmt "${args[@]}" || rc=$?
  elif docker_ok; then
    docker run --rm -v "$PWD:/mnt" -w /mnt mvdan/shfmt:latest "${args[@]}" || rc=$?
  else
    printf '  shfmt 不可用，跳过\n'
    return 0
  fi
  if ((rc == 0)); then
    pass shfmt
  else
    fail "shfmt（跑 ./run-tests.sh fmt 修复）"
  fi
}

run_syntax() {
  say "bash -n 与内置 --lint"
  check "bash -n" bash -n TMUX.sh
  check "--lint" bash TMUX.sh --lint
}

run_bats() {
  say "bats"
  if have bats; then
    check bats bats tests/
  elif docker_ok; then
    check "bats (docker)" \
      docker run --rm -v "$PWD:/code" bats/bats:latest /code/tests
  else
    fail "bats 不可用（装 bats-core 或启动 docker）"
  fi
}

do_fmt() {
  local args=(-i 2 -ci -bn -w "${SH_FILES[@]}")
  if have shfmt; then
    shfmt "${args[@]}"
  elif docker_ok; then
    docker run --rm -v "$PWD:/mnt" -w /mnt mvdan/shfmt:latest "${args[@]}"
  else
    echo "shfmt 不可用" >&2
    exit 1
  fi
  pass "已格式化"
}

case "${1:-all}" in
  lint)
    run_syntax
    run_shellcheck
    run_shfmt
    ;;
  bats) run_bats ;;
  fmt)
    do_fmt
    exit 0
    ;;
  all)
    run_syntax
    run_shellcheck
    run_shfmt
    run_bats
    ;;
  *)
    echo "用法: $0 [all|lint|bats|fmt]" >&2
    exit 1
    ;;
esac

echo
if ((FAILED)); then
  printf '%b测试未全部通过%b\n' "$RED" "$NC"
  exit 1
fi
printf '%b全部通过%b\n' "$GREEN" "$NC"
