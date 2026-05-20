module.exports = {
  env: {
    NODE_ENV: '"production"',
  },
  defineConstants: {
    // API 基础地址（云托管公网访问）
    'process.env.TARO_APP_API_BASE': JSON.stringify('https://test-258814-7-1433977056.sh.run.tcloudbase.com'),
    // 云托管配置（用于小程序内部调用 wx.cloud.callContainer）
    'process.env.TARO_APP_CLOUD_ENV': JSON.stringify('test1-258814-7'),
    'process.env.TARO_APP_CLOUD_SERVICE': JSON.stringify('test'),
  },
  mini: {},
  h5: {
    publicPath: '/',
  },
}
