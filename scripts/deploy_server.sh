#!/bin/bash
# TechEcho 快速部署脚本
# 在服务器上运行此脚本，自动完成基础配置

set -e

echo "=========================================="
echo "TechEcho 快速部署脚本"
echo "=========================================="

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查 root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}请使用 root 权限运行此脚本 (sudo ./deploy_server.sh)${NC}"
   exit 1
fi

# 1. 系统更新
echo -e "\n${YELLOW}[1/6] 更新系统...${NC}"
apt update && apt upgrade -y

# 2. 安装依赖
echo -e "\n${YELLOW}[2/6] 安装依赖...${NC}"
apt install -y curl wget git nginx certbot python3-pip python3-venv

# 3. 安装 Python 依赖
echo -e "\n${YELLOW}[3/6] 安装 Python 依赖...${NC}"
pip3 install -r requirements.txt

# 4. 创建目录
echo -e "\n${YELLOW}[4/6] 创建必要目录...${NC}"
mkdir -p logs data/audio
chmod 755 logs data data/audio

# 5. 配置防火墙
echo -e "\n${YELLOW}[5/6] 配置防火墙...${NC}"
ufw allow 22
ufw allow 80
ufw allow 443
ufw allow 8001

# 6. 创建 .env 文件（如果不存在）
if [ ! -f .env ]; then
    echo -e "\n${YELLOW}[6/6] 创建 .env 文件...${NC}"
    cp .env.example .env
    echo -e "${RED}请编辑 .env 文件填入你的密钥！${NC}"
    echo -e "  nano .env"
fi

echo -e "\n${GREEN}==========================================${NC}"
echo -e "${GREEN}基础配置完成！${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "下一步："
echo "  1. 编辑 .env 填入 MINIMAX_API_KEY"
echo "  2. 配置 Nginx (见 DEPLOY_WECHAT.md 第六步)"
echo "  3. 启动服务: systemctl start techecho"
echo "  4. 配置域名和 SSL (见 DEPLOY_WECHAT.md 第六步)"
echo ""
