# Schema 约束规范

本文档描述 dot 项目的 YAML 配置约束规则。

## 核心原则

dot 的配置模型基于以下原则：
1. **明确的层次结构**：每个节点必须明确其角色（容器/选项/动作）
2. **强类型约束**：通过 mode 声明节点行为
3. **清晰的依赖关系**：deps 用于表达执行顺序

---

## 约束规则

### 1. Flow 节点必须有 children

**规则**：`mode: flow` 的节点必须包含至少一个子节点。

**原因**：Flow 表示线性工作流，没有子节点的 flow 是无意义的。

```yaml
# ❌ 错误：flow 节点没有 children
- id: tmux-setup
  label: Tmux 配置流程
  mode: flow
  # 缺少 children

# ✅ 正确：flow 节点有 children
- id: tmux-setup
  label: Tmux 配置流程
  mode: flow
  children:
    - id: install
      label: 安装
      script: install.sh
```

---

### 2. 叶子节点必须有可执行内容

**规则**：没有 children 的节点必须有 `script` 或 `prompt`，除非它是 `hidden` 节点或容器节点。

**原因**：叶子节点是实际执行单元，必须定义要做什么。

```yaml
# ❌ 错误：叶子节点既没有 script 也没有 prompt
- id: install-tmux
  label: 安装 Tmux
  # 缺少 script 或 prompt

# ✅ 正确：叶子节点有 script
- id: install-tmux
  label: 安装 Tmux
  script: ../templates/tmux/install-apt.sh

# ✅ 正确：叶子节点有 prompt
- id: custom-prefix
  label: 自定义前缀键
  prompt:
    type: key
    var: prefix_key
    label: 按下前缀键

# ✅ 正确：hidden 节点可以没有 script
- id: tmux-header
  label: 配置文件头
  hidden: true
```

---

### 3. 父节点应该声明 mode

**规则**：包含 children 的节点应该明确声明 `mode`（single/multi/flow）。

**原因**：mode 定义了子节点的选择行为，显式声明避免歧义。

```yaml
# ⚠️ 警告：父节点没有声明 mode
- id: tmux-plugins
  label: 插件管理
  children:
    - id: plugin-a
      label: 插件 A
      script: plugin-a.sh

# ✅ 正确：父节点声明 mode
- id: tmux-plugins
  label: 插件管理
  mode: multi  # 明确声明为多选
  children:
    - id: plugin-a
      label: 插件 A
      script: plugin-a.sh
    - id: plugin-b
      label: 插件 B
      script: plugin-b.sh
```

**Mode 语义**：
- `single`: 单选，用户必须从 children 中选择一个
- `multi`: 多选，用户可以勾选 0~N 个
- `flow`: 线性流程，按顺序执行所有步骤

---

### 4. endFlow 不能用于 flow 容器

**规则**：`mode: flow` 的节点不能设置 `endFlow: true`。

**原因**：endFlow 用于 flow 内部的子节点提前结束流程，flow 容器本身不能结束自己。

```yaml
# ❌ 错误：flow 容器设置了 endFlow
- id: tmux-setup
  label: Tmux 配置
  mode: flow
  endFlow: true  # ❌ 不允许
  children: [...]

# ✅ 正确：endFlow 用于 flow 内部的子节点
- id: tmux-setup
  label: Tmux 配置
  mode: flow
  children:
    - id: install-recommended
      label: 推荐配置
      script: recommended.sh
      endFlow: true  # ✅ 选择此项后结束流程
    - id: install-custom
      label: 自定义配置
      script: custom.sh
```

---

### 5. Post 节点不应该有 children

**规则**：`post: true` 的节点不应该包含子节点。

**原因**：Post 节点是后置收尾步骤，应该是简单的叶子动作。

```yaml
# ❌ 错误：post 节点有 children
- id: finalize
  label: 收尾
  post: true
  children:  # ❌ 不推荐
    - id: cleanup
      label: 清理
      script: cleanup.sh

# ✅ 正确：post 节点是叶子节点
- id: finalize
  label: 收尾
  post: true
  script: finalize.sh
```

---

## 最佳实践

### 软件包结构推荐

**向导模式（Tmux）**：
```yaml
- id: tmux
  label: Tmux 终端复用器
  mode: flow  # 线性向导
  children:
    - id: install
      label: 安装方式
      mode: single
      children: [apt, source]
    
    - id: configure
      label: 配置
      mode: multi
      children: [prefix, plugins, statusbar]
    
    - id: finalize
      label: 收尾
      post: true
      script: final-notes.sh
```

**工具箱模式（SSH）**：
```yaml
- id: ssh
  label: SSH 工具箱
  mode: multi  # 可以选择多个工具
  children:
    - id: diagnose
      label: 诊断配置
      script: diagnose.sh
    
    - id: keygen
      label: 生成密钥
      mode: single
      children: [ed25519, rsa]
    
    - id: hardening
      label: 服务器加固
      mode: multi
      children: [disable-password, custom-port, ...]
```

---

## 验证工具

运行以下命令检查配置是否符合约束：

```bash
# 验证配置
npm run build

# 查看详细的验证计划
node dist/index.js plan --config configs/dot.yaml
```

约束违规会在构建时报错，错误信息会指出具体的问题节点和违规原因。
