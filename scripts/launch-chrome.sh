#!/usr/bin/env bash
# ============================================================================
# launch-chrome.sh — 以远程调试模式启动 Chrome（复用本地 Cookie/Profile）
#
# 用法:
#   ./launch-chrome.sh            # 默认端口 9222（如被占用自动递增）
#   ./launch-chrome.sh 9333       # 指定端口
#   ./launch-chrome.sh --yes      # 非交互模式
#
# 功能:
#   1. 创建 Chrome Profile 的浅拷贝目录（复用 Cookie）
#   2. 自动检测端口冲突，递增寻找可用端口
#   3. 区分 Headless Chrome（MCP 服务）vs 真实 Chrome
#
# 注意:
#   Chrome 不允许在默认 data-dir 上开启远程调试，所以本脚本会:
#   - 创建一个独立的 user-data-dir（~/.chrome-debug-profile）
#   - 将原始 Profile 的 Cookies、Login Data 等关键文件拷贝过来
#   - 这样就能复用已登录的 Cookie，同时不影响主 Chrome
# ============================================================================

set -euo pipefail

# ---- 配置 ----
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_ORIGINAL_DIR="$HOME/Library/Application Support/Google/Chrome"
CHROME_DEBUG_DIR="$HOME/.chrome-debug-profile"
DEFAULT_PORT=9222
MAX_PORT_ATTEMPTS=20

# ---- 颜色输出 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ---- 检查端口上的调试 Chrome 是否使用我们的 debug profile ----
check_debug_is_our_chrome() {
    local port=$1
    local version_json
    version_json=$(curl -s --connect-timeout 2 "http://localhost:${port}/json/version" 2>/dev/null || echo "")
    if [ -z "$version_json" ]; then
        return 1
    fi
    local ua
    ua=$(echo "$version_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('User-Agent',''))" 2>/dev/null || echo "")
    # Headless Chrome = MCP 等服务，不算
    if echo "$ua" | grep -qi "headless"; then
        return 1
    fi
    # 检查进程的 user-data-dir 是否是我们的 debug 目录
    local pid
    pid=$(lsof -i ":${port}" -sTCP:LISTEN -t 2>/dev/null | head -1 || echo "")
    if [ -n "$pid" ]; then
        if ps -p "$pid" -o args= 2>/dev/null | grep -q "chrome-debug-profile"; then
            return 0
        fi
    fi
    return 1
}

# ---- 检查端口是否有 CDP 活跃服务 ----
check_debug_port_active() {
    local port=$1
    curl -s --connect-timeout 1 "http://localhost:${port}/json/version" > /dev/null 2>&1
}

# ---- 检查端口是否被占用 ----
is_port_in_use() {
    lsof -i ":$1" -sTCP:LISTEN > /dev/null 2>&1
}

# ---- 自动寻找可用端口 ----
find_available_port() {
    local port=$1
    local attempts=0
    while is_port_in_use "$port"; do
        warn "端口 $port 已被占用" >&2
        port=$((port + 1))
        attempts=$((attempts + 1))
        if [ "$attempts" -ge "$MAX_PORT_ATTEMPTS" ]; then
            err "在 $MAX_PORT_ATTEMPTS 次尝试后仍未找到可用端口"
            exit 1
        fi
    done
    echo "$port"
}

# ---- 同步 Cookie 和登录数据 ----
sync_profile() {
    info "同步 Cookie 和登录数据到调试用 Profile..."

    local src="$CHROME_ORIGINAL_DIR/Default"
    local dst="$CHROME_DEBUG_DIR/Default"

    mkdir -p "$dst"

    # 关键文件：Cookie、登录凭据、Local Storage（一些网站用 localStorage 保存 token）
    local files_to_copy=(
        "Cookies"
        "Cookies-journal"
        "Login Data"
        "Login Data-journal"
        "Web Data"
        "Web Data-journal"
        "Preferences"
        "Secure Preferences"
        "Favicons"
        "Favicons-journal"
    )

    local copied=0
    for f in "${files_to_copy[@]}"; do
        if [ -f "$src/$f" ]; then
            cp -f "$src/$f" "$dst/$f" 2>/dev/null && copied=$((copied + 1))
        fi
    done

    # 拷贝 Local Storage（一些网站的 token 存在这里）
    if [ -d "$src/Local Storage" ]; then
        cp -rf "$src/Local Storage" "$dst/" 2>/dev/null && copied=$((copied + 1))
    fi

    # 拷贝 IndexedDB（一些 SPA 用 IndexedDB 存 session）
    if [ -d "$src/IndexedDB" ]; then
        cp -rf "$src/IndexedDB" "$dst/" 2>/dev/null && copied=$((copied + 1))
    fi

    # 拷贝 Session Storage
    if [ -d "$src/Session Storage" ]; then
        cp -rf "$src/Session Storage" "$dst/" 2>/dev/null && copied=$((copied + 1))
    fi

    ok "已同步 $copied 项数据"
}

# ---- 解析参数 ----
REQUESTED_PORT=$DEFAULT_PORT
NON_INTERACTIVE=false
FORCE_RESYNC=false

for arg in "$@"; do
    case "$arg" in
        --yes|-y) NON_INTERACTIVE=true ;;
        --resync) FORCE_RESYNC=true ;;
        --help|-h)
            echo "用法: $0 [PORT] [--yes] [--resync] [--help]"
            echo ""
            echo "  PORT      指定调试端口 (默认: $DEFAULT_PORT)"
            echo "  --yes     非交互模式"
            echo "  --resync  强制重新同步 Cookie"
            echo "  --help    显示帮助"
            exit 0
            ;;
        *)
            if [[ "$arg" =~ ^[0-9]+$ ]]; then
                REQUESTED_PORT="$arg"
            fi
            ;;
    esac
done

# ---- 主逻辑 ----
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Chrome 远程调试模式启动器              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# 1) 检查 Chrome 安装
if [ ! -f "$CHROME_BIN" ]; then
    err "未找到 Chrome，请确认已安装 Google Chrome"
    exit 1
fi
ok "Chrome 已安装"

# 2) 检查是否已有我们的调试 Chrome 在运行
for port in $(seq "$REQUESTED_PORT" $((REQUESTED_PORT + MAX_PORT_ATTEMPTS))); do
    if check_debug_port_active "$port" && check_debug_is_our_chrome "$port"; then
        ok "调试 Chrome 已在端口 $port 运行"
        echo ""
        info "调试端点: http://localhost:${port}"
        curl -s "http://localhost:${port}/json/version" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for k, v in data.items():
    print(f'  {k}: {v}')
" 2>/dev/null || true
        echo ""
        echo -e "${GREEN}✅ 可以直接连接使用${NC}"
        echo "$port" > /tmp/chrome-debug-port
        exit 0
    fi
done

# 3) 检查原始 Chrome Profile 是否存在
if [ ! -d "$CHROME_ORIGINAL_DIR/Default" ]; then
    err "未找到 Chrome 用户 Profile"
    err "预期路径: $CHROME_ORIGINAL_DIR/Default"
    exit 1
fi
ok "找到原始 Chrome Profile"

# 4) 同步 Profile
if [ ! -d "$CHROME_DEBUG_DIR/Default" ] || $FORCE_RESYNC; then
    sync_profile
else
    # 检查 Cookie 文件是否过期（超过 1 小时则重新同步）
    COOKIE_FILE="$CHROME_DEBUG_DIR/Default/Cookies"
    if [ -f "$COOKIE_FILE" ]; then
        COOKIE_AGE=$(( $(date +%s) - $(stat -f %m "$COOKIE_FILE") ))
        if [ "$COOKIE_AGE" -gt 3600 ]; then
            info "Cookie 数据已超过 1 小时，重新同步..."
            sync_profile
        else
            ok "调试 Profile 数据已就绪 (${COOKIE_AGE}s 前同步)"
        fi
    else
        sync_profile
    fi
fi

# 5) 确定端口
DEBUG_PORT=$(find_available_port "$REQUESTED_PORT")
ok "使用调试端口: $DEBUG_PORT"

# 6) 检查是否有之前的调试 Chrome 在运行（使用 chrome-debug-profile）
OLD_DEBUG_PID=$(ps aux | grep -v grep | grep "chrome-debug-profile" | grep "Google Chrome" | grep -v "Helper" | awk '{print $2}' | head -1 || echo "")
if [ -n "$OLD_DEBUG_PID" ]; then
    warn "发现之前的调试 Chrome 进程 (PID: $OLD_DEBUG_PID)"
    if $NON_INTERACTIVE; then
        info "自动关闭旧实例..."
        kill "$OLD_DEBUG_PID" 2>/dev/null || true
        sleep 2
        kill -9 "$OLD_DEBUG_PID" 2>/dev/null || true
        sleep 1
    else
        echo -e "  ${YELLOW}是否关闭? [Y/n]${NC} "
        read -rp "" yn
        case "$yn" in
            [nN]*) ;;
            *)
                kill "$OLD_DEBUG_PID" 2>/dev/null || true
                sleep 2
                ;;
        esac
    fi
fi

# 清理调试 profile 的 SingletonLock
rm -f "$CHROME_DEBUG_DIR/SingletonLock" 2>/dev/null || true

# 7) 启动 Chrome
info "正在启动 Chrome（远程调试模式）..."
info "调试 Profile: $CHROME_DEBUG_DIR"
echo ""

"$CHROME_BIN" \
    --remote-debugging-port="$DEBUG_PORT" \
    --user-data-dir="$CHROME_DEBUG_DIR" \
    --no-first-run \
    --no-default-browser-check \
    '--remote-allow-origins=*' \
    >/dev/null 2>/tmp/chrome-debug-stderr.log &

CHROME_PID=$!

# 8) 等待调试端口就绪（最多 30 秒）
info "等待调试端口就绪..."
for i in $(seq 1 30); do
    if check_debug_port_active "$DEBUG_PORT"; then
        break
    fi
    sleep 1
done

if ! check_debug_port_active "$DEBUG_PORT"; then
    err "Chrome 启动超时（30 秒），调试端口未就绪"
    err "Chrome stderr:"
    head -5 /tmp/chrome-debug-stderr.log 2>/dev/null || true
    exit 1
fi

# 9) 输出信息
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Chrome 远程调试模式已启动！          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
info "调试端口: ${GREEN}${DEBUG_PORT}${NC}"
info "调试端点: ${GREEN}http://localhost:${DEBUG_PORT}${NC}"
info "Chrome PID: $CHROME_PID"
echo ""
info "版本信息:"
curl -s "http://localhost:${DEBUG_PORT}/json/version" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for k, v in data.items():
    print(f'  {k}: {v}')
" 2>/dev/null || true
echo ""

# 保存端口号
echo "$DEBUG_PORT" > /tmp/chrome-debug-port
info "端口号已保存到 /tmp/chrome-debug-port"
echo ""
echo -e "${CYAN}后续使用:${NC}"
echo "  node twitter-summary.mjs              # 浏览 Twitter 并总结"
echo "  node twitter-summary.mjs --port $DEBUG_PORT  # 指定端口"
echo ""
echo -e "${CYAN}提示:${NC}"
echo "  如果网站登录已过期，先更新主 Chrome 的登录，然后运行:"
echo "  ./launch-chrome.sh --resync            # 重新同步 Cookie"
echo ""
