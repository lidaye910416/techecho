export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/news/news',
    'pages/read/read',
    'pages/mine/mine',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationStyle: 'custom',
    navigationBarBackgroundColor: '#0f0f1a',
    navigationBarTitleText: '科技回声',
    navigationBarTextStyle: 'white',
    backgroundColor: '#0f0f1a'
  },
  tabBar: {
    color: '#86868B',
    selectedColor: '#6366f1',
    backgroundColor: '#0f0f1a',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/home.png',
        selectedIconPath: 'assets/home-active.png'
      },
      {
        pagePath: 'pages/news/news',
        text: '收藏',
        iconPath: 'assets/fav.png',
        selectedIconPath: 'assets/fav-active.png'
      },
      {
        pagePath: 'pages/mine/mine',
        text: '我的',
        iconPath: 'assets/mine.png',
        selectedIconPath: 'assets/mine-active.png'
      }
    ]
  },
  permission: {
    'scope.userLocation': {
      desc: '你的位置信息将用于提供更好的新闻服务'
    }
  }
})
