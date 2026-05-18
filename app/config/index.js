// Taro 公共配置
const fs = require('fs');
const path = require('path');

// .env 文件在 app 目录下，不是 config 目录
const envFile = path.join(__dirname, '..', '.env');
let apiBase = 'http://localhost:8000';
let cloudEnv = 'prod-d9g7e5osy7b5e7a9c';  // 默认云托管配置
let cloudService = 'test1';

if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf-8');
  console.log('[Config] .env content:', content);

  // 读取 API_BASE
  const apiMatch = content.match(/^TARO_APP_API_BASE\s*=\s*(.+)$/m);
  if (apiMatch && apiMatch[1]) {
    apiBase = apiMatch[1].trim();
    console.log('[Config] API_BASE:', apiBase);
  }

  // 读取 CLOUD_ENV
  const envMatch = content.match(/^TARO_APP_CLOUD_ENV\s*=\s*(.+)$/m);
  if (envMatch && envMatch[1]) {
    cloudEnv = envMatch[1].trim();
    console.log('[Config] CLOUD_ENV:', cloudEnv);
  }

  // 读取 CLOUD_SERVICE
  const svcMatch = content.match(/^TARO_APP_CLOUD_SERVICE\s*=\s*(.+)$/m);
  if (svcMatch && svcMatch[1]) {
    cloudService = svcMatch[1].trim();
    console.log('[Config] CLOUD_SERVICE:', cloudService);
  }
} else {
  console.log('[Config] .env file not found at:', envFile);
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
  // 配置常量（从 .env 文件读取）
  defineConstants: {
    'process.env.TARO_APP_API_BASE': JSON.stringify(apiBase),
    'process.env.TARO_APP_CLOUD_ENV': JSON.stringify(cloudEnv),
    'process.env.TARO_APP_CLOUD_SERVICE': JSON.stringify(cloudService),
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
