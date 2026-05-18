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

// 初始化微信云开发环境（仅在云托管模式下）
const USE_CLOUD = process.env.TARO_APP_USE_CLOUD === 'true'
const CLOUD_ENV = process.env.TARO_APP_CLOUD_ENV || ''

if (USE_CLOUD && typeof wx !== 'undefined' && wx.cloud && CLOUD_ENV) {
  wx.cloud.init({
    env: CLOUD_ENV,
    traceUser: true,
  })
}

export default App
