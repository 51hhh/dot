# Docker 测试指南

本文档说明如何使用 Docker 容器测试 dot 生成的配置脚本。

---

## 📋 前置要求

```bash
# 1. 确保 Docker 已安装
docker --version

# 2. 确保项目已构建
npm run build
```

---

## 🚀 快速开始

### 生成并测试完整脚本（推荐）

```bash
# 1. 生成完整的 dot 配置脚本
npm run build

# 2. 在 Docker 容器中交互式运行
docker run --rm -it \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash /root/setup.sh
```

---

## 📁 关键路径

### 本地文件
- **生成的脚本**: `dist/dot.sh` (由 `npm run build` 自动生成)
- **配置文件**: `configs/dot.yaml`

### 容器内路径
- **推荐路径**: `/root/setup.sh` (标准位置)
- **执行命令**: `bash /root/setup.sh`

---

## 🔧 详细测试流程

### 步骤 1：生成完整脚本

```bash
# 方式 A：使用 npm 脚本（推荐）
npm run build
# 生成 dist/dot.sh (220KB 自包含脚本)

# 方式 B：手动生成
node dist/index.js build \
  --config configs/dot.yaml \
  --output dist/dot.sh \
  --quiet
```

**⚠️ 重要**: 
- 脚本必须先生成才能挂载
- 如果挂载时本地文件不存在，Docker 会创建**空目录**而非文件

### 步骤 2：启动 Docker 容器

#### 方式 A：一次性交互式运行（推荐）

```bash
docker run --rm -it \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash /root/setup.sh
```

**参数说明**:
- `--rm`: 容器退出后自动删除
- `-it`: 交互式终端（支持 TUI 菜单）
- `-v`: 挂载脚本到容器
  - **本地**: `$(pwd)/dist/dot.sh`
  - **容器**: `/root/setup.sh`

#### 方式 B：长运行容器（调试用）

```bash
# 1. 确认脚本已生成
ls -lh dist/dot.sh

# 2. 启动容器（后台运行）
docker run -d --name dot-test \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  sleep 3600

# 3. 验证挂载成功
docker exec dot-test ls -lh /root/setup.sh
docker exec dot-test file /root/setup.sh
# 应输出: Bourne-Again shell script, ASCII text executable

# 4. 安装基础依赖（如需）
docker exec dot-test bash -c \
  "apt-get update -qq && apt-get install -y git curl sudo -qq"

# 5. 交互式执行脚本
docker exec -it dot-test bash /root/setup.sh

# 6. 验证安装结果
docker exec dot-test tmux -V
docker exec dot-test cat /root/.tmux.conf

# 7. 清理容器
docker rm -f dot-test
```

---

## 🧪 常见测试场景

### 场景 1：测试 Tmux 完整安装

```bash
# 使用完整脚本交互式选择 tmux 相关选项
docker run --rm -it \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash /root/setup.sh

# 在菜单中选择：
# - Tmux 安装方式 → apt
# - 前缀键 → Ctrl+A
# - 插件 → TPM + resurrect
```

### 场景 2：测试卸载功能

```bash
docker run --rm \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash -c "
    # 先安装 tmux
    apt-get update -qq && apt-get install -y tmux sudo -qq
    mkdir -p ~/.tmux/plugins
    echo 'test config' > ~/.tmux.conf
    tmux -V
    
    # 使用脚本卸载（需要交互式选择卸载选项）
    # 或手动调用卸载模板
    echo '卸载前状态:'
    ls -la ~/.tmux.conf ~/.tmux/
    
    # 这里需要交互式选择卸载
  "
```

### 场景 3：非交互式测试（使用预设）

```bash
# 生成带预设的测试脚本
node tests/integration/generate.mjs /tmp/test-preset.sh \
  tmux-install-apt \
  tmux-header \
  tmux-prefix-ctrl-a \
  tmux-opt-mouse

# 在容器中非交互式执行
docker run --rm \
  -v /tmp/test-preset.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash -c "
    apt-get update -qq && apt-get install -y git curl -qq
    bash /root/setup.sh
    tmux -V
    grep 'prefix C-a' ~/.tmux.conf && echo '✓ Ctrl+A 配置成功'
  "
```

### 场景 4：测试源码编译安装

```bash
docker run --rm -it \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash -c "
    apt-get update -qq
    apt-get install -y build-essential libevent-dev ncurses-dev \
      bison autoconf automake pkg-config git curl -qq
    bash /root/setup.sh
  "

# 在菜单中选择：tmux 安装方式 → 源码编译
# 验证: ls -la /usr/local/bin/tmux
```

---

## 🐛 故障排查

### 问题 1：挂载的是空目录而非文件

**症状**:
```bash
docker exec dot-test ls -lh /root/setup.sh
# 输出: total 0  (空目录)

docker exec dot-test bash /root/setup.sh
# 错误: bash: /root/setup.sh: Is a directory
```

**原因**: 挂载时本地 `dist/dot.sh` 不存在，Docker 创建了空目录

**解决方案**:
```bash
# ✓ 正确步骤：先构建再挂载
npm run build
ls -lh dist/dot.sh  # 确认文件存在，大小 ~220KB
docker run --rm -it \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash /root/setup.sh
```

### 问题 2：`/dev/tty: 没有那个设备或地址`

**原因**: 管道模式下 `/dev/tty` 不可用

**解决方案**:
```bash
# ✗ 错误（管道模式）
echo "q" | docker run --rm -v $(pwd)/dist/dot.sh:/root/setup.sh ubuntu:24.04 bash /root/setup.sh

# ✓ 正确（交互式终端）
docker run --rm -it \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash /root/setup.sh

# ✓ 或使用预设模式（非交互）
docker run --rm \
  -e DOT_RUN_PRESET='tmux-install-apt' \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash /root/setup.sh
```

### 问题 3：权限错误

```bash
# 在容器中安装 sudo
docker run --rm -it \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash -c "
    apt-get update -qq && apt-get install -y sudo -qq
    bash /root/setup.sh
  "
```

### 问题 4：脚本生成失败

```bash
# 检查构建是否成功
npm run build 2>&1 | tail -10

# 检查配置文件
node dist/index.js build -c configs/dot.yaml -o /tmp/test.sh --quiet

# 运行测试
npm test
```

---

## 🧰 自动化测试

项目包含完整的 Docker 自动化测试套件：

```bash
# 运行所有 Docker 测试（6 个场景）
npm run test:docker

# 或直接运行
bash tests/integration/docker-test-v2.sh
```

**测试内容**:
- ✅ 最小配置（apt + Ctrl+A）
- ✅ Ctrl+B + Vi模式 + 丰富状态栏
- ✅ 完整插件（TPM + resurrect + yank）
- ✅ Continuum 自动依赖 resurrect
- ✅ 源码编译安装
- ⚠️  交互式入口测试（跳过，需修复 /dev/tty）

**查看测试配置**: `tests/integration/test-matrix.json`

---

## 📊 验证清单

完整测试流程：

```bash
# ✓ 1. 构建项目
npm run build

# ✓ 2. 确认脚本生成
ls -lh dist/dot.sh
file dist/dot.sh

# ✓ 3. 验证语法
bash -n dist/dot.sh

# ✓ 4. 在容器中运行
docker run --rm -it \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 \
  bash /root/setup.sh

# ✓ 5. 验证安装结果（根据选择的选项）
docker exec <container> tmux -V
docker exec <container> cat ~/.tmux.conf
docker exec <container> ls -la ~/.tmux/plugins/
```

---

## 💡 最佳实践

1. **使用完整路径**: `$(pwd)/dist/dot.sh` 而非相对路径
2. **先构建再挂载**: 确保 `dist/dot.sh` 存在
3. **交互式终端**: 使用 `-it` 支持 TUI 菜单
4. **验证挂载**: 用 `docker exec` 检查文件是否正确挂载
5. **清理容器**: 使用 `--rm` 或手动 `docker rm -f`

---

## 📝 快速命令参考

```bash
# 一键构建并测试
npm run build && docker run --rm -it \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 bash /root/setup.sh

# 调试模式（长运行容器）
docker run -d --name dot-debug \
  -v $(pwd)/dist/dot.sh:/root/setup.sh \
  ubuntu:24.04 sleep 3600
docker exec -it dot-debug bash /root/setup.sh
docker rm -f dot-debug

# 自动化测试
npm run test:docker
```

---

*文档版本: 1.0*  
*最后更新: 2026-06-16*
