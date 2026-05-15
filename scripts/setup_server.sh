#!/bin/bash
# =============================================================================
# TechEcho 一键部署脚本
# 使用方法: curl -sL https://raw.githubusercontent.com/你的用户名/digital-human-tool/main/scripts/setup_server.sh | bash
# 或下载后在服务器上运行: chmod +x setup_server.sh && sudo ./setup_server.sh
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# 配置变量（根据你的项目修改）
# -----------------------------------------------------------------------------
PROJECT_NAME="techecho"
PROJECT_DIR="/opt/techecho"
GIT_REPO="https://github.com/你的用户名/digital-human-tool.git"
DOMAIN=""
API_PORT=8001

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# 检查 root 权限
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "请使用 root 权限运行: sudo ./setup_server.sh"
        exit 1
    fi
}

# 检测操作系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
    else
        error "无法检测操作系统"
        exit 1
    fi
    log "检测到操作系统: $OS $VER"
}

# -----------------------------------------------------------------------------
# Step 1: 系统更新和基础软件
# -----------------------------------------------------------------------------
install_dependencies() {
    step "安装系统依赖..."
    
    if [[ "$OS" == "ubuntu" ]] || [[ "$OS" == "debian" ]]; then
        apt update
        apt install -y curl wget git nginx certbot python3-pip python3-venv software-properties-common
    elif [[ "$OS" == "centos" ]] || [[ "$OS" == "rocky" ]] || [[ "$OS" == "alma" ]]; then
        yum update -y
        yum install -y curl wget git nginx certbot python3-pip
    else
        warn "未知系统，将尝试 Ubuntu/CentOS 方式安装"
    fi
    
    log "系统依赖安装完成"
}

# -----------------------------------------------------------------------------
# Step 2: 安装 Python 依赖
# -----------------------------------------------------------------------------
install_python_deps() {
    step "安装 Python 依赖..."
    
    # 创建虚拟环境（可选，生产环境推荐）
    # python3 -m venv /opt/techecho/venv
    # source /opt/techecho/venv/bin/activate
    
    pip3 install --upgrade pip
    pip3 install -r requirements.txt
    
    log "Python 依赖安装完成"
}

# -----------------------------------------------------------------------------
# Step 3: 创建目录结构
# -----------------------------------------------------------------------------
create_dirs() {
    step "创建目录结构..."
    
    mkdir -p ${PROJECT_DIR}/{logs,data/audio}
    chmod -R 755 ${PROJECT_DIR}/{logs,data}
    
    log "目录创建完成"
}

# -----------------------------------------------------------------------------
# Step 4: 配置 .env 文件
# -----------------------------------------------------------------------------
setup_env() {
    step "配置环境变量..."
    
    ENV_FILE="${PROJECT_DIR}/.env"
    
    if [ -f "$ENV_FILE" ]; then
        warn ".env 文件已存在，跳过创建"
        return
    fi
    
    cat > "$ENV_FILE" << ENVEOF
# TechEcho 环境配置
# 请访问 https://platform.minimaxi.com/ 获取 API Key

# MiniMax API Key (必需)
MINIMAX_API_KEY=请在这里填入你的MiniMax密钥

# 微信小程序配置 (登录微信公众平台获取)
WECHAT_APPID=请在这里填入你的AppID
WECHAT_SECRET=请在这里填入你的Secret

# 服务器配置
BASE_URL=https://${DOMAIN}
ENVEOF
    
    chmod 600 "$ENV_FILE"
    log ".env 文件已创建: $ENV_FILE"
    echo ""
    warn "请编辑 .env 文件填入你的密钥: nano $ENV_FILE"
}

# -----------------------------------------------------------------------------
# Step 5: 配置 Systemd 服务
# -----------------------------------------------------------------------------
setup_systemd() {
    step "配置 Systemd 服务..."
    
    cat > /etc/systemd/system/${PROJECT_NAME}.service << SERVICEEOF
[Unit]
Description=TechEcho API Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=${PROJECT_DIR}/.env
ExecStart=/usr/bin/python3 -m uvicorn src.main:app --host 127.0.0.1 --port ${API_PORT}
Restart=always
RestartSec=10
StandardOutput=append:${PROJECT_DIR}/logs/api.log
StandardError=append:${PROJECT_DIR}/logs/api_error.log

[Install]
WantedBy=multi-user.target
SERVICEEOF
    
    systemctl daemon-reload
    log "Systemd 服务配置完成"
}

# -----------------------------------------------------------------------------
# Step 6: 配置 Nginx
# -----------------------------------------------------------------------------
setup_nginx() {
    if [ -z "$DOMAIN" ]; then
        warn "未设置 DOMAIN，跳过 Nginx 配置"
        warn "请手动配置或重新运行并设置 DOMAIN=your-domain.com"
        return
    fi
    
    step "配置 Nginx..."
    
    cat > /etc/nginx/sites-available/${PROJECT_NAME} << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};
    
    client_max_body_size 50M;
    
    location / {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    location /data/ {
        alias ${PROJECT_DIR}/data/;
        autoindex off;
        add_header Cache-Control "public, max-age=86400";
    }
}
NGINXEOF
    
    ln -sf /etc/nginx/sites-available/${PROJECT_NAME} /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
    
    log "Nginx 配置完成"
}

# -----------------------------------------------------------------------------
# Step 7: 配置 SSL (Let's Encrypt)
# -----------------------------------------------------------------------------
setup_ssl() {
    if [ -z "$DOMAIN" ]; then
        warn "未设置 DOMAIN，跳过 SSL 配置"
        return
    fi
    
    step "配置 SSL 证书..."
    
    certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --noninteractive --agree-tos --email admin@${DOMAIN} || {
        warn "SSL 配置可能失败，请手动运行: certbot --nginx -d ${DOMAIN}"
    }
    
    # 自动续期
    systemctl enable certbot.timer
    systemctl start certbot.timer
    
    log "SSL 证书配置完成"
}

# -----------------------------------------------------------------------------
# Step 8: 配置定时任务
# -----------------------------------------------------------------------------
setup_cron() {
    step "配置定时任务..."
    
    # 每天早上 8:30 自动收集新闻
    CRON_LINE="30 8 * * * cd ${PROJECT_DIR} && python3 scripts/collect_news.py >> logs/collect.log 2>&1"
    
    # 检查是否已存在
    if crontab -l 2>/dev/null | grep -q "collect_news.py"; then
        warn "定时任务已存在，跳过"
    else
        (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
        log "定时任务添加成功"
    fi
}

# -----------------------------------------------------------------------------
# Step 9: 启动服务
# -----------------------------------------------------------------------------
start_services() {
    step "启动服务..."
    
    # 启动 API 服务
    systemctl enable ${PROJECT_NAME}
    systemctl restart ${PROJECT_NAME}
    
    if systemctl is-active --quiet ${PROJECT_NAME}; then
        log "API 服务启动成功"
    else
        error "API 服务启动失败，请检查: journalctl -u ${PROJECT_NAME} -n 50"
    fi
    
    # 启动 Nginx
    systemctl enable nginx
    systemctl restart nginx
    
    log "服务启动完成"
}

# -----------------------------------------------------------------------------
# Step 10: 防火墙配置
# -----------------------------------------------------------------------------
setup_firewall() {
    step "配置防火墙..."
    
    if command -v ufw &> /dev/null; then
        ufw allow 22/tcp
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw --force enable
        log "防火墙配置完成"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=80/tcp
        firewall-cmd --permanent --add-port=443/tcp
        firewall-cmd --reload
        log "防火墙配置完成"
    else
        warn "未检测到防火墙软件，跳过"
    fi
}

# -----------------------------------------------------------------------------
# 验证
# -----------------------------------------------------------------------------
verify() {
    step "验证部署..."
    
    echo ""
    echo "=========================================="
    echo "验证结果"
    echo "=========================================="
    
    # API 健康检查
    if curl -s http://localhost:${API_PORT}/health | grep -q "healthy"; then
        log "API 服务运行正常 ✓"
    else
        error "API 服务可能未正常运行"
        error "请检查: systemctl status ${PROJECT_NAME}"
    fi
    
    # Nginx 检查
    if systemctl is-active --quiet nginx; then
        log "Nginx 运行正常 ✓"
    else
        error "Nginx 可能未正常运行"
    fi
    
    echo ""
    echo "=========================================="
    echo "部署完成！"
    echo "=========================================="
    echo ""
    echo "下一步："
    echo "  1. 编辑 .env 文件填入密钥: nano ${PROJECT_DIR}/.env"
    echo "  2. 测试新闻收集: cd ${PROJECT_DIR} && python3 scripts/collect_news.py --limit 3"
    echo "  3. 查看 API 日志: journalctl -u ${PROJECT_NAME} -f"
    echo "  4. 如果配置了域名，访问: https://${DOMAIN}/api/news"
    echo ""
}

# -----------------------------------------------------------------------------
# 主函数
# -----------------------------------------------------------------------------
main() {
    clear
    echo ""
    echo -e "${BLUE}==========================================${NC}"
    echo -e "${BLUE}  TechEcho 一键部署脚本${NC}"
    echo -e "${BLUE}==========================================${NC}"
    echo ""
    
    check_root
    detect_os
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain=*)
                DOMAIN="${1#*=}"
                shift
                ;;
            --dir=*)
                PROJECT_DIR="${1#*=}"
                shift
                ;;
            --no-ssl)
                SKIP_SSL=1
                shift
                ;;
            --help)
                echo "用法: $0 [--domain=your-domain.com] [--dir=/path/to/project] [--no-ssl]"
                exit 0
                ;;
            *)
                shift
                ;;
        esac
    done
    
    if [ -n "$DOMAIN" ]; then
        log "将配置域名: $DOMAIN"
    else
        warn "未指定域名，将跳过 HTTPS 配置"
        warn "使用方式: $0 --domain=your-domain.com"
    fi
    
    # 开始部署
    install_dependencies
    install_python_deps
    create_dirs
    setup_env
    setup_systemd
    setup_nginx
    setup_firewall
    
    if [ -z "$SKIP_SSL" ] && [ -n "$DOMAIN" ]; then
        setup_ssl
    fi
    
    setup_cron
    start_services
    verify
    
    echo ""
    log "请继续阅读 ${PROJECT_DIR}/DEPLOY_WECHAT.md 完成后续配置"
    echo ""
}

# 运行
main "$@"
