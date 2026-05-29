# dot

交互式系统配置脚本生成框架。通过 YAML 定义菜单树，数字选择交互，自动生成完整的 `.sh` 配置脚本。

## 特性

- 任意层级嵌套菜单（YAML 定义）
- 数字选择 + 多选 + 范围选择（如 `1,3,5` 或 `1-3`）
- 依赖自动解析 + 拓扑排序
- `{{variable}}` 模板变量替换
- `bash -n` 语法校验
- 生成可直接 `wget` 运行的完整 `.sh` 脚本

## 快速开始

```bash
npm install
npm run build
node dist/index.js --config configs/example.yaml
```

## 配置文件格式

```yaml
name: "我的配置"
version: "1.0"
description: "一键配置开发环境"

output:
  filename: "setup.sh"
  dir: "dist"

vars:
  global_var: "value"

menu:
  - id: "category"
    label: "分类名称"
    children:
      - id: "tool-a"
        label: "安装工具 A"
        description: "工具 A 的说明"
        script: "templates/tool-a.sh"
        deps: ["tool-b"]
        vars:
          version: "1.0"
      - id: "tool-b"
        label: "安装工具 B"
        script: "templates/tool-b.sh"
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识 |
| `label` | 是 | 菜单显示文本 |
| `description` | 否 | 菜单项描述 |
| `script` | 否 | 模板脚本路径（叶子节点） |
| `deps` | 否 | 依赖项 id 列表 |
| `vars` | 否 | 模板变量，覆盖全局变量 |
| `children` | 否 | 子菜单（支持任意嵌套） |

## CLI 参数

```
dot --config <path>       # 配置文件路径 (YAML/JSON)
    --output <path>       # 输出脚本路径（覆盖配置中的 output）
    --dry-run             # 打印到 stdout，不写文件
```

## 模板语法

脚本模板中使用 `{{variable}}` 插入变量：

```bash
echo "Installing version {{version:latest}}"
```

`:` 后为默认值，当变量未定义时使用。

## 项目结构

```
dot/
├── src/                    # TypeScript 源码
│   ├── index.ts            # CLI 入口
│   ├── loader/             # 配置加载 + Schema 校验
│   ├── menu/               # 菜单渲染 + 导航
│   ├── generator/          # 脚本拼装 + 模板 + 校验
│   └── utils/              # 依赖解析 + 终端颜色
├── configs/                # 配置文件
├── templates/              # Shell 模板片段
└── dist/                   # 编译产物 + 生成脚本
```

## License

MIT
