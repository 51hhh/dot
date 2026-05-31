# 项目架构分析

## 项目概况

- **源码**：853 行 TypeScript，11 个文件
- **测试**：711 行，10 个测试文件，75 个测试用例
- **覆盖率**：statements 97%, branches 84%, functions 100%, lines 98%
- **模板**：26 个 shell 模板文件（6 example + 20 tmux）
- **配置**：2 个 YAML 配置（example + tmux）

## 架构评估

### 优势
1. 模块边界清晰：loader → menu → deps → generator → output 单向数据流
2. Zod schema + 语义校验双重保障
3. 拓扑排序 + post phase 正确处理依赖关系
4. 测试覆盖充分，集成测试使用真实生成器
5. shell 转义和模板变量安全处理

### 当前局限
1. 只有 shell 输出格式
2. 模板只能是本地文件
3. 变量系统只支持字符串替换，无条件逻辑
4. 没有插件/包管理机制
5. 配置只能单文件，无法组合

## 关键数据流

```
YAML/JSON config
  → Zod parse + semantic validation
  → Interactive menu (or --select)
  → Dependency resolution + topo sort
  → Template rendering ({{var}} substitution)
  → Script assembly (header + sections + footer)
  → bash -n validation
  → Output .sh file
```
