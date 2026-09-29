# BenchLocal 主题

BenchLocal 通过 JSON 文件支持内置主题与用户自定义主题。

用户主题应放置在：

`~/.benchlocal/themes/`

主题文件结构：

```json
{
  "schemaVersion": 1,
  "id": "my-theme",
  "name": "My Theme",
  "colorScheme": "light",
  "variables": {
    "--bg": "#f1f2f4",
    "--ink": "#1f2937",
    "--accent": "#2563eb"
  }
}
```

创建自定义主题最简单的方式是：复制本目录中的某个内置主题 JSON 文件，然后修改其中的变量值。
