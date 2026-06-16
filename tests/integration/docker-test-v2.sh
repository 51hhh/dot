#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Docker 集成测试 - JSON 驱动、单容器多路径
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MATRIX="$PROJECT_DIR/tests/integration/test-matrix.json"
GENERATE="$PROJECT_DIR/tests/integration/generate.mjs"
PASS=0
FAIL=0

log_ok()    { echo -e "    ${GREEN}✓${NC} $*"; PASS=$((PASS + 1)); }
log_fail()  { echo -e "    ${RED}✗${NC} $*"; FAIL=$((FAIL + 1)); }
log_warn()  { echo -e "    ${YELLOW}⚠${NC} $*"; }
log_header(){ echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }
log_test()  { echo -e "  ${CYAN}→${NC} $*"; }

if ! command -v docker &>/dev/null; then
  echo "Docker 未安装，跳过集成测试"
  exit 0
fi

if ! command -v jq &>/dev/null; then
  echo "jq 未安装，跳过集成测试"
  exit 0
fi

CONTAINER="dot-test-$$"
cleanup() { docker rm -f "$CONTAINER" 2>/dev/null || true; }
trap cleanup EXIT

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  创建长运行容器
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_header "启动测试容器"
docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d --name "$CONTAINER" ubuntu:24.04 sleep 3600 >/dev/null
log_ok "容器启动: $CONTAINER"

log_test "安装基础依赖..."
docker exec "$CONTAINER" bash -c "apt-get update -qq && apt-get install -y -qq git curl build-essential libevent-dev ncurses-dev bison autoconf automake pkg-config >/dev/null 2>&1"
log_ok "依赖安装完成"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  执行检查函数
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
run_check() {
  local type="$1"
  local check_json="$2"

  case "$type" in
    command)
      local cmd; cmd=$(echo "$check_json" | jq -r '.cmd')
      local expect; expect=$(echo "$check_json" | jq -r '.expect')
      local output; output=$(docker exec "$CONTAINER" bash -c "$cmd" 2>&1 || true)
      if echo "$output" | grep -q "$expect"; then
        log_ok "命令成功: $cmd"
      else
        log_fail "命令失败: $cmd (期望: $expect, 实际: $output)"
      fi
      ;;

    file_contains)
      local path; path=$(echo "$check_json" | jq -r '.path')
      local pattern; pattern=$(echo "$check_json" | jq -r '.pattern')
      if docker exec "$CONTAINER" bash -c "test -f '$path' && grep -q '$pattern' '$path'" 2>/dev/null; then
        log_ok "文件包含: $path → $pattern"
      else
        log_fail "文件不包含: $path → $pattern"
      fi
      ;;

    file_exists)
      local path; path=$(echo "$check_json" | jq -r '.path')
      if docker exec "$CONTAINER" test -f "$path" 2>/dev/null; then
        log_ok "文件存在: $path"
      else
        log_fail "文件不存在: $path"
      fi
      ;;

    dir_exists)
      local path; path=$(echo "$check_json" | jq -r '.path')
      if docker exec "$CONTAINER" test -d "$path" 2>/dev/null; then
        log_ok "目录存在: $path"
      else
        log_fail "目录不存在: $path"
      fi
      ;;

    tmux_session)
      local action; action=$(echo "$check_json" | jq -r '.action')
      local name; name=$(echo "$check_json" | jq -r '.name')
      if [ "$action" = "new" ]; then
        if docker exec "$CONTAINER" tmux new-session -d -s "$name" 2>/dev/null; then
          log_ok "Tmux 会话创建: $name"
          docker exec "$CONTAINER" tmux kill-session -t "$name" 2>/dev/null || true
        else
          log_fail "Tmux 会话创建失败: $name"
        fi
      fi
      ;;

    pipe_execution)
      local input; input=$(echo "$check_json" | jq -r '.input')
      local expect_exit; expect_exit=$(echo "$check_json" | jq -r '.expect_exit')
      local output; output=$(echo -e "$input" | docker exec -i "$CONTAINER" bash /tmp/setup.sh 2>&1 || true)
      local exit_code=$?
      if [ "$exit_code" -eq "$expect_exit" ]; then
        log_ok "管道执行: 退出码 $exit_code"
      else
        log_fail "管道执行: 期望退出码 $expect_exit, 实际 $exit_code"
      fi
      ;;

    stderr_not_contains)
      local pattern; pattern=$(echo "$check_json" | jq -r '.pattern')
      local stderr; stderr=$(docker exec "$CONTAINER" bash /tmp/setup.sh 2>&1 >/dev/null || true)
      if echo "$stderr" | grep -q "$pattern"; then
        log_fail "stderr 包含错误: $pattern"
      else
        log_ok "stderr 不包含: $pattern"
      fi
      ;;

    *)
      log_warn "未知检查类型: $type"
      ;;
  esac
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  遍历测试场景
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
scenario_count=$(jq '.scenarios | length' "$MATRIX")

for i in $(seq 0 $((scenario_count - 1))); do
  scenario=$(jq ".scenarios[$i]" "$MATRIX")
  name=$(echo "$scenario" | jq -r '.name')
  select_ids=$(echo "$scenario" | jq -r '.select[]' | tr '\n' ' ')
  is_interactive=$(echo "$scenario" | jq -r '.interactive // false')

  log_header "场景 $((i + 1))/$scenario_count: $name"

  # 跳过交互式测试（需要特殊处理）
  if [ "$is_interactive" = "true" ]; then
    log_warn "交互式测试跳过（需要 /dev/tty 修复后启用）"
    continue
  fi

  # 生成脚本
  if [ -n "$select_ids" ]; then
    script=$(mktemp /tmp/dot-XXXXXX.sh)
    log_test "生成脚本: $select_ids"
    cd "$PROJECT_DIR"
    if node "$GENERATE" "$script" $select_ids 2>/dev/null; then
      log_ok "脚本生成成功"
    else
      log_fail "脚本生成失败"
      rm -f "$script"
      continue
    fi

    # 上传到容器
    docker cp "$script" "$CONTAINER":/tmp/setup.sh
    rm -f "$script"

    # 执行脚本
    log_test "执行脚本..."
    if docker exec "$CONTAINER" bash /tmp/setup.sh >/dev/null 2>&1; then
      log_ok "脚本执行成功"
    else
      log_fail "脚本执行失败"
      continue
    fi
  fi

  # 执行检查
  check_count=$(echo "$scenario" | jq '.checks | length')
  for j in $(seq 0 $((check_count - 1))); do
    check=$(echo "$scenario" | jq ".checks[$j]")
    check_type=$(echo "$check" | jq -r '.type')
    run_check "$check_type" "$check"
  done

  # 清理容器状态（为下一个测试准备）
  docker exec "$CONTAINER" bash -c "rm -rf /root/.tmux* /usr/local/bin/tmux 2>/dev/null || true" >/dev/null 2>&1
done

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  结果汇总
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_header "结果汇总"
echo ""
echo -e "  ${GREEN}通过: $PASS${NC}  ${RED}失败: $FAIL${NC}"
echo ""
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
