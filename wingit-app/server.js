// Backend code using Node.js, Express, and database support
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg'); // PostgreSQL client

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;

// Use environment variables for admin credentials
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || 'wingit123';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set up database connection
let db; // This will store our database connection

// Check if we're running on Heroku with a DATABASE_URL
if (process.env.DATABASE_URL) {
  // PostgreSQL connection
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Heroku Postgres
    }
  });
  
  console.log("Using PostgreSQL database");
  
  // Initialize PostgreSQL tables
  const initializeTables = async () => {
    try {
      // Create submissions table
      await db.query(`
        CREATE TABLE IF NOT EXISTS submissions (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          grade TEXT NOT NULL,
          pickup TEXT NOT NULL,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create users table
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          is_admin INTEGER DEFAULT 0
        )
      `);
      
      // Check for admin user and create if doesn't exist
      const result = await db.query(
        'SELECT * FROM users WHERE username = $1',
        [adminUser]
      );
      
      if (result.rows.length === 0) {
        await db.query(
          'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, 1)',
          [adminUser, adminPass]
        );
        console.log(`Created default admin user: ${adminUser}`);
      }
    } catch (error) {
      console.error("Error initializing PostgreSQL tables:", error);
    }
  };
  
  // Call the initialization function
  initializeTables();
} else {
  // Local SQLite connection (if you still want this for local development)
  const sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database('./wingit.db');
  console.log("Using SQLite database");
  
  // Initialize SQLite tables
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
    
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0
      )
    `);
    
    db.get(`SELECT * FROM users WHERE username = ?`, [adminUser], (err, row) => {
      if (!row) {
        db.run(`INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)`,
          [adminUser, adminPass]);
        console.log(`Created default admin user: ${adminUser}`);
      }
    });
  });
}

// Helper function to determine if we're using PostgreSQL
const isPostgres = () => {
  return !!process.env.DATABASE_URL;
};

// Routes for the API
// POST endpoint to receive form submissions
app.post('/api/submissions', async (req, res) => {
  const { name, email, phone, grade, pickup, date, time } = req.body;
  
  if (!name || !email || !phone || !grade || !pickup || !date || !time) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  try {
    if (isPostgres()) {
      // PostgreSQL query
      const result = await db.query(
        `INSERT INTO submissions (name, email, phone, grade, pickup, date, time) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [name, email, phone, grade, pickup, date, time]
      );
      
      res.status(201).json({ 
        success: true, 
        message: 'Submission saved successfully',
        id: result.rows[0].id
      });
    } else {
      // SQLite query
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
    }
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: 'Failed to save submission' });
  }
});

// GET endpoint to retrieve all submissions
app.get('/api/submissions', async (req, res) => {
  try {
    if (isPostgres()) {
      // PostgreSQL query
      const result = await db.query('SELECT * FROM submissions ORDER BY date, time');
      res.json(result.rows);
    } else {
      // SQLite query
      db.all('SELECT * FROM submissions ORDER BY date, time', (err, rows) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to retrieve submissions' });
        }
        
        res.json(rows);
      });
    }
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: 'Failed to retrieve submissions' });
  }
});

// Route for admin login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  try {
    if (isPostgres()) {
      // PostgreSQL query
      const result = await db.query(
        'SELECT * FROM users WHERE username = $1 AND password = $2',
        [username, password]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const user = result.rows[0];
      res.json({ 
        success: true, 
        user: { id: user.id, username: user.username, isAdmin: !!user.is_admin } 
      });
    } else {
      // SQLite query
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
          
          res.json({ 
            success: true, 
            user: { id: user.id, username: user.username, isAdmin: !!user.is_admin } 
          });
        }
      );
    }
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
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