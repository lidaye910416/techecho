module.exports = {
  env: {
    NODE_ENV: '"production"',
  },
  defineConstants: {
    'process.env.TARO_APP_API_BASE': JSON.stringify('https://your-api-domain.com'),
  },
  mini: {},
  h5: {
    publicPath: '/',
  },
}
