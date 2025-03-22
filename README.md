# Domain Explainer Chrome插件

这是一个Chrome插件，用于在semrush.com的域名排名页面为每个域名添加解释说明。

## 功能特点

- 自动识别页面中的域名
- 调用OpenAI API获取域名解释
- 实时显示域名说明
- 支持页面滚动时动态加载新域名

## 目录结构

```
WhatDoesItDo/
├── extension/           # Chrome插件前端代码
│   ├── manifest.json   # 插件配置文件
│   ├── content.js     # 内容脚本
│   ├── background.js  # 后台脚本
│   └── popup.html     # 弹出界面
└── backend/            # 后端服务代码
    ├── app.py         # Flask后端服务
    ├── requirements.txt # Python依赖
    └── README.md      # 说明文档
```

## 安装说明

### 后端服务

1. 进入backend目录
2. 创建并激活Python虚拟环境（推荐）
3. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```
4. 设置OpenAI API密钥：
   ```bash
   export OPENAI_API_KEY='你的OpenAI API密钥'
   ```
5. 启动服务：
   ```bash
   python app.py
   ```

### Chrome插件

1. 打开Chrome浏览器
2. 访问 chrome://extensions/
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择extension目录

## 使用说明

1. 安装并启动后端服务
2. 安装Chrome插件
3. 访问semrush.com的域名排名页面
4. 插件会自动为页面上的域名添加解释说明
5. 滚动页面时，新出现的域名会自动获取解释

## 注意事项

- 需要有效的OpenAI API密钥
- 后端服务默认运行在 http://localhost:5000
- 确保Chrome插件有权限访问semrush.com 