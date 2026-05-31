# Claude Code 工作规范

## 分支管理

1. **不要自动 merge 不同分支** — 除非用户明确要求，否则不要合并任何分支
2. 切换分支前确认当前工作目录是干净的
3. 如果需要合并，必须先获得用户确认

## 开发环境

1. 本地开发: `npm run dev:weapp`
2. 生产环境: `npm run build:weapp`
3. **默认编译微信小程序**，除非用户特别要求编译 H5 页面
3. 本地后端地址: `http://localhost:8000`
4. 云端后端地址: `https://test-258357-8-1433613936.sh.run.tcloudbase.com`
