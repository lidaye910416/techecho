module.exports = {
  env: {
    NODE_ENV: '"production"',
  },
  defineConstants: {
    'process.env.TARO_APP_API_BASE': JSON.stringify('https://techecho-258357-8-1433613936.sh.run.tcloudbase.com'),
  },
  mini: {},
  h5: {
    publicPath: '/',
  },
}
