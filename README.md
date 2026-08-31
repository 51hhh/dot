<h1 align="center">dot</h1>

<p align="center">
  终端环境一键配置脚本 —— 纯 Bash，单文件，可测试。
</p>

<p align="center">
  <a href="https://github.com/51hhh/dot/actions">
    <img src="https://github.com/51hhh/dot/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
</p>

---

## 快速开始

```bash
# 交互式（推荐首次使用）
bash <(curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/TMUX.sh)

# 或者先下载再看一眼，再执行
curl -fsSL https://raw.githubusercontent.com/51hhh/dot/master/TMUX.sh -o TMUX.sh
less TMUX.sh
bash TMUX.sh
```

非交互（CI、批量部署、重装机器）：

```bash
bash TMUX.sh --preset recommended --yes
```

> **要求：bash ≥ 4.2。** 脚本大量使用关联数组和 `declare -g`（后者是 4.2 引入的），
> 启动时会检查版本并给出提示。macOS 自带 bash 3.2，需要 `brew install bash`。

## 它做什么

`TMUX.sh` 交互式安装并配置 tmux：安装方式（apt / 源码编译 / 跳过）、前缀键、
8 个常用插件（TPM、sensible、yank、cpu、battery、Catppuccin、vim-tmux-navigator、tmuxifier）、
5 项基础配置（鼠标、Vi 复制模式、索引从 1、直觉化分割键、prefix+r 重载），
以及完整卸载。选「推荐配置」则一步到位，展开为 20 个步骤。

## 架构

整个脚本是一条单向管道，四段之间只用**数据**衔接：

```
ASK  ──►  answers  ──►  PLAN  ──►  RUN
交互      纯 k=v 数据    纯函数     副作用
需要 TTY   可序列化      可测试     装包 / 写文件
```

关键在于 `answers` 这个中间层。它是一张 `key=value` 表，能存成文件、能用 `--set`
从命令行喂进去。于是：

- **计划是纯函数。** `build_plan` 只读 `answers`、只写 `PLAN` 数组，不输出、不碰磁盘。
  测「选了这些答案会做哪些事」不需要 TTY、不需要 root、不需要联网、不需要 Docker，毫秒级。
- **任何 bug 都能一条命令复现。** 用户把 `--save-answers` 出来的文件发过来，
  你 `--answers that-file --dry-run` 就得到一模一样的计划。不用再问「你当时点了什么」。

### 五个声明原语

产品逻辑全部集中在 §8「声明」一节，约 40 行。加功能改这里，不动引擎。

```bash
recipe "Tmux 一键配置" "安装方式、前缀键、插件、基础选项"

ask one  tmux.install "安装方式" --when tmux.profile=custom \
  apt:"包管理器安装（快，版本可能偏旧）" \
  source:"源码编译（最新版，需编译环境）" \
  skip:"已装好，跳过安装"

ask text tmux.source_version "要编译的 tmux 版本" \
  --when tmux.install=source --default 3.4

step tmux.opt.mouse configure \
  --when tmux.profile!=uninstall --when tmux.options~mouse \
  --label "启用鼠标支持"

preset recommended --when tmux.profile=recommended \
  tmux.install=apt \
  tmux.plugins="tpm sensible yank cpu battery catppuccin vim-navigator tmuxifier"
```

| 原语 | 作用 |
| --- | --- |
| `recipe <标题> <描述>` | 首屏信息 |
| `ask one\|many\|text\|number <key> <提示> [--when E] [--default V] [k:描述...]` | 一个问题 = 一个 answers key |
| `step <id> <阶段> [--when E] [--label 文本]` | 一个步骤，函数体是 `step_<id>`（点和横线换成下划线） |
| `preset <名字> [--when E] k=v...` | 一组答案，不覆盖用户已显式给出的值 |

### 四个阶段，没有依赖图

```
prepare  →  install  →  configure  →  final
```

步骤在阶段内按声明顺序执行，阶段之间固定顺序。**没有拓扑排序、没有依赖边、没有环检测。**
旧架构用 13 种依赖类型表达「TPM 初始化必须最后跑」，新架构就是把它声明成 `final`。
`prepare` / `install` 里的步骤失败会中止后续；`configure` / `final` 失败只告警并继续。

### `when` 表达式：四个算子，没有解析器

| 写法 | 含义 |
| --- | --- |
| `key=value` | 相等 |
| `key!=value` | 不等（**键不存在时成立**，所以 `tmux.profile!=uninstall` 对未作答也生效） |
| `key~word` | 多选题按整词包含（`tmuxifier` 不会被 `~tmux` 命中） |
| `key` | 非空 |

不支持嵌套、不支持 `and` / `or` 关键字、没有优先级。需要 AND 就**重复 `--when`**，
全部成立才算成立。需要 OR 就写两个 `step`——这比让阅读者在脑子里跑一遍布尔求值更便宜。

刻意**不提供**的能力：隐藏问题、提前结束流程。它们在这个模型里根本无法表达，
所以不需要写校验去禁止。

### 导航用 history 栈，不是索引 ±1

因为 `when` 会让「可见问题列表」随答案变化：选 `custom` 有 5 个问题，
改成 `recommended` 只剩 1 个。用索引往回退会指向一个已经不存在的问题。
所以 `run_ask` 维护一个 `HIST` 栈，回退就是弹栈，然后重新计算可见列表。

回退**保留**已答的答案（这样改完一个选项不用重答全部），但会撤销
`preset` 自动套用的值（`clear_preset_keys`），否则从「推荐」退回去改成「自定义」
会带着一堆你没选过的插件。

## 命令行

| 参数 | 说明 |
| --- | --- |
| `--preset <名字>` | 套用预设答案 |
| `--set k=v` | 单独设置一个答案（在 argv 里出现得越晚优先级越高，可覆盖 `--preset`） |
| `--answers <文件>` | 从文件读答案（支持 `#` 注释与空行） |
| `--save-answers <文件>` | 把最终答案写出来，用于复现与提 issue |
| `--only <步骤id>` | 只跑指定步骤，可重复；保留原计划顺序 |
| `--dry-run` | 只打印计划，不执行任何副作用 |
| `--list` | 列出全部问题与步骤及其 `when` 条件 |
| `--lint` | 自检声明（执行前会自动跑一次） |
| `--mirror <前缀>` | 追加一个 GitHub 镜像前缀 |
| `-y, --yes` | 跳过确认页 |

### 调试工作流

```bash
# 1. 用户复现问题后导出答案
bash TMUX.sh --save-answers bug.txt

# 2. 你本地看它会做什么 —— 不动系统
bash TMUX.sh --answers bug.txt --dry-run

# 3. 只跑可疑的那一步
bash TMUX.sh --answers bug.txt --only tmux.status.catppuccin
```

## 测试

```bash
./run-tests.sh          # 全部
./run-tests.sh lint     # bash -n + --lint + shellcheck
./run-tests.sh bats     # 行为测试
./run-tests.sh fmt      # shfmt 格式检查
```

本地有 `shellcheck` / `shfmt` / `bats` 就直接用，没有则回落到 Docker 镜像。
128 个 bats 测试分五层：

| 文件 | 测什么 | 需要 |
| --- | --- | --- |
| `tests/when.bats` | 四个算子的真值表 + AND 组合 | 无 |
| `tests/plan.bats` | 答案 → 计划，阶段顺序、预设、互斥 | 无 |
| `tests/conf.bats` | 生成的 `~/.tmux.conf` 内容与幂等性 | 临时 HOME |
| `tests/cli.bats` | 参数解析、错误退出码、lint 反例 | 无 |
| `tests/ask.bats` | 交互导航，靠 `DOT_INPUT_FD` 注入按键 | 无 |

只有 `conf.bats` 碰文件系统，且全在 `$BATS_TEST_TMPDIR` 里。
交互测试通过 `DOT_INPUT_FD` 把按键序列从一个普通 fd 喂进去，不需要 pty：

```bash
exec 7< <(printf '\033[B\r')      # 下移一次 + 回车
DOT_INPUT_FD=7 bash TMUX.sh --save-answers out.txt
```

## 文件结构

```
TMUX.sh          # 全部实现，按 §1..§11 分节
├─ §1  core      # 版本闸门、颜色、日志、sudo
├─ §2  tty       # 输入探测、单一读取路径、光标控制
├─ §3  registry  # Q / S / ANS 关联数组与注册函数
├─ §4  ask       # history 栈导航、四种问题渲染
├─ §5  plan      # when 求值、build_plan（纯）、warn_answers
├─ §6  run       # 按阶段执行、失败策略、结果汇总
├─ §7  net       # GitHub 镜像回落、curl/wget 与 git clone 回落
├─ §8  declare   # ★ 产品逻辑全在这里（问题、预设、步骤声明）
├─ §9  steps     # 每个 step_* 函数体
├─ §10 lint      # 声明自检
└─ §11 cli       # 参数解析与 main
tests/*.bats     # 五层测试
run-tests.sh     # 本地/Docker 测试入口
```

分节编号与将来可能的 `lib/` 拆分一一对应。目前保持单文件，因为
`curl | bash` 是主要分发方式——多文件就得先打包再合并，那正是上一版架构复杂度的来源。

## 加一个新配方

以 zsh 为例，需要动两处：

1. **§8 声明**：`ask` 出问题、`step` 出步骤、`preset` 出推荐组合。
2. **§9 实现**：为每个 step 写 `step_<id>` 函数。

然后 `--lint` 会告诉你有没有引用未声明的 key、有没有 step 缺函数体、
有没有写错阶段名。计划层的测试基本靠复制 `plan.bats` 的模式。

> 旧架构里的 zsh（23 个模板）与 ssh（25 个模板）脚本片段保存在提交 `16d6670`，
> 移植时可以直接取用：`git show 16d6670:templates/zsh/zshrc-recommended.sh`

## 安全说明

- 安装 tmux、写 `/etc` 之外的配置需要 `sudo`，脚本只在必要的步骤调用，
  且都经过 `dot_sudo` 这一个入口，`grep dot_sudo TMUX.sh` 能看全。
- 覆盖 `~/.tmux.conf` 前会备份为 `~/.tmux.conf.bak.<时间戳>`。
- `--mirror` / `DOT_GITHUB_MIRRORS` 引入的镜像是**第三方信任根**，
  脚本不做校验和/签名验证。默认直连 GitHub，镜像需显式开启。
- `--dry-run` 保证零副作用，不确定时先跑它。
