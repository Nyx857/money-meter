#!/bin/bash
# 双击这个文件，会在本机起一个小服务，手机连同一个 Wi-Fi 就能打开。
cd "$(dirname "$0")" || exit 1

PORT=""
for p in $(seq 8765 8790); do
  if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then PORT="$p"; break; fi
done
[ -z "$PORT" ] && PORT=8765

IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
IP=$(ipconfig getifaddr "$IFACE" 2>/dev/null)
[ -z "$IP" ] && IP=$(ipconfig getifaddr en0 2>/dev/null)
[ -z "$IP" ] && IP=$(ipconfig getifaddr en1 2>/dev/null)
[ -z "$IP" ] && IP="127.0.0.1"

echo ""
echo "  💰 每秒进账 已启动"
echo ""

if [ "$IP" != "127.0.0.1" ]; then
  URL="http://$IP:$PORT"

  if [ "$(tput cols 2>/dev/null || echo 80)" -ge 74 ]; then
    echo "  手机相机扫这个二维码，直接打开："
    echo ""
    xcrun swift "tools/qr.swift" "$URL" 2>/dev/null || echo "  （二维码生成失败，用下面的地址手打）"
    echo ""
  fi

  echo "  手机地址：$URL"
  echo "  （手机要和电脑连同一个 Wi-Fi）"
  echo ""

  if echo "$URL" | pbcopy 2>/dev/null; then
    echo "  地址已经复制到剪贴板了 —— 可以粘到微信/备忘录，发给手机点开。"
    echo ""
  fi

  echo "  手机上建议：Safari/Chrome 打开后点「分享 → 添加到主屏幕」，"
  echo "  之后就是个全屏 App，随时点开看每秒在进账多少。"
else
  echo "  电脑上打开：http://localhost:$PORT"
  echo "  （没检测到局域网 IP，手机连不上，检查一下 Wi-Fi）"
fi

echo ""
echo "  电脑上也可以开：http://localhost:$PORT"
echo "  按 Ctrl+C 停止。"
echo ""

python3 -m http.server "$PORT" --bind 0.0.0.0
