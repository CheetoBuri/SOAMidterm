#!/bin/bash
PID=$(ps aux | grep "node server.js" | grep -v grep | awk '{print $2}')
if [ -z "$PID" ]; then
  echo "Không có server nào đang chạy"
else
  kill $PID
  echo "✅ Đã dừng server (PID: $PID)"
fi
