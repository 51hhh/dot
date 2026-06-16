# 增强约束验证 - 实现总结

**日期**: 2026-06-16  
**状态**: 已实现并测试通过

---

## 📊 实现的约束检查

### ✅ 已实现（6项）

1. **Bash 保留字冲突检测**
   - 检查节点 ID 是否与 37 个 Bash 保留字冲突
   - 防止生成的脚本出现语法错误
   - 错误级别：Error（阻止加载）

2. **最大嵌套深度限制**
   - 默认限制：10 层
   - 防止栈溢出和过度复杂的菜单结构
   - 错误级别：Error

3. **循环依赖预检测**
   - 在配置加载阶段使用 DFS 检测循环
   - 提供完整依赖链和循环路径
   - 比原来的运行时检测更早、更清晰
   - 错误级别：Error

4. **未知依赖检测（增强）**
   - 保留原有检查
   - 增强错误信息：提供修复建议
   - 错误级别：Error

5. **Post 节点依赖约束（增强）**
   - 保留原有检查
   - 增强错误信息：提供明确修复方案
   - 错误级别：Error

6. **Hidden 节点被依赖（警告）**
   - 检测 hidden 节点是否被其他节点依赖
   - 降级为警告（这是合法的设计模式）
   - 错误级别：Warning

### 🔜 暂时禁用（2项）

7. **脚本路径存在性验证**
   - 已实现但暂时禁用
   - 原因：需要处理相对路径解析问题
   - 计划：修复后重新启用

8. **模板变量一致性检查**
   - 已实现但暂时禁用
   - 检查 `{{var}}` 是否在 `vars` 或 `prompt.var` 中声明
   - 计划：完善正则匹配后启用

---

## 🎯 错误信息改进

### Before (旧版)
```
Error: Menu item "a" depends on unknown item "b"
```

### After (新版)
```
Error: Menu item "a" depends on unknown item "b"
  Check for typos or ensure "b" is defined in the config.
```

### 循环依赖（新增）
```
Error: Circular dependency detected:
  Dependency chain: a → b
  Cycle: b → a → b
  Fix: Remove one of the dependencies in the cycle to break it.
```

---

## 📁 文件变更

### 新增文件
- `src/loader/validators.ts` (180 行) - 验证器函数集合

### 修改文件
- `src/loader/loader.ts` (+89 行) - 集成所有验证器
- `tests/cli.test.ts` (+3 行) - 更新测试期望

---

## ✅ 测试结果

```bash
Test Files  11 passed (11)
Tests      151 passed (151)
Duration   2.24s
```

**关键测试**:
- ✅ 循环依赖检测：现在在 loader 阶段捕获（exit code 1）
- ✅ 所有现有测试适配新行为
- ✅ 无回归

---

## 🔍 验证器设计

### 分离关注点
```
loader.ts (协调)
    ↓
validators.ts (纯函数)
    ↓
返回违规列表，不抛异常
```

### 可扩展性
- 每个验证器独立
- 易于添加新检查
- 易于调整严重级别（Error → Warning）

---

## 📋 待完成（下一步）

1. **启用脚本路径检查**
   - 修复 `path.resolve` 对 undefined 的处理
   - 测试相对路径场景

2. **启用模板变量检查**
   - 改进变量提取正则
   - 考虑 Bash 变量引用语法（`$VAR`, `${VAR}`）

3. **添加新约束**
   - ID 命名规范（长度限制、特殊字符）
   - 依赖深度限制（防止过长依赖链）
   - 变量名冲突检测

---

## 🚀 使用示例

### 检测循环依赖
```yaml
menu:
  - id: a
    deps: [b]
  - id: b
    deps: [a]
```
**结果**:
```
Error: Circular dependency detected:
  Dependency chain: a → b
  Cycle: b → a → b
  Fix: Remove one of the dependencies in the cycle to break it.
```

### Bash 保留字冲突
```yaml
menu:
  - id: if  # ✗ Bash 保留字
```
**结果**:
```
Error: Menu item IDs conflict with Bash reserved words: if
  Rename these IDs to avoid shell scripting issues.
```

### Hidden 节点被依赖（警告）
```yaml
menu:
  - id: header
    hidden: true
  - id: action
    deps: [header]  # 合法但会警告
```
**结果**:
```
⚠️  Warning: Hidden nodes are being depended on: "action" → "header"
   Hidden nodes as shared dependencies is valid, but consider if they should be visible.
```

---

## 🎓 经验教训

1. **合法的边缘案例**: Hidden 节点作为共享依赖是合法的设计模式
2. **验证时机**: 越早检测越好（loader > planner > runtime）
3. **错误质量**: 提供依赖链和修复建议比简单报错更有用
4. **渐进式启用**: 从 Error 到 Warning 降级，避免破坏现有配置

---

*实现 by: Claude Opus 4.7*  
*Date: 2026-06-16*
