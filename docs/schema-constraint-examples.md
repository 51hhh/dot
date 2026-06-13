# Schema 约束验证示例

本文件包含一些违反约束的示例，用于测试验证是否生效。

## 示例 1：Flow 节点没有 children

```yaml
- id: bad-flow
  label: "错误的 Flow"
  mode: flow
  # 缺少 children - 违反约束 1
```

**预期错误**：
```
Flow node "bad-flow" must have children. Flow mode requires at least one child node to create a sequential workflow.
```

## 示例 2：叶子节点没有 script

```yaml
- id: bad-leaf
  label: "错误的叶子节点"
  # 缺少 script 或 prompt - 违反约束 2
```

**预期错误**：
```
Leaf node "bad-leaf" must have a script or prompt. Nodes without children should define executable content unless they are hidden or container nodes.
```

## 示例 3：父节点没有 mode

```yaml
- id: bad-parent
  label: "错误的父节点"
  children:
    - id: child1
      label: "子节点"
      script: test.sh
  # 缺少 mode - 违反约束 3
```

**预期错误**：
```
Parent node "bad-parent" should specify a mode (single/multi/flow) to define how children are selected.
```

## 示例 4：Flow 容器设置 endFlow

```yaml
- id: bad-endflow
  label: "错误的 endFlow"
  mode: flow
  endFlow: true  # 违反约束 4
  children:
    - id: step1
      label: "步骤 1"
      script: step1.sh
```

**预期错误**：
```
Node "bad-endflow" cannot have endFlow=true when it is itself a flow container. Only child nodes within a flow can end the flow.
```

## 示例 5：Post 节点有 children

```yaml
- id: bad-post
  label: "错误的 Post 节点"
  post: true
  children:  # 违反约束 5
    - id: child
      label: "子节点"
      script: test.sh
```

**预期错误**：
```
Post node "bad-post" should not have children. Post nodes are finalization steps and should be leaf actions.
```

## 验证方法

```bash
# 运行构建命令，会自动验证
npm run build

# 或直接运行 plan 命令
node dist/index.js plan --config your-config.yaml
```

所有约束错误会在加载配置时立即报告。
