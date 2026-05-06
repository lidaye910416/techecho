// defineAppConfig wrapper - returns config directly since Taro 3.x handles it automatically
const defineAppConfig = (config) => config;

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
