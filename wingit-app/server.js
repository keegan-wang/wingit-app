// Backend code using Node.js, Express, and SQLite
// Save this file as server.js

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create and initialize the database
const db = new sqlite3.Database('./wingit.db');

// Create tables if they don't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      grade TEXT NOT NULL,
      pickup TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create admin user for the dashboard
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0
    )
  `);
  
  // Insert a default admin user if none exists
  db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO users (username, password, is_admin) VALUES ('admin', 'wingit123', 1)");
      console.log("Created default admin user: admin/wingit123");
    }
  });
});

// Routes for the API
// POST endpoint to receive form submissions
app.post('/api/submissions', (req, res) => {
  const { name, email, phone, grade, pickup, date, time } = req.body;
  
  if (!name || !email || !phone || !grade || !pickup || !date || !time) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const stmt = db.prepare(
    `INSERT INTO submissions (name, email, phone, grade, pickup, date, time) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  
  stmt.run([name, email, phone, grade, pickup, date, time], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to save submission' });
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Submission saved successfully',
      id: this.lastID
    });
  });
  
  stmt.finalize();
});

// GET endpoint to retrieve all submissions (admin only)
app.get('/api/submissions', (req, res) => {
  // In a real app, this would have authentication
  db.all('SELECT * FROM submissions ORDER BY date, time', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to retrieve submissions' });
    }
    
    res.json(rows);
  });
});

// Route for admin login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  db.get(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Login failed' });
      }
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // In a real app, you would use JWT or sessions for auth
      res.json({ 
        success: true, 
        user: { id: user.id, username: user.username, isAdmin: !!user.is_admin } 
      });
    }
  );
});

// Serve the admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve the main form
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});