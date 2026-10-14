#!/bin/bash
# Локальный запуск квеста - только на этом компьютере, без интернета

cd "$(dirname "$0")"
PORT=8080

if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Порт $PORT уже занят - открываю браузер..."
  open "http://127.0.0.1:$PORT"
  exit 0
fi

echo "Запуск «Звёздной тропинки» на http://127.0.0.1:$PORT"
echo "Закройте это окно или нажмите Ctrl+C, чтобы остановить сервер."
echo ""

python3 -m http.server $PORT --bind 127.0.0.1 &
SERVER_PID=$!
sleep 0.8
open "http://127.0.0.1:$PORT"

wait $SERVER_PID
