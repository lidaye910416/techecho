// Taro 公共配置
const fs = require('fs');
const path = require('path');

// 自动读取 app/.env 文件获取 API 地址
let apiBase = process.env.TARO_APP_API_BASE || 'http://localhost:8000';

try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf-8');
    const match = content.match(/^TARO_APP_API_BASE\s*=\s*(.+)$/m);
    if (match && match[1]) {
      apiBase = match[1].trim();
    }
  }
} catch (e) {
  // 读取失败时使用默认值
}

module.exports = {
  projectName: 'aiyinbi-pro',
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  designWidth: 375,
  // 禁用 scope hoisting 修复 Taro + webpack5 循环依赖 TDZ 错误
  mini: {
    webpackChain(chain) {
      chain.optimization.concatenateModules(false)
    }
  },
  // API 地址从 app/.env 文件读取（已被 .gitignore 保护）
  defineConstants: {
    'process.env.TARO_APP_API_BASE': JSON.stringify(apiBase),
  },
  pages: [
    'pages/index/index',
    'pages/news/news',
    'pages/mine/mine'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationStyle: 'custom',
    navigationBarBackgroundColor: '#1a1a2e',
    navigationBarTitleText: 'AI回音壁',
    navigationBarTextStyle: 'white'
  },
  tabBar: {
    color: '#86868B',
    selectedColor: '#6366f1',
    backgroundColor: '#0f0f1a',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/index/index', text: '首页', iconPath: 'assets/home.png', selectedIconPath: 'assets/home-active.png' },
      { pagePath: 'pages/news/news', text: '收藏', iconPath: 'assets/fav.png', selectedIconPath: 'assets/fav-active.png' },
      { pagePath: 'pages/mine/mine', text: '我的', iconPath: 'assets/mine.png', selectedIconPath: 'assets/mine-active.png' }
    ]
  }
}
