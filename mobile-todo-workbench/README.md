# Todo 工作台 Mobile

这是从原站点重建出的移动端优先版本，保留任务、今日任务、番茄钟、AI 助手、计划、备忘录、设置、游客模式和本地账号逻辑，并针对手机浏览做了新的壳层样式。

## 移动端改造

- 底部横向导航，适配安全区和小屏横向滑动。
- 顶部模块标题固定，新增按钮改为移动端浮动按钮。
- 任务表格在手机上重排为卡片，不需要横向拖动表格。
- 弹窗在手机上改为底部抽屉，表单控件使用更大的触控尺寸。
- 今日任务、备忘录、计划、AI 对话、设置页都做了单列和小屏排版。

## 本地预览

直接用浏览器打开 `index.html` 即可使用本地功能。若要测试 `/api/chat`，请通过 Cloudflare Pages 或兼容 Functions 的本地环境运行，并配置：

```bash
DEEPSEEK_API_KEY=你的 DeepSeek API Key
```

## 项目结构

```text
mobile-todo-workbench/
├── index.html
├── main.js
├── mobile.css
└── functions/
    └── api/
        └── chat.js
```
