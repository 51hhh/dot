#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Docker 集成测试
#  在干净的 Ubuntu 容器中运行生成的脚本，验证实际可用性
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR=$(mktemp -d)
PASS=0
FAIL=0

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[PASS]${NC}  $*"; PASS=$((PASS + 1)); }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $*"; FAIL=$((FAIL + 1)); }
log_header(){ echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

cleanup() {
  rm -rf "$TEST_DIR"
  docker rm -f dot-test-tmux 2>/dev/null || true
}
trap cleanup EXIT

# ── 检查 Docker ──
if ! command -v docker &>/dev/null; then
  echo "Docker 未安装，跳过集成测试"
  exit 0
fi

# ── 生成 tmux 配置脚本（直接调用模块 API，跳过交互式 CLI）──
log_header "生成 tmux 配置脚本"

cd "$PROJECT_DIR"
mkdir -p tests/integration/tmp
node --input-type=module << 'GENEOF'
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const config = yaml.load(fs.readFileSync("configs/tmux.yaml", "utf-8"));
const allNodes = new Map();
function walk(nodes) { for (const n of nodes) { allNodes.set(n.id, n); if (n.children) walk(n.children); } }
walk(config.menu);

const selected = new Set([
  "tmux-install-apt", "tmux-header", "tmux-prefix-ctrl-a",
  "tmux-tpm", "tmux-plugin-resurrect", "tmux-tpm-finalize",
  "tmux-status-minimal", "tmux-opt-mouse", "tmux-opt-index",
]);

function resolveDeps(ids) {
  const r = new Set(ids); const q = [...ids];
  while (q.length) { const id = q.pop(); const n = allNodes.get(id); if (!n?.deps) continue; for (const d of n.deps) { if (!r.has(d)) { r.add(d); q.push(d); } } }
  return r;
}
function topoSort(ids) {
  const inD = new Map(); const deps = new Map();
  for (const id of ids) inD.set(id, 0);
  for (const id of ids) { const n = allNodes.get(id); if (!n?.deps) continue; for (const d of n.deps) { if (!ids.has(d)) continue; inD.set(id, (inD.get(id)??0)+1); if (!deps.has(d)) deps.set(d, []); deps.get(d).push(id); } }
  const q = []; for (const [id,deg] of inD) if (deg===0) q.push(id);
  const sorted = []; while (q.length) { const id=q.shift(); sorted.push(id); for (const dep of deps.get(id)??[]) { const nd=(inD.get(dep)??1)-1; inD.set(dep,nd); if(nd===0) q.push(dep); } }
  return sorted;
}
function renderTemplate(content, vars) {
  return content.replace(/\{\{(\w+)(?::([^}]*))?\}\}/g, (_, k, d) => vars[k] ?? d ?? `{{${k}}}`);
}

const resolved = resolveDeps(selected);
const sorted = topoSort(resolved);
const normalIds = sorted.filter(id => !allNodes.get(id)?.post);
const postIds = sorted.filter(id => allNodes.get(id)?.post);
const sections = [`#!/usr/bin/env bash
set -euo pipefail
RED='\\033[0;31m'
GREEN='\\033[0;32m'
CYAN='\\033[0;36m'
NC='\\033[0m'
log_info()  { echo -e "\${CYAN}[INFO]\${NC}  \$*"; }
log_ok()    { echo -e "\${GREEN}[OK]\${NC}    \$*"; }
`];
for (const id of [...normalIds, ...postIds]) {
  const node = allNodes.get(id);
  if (!node?.script) continue;
  const scriptPath = path.resolve(node.script);
  let content = fs.readFileSync(scriptPath, "utf-8");
  content = renderTemplate(content, { ...config.vars, ...node.vars });
  sections.push(`# ─── ${node.label} (${node.id}) ───\n${content}`);
}
sections.push('\nlog_ok "Tmux 配置完成!"');
const output = sections.join("\n\n");
fs.writeFileSync("tests/integration/tmp/setup-tmux.sh", output, { mode: 0o755 });
console.log("Generated: tests/integration/tmp/setup-tmux.sh");
GENEOF

TEST_DIR="$PROJECT_DIR/tests/integration/tmp"
log_info "脚本生成成功"

# ── 测试 1: 语法校验 ──
log_header "测试 1: bash -n 语法校验"
if bash -n "$TEST_DIR/setup-tmux.sh" 2>/dev/null; then
  log_ok "语法校验通过"
else
  log_fail "语法校验失败"
fi

# ── 测试 2: Docker 容器中执行 ──
log_header "测试 2: Docker 容器执行 (ubuntu:24.04)"

CONTAINER_NAME="dot-test-tmux"
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

log_info "启动容器..."
docker run -d --name "$CONTAINER_NAME" ubuntu:24.04 sleep 300

log_info "预装基础依赖..."
docker exec "$CONTAINER_NAME" bash -c "apt-get update -qq && apt-get install -y -qq git curl >/dev/null 2>&1"

log_info "复制脚本到容器..."
docker cp "$TEST_DIR/setup-tmux.sh" "$CONTAINER_NAME":/tmp/setup-tmux.sh

log_info "执行脚本..."
if docker exec "$CONTAINER_NAME" bash /tmp/setup-tmux.sh; then
  log_ok "脚本执行成功 (exit code 0)"
else
  log_fail "脚本执行失败"
fi

# ── 测试 3: 验证安装结果 ──
log_header "测试 3: 验证安装结果"

# 检查 tmux 是否安装
if docker exec "$CONTAINER_NAME" tmux -V &>/dev/null; then
  TMUX_VER=$(docker exec "$CONTAINER_NAME" tmux -V)
  log_ok "tmux 已安装: $TMUX_VER"
else
  log_fail "tmux 未安装"
fi

# 检查 tmux.conf 是否生成
if docker exec "$CONTAINER_NAME" test -f /root/.tmux.conf; then
  log_ok "~/.tmux.conf 已生成"
else
  log_fail "~/.tmux.conf 不存在"
fi

# 检查 tmux.conf 内容
TMUX_CONF=$(docker exec "$CONTAINER_NAME" cat /root/.tmux.conf)

check_conf() {
  local pattern="$1" label="$2"
  if echo "$TMUX_CONF" | grep -q "$pattern"; then
    log_ok "$label"
  else
    log_fail "$label"
  fi
}

check_conf "prefix C-a"                           "前缀键配置正确 (C-a)"
check_conf "mouse on"                             "鼠标支持已启用"
check_conf "base-index 1"                         "窗口索引从 1 开始"
check_conf "@plugin 'tmux-plugins/tpm'"           "TPM 声明已写入"
check_conf "run '~/.tmux/plugins/tpm/tpm'"        "TPM 初始化在文件末尾"
check_conf "@plugin 'tmux-plugins/tmux-resurrect'" "resurrect 插件已声明"

# ── 清理 ──
log_header "测试完成"
docker rm -f "$CONTAINER_NAME" &>/dev/null

echo ""
echo -e "${GREEN}通过: $PASS${NC}  ${RED}失败: $FAIL${NC}"
echo ""
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
