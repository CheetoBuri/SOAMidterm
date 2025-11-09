#!/bin/bash
# Database migration script for iBank

# Load environment variables
source .env

# Default values if not set in .env
DB_HOST=${DB_HOST:-"127.0.0.1"}
DB_PORT=${DB_PORT:-"3306"}
DB_USER=${DB_USER:-"ibankuser"}
DB_PASSWORD=${DB_PASSWORD:-"ibankpass"}
DB_NAME=${DB_NAME:-"ibank"}

# Function to run SQL file
run_sql() {
    local file=$1
    echo "Running migration: $file"
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$file"
}

# Run all migration files in order
for f in db/migrations/*.sql; do
    if [ -f "$f" ]; then
        run_sql "$f"
    fi
done

echo "Migrations completed"