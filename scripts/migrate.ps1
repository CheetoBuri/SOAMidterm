# PowerShell script for database migrations

# Load environment variables from .env file
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        Set-Item -Path "Env:$name" -Value $value
    }
}

# Default values if not set in .env
$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "127.0.0.1" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "3306" }
$DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "ibankuser" }
$DB_PASSWORD = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { "ibankpass" }
$DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "ibank" }

# Function to run SQL file
function Run-SqlFile {
    param (
        [string]$file
    )
    Write-Host "Running migration: $file"
    Get-Content $file | mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASSWORD $DB_NAME
}

# Run all migration files in order
Get-ChildItem "db\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Run-SqlFile $_.FullName
}

Write-Host "Migrations completed"