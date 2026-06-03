# PRD: SSH 一键配置流程

## 背景

项目当前已有 `Tmux 一键配置` 和 `Zsh 一键配置` flow。用户希望新增 `SSH 一键配置`，覆盖 SSH 服务器安装与加固、客户端密钥生成、SSH Agent 配置、授权密钥管理、fail2ban 暴力破解防护、防火墙联动等场景。

目标用户：刚拿到一台新的 Linux 服务器（物理机、VPS、云实例），需要快速把 SSH 从默认不安全状态拉到生产可用状态。

## 目标

- 在 `configs/dot.yaml` 中新增顶层 `SSH 一键配置`（`multi` 模式，用户自由选择）
- 新增 SSH 相关安装和配置脚本模板（`templates/ssh/`）
- 独立工具（查看公钥、诊断配置）可单独使用，无需走完整安装流程
- **工具即节点**：每个工具定义为独立节点，既能被用户直接选择使用，也能被其他流程节点通过 `deps` 引用。例如"生成密钥"节点既可单独勾选执行，也是"禁用密码登录"的前置依赖。
- 所有 sshd_config 修改操作安全：先备份、再修改、`sshd -t` 验证、最后才重启服务
- 密钥生成幂等：已存在同名密钥时跳过并提示
- 支持 apt 安装 openssh-server（首版只做 apt）
- 防止用户被锁在门外：禁用密码登录前必须确认已有可用密钥
- 所有加固项均为可选（multi / single 模式），用户按需勾选
- 所有模板符合现有约定：无 shebang、用 `log_*` 系列、`dot_sudo`、`return 1` 错误处理、中文提示
- 增加测试覆盖菜单结构、模板路径、生成脚本内容和 standalone build

## 非目标

- 不支持非 apt 包管理器（dnf、pacman 等），首版只做 apt
- 不实现 MFA/2FA（Google Authenticator、Duo 等）
- 不实现端口敲门（port knocking）
- 不实现证书认证（SSH CA）
- 不安装 ssh-audit、sshuttle、mosh 等工具（保持首版聚焦）
- 不自动修改云端安全组规则
- 不自动运行 `ssh-copy-id` 到远程服务器（需要交互式密码输入，不适合脚本化）

---

## 菜单结构设计

顶层入口为 `multi` 模式，用户自由勾选需要的工具/配置项，无需按顺序走完整流程。

```
dot 主页
├── Tmux 一键配置 (已有)
├── Zsh 一键配置 (已有)
└── SSH 一键配置 (multi)            ← 自由选择，按需勾选

SSH 一键配置 (multi)
├── 安装 SSH 服务 (single)
│   ├── 安装并启动 SSH 服务 (apt)
│   └── 跳过安装，系统已有 SSH
│
├── 生成 SSH 密钥 (single)          ← 独立可用，不依赖安装步骤
│   ├── Ed25519（推荐）
│   ├── RSA 4096（兼容性最好）
│   └── 跳过，已有密钥
│
├── 查看本机公钥                     ← 独立工具，只读不修改
├── 诊断 SSH 配置                    ← 独立工具，检查 sshd -t + 常见问题
│
├── Host Key 管理 (single)
│   ├── 重新生成所有 Host Key（推荐新机器）
│   └── 保留现有 Host Key
│
├── 授权密钥管理 (single)
│   ├── 从本地文件导入公钥到 authorized_keys
│   ├── 从 GitHub 用户名拉取公钥
│   └── 跳过，稍后手动配置
│
├── 服务器加固选项 (multi)           ← 子级也是 multi，6 项可多选
│   ├── 禁用密码登录                 运行时检查：至少有一个密钥
│   ├── 禁用 Root 直接登录
│   ├── 自定义端口                   prompt: number, default 2222
│   ├── 限制登录用户                 prompt: text
│   ├── 加密算法加固（现代密码套件 + 过滤弱 DH moduli）
│   └── 会话安全加固（超时、最大尝试次数、禁用转发等）
│
├── fail2ban 防暴力破解 (single)
│   ├── 安装并配置 fail2ban
│   └── 跳过 fail2ban
│
├── 客户端配置 (multi)
│   ├── 生成推荐 ~/.ssh/config（全局 KeepAlive + HashKnownHosts）
│   └── 配置 SSH Agent 自动加载密钥（bashrc/zshrc）
│
├── 防火墙配置 (single)
│   ├── 启用 UFW 并放行当前 SSH 端口（limit 模式限速）
│   └── 跳过防火墙配置
│
└── 收尾提示 (post)
    └── 显示配置摘要与后续操作提示
```

---

## 详细需求

### 独立工具

**查看本机公钥** (`ssh-show-pubkey`)
- 只读操作，不修改系统
- 扫描 `~/.ssh/*.pub`，显示所有已有公钥内容
- 如果没有公钥，提示先运行"生成 SSH 密钥"
- 输出格式：key type + fingerprint + comment，方便复制粘贴

**诊断 SSH 配置** (`ssh-diagnose`)
- 只读检查，不修改系统
- `sshd -t` 验证配置语法
- 检查常见问题：权限过宽（~/.ssh 700 vs 755）、authorized_keys 权限、Host Key 权限
- `ss -tlnp | grep ssh` 确认监听端口
- `systemctl is-active ssh` 确认服务状态
- 输出诊断摘要

### 步骤 1：SSH 服务安装

**节点 id**: `ssh-install-apt` / `ssh-install-skip`

- `install-apt.sh`：`dot_sudo apt-get install -y openssh-server`，然后 `dot_sudo systemctl enable --now ssh`
- `install-skip.sh`：检查 `command -v sshd` 和 `systemctl is-active ssh` 是否可用
- 幂等：已安装时跳过 apt，只确认服务正在运行
- 处理 systemd socket activation（Debian 12+ / Ubuntu 22.04+）

### 步骤 2：Host Key 管理

**节点 id**: `ssh-hostkey-regen` / `ssh-hostkey-keep`

- `hostkey-regen.sh`：
  - 备份现有 host key 到 `/etc/ssh/backup/`
  - 删除旧的 DSA/RSA-1024/ECDSA 弱密钥
  - 重新生成 ed25519 + rsa-4096 host key
  - 警告：客户端再次连接时会看到 host key 变更提示
- `hostkey-keep.sh`：`log_info` 提示保留现有密钥，不做修改

### 步骤 3：SSH 密钥生成

**节点 id**: `ssh-keygen-ed25519` / `ssh-keygen-rsa` / `ssh-keygen-skip`

无 deps 依赖。锁门防护由"禁用密码登录"脚本在运行时检查实现：检测 `~/.ssh/id_*` 和 `~/.ssh/authorized_keys`，无密钥则拒绝执行。

- `keygen-ed25519.sh`：`ssh-keygen -t ed25519 -C "user@$(hostname)-$(date +%Y%m%d)"`
- `keygen-rsa.sh`：`ssh-keygen -t rsa -b 4096 -C "user@$(hostname)-$(date +%Y%m%d)"`
- `keygen-skip.sh`：检查 `~/.ssh/id_ed25519` 或 `~/.ssh/id_rsa` 是否存在，提示用户
- 幂等：检测目标密钥是否已存在，存在则跳过并提示
- 默认路径 `~/.ssh/id_ed25519`，不加日期后缀（保持与 `ssh-agent` 默认行为一致）
- passphrase 留空提示（脚本无法安全输入 passphrase，提示用户后续手动设置）

### 步骤 4：授权密钥管理

**节点 id**: `ssh-authkeys-file` / `ssh-authkeys-github` / `ssh-authkeys-skip`

- `authkeys-file.sh`：
  - prompt: text，label: "输入公钥文件路径"
  - 读取指定文件内容，追加到 `~/.ssh/authorized_keys`
  - 幂等：检查该公钥是否已在 authorized_keys 中（按指纹比较）
  - 设置正确权限：`chmod 600 ~/.ssh/authorized_keys`
- `authkeys-github.sh`：
  - prompt: text，label: "输入 GitHub 用户名"
  - 从 `https://github.com/<user>.keys` 下载公钥
  - 使用 `dot_download_with_fallback` 处理网络问题
  - 追加到 `~/.ssh/authorized_keys`，去重
- `authkeys-skip.sh`：`log_info` 提示稍后手动配置

### 步骤 5：服务器加固选项

所有加固项修改 `/etc/ssh/sshd_config`，统一使用安全模式：

```
备份 → sed 替换 → sshd -t 验证 → 失败则恢复备份
```

**5a. 禁用密码登录** (`ssh-disable-password`)
- `PasswordAuthentication no`
- `ChallengeResponseAuthentication no`
- `KbdInteractiveAuthentication no`（OpenSSH 8.7+ 新名）
- 无 deps，改为脚本内运行时检查：至少存在一个密钥文件（`~/.ssh/id_*` 或 `~/.ssh/authorized_keys` 非空）才允许执行，否则 log_error 提示先生成或导入密钥

**5b. 禁用 Root 直接登录** (`ssh-disable-root`)
- `PermitRootLogin prohibit-password`（允许密钥登录 root，比 `no` 更安全——避免意外无法恢复）
- 提示：如果需要完全禁止 root SSH，可手动改为 `no`

**5c. 自定义端口** (`ssh-custom-port`)
- `Port {{ssh_port}}`
- prompt: number，label: "输入自定义 SSH 端口"，default: `2222`
- 警告：改端口后需同步更新防火墙和云安全组

**5d. 限制登录用户** (`ssh-limit-users`)
- `AllowUsers {{allowed_users}}`
- prompt: text，label: "输入允许登录的用户名（空格分隔）"
- 仅在用户输入非空时写入

**5e. 加密算法加固** (`ssh-crypto-hardening`)
- 写入 Mozilla Modern 配置：
  - `KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,...`
  - `Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,...`
  - `MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,...`
- 过滤弱 DH moduli：`awk '$5 >= 3071' /etc/ssh/moduli > tmp && mv tmp /etc/ssh/moduli`

**5f. 会话安全加固** (`ssh-session-hardening`)
- `MaxAuthTries 3`
- `LoginGraceTime 30`
- `ClientAliveInterval 300`
- `ClientAliveCountMax 2`
- `MaxSessions 10`
- `MaxStartups 10:30:60`
- `PermitEmptyPasswords no`
- `X11Forwarding no`
- `AllowTcpForwarding no`

### 步骤 6：安全防护（fail2ban）

**节点 id**: `ssh-fail2ban-install` / `ssh-fail2ban-skip`

- `fail2ban-install.sh`：
  - `dot_sudo apt-get install -y fail2ban`
  - 写入 `/etc/fail2ban/jail.local`（不修改默认 jail.conf）
  - SSH jail 配置：
    ```ini
    [sshd]
    enabled = true
    port = ssh       # 自动读取 sshd_config 中的端口
    filter = sshd
    logpath = /var/log/auth.log
    maxretry = 5
    bantime = 3600
    findtime = 600
    ```
  - `dot_sudo systemctl enable --now fail2ban`
  - 如果用户在步骤 5c 改了端口，`port` 字段使用 `ssh`（fail2ban 自动从 sshd_config 读取）
- `fail2ban-skip.sh`：`log_info` 提示跳过

### 步骤 7：客户端配置

**7a. 生成推荐 ~/.ssh/config** (`ssh-client-config`)
- 全局设置：
  ```
  Host *
      ServerAliveInterval 60
      ServerAliveCountMax 3
      AddKeysToAgent yes
      HashKnownHosts yes
      IdentityFile ~/.ssh/id_ed25519
  ```
- 幂等：备份现有 config，使用 `set_or_insert` 模式写入（参考 zshrc-recommended.sh 模式）

**7b. 配置 SSH Agent** (`ssh-agent-config`)
- 检测当前 shell（bash/zsh）选择对应的 rc 文件
- 在 rc 文件中添加自动启动 ssh-agent 片段：
  ```bash
  if [ -z "$SSH_AUTH_SOCK" ]; then
      eval "$(ssh-agent -s)" > /dev/null 2>&1
  fi
  ```
- 幂等：检查 rc 文件中是否已有 `ssh-agent` 相关配置

### 步骤 8：防火墙配置

**节点 id**: `ssh-ufw-enable` / `ssh-ufw-skip`

- `ufw-ssh.sh`：
  - 检测 UFW 是否已安装，未安装则 `apt install ufw`
  - 从 `/etc/ssh/sshd_config` 读取当前端口（默认 22）
  - `ufw limit <port>/tcp comment 'SSH rate limit'`
  - `ufw --force enable`
  - 提示：云端实例可能需要在安全组中同步放行
- `ufw-skip.sh`：`log_info` 提示跳过

### 收尾提示

**节点 id**: `ssh-final-notes`，`post: true`

显示内容：
- 配置摘要（哪些步骤已执行）
- 提示在新终端测试 SSH 连接后再关闭当前会话
- 测试命令：`ssh -p <port> user@host`
- 如果改了端口，提醒更新防火墙/安全组
- 提示设置密钥 passphrase：`ssh-keygen -p -f ~/.ssh/id_ed25519`
- 如果启用了 fail2ban，提示 `fail2ban-client status sshd` 查看封禁状态

---

## sshd_config 修改安全协议

每个修改 sshd_config 的脚本自行完成完整安全周期（不依赖外部统一 restart）：

```
1. cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(timestamp)
2. sed -i 替换目标行（匹配 #?Key value 模式，避免重复追加）
3. sshd -t
   ├─ 成功 → log_ok，继续
   └─ 失败 → cp 备份恢复，log_error，return 1
4. systemctl restart sshd
5. 等待 2 秒，systemctl is-active ssh 验证存活
6. 提示用户在新终端测试连接
```

多个脚本各自 restart 虽然冗余，但保证每个工具独立可用、安全可靠。

---

## 依赖关系图（工具即节点）

设计原则：每个工具是独立节点，定义一次，到处复用。

- 用户直接勾选 → 独立执行
- 其他节点通过运行时检查引用 → 脚本内验证前置条件

```
顶层节点（SSH 一键配置 multi 的直接子节点）：
  ssh-install-apt/skip
  ssh-show-pubkey            （只读）
  ssh-diagnose               （只读）
  ssh-hostkey-regen/keep
  ssh-keygen-ed25519/rsa/skip
  ssh-authkeys-file/github/skip

  服务器加固 (multi) ─ 子节点：
    ssh-disable-password     运行时检查：至少有一个密钥/authorized_keys
    ssh-disable-root
    ssh-custom-port
    ssh-limit-users
    ssh-crypto-hardening
    ssh-session-hardening

  ssh-fail2ban-install/skip

  客户端配置 (multi) ─ 子节点：
    ssh-client-config
    ssh-agent-config

  ssh-ufw-enable/skip

  ssh-final-notes (post: true) ── 最后执行
```

无 deps 依赖关系。所有前置条件通过脚本内运行时检查实现。
每个修改 sshd_config 的脚本自行完成：备份 → 修改 → sshd -t → restart → 验证存活。

---

## 实现计划（5 个 PR）

### PR1: 基础骨架 + 独立工具 + 服务安装 + Host Key + 密钥生成

**目标**：跑通 multi 模式骨架 + 最常用的独立工具

文件变更：
- `configs/dot.yaml`：添加 SSH 一键配置（multi 模式）骨架
- `templates/ssh/install-apt.sh`
- `templates/ssh/install-skip.sh`
- `templates/ssh/hostkey-regen.sh`
- `templates/ssh/hostkey-keep.sh`
- `templates/ssh/keygen-ed25519.sh`
- `templates/ssh/keygen-rsa.sh`
- `templates/ssh/keygen-skip.sh`
- `templates/ssh/show-pubkey.sh`（只读工具）
- `templates/ssh/diagnose.sh`（只读工具）

### PR2: 服务器加固（全部 6 项）

**目标**：完整的 sshd_config 加固

文件变更：
- `configs/dot.yaml`：添加服务器加固 multi 节点及其 6 个子节点
- `templates/ssh/disable-password.sh`（内联备份/验证/恢复逻辑）
- `templates/ssh/disable-root.sh`
- `templates/ssh/custom-port.sh`
- `templates/ssh/limit-users.sh`
- `templates/ssh/crypto-hardening.sh`
- `templates/ssh/session-hardening.sh`

### PR3: 授权密钥 + 客户端配置 + SSH Agent

**目标**：密钥分发和客户端体验

文件变更：
- `configs/dot.yaml`：添加授权密钥管理 + 客户端配置节点
- `templates/ssh/authkeys-file.sh`
- `templates/ssh/authkeys-github.sh`
- `templates/ssh/authkeys-skip.sh`
- `templates/ssh/client-config.sh`
- `templates/ssh/agent-config.sh`

### PR4: fail2ban + 防火墙 + 收尾

**目标**：安全防护全链路

文件变更：
- `configs/dot.yaml`：添加 fail2ban、防火墙、收尾节点
- `templates/ssh/fail2ban-install.sh`
- `templates/ssh/fail2ban-skip.sh`
- `templates/ssh/ufw-ssh.sh`
- `templates/ssh/ufw-skip.sh`
- `templates/ssh/final-notes.sh`

### PR5: 测试 + 文档

**目标**：质量门禁全绿

文件变更：
- `tests/cli.test.ts`：添加 SSH flow 的 plan/build 测试
- `tests/planner.test.ts`：添加 SSH 菜单结构测试
- `README.md`：更新项目说明

---

## 验收标准

- [ ] `dot > SSH 一键配置` 为 `multi` 模式顶层入口，出现在生成计划和脚本中
- [ ] 用户可单独选择"查看本机公钥"或"诊断 SSH 配置"等独立工具，无需走安装流程
- [ ] SSH flow 包含：独立工具（2 项）、服务安装、Host Key、密钥生成、授权密钥、服务器加固（6 项）、fail2ban、客户端配置、防火墙、收尾
- [ ] 密钥生成在禁用密码登录之前（通过运行时检查保证：无密钥时 log_error 拒绝执行）
- [ ] sshd_config 修改前备份，修改后 `sshd -t` 验证，失败自动恢复
- [ ] 密钥生成幂等：已有密钥时跳过
- [ ] 查看本机公钥和诊断 SSH 配置为只读操作，不修改系统
- [ ] fail2ban 使用 `jail.local` 而非修改 `jail.conf`
- [ ] UFW 使用 `limit` 模式（带速率限制）而非 `allow`
- [ ] 所有脚本使用 `dot_sudo`、`log_*`、`return 1`，无 shebang
- [ ] `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 通过
- [ ] 重新生成 `dist/dot.sh` 后通过 `bash -n` 和 dry-run smoke

## 定义完成

- 测试已添加/更新（单元测试覆盖菜单结构、模板路径、生成脚本内容）
- Lint / typecheck / CI 全绿
- 文档已更新（README 中 Main Commands 部分）
- 生成的 `dist/dot.sh` 通过 `bash -n` 语法检查

## Out of Scope

- 非 apt 包管理器支持
- MFA / 2FA
- 端口敲门
- SSH CA 证书认证
- ssh-audit、mosh 等工具安装
- 云端安全组自动配置
- ssh-copy-id 自动化（需要交互密码）
