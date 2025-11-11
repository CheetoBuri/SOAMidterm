-- Initial schema and demo data for iBanking tuition payment prototype
CREATE DATABASE IF NOT EXISTS ibank;
USE ibank;

-- Users table (payer accounts)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(200) NOT NULL,
  balance_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Students table (basic info)
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tuition records table
CREATE TABLE IF NOT EXISTS tuitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year INT NOT NULL,
  semester INT NOT NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  description VARCHAR(200),
  status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE KEY unique_tuition (student_id, academic_year, semester)
) ENGINE=InnoDB;

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payer_user_id INT NOT NULL,
  tuition_id INT NOT NULL,
  amount_cents INT NOT NULL,
  status ENUM('pending','confirmed','failed','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  FOREIGN KEY (payer_user_id) REFERENCES users(id),
  FOREIGN KEY (tuition_id) REFERENCES tuitions(id)
) ENGINE=InnoDB;

-- OTPs table
CREATE TABLE IF NOT EXISTS otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL UNIQUE,
  code_hash VARCHAR(255) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
) ENGINE=InnoDB;

-- Seed demo users
INSERT IGNORE INTO users (username, password, full_name, phone, email, balance_cents)
VALUES
('alice','alice123','Alice Nguyen','+84900123456','huynhnhattien0411@gmail.com',100000),
('bob','bob123','Bob Tran','+84900987654','bob@example.com',50000);

-- Seed demo students
INSERT IGNORE INTO students (student_id, full_name)
VALUES
('20190001','Tran Van A'),
('20190002','Le Thi B'),
('20190003','Nguyen Van C');

-- Seed demo tuition records
INSERT IGNORE INTO tuitions (student_id, academic_year, semester, amount_cents, description, status)
SELECT 
    s.id,
    2023,
    1,
    50000,
    'Fall 2023 Semester Tuition',
    'pending'
FROM students s WHERE s.student_id = '20190001'
UNION ALL
SELECT 
    s.id,
    2023,
    2,
    75000,
    'Spring 2024 Semester Tuition',
    'pending'
FROM students s WHERE s.student_id = '20190001'
UNION ALL
SELECT 
    s.id,
    2023,
    1,
    75000,
    'Fall 2023 Semester Tuition',
    'pending'
FROM students s WHERE s.student_id = '20190002'
UNION ALL
SELECT 
    s.id,
    2023,
    1,
    30000,
    'Fall 2023 Semester Tuition',
    'pending'
FROM students s WHERE s.student_id = '20190003';
