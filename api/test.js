// Minimal test API for debugging
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'API is running' });
});

// Test endpoint that doesn't require database
app.post('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Test endpoint working',
    body: req.body 
  });
});

module.exports = app;