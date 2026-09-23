#!/usr/bin/env bash
# Start HouseKeepAI for Expo Go (same Wi‑Fi — most reliable)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAN_IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")}"

if [[ -z "$LAN_IP" ]]; then
  echo "Could not detect LAN IP. Set LAN_IP=your.ip.address.here and run again."
  exit 1
fi

BASE="http://${LAN_IP}:3006"
LOGIN="${BASE}/login?mobile=1&callbackUrl=/m"

echo "Using LAN: $BASE"
echo "Updating .env.local and mobile/.env …"

cat > "$ROOT/.env.local" <<EOF
PORT=3006
NEXTAUTH_URL=${BASE}
EOF

cat > "$ROOT/mobile/.env" <<EOF
EXPO_PUBLIC_APP_URL=${LOGIN}
EXPO_PUBLIC_LAN_URL=${LOGIN}
EOF

echo ""
echo "=== Terminal 1 (keep running): Next.js ==="
echo "  cd \"$ROOT\" && npx next dev --turbopack --port 3006 --hostname 0.0.0.0"
echo ""
echo "=== Terminal 2 (keep running): Expo Go ==="
echo "  cd \"$ROOT/mobile\" && npx expo start --lan --clear"
echo ""
echo "Then open Expo Go on your phone (same Wi‑Fi) and scan the QR code."
echo "Demo login: housekeeper@hotel.com / password123"
echo ""
echo "If LAN fails, use tunnel mode: ./scripts/start-mobile-tunnel.sh"
