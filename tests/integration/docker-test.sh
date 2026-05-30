#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Docker 集成测试 - 参数化矩阵
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
GENERATE="$PROJECT_DIR/tests/integration/generate.mjs"
PASS=0
FAIL=0

log_ok()    { echo -e "  ${GREEN}✓${NC} $*"; PASS=$((PASS + 1)); }
log_fail()  { echo -e "  ${RED}✗${NC} $*"; FAIL=$((FAIL + 1)); }
log_header(){ echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

if ! command -v docker &>/dev/null; then
  echo "Docker 未安装，跳过集成测试"
  exit 0
fi

CONTAINER=""

cleanup() { docker rm -f "$CONTAINER" 2>/dev/null || true; }
trap cleanup EXIT

# ── 启动容器、生成脚本、执行 ──
setup_and_run() {
  local name="$1"; shift
  log_header "$name"

  CONTAINER="dot-test-$$-$RANDOM"
  docker rm -f "$CONTAINER" 2>/dev/null || true

  local script
  script=$(mktemp /tmp/dot-XXXXXX.sh)
  cd "$PROJECT_DIR"
  node "$GENERATE" "$script" "$@"

  docker run -d --name "$CONTAINER" ubuntu:24.04 sleep 600 >/dev/null
  docker exec "$CONTAINER" bash -c "apt-get update -qq && apt-get install -y -qq git curl >/dev/null 2>&1"
  docker cp "$script" "$CONTAINER":/tmp/setup.sh
  rm -f "$script"

  if docker exec "$CONTAINER" bash /tmp/setup.sh >/dev/null 2>&1; then
    log_ok "脚本执行成功"
    return 0
  else
    log_fail "脚本执行失败"
    docker rm -f "$CONTAINER" 2>/dev/null; CONTAINER=""
    return 1
  fi
}

# ── 验证 tmux 能正常工作 ──
check_tmux() {
  [ -z "$CONTAINER" ] && return
  if docker exec "$CONTAINER" tmux new-session -d -s t 2>/dev/null; then
    log_ok "tmux 可以启动会话"
    # source 必须在 session 存活时执行
    docker exec "$CONTAINER" tmux source-file /root/.tmux.conf 2>/dev/null \
      && log_ok "tmux.conf source 成功" || log_fail "tmux.conf source 失败"
    docker exec "$CONTAINER" tmux kill-session -t t 2>/dev/null || true
  else
    log_fail "tmux 无法启动会话"
  fi
  local v; v=$(docker exec "$CONTAINER" tmux -V 2>/dev/null) && log_ok "版本: $v"
}

# ── 检查 tmux.conf 内容 ──
check_conf() {
  [ -z "$CONTAINER" ] && return
  local conf; conf=$(docker exec "$CONTAINER" cat /root/.tmux.conf 2>/dev/null)
  echo "$conf" | grep -q "prefix"     && log_ok "前缀键已配置"    || log_fail "前缀键缺失"
  echo "$conf" | grep -q "mouse on"   && log_ok "鼠标支持已启用"  || log_fail "鼠标支持缺失"
  echo "$conf" | grep -q "base-index" && log_ok "窗口索引已配置"  || log_fail "窗口索引缺失"
}

# ── 检查插件是否安装 ──
check_plugins() {
  [ -z "$CONTAINER" ] && return
  docker exec "$CONTAINER" test -d /root/.tmux/plugins/tpm && log_ok "TPM 目录存在" || log_fail "TPM 目录缺失"
  shift
  for p in "$@"; do
    docker exec "$CONTAINER" test -d "/root/.tmux/plugins/$p" && log_ok "插件 $p 已安装" || log_fail "插件 $p 未安装"
  done
}

# ── 清理当前容器 ──
teardown() {
  docker rm -f "$CONTAINER" 2>/dev/null || true
  CONTAINER=""
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  测试 1: 最小配置（无插件）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
setup_and_run "最小配置: apt + Ctrl+A + 基础选项" \
  "tmux-install-apt" "tmux-header" "tmux-prefix-ctrl-a" \
  "tmux-status-minimal" "tmux-opt-mouse" "tmux-opt-index" "tmux-opt-reload" || true

check_tmux
check_conf
if [ -n "$CONTAINER" ]; then
  conf=$(docker exec "$CONTAINER" cat /root/.tmux.conf 2>/dev/null)
  echo "$conf" | grep -q "prefix C-a" && log_ok "前缀是 Ctrl+A" || log_fail "前缀不是 Ctrl+A"
  echo "$conf" | grep -q "@plugin" && log_fail "不应有插件声明" || log_ok "无插件声明"
fi
teardown

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  测试 2: Ctrl+B + 丰富状态栏 + vi 模式
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
setup_and_run "Ctrl+B + 丰富状态栏 + vi 模式" \
  "tmux-install-apt" "tmux-header" "tmux-prefix-ctrl-b" \
  "tmux-status-rich" "tmux-opt-vi" "tmux-opt-split" || true

check_tmux
if [ -n "$CONTAINER" ]; then
  conf=$(docker exec "$CONTAINER" cat /root/.tmux.conf 2>/dev/null)
  echo "$conf" | grep -q "prefix C-b"        && log_ok "前缀是 Ctrl+B"        || log_fail "前缀不是 Ctrl+B"
  echo "$conf" | grep -q "mode-keys vi"      && log_ok "Vi 模式已启用"        || log_fail "Vi 模式未启用"
  echo "$conf" | grep -q "cpu_percentage\|mem_percentage" && log_ok "丰富状态栏" || log_fail "丰富状态栏缺失"
fi
teardown

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  测试 3: 完整插件配置
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
setup_and_run "完整配置: TPM + resurrect + yank + sensible" \
  "tmux-install-apt" "tmux-header" "tmux-prefix-ctrl-a" \
  "tmux-tpm" "tmux-plugin-resurrect" "tmux-plugin-yank" "tmux-plugin-sensible" "tmux-tpm-finalize" \
  "tmux-status-minimal" "tmux-opt-mouse" "tmux-opt-index" || true

check_tmux
check_conf
check_plugins "tmux-resurrect" "tmux-yank" "tmux-sensible"

if [ -n "$CONTAINER" ]; then
  conf=$(docker exec "$CONTAINER" cat /root/.tmux.conf 2>/dev/null)
  last=$(echo "$conf" | grep -n "run.*tpm" | tail -1 | cut -d: -f1)
  total=$(echo "$conf" | wc -l)
  [ "$last" -ge $((total - 2)) ] && log_ok "TPM init 在文件末尾" || log_fail "TPM init 不在末尾"
fi
teardown

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  测试 4: continuum 自动依赖 resurrect
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
setup_and_run "continuum 自动依赖 resurrect" \
  "tmux-install-apt" "tmux-header" "tmux-prefix-ctrl-a" \
  "tmux-tpm" "tmux-plugin-continuum" "tmux-tpm-finalize" \
  "tmux-status-minimal" || true

check_tmux
check_plugins "tmux-resurrect" "tmux-continuum"
if [ -n "$CONTAINER" ]; then
  conf=$(docker exec "$CONTAINER" cat /root/.tmux.conf 2>/dev/null)
  echo "$conf" | grep -q "continuum-restore" && log_ok "continuum 自动保存已配置" || log_fail "continuum 配置缺失"
fi
teardown

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  结果
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_header "结果汇总"
echo ""
echo -e "  ${GREEN}通过: $PASS${NC}  ${RED}失败: $FAIL${NC}"
echo ""
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
