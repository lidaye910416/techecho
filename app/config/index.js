// defineAppConfig wrapper - returns config directly since Taro 3.x handles it automatically
const defineAppConfig = (config) => config;

export default defineAppConfig({
  projectName: 'tech-echo-pro',
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  designWidth: 375, // SCSS 按 375px 设计稿编写，1px = 2rpx → 物理尺寸翻倍
  // 禁用 scope hoisting 修复 Taro + webpack5 循环依赖 TDZ 错误
  // Cannot access 'vi' before initialization / Cannot access 'R' before initialization
  mini: {
    webpackChain(chain) {
      chain.optimization.concatenateModules(false)
    }
  },
  defineConstants: {
    'process.env.TARO_APP_API_BASE': JSON.stringify('http://localhost:8001'),
  },
  pages: [
    'pages/index/index',
    'pages/news/news',
    'pages/read/read',
    'pages/mine/mine'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationStyle: 'custom',
    navigationBarBackgroundColor: '#1a1a2e',
    navigationBarTitleText: '科技回声',
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
})
