import { Component, PropsWithChildren } from 'react'
import './app.scss'

class App extends Component<PropsWithChildren> {
  componentDidMount() {}

  componentDidShow() {}

  componentDidHide() {}

  render() {
    return this.props.children
  }
}

// 初始化微信云开发环境
if (typeof wx !== 'undefined' && wx.cloud) {
  wx.cloud.init({
    env: 'prod-d9g7e5osy7b5e7a9c', // 云托管环境 ID
    traceUser: true,
  })
}

export default App
