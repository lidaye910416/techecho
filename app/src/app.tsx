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

// 是否使用云托管
const USE_CLOUD = process.env.TARO_APP_CLOUD_ENV !== '' && process.env.TARO_APP_CLOUD_SERVICE !== ''

if (USE_CLOUD && typeof wx !== 'undefined' && wx.cloud) {
  wx.cloud.init({
    env: process.env.TARO_APP_CLOUD_ENV,
    traceUser: true,
  })
}

export default App
