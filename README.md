# iBank Tuition Payment System

A modern web application for managing university tuition payments through an iBanking system.

## Features

- Secure user authentication
- Real-time student tuition lookup
- Multiple tuition records per student
- OTP verification for payments
- Email notifications via Gmail API
- Transaction history
- Balance management

## Technology Stack

- Frontend: HTML5, CSS3, Vanilla JavaScript
- Backend: Node.js, Express
- Database: MySQL 8.0
- Email: Gmail API / SMTP fallback
- Container: Docker & Docker Compose

## Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Windows PowerShell or similar shell

## Quick Start

1. Clone the repository and navigate to the project folder:
```bash
git clone https://github.com/CheetoBuri/SOAMidterm.git
cd SOAMidterm
```

2. Copy the environment template and configure:
```bash
cp .env.sample .env
# Edit .env with your settings
```

3. Start MySQL via Docker Compose:
```powershell
docker-compose up -d db
```

4. Install dependencies:
```bash
npm install
```

5. Start the application:
```bash
npm start
```

6. Open http://localhost:3000 in your browser

## Demo Accounts

The database is seeded with these test accounts:

### Payers
- Username: alice / Password: alice123
  - Balance: 1,000.00 VND
- Username: bob / Password: bob123
  - Balance: 500.00 VND

### Students
- ID: 20190001 - Tran Van A
  - Fall 2023: 500.00 VND
  - Spring 2024: 750.00 VND
- ID: 20190002 - Le Thi B
  - Fall 2023: 750.00 VND
- ID: 20190003 - Nguyen Van C
  - Fall 2023: 300.00 VND

## Development

### Project Structure
```
.
├── config/             # Configuration files
├── db/                # Database scripts
├── docs/              # Documentation
├── public/            # Frontend assets
│   ├── css/          # Stylesheets
│   ├── js/           # Client-side JavaScript
│   └── index.html    # Main application page
└── src/              # Backend source code
    ├── controllers/  # Route handlers
    ├── middleware/   # Express middleware
    └── mailer.js     # Email service
```

### Available Scripts

- `npm start`: Start the application
- `npm run dev`: Start with nodemon for development

## Email Configuration

The system supports two email methods:
1. Gmail API (recommended)
   - Configure in config/email.js
   - Requires Google Cloud credentials
2. SMTP Fallback
   - Configure in .env
   - Used when Gmail API is not configured

## API Documentation

See [API Documentation](docs/api.md) for endpoint details.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
