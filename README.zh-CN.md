<h1 align="center">dot</h1>

<p align="center">
  终端环境交互式配置脚本。纯 Bash，单文件，无构建步骤，可测试。
</p>

<p align="center">
  <a href="https://github.com/51hhh/dot/actions">
    <img src="https://github.com/51hhh/dot/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

---

## 快速开始

```bash
# 交互式
bash <(curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/TMUX.sh)

# 经典管道写法 —— 同样可交互，因为按键读自 /dev/tty 而不是 stdin
curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/TMUX.sh | bash

# 先看再跑（推荐）
curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/TMUX.sh -o TMUX.sh
less TMUX.sh && bash TMUX.sh
```

非交互（CI、批量部署、重装机器）：

```bash
bash TMUX.sh --preset recommended --yes
```

> **要求 bash ≥ 4.2。** 脚本大量使用关联数组和 `declare -g`（后者是 4.2 引入的），
> 启动时会检查版本并给出提示。macOS 自带 bash 3.2，需要先 `brew install bash`。

## 没有构建产物，这是刻意的

`TMUX.sh` **本身就是产物** —— 你读到的文件就是跑起来的文件。

- **本地不需要生成任何东西。** `git clone && bash TMUX.sh`，没有第二步。
- **CI 不产出脚本。** 它只做验证：`bash -n`、脚本自带的 `--lint`、shellcheck、
  shfmt、172 个 bats 测试，以及在三个发行版容器里真实安装一遍。
  不上传 artifact、不写回分支、不提交 `dist/`。
- **下载链接就是仓库里的那个文件：**
  `https://raw.githubusercontent.com/51hhh/dot/master/TMUX.sh`

上一版架构确实有构建（TypeScript 把 YAML 配置和约 80 个模板片段拼成 `dist/dot.sh`，
再发布到一个网站）。那层间接正是它最痛的来源：下载到的东西没有人读过、
出 bug 要先去二分生成器而不是脚本本身、`curl | bash` 还得先指望整条流水线跑对。
去掉生成器就去掉了一整类故障 —— 所以「没有构建」不是缺功能，是主动砍掉的。

## 它做什么

`TMUX.sh` 交互式安装并配置 tmux：安装方式（apt / 源码编译 / 跳过）、前缀键、
8 个常用插件（TPM、sensible、yank、cpu、battery、Catppuccin、vim-tmux-navigator、
tmuxifier）、5 项基础配置（鼠标、Vi 复制模式、索引从 1 开始、直觉化分割键、
`prefix+r` 重载）、Nerd Font（自动下载安装 —— 没有它状态栏图标就是一排方框），
以及完整卸载。选「推荐配置」一个回车即展开为 21 个步骤。

## 架构

整个脚本是一条单向管道，四段之间只用**数据**衔接：

```
ASK  ──►  answers  ──►  PLAN  ──►  RUN
交互      纯 k=v 数据    纯函数     副作用
需要 TTY   可序列化      可测试     装包 / 写文件
```

关键在于 `answers` 只是一张普通的键值表：能存成文件，也能用 `--set` 从命令行喂进去。
于是：

- **计划是纯函数。** `build_plan` 只读 `answers`、只写 `PLAN` 数组，别的什么都不做 ——
  不输出、不碰磁盘。测「选了这些答案会做哪些事」不需要 TTY、不需要 root、
  不需要联网、不需要 Docker。毫秒级。
- **任何 bug 都能一条命令复现。** 用户把 `--save-answers` 出来的文件发过来，
  你 `--answers 那个文件 --dry-run` 得到完全一致的结果。不用再问「你当时点了什么」。

### 四个声明原语

产品逻辑全部集中在 §8，约 40 行。加功能改这里，引擎不动。

```bash
recipe "Tmux 一键配置" "安装方式、前缀键、插件、基础选项"

ask one  tmux.install "安装方式" --when tmux.profile=custom \
  apt:"包管理器安装（快，版本可能偏旧）" \
  source:"源码编译（最新版，需编译环境）" \
  skip:"已装好，跳过安装"

ask text tmux.source_version "要编译的 tmux 版本" \
  --when tmux.profile=custom --when tmux.install=source --default 3.4

step tmux.opt.mouse configure \
  --when tmux.profile!=uninstall --when tmux.options~mouse \
  --label "启用鼠标支持"

preset recommended --when tmux.profile=recommended \
  tmux.install=apt \
  tmux.plugins="tpm sensible yank cpu battery catppuccin vim-navigator tmuxifier"
```

| 原语 | 作用 |
| --- | --- |
| `recipe <标题> <描述>` | 每屏顶部的信息 |
| `ask one\|many\|text\|number <key> <提示> [--when E] [--default V] [k:描述...]` | 一个问题 ⇒ 一个 answers key |
| `step <id> <阶段> [--when E] [--label 文本]` | 一个步骤，函数体是 `step_<id>`（`.` 和 `-` 换成 `_`） |
| `preset <名字> [--when E] k=v...` | 一组答案；绝不覆盖用户显式选过的值 |

### 四个阶段，没有依赖图

```
prepare  →  install  →  configure  →  final
```

步骤在阶段内按声明顺序执行，阶段之间固定顺序。**没有拓扑排序、没有依赖边、
没有环检测。** 旧架构用 13 种依赖类型表达「TPM 初始化必须最后跑」，
新架构就是把它声明成 `final`。`prepare` / `install` 失败会中止后续；
`configure` / `final` 失败只告警并继续。

### `when`：四个算子，没有解析器

| 写法 | 含义 |
| --- | --- |
| `key=value` | 相等 |
| `key!=value` | 不等 —— **键未设置时成立**，这正是 `tmux.profile!=uninstall` 在什么都没答时也生效的原因 |
| `key~word` | 多选答案里的整词包含（`~tmux` 不会命中 `tmuxifier`） |
| `key` | 非空 |

不支持嵌套、没有 `and` / `or` 关键字、没有优先级。需要 AND 就**重复 `--when`**，
全部成立才算成立；需要 OR 就写两个 `step`。这比让阅读者在脑子里跑一遍布尔求值更便宜。

刻意**不提供**的能力：隐藏问题、提前结束流程。它们在这个模型里根本写不出来，
所以不需要写一条校验规则去禁止。

### 导航用 history 栈，不是 `索引 ± 1`

`when` 会让「可见问题列表」随答案变形：选 `custom` 有 5 个问题，
改成 `recommended` 只剩 1 个。按索引往回退会指向一个已经不存在的问题。
所以 `run_ask` 维护一个 `HIST` 栈，回退就是弹栈，然后重算可见列表。

回退**保留**已经答过的答案（改一个选项不用重答全部），但会撤销 `preset`
自动套用的值（`clear_preset_keys`）—— 否则从「推荐」退回去改「自定义」，
会带着八个你从没选过的插件。

## 命令行

| 参数 | 说明 |
| --- | --- |
| `--preset <名字>` | 套用预设 |
| `--set k=v` | 设置单个答案；出现得越晚优先级越高，可覆盖 `--preset`。未声明的 key、或选项题给了未声明的值，都直接报错 |
| `--answers <文件>` | 从文件读答案（支持 `#` 注释与空行） |
| `--save-answers <文件>` | 把最终答案写出来，用于复现与提 issue |
| `--only <步骤id>` | 只执行指定步骤，可重复；保留原计划顺序 |
| `--dry-run` | 只打印计划，不执行任何步骤 |
| `--list` | 列出全部问题与步骤及其 `when` 条件，以及下载源的尝试顺序 |
| `--lint` | 检查声明是否自洽（执行前也会自动跑一次） |
| `--mirror <前缀>` | 追加一个 GitHub 镜像前缀 |
| `-y, --yes` | 跳过确认页 |

### 调试工作流

```bash
# 1. 报告者导出答案
bash TMUX.sh --save-answers bug.txt

# 2. 你本地看它到底会做什么 —— 不动任何东西
bash TMUX.sh --answers bug.txt --dry-run

# 3. 只跑可疑的那一步
bash TMUX.sh --answers bug.txt --only tmux.status.catppuccin
```

## 测试

```bash
./run-tests.sh          # 全部
./run-tests.sh lint     # bash -n + --lint + shellcheck
./run-tests.sh bats     # 行为测试
./run-tests.sh fmt      # shfmt 就地格式化
```

本机有 `shellcheck` / `shfmt` / `bats` 就直接用，没有则回落到 Docker 镜像。
172 个 bats 测试分六层：

| 文件 | 测什么 | 需要 |
| --- | --- | --- |
| `tests/when.bats` | 四个算子的真值表 + AND 组合 | 无 |
| `tests/plan.bats` | 答案 → 计划：阶段顺序、预设、互斥 | 无 |
| `tests/conf.bats` | 生成的 `~/.tmux.conf` 内容与幂等性 | 临时 HOME |
| `tests/cli.bats` | 参数解析、退出码、`curl \| bash`、lint 反例 | 无 |
| `tests/ask.bats` | 交互导航，按键经 `DOT_INPUT_FD` 注入 | 无 |
| `tests/run.bats` | 各阶段的失败策略、镜像回落顺序、字体跳过判断 | 无 |

只有 `conf.bats` 碰文件系统，且全在 `$BATS_TEST_TMPDIR` 里。
交互测试不需要 pty —— 按键从一个普通 fd 喂进去：

```bash
exec 7< <(printf '\033[B\n')      # 下移一次 + 回车
DOT_INPUT_FD=7 bash TMUX.sh --save-answers out.txt
```

这里的回车是 `\n` 而不是 `\r`：真终端会替我们把 CR 转成 LF（`ICRNL`），
普通 fd 不会。`read_key` 现在也认 `\r`，两种都能跑 ——
但测试统一用 `\n`，因为那才是终端实际送进来的字节。

## 文件结构

```
TMUX.sh          # 全部实现，按 §1..§11 分节
├─ §1  core      # 版本闸门、颜色、日志、sudo
├─ §2  tty       # 输入探测、单一读取路径、光标控制
├─ §3  registry  # Q / S / ANS 三张表与注册函数
├─ §4  ask       # history 栈导航、四种问题渲染
├─ §5  plan      # when 求值、build_plan（纯）、warn_answers
├─ §6  run       # 按阶段执行、失败策略、结果汇总
├─ §7  net       # GitHub 镜像回落、curl/wget 与 git clone 回落
├─ §8  declare   # ★ 产品逻辑全在这里：问题、预设、步骤
├─ §9  steps     # 每个步骤一个 step_* 函数
├─ §10 lint      # 声明自检
└─ §11 cli       # 参数解析与 main
tests/*.bats     # 六层测试
run-tests.sh     # 本地 / Docker 测试入口
```

分节编号与将来可能的 `lib/` 拆分一一对应。目前保持单文件，
因为 `curl | bash` 是主要分发方式 —— 多文件就得先打包再合并，
而那正是上一版架构复杂度的来源。

## 加一个新配方

以 zsh 为例，只需要动两处：

1. **§8 declare** —— `ask` 出问题、`step` 出步骤、`preset` 出推荐组合。
2. **§9 steps** —— 每个步骤写一个 `step_<id>` 函数。

然后 `--lint` 会告诉你：`when` 有没有引用未声明的 key、`step` 有没有缺函数体、
阶段名有没有写错。计划层的测试基本照抄 `plan.bats` 的模式。

> 旧架构里的 zsh（23 个片段）与 ssh（25 个片段）脚本保存在提交 `16d6670`，
> 移植时可以直接取用：`git show 16d6670:templates/zsh/zshrc-recommended.sh`

## 安全说明

- 安装 tmux 需要 `sudo`。只在必需的步骤调用，且统一走 `dot_sudo` 这一个入口 ——
  `grep dot_sudo TMUX.sh` 能看全部用法。
- 覆盖 `~/.tmux.conf` 之前会备份为 `~/.tmux.conf.bak.<时间戳>`。
- `--mirror` / `DOT_GITHUB_MIRRORS` 引入的镜像是**第三方信任根**，
  脚本不做校验和或签名验证。默认直连 GitHub，镜像严格需要显式开启；
  `--list` 会按尝试顺序把下载源打出来。
- 联网只发生在三个 GitHub 项目上：`tmux/tmux`（源码编译）、
  `tmux-plugins/tpm`（插件）、`ryanoasis/nerd-fonts`（字体）。
- 唯一的大流量步骤是字体：nerd-fonts 按字体族发包，zip 上百 MB 没得挑。
  但只解出等宽的常规四款（约 20 MB，而非整包 233 MB），装过之后再跑就直接跳过，
  而且它在 `final` 阶段 —— GitHub 限速不会让刚生成好的 tmux 配置作废。
  不想装就 `--set tmux.font=skip`。
- `Ctrl-C` 是真的停：恢复光标并以 130 退出，不会接着跑下一个步骤。
- `--dry-run` 保证零副作用。不确定时先跑它。
