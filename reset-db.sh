#!/bin/bash
echo " Dừng các container..."
docker-compose down

echo "  Xóa database volume..."
docker volume rm soamidterm_db_data 2>/dev/null || echo "Volume không tồn tại hoặc đã bị xóa"

echo " Khởi động lại MySQL với database mới..."
docker-compose up -d mysql

echo " Đợi MySQL khởi động (10 giây)..."
sleep 10

echo " Database đã được reset về trạng thái ban đầu!"
echo " Dữ liệu mẫu đã được load từ db/init.sql"
