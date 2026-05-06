# 微信小程序部署指南

## 准备工作

### 1. 安装微信小程序开发工具

下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

### 2. 添加小程序平台插件

```bash
cd app
npm install @tarojs/plugin-platform-weapp -D
```

### 3. 创建 TabBar 图标

微信小程序 TabBar 需要 PNG 格式图标（建议 81x81 像素）

需要创建以下图标文件：
```
app/src/assets/
├── home.png          # 首页图标
├── home-active.png   # 首页选中图标
├── news.png          # 资讯图标
├── news-active.png   # 资讯选中图标
├── mine.png          # 我的图标
└── mine-active.png   # 我的选中图标
```

**方式一**：使用在线工具将 SVG 转换为 PNG
- 上传 `home.svg` → 导出为 `81x81 PNG`

**方式二**：使用 ImageMagick
```bash
# 如果有 ImageMagick
convert -background none -resize 81x81 home.svg home.png
```

## 配置文件

### 1. 更新 project.config.json

```json
{
  "name": "tech-echo",
  "version": "1.0.0",
  "description": "科技资讯播报",
  "appid": "your_appid_here",
  "setting": {
    "urlCheck": false,
    "es6": true,
    "postcss": true,
    "minified": true
  },
  "compileType": "miniprogram",
  "srcMiniprogramRoot": "dist/",
  "condition": {}
}
```

### 2. 更新 config/index.js

移除 H5 模板配置（小程序不需要）：
```javascript
export default defineAppConfig({
  projectName: 'tech-echo-pro',
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  pages: [
    'pages/index/index',
    'pages/news/news',
    'pages/read/read',
    'pages/mine/mine'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1a1a2e',
    navigationBarTitleText: 'Tech Echo',
    navigationBarTextStyle: 'white'
  },
  tabBar: {
    color: '#86868B',
    selectedColor: '#007AFF',
    backgroundColor: '#1a1a2e',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/index/index', text: '首页', iconPath: 'assets/home.png', selectedIconPath: 'assets/home-active.png' },
      { pagePath: 'pages/news/news', text: '资讯', iconPath: 'assets/news.png', selectedIconPath: 'assets/news-active.png' },
      { pagePath: 'pages/mine/mine', text: '我的', iconPath: 'assets/mine.png', selectedIconPath: 'assets/mine-active.png' }
    ]
  }
})
```

## API 适配

### 小程序 API 配置

当前 `app/src/api/index.ts` 使用 `fetch`，需要适配小程序：

```typescript
// app/src/api/index.ts

const BASE_URL = 'https://your-server-domain.com'  // 后端 API 地址

// 小程序请求方法
function request(url: string, options?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + url,
      ...options,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else {
          reject(res)
        }
      },
      fail: reject
    })
  })
}

// 更新所有 API 调用
export async function getNewsList(params) {
  const query = new URLSearchParams()
  // ... 参数处理
  
  return request(`/api/news?${query}`)
}
```

## 构建步骤

### 1. 构建小程序

```bash
cd app
npm run build:weapp
```

构建产物在 `app/dist/` 目录

### 2. 导入开发者工具

1. 打开微信开发者工具
2. 点击「导入项目」
3. 选择 `app/dist/` 目录
4. 填写 AppID（需要到[微信公众平台](https://mp.weixin.qq.com/)注册）
5. 点击「确定」

### 3. 配置服务器域名

在微信公众平台 → 开发管理 → 开发设置 中添加：

- **request 合法域名**：`https://your-server-domain.com`
- **socket 合法域名**：（如需要）

## 后端部署

确保后端 API 可通过 HTTPS 访问：

```bash
# 服务器上启动后端
cd /path/to/project
PYTHONPATH=. nohup python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8001 > uvicorn.log 2>&1 &
```

## 目录结构

部署后的小程序结构：
```
dist/
├── app.js
├── app.json
├── app.wxss
├── pages/
│   ├── index/
│   ├── news/
│   ├── read/
│   └── mine/
├── components/
├── assets/
└── static/
```

## 常见问题

### Q: 提示 "不在合法域名列表中"
A: 确保在微信公众平台配置了服务器域名，并使用 HTTPS

### Q: TabBar 图标不显示
A: 确保使用 PNG 格式，尺寸为 81x81 像素

### Q: API 请求失败
A: 检查 BASE_URL 是否正确，确保后端已启动并可访问
