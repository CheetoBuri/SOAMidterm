# iBank API Documentation

## Authentication

### POST /api/login
Login with username and password.

**Request:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "string",
  "profile": {
    "id": "number",
    "full_name": "string",
    "phone": "string",
    "email": "string",
    "balance_cents": "number"
  }
}
```

## Student Information

### GET /api/student/:studentId
Get student information and pending tuitions.

**Response:**
```json
{
  "student": {
    "id": "number",
    "student_id": "string",
    "full_name": "string",
    "pending_tuitions": [
      {
        "id": "number",
        "academic_year": "number",
        "semester": "number",
        "amount_cents": "number",
        "description": "string",
        "read_only": "boolean (optional)",
        "is_combined": "boolean (optional)",
        "mandatory": "boolean (optional)",
        "tuition_count": "number (optional)"
      }
    ]
  }
}
```

**Special behavior for student 20190001:**
- If the student has multiple pending tuitions, individual tuitions are listed first with `read_only: true` (for information only)
- A combined payment option with `id: 0`, `is_combined: true`, and `mandatory: true` is included at the end
- Individual tuitions cannot be paid separately - only the combined option (id=0) can be used for payment

## Transactions

### POST /api/transactions/start
Start a new payment transaction.

**Request:**
```json
{
  "studentId": "string",
  "tuitionId": "number"
}
```

**Special rules for student 20190001 with multiple pending tuitions:**
- Individual tuition IDs (1, 2, etc.) are **NOT accepted** - they are read-only for information only
- **MUST use `tuitionId: 0`** to pay all tuitions combined in a single transaction
- This is **mandatory** - individual tuitions cannot be paid separately
- The combined payment will process all pending tuitions together

**Response:**
```json
{
  "transactionId": "number",
  "otpExpiresAt": "string (ISO date)"
}
```

### POST /api/transactions/verify
Verify OTP and complete payment.

**Request:**
```json
{
  "transactionId": "number",
  "otpCode": "string"
}
```

**Response:**
```json
{
  "success": true,
  "new_balance_cents": "number"
}
```

### POST /api/transactions/resend
Resend OTP for a transaction.

**Request:**
```json
{
  "transactionId": "number"
}
```

**Response:**
```json
{
  "transactionId": "number",
  "otpExpiresAt": "string (ISO date)"
}
```

### GET /api/transactions/history
Get transaction history for current user.

**Response:**
```json
{
  "transactions": [
    {
      "id": "number",
      "amount_cents": "number",
      "status": "string",
      "created_at": "string (ISO date, Asia/Ho_Chi_Minh timezone)",
      "confirmed_at": "string (ISO date, Asia/Ho_Chi_Minh timezone)",
      "mssv": "string",
      "student_name": "string"
    }
  ]
}
```

> **Note:** `created_at` and `confirmed_at` are returned in the Vietnam timezone (`Asia/Ho_Chi_Minh`, UTC+07:00) so that Swagger responses match the frontend UI display.

## Profile

### GET /api/profile
Get current user's profile.

**Response:**
```json
{
  "profile": {
    "id": "number",
    "full_name": "string",
    "phone": "string",
    "email": "string",
    "balance_cents": "number"
  }
}
```

## Error Responses

All endpoints may return these error responses:

```json
{
  "error": "error_code",
  "message": "Optional human readable message"
}
```

Common error codes:
- `server_error`: Internal server error
- `invalid_token`: Authentication token is invalid or expired
- `missing_token`: No authentication token provided
- `insufficient_balance`: User has insufficient balance
- `student_not_found`: Student ID not found
- `invalid_otp`: Wrong OTP code
- `otp_expired`: OTP code has expired
- `otp_attempts_exceeded`: Too many invalid OTP attempts