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

have() { command -v "$1" >/dev/null 2>&1; }
docker_ok() { have docker && docker info >/dev/null 2>&1; }

run_shellcheck() {
  say "shellcheck（-S style，最严档）"
  if have shellcheck; then
    shellcheck -s bash -S style TMUX.sh && pass shellcheck || fail shellcheck
  elif docker_ok; then
    docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable \
      -s bash -S style /mnt/TMUX.sh && pass "shellcheck (docker)" || fail shellcheck
  else
    fail "shellcheck 不可用（装 shellcheck 或启动 docker）"
  fi
}

run_shfmt() {
  say "shfmt --diff"
  local args=(-i 2 -ci -bn -d TMUX.sh run-tests.sh)
  if have shfmt; then
    shfmt "${args[@]}" && pass shfmt || fail "shfmt（跑 ./run-tests.sh fmt 修复）"
  elif docker_ok; then
    docker run --rm -v "$PWD:/mnt" -w /mnt mvdan/shfmt:latest \
      "${args[@]}" && pass "shfmt (docker)" || fail "shfmt（跑 ./run-tests.sh fmt 修复）"
  else
    printf '  shfmt 不可用，跳过\n'
  fi
}

run_syntax() {
  say "bash -n 与内置 --lint"
  bash -n TMUX.sh && pass "bash -n" || fail "bash -n"
  bash TMUX.sh --lint && pass "--lint" || fail "--lint"
}

run_bats() {
  say "bats"
  if have bats; then
    bats tests/ && pass bats || fail bats
  elif docker_ok; then
    docker run --rm -v "$PWD:/code" bats/bats:latest /code/tests \
      && pass "bats (docker)" || fail bats
  else
    fail "bats 不可用（装 bats-core 或启动 docker）"
  fi
}

do_fmt() {
  local args=(-i 2 -ci -bn -w TMUX.sh run-tests.sh)
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
