module.exports = {
  env: {
    NODE_ENV: '"development"',
  },
  defineConstants: {
    'process.env.TARO_APP_API_BASE': JSON.stringify('http://localhost:8001'),
  },
  mini: {},
  h5: {},
}
