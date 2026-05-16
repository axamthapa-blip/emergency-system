const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL || 'https://uhopsznmgmlnrsjvrufm.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_F8-NfRklN1ts_JJvUwoW6w_RxspBdNp';
const supabase = createClient(supabaseUrl, supabaseKey);

// Health check - THIS IS THE MOST IMPORTANT ENDPOINT FOR TESTING
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'API is working!',
        timestamp: new Date().toISOString()
    });
});

// Simple test endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'Test endpoint works!' });
});

// Register endpoint (simplified for testing)
app.post('/api/auth/register', async (req, res) => {
    const { email, password, full_name, phone, role } = req.body;
    
    // Return success for testing (skip Supabase for now)
    res.json({
        success: true,
        message: 'Registration successful!',
        user: { email, full_name, role }
    });
});

// Login endpoint (simplified for testing)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    res.json({
        success: true,
        token: 'test-token-12345',
        user: { email, full_name: 'Test User', role: 'requester' }
    });
});

// Export for Vercel
module.exports = app;