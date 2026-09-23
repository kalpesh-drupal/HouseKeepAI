#!/usr/bin/env bash
# Start HouseKeepAI for Expo Go via HTTPS tunnel (works off Wi‑Fi)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAN_IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.1.16")}"
LOGIN_PATH="/login?mobile=1&callbackUrl=/m"

echo "1) Start Next.js in another terminal:"
echo "   cd \"$ROOT\" && npx next dev --turbopack --port 3006 --hostname 0.0.0.0"
echo ""
echo "2) Start a public HTTPS tunnel to port 3006:"
echo "   Option A — install cloudflared: brew install cloudflared"
echo "     cloudflared tunnel --url http://127.0.0.1:3006"
echo "   Option B — localtunnel:"
echo "     npx localtunnel --port 3006"
echo ""
echo "3) Copy the https://… URL and run (replace TUNNEL_URL):"
echo ""
cat <<'EOF'
   TUNNEL_URL="https://YOUR-TUNNEL-URL"
   cat > .env.local <<ENVEOF
PORT=3006
NEXTAUTH_URL=${TUNNEL_URL}
ENVEOF
   cat > mobile/.env <<ENVEOF
EXPO_PUBLIC_APP_URL=${TUNNEL_URL}/login?mobile=1&callbackUrl=/m
EXPO_PUBLIC_LAN_URL=http://LAN_IP:3006/login?mobile=1&callbackUrl=/m
ENVEOF
   # Restart Next.js after changing .env.local
   cd mobile && npx expo start --tunnel --clear
EOF
echo ""
echo "LAN fallback IP placeholder: $LAN_IP"
