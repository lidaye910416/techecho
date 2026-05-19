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

// 云托管配置（从编译时常量读取）
const CLOUD_ENV = process.env.TARO_APP_CLOUD_ENV || ''
const CLOUD_SERVICE = process.env.TARO_APP_CLOUD_SERVICE || ''

// 初始化云托管（仅在有配置时）
if (typeof wx !== 'undefined' && wx.cloud && CLOUD_ENV) {
  wx.cloud.init({
    env: CLOUD_ENV,
    traceUser: true,
  })
  console.log('[App] wx.cloud.init with env:', CLOUD_ENV)
}

export default App
