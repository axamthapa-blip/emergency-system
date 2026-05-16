const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL || 'https://uhopsznmgmlnrsjvrufm.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_F8-NfRklN1ts_JJvUwoW6w_RxspBdNp';
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// File upload setup for videos
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ============================================
// INVERTED INDEX SEARCH
// ============================================
class InvertedIndex {
    constructor() {
        this.index = new Map();
        this.stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'for', 'of', 'to', 'in']);
    }
    
    tokenize(text) {
        if (!text) return [];
        text = text.toLowerCase().replace(/[^\w\s]/g, ' ');
        let words = text.split(/\s+/);
        let tokens = [];
        for (let word of words) {
            if (word.length > 2 && !this.stopWords.has(word)) {
                tokens.push(word);
            }
        }
        return tokens;
    }
    
    addDocument(id, text) {
        const tokens = this.tokenize(text);
        for (let token of tokens) {
            if (!this.index.has(token)) this.index.set(token, new Set());
            this.index.get(token).add(id);
        }
    }
    
    search(query) {
        const tokens = this.tokenize(query);
        if (tokens.length === 0) return [];
        let results = null;
        for (let token of tokens) {
            if (this.index.has(token)) {
                if (results === null) results = new Set(this.index.get(token));
                else results = new Set([...results].filter(id => this.index.get(token).has(id)));
            } else return [];
        }
        return [...(results || [])];
    }
}

const invertedIndex = new InvertedIndex();

// ============================================
// WEIGHTED RANKING ALGORITHM
// ============================================
function calculateWeightedScore(incident) {
    // Severity Score (0-100)
    const severityScore = (incident.q1_threat || 0) + (incident.q2_people || 0) + (incident.q3_urgency || 0);
    
    // Time Decay (newer = higher)
    const hoursOld = (Date.now() - new Date(incident.created_at)) / (1000 * 3600);
    let timeScore = 100;
    if (hoursOld > 0.5) {
        timeScore = Math.max(10, 100 * Math.exp(-0.05 * (hoursOld - 0.5)));
    }
    
    // Admin Boost
    const adminBoost = incident.admin_boost || 0;
    
    // Final weighted score: 70% severity, 20% time, 10% boost
    const finalScore = Math.round(
        (severityScore * 0.7) + (timeScore * 0.2) + (adminBoost * 0.1)
    );
    
    return { severityScore, timeScore, finalScore };
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', decoded.user_id)
            .single();
        
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const isAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

const isProvider = async (req, res, next) => {
    if (req.user.role !== 'provider') {
        return res.status(403).json({ error: 'Provider access required' });
    }
    next();
};
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'API is working!',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ============================================
// AUTH ROUTES
// ============================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, phone, full_name, password, role, latitude, longitude } = req.body;
        
        // Validation - Nepal phone format
        if (!email || !email.endsWith('@gmail.com')) {
            return res.status(400).json({ error: 'Only Gmail addresses allowed' });
        }
        if (!phone || !/^(98|97|96)\d{8}$/.test(phone)) {
            return res.status(400).json({ error: 'Invalid Nepali phone number (98XXXXXXXX)' });
        }
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        if (!['requester', 'provider', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role selected' });
        }
        
        // Check existing user
        const { data: existing } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();
        
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Create user
        const hashedPassword = await bcrypt.hash(password, 10);
        const user_id = require('crypto').randomUUID();
        
        const { error: insertError } = await supabase
            .from('users')
            .insert([{
                user_id, email, phone, full_name,
                password_hash: hashedPassword, role,
                is_verified: role !== 'provider',
                latitude, longitude,
                created_at: new Date()
            }]);
        
        if (insertError) throw insertError;
        
        // If provider, create provider record
        if (role === 'provider') {
            await supabase
                .from('providers')
                .insert([{
                    provider_id: user_id,
                    verified_by_admin: false,
                    is_available: true,
                    total_services: 0,
                    rating: 0
                }]);
        }
        
        const token = jwt.sign({ user_id, email, role }, JWT_SECRET, { expiresIn: '7d' });
        
        res.status(201).json({
            success: true,
            token,
            user: { user_id, email, full_name, role }
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check if provider is verified
        if (user.role === 'provider') {
            const { data: provider } = await supabase
                .from('providers')
                .select('verified_by_admin')
                .eq('provider_id', user.user_id)
                .single();
            
            if (!provider?.verified_by_admin) {
                return res.status(403).json({ error: 'Provider account pending admin verification' });
            }
        }
        
        const token = jwt.sign(
            { user_id: user.user_id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                user_id: user.user_id,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// INCIDENT ROUTES
// ============================================
app.post('/api/incidents', authenticate, upload.single('video'), async (req, res) => {
    try {
        const {
            emergency_type, q1_threat, q2_people, q3_urgency,
            description, province, district, municipality, ward, tole,
            latitude, longitude
        } = req.body;
        
        // Validation
        if (!emergency_type) return res.status(400).json({ error: 'Emergency type required' });
        if (!description || description.length < 10) {
            return res.status(400).json({ error: 'Description must be at least 10 characters' });
        }
        if (!latitude || !longitude) return res.status(400).json({ error: 'Location required' });
        
        const severityScore = parseInt(q1_threat || 0) + parseInt(q2_people || 0) + parseInt(q3_urgency || 0);
        const { finalScore } = calculateWeightedScore({
            q1_threat, q2_people, q3_urgency,
            created_at: new Date(),
            admin_boost: 0
        });
        
        let video_url = null;
        if (req.file) {
            video_url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        }
        
        const incident_id = require('crypto').randomUUID();
        
        const { data: incident, error } = await supabase
            .from('incidents')
            .insert([{
                incident_id,
                requester_id: req.user.user_id,
                emergency_type,
                q1_threat, q2_people, q3_urgency,
                severity_score: severityScore,
                final_priority: finalScore,
                description,
                province, district, municipality, ward, tole,
                latitude, longitude,
                video_url,
                status: 'pending',
                created_at: new Date()
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        // Add to inverted index
        invertedIndex.addDocument(incident_id, `${emergency_type} ${description} ${tole} ${district}`);
        
        res.status(201).json({ success: true, incident });
        
    } catch (error) {
        console.error('Create incident error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/incidents', authenticate, async (req, res) => {
    try {
        let query = supabase
            .from('incidents')
            .select('*, requester:users!requester_id(full_name, phone)')
            .order('final_priority', { ascending: false });
        
        // Provider sees only nearby incidents
        if (req.user.role === 'provider') {
            const { data: provider } = await supabase
                .from('providers')
                .select('latitude, longitude, service_radius')
                .eq('provider_id', req.user.user_id)
                .single();
            
            if (provider?.latitude) {
                // In production, use PostGIS. For now, get all and filter
                const { data: all } = await query;
                const nearby = all.filter(inc => {
                    const dist = calculateDistance(
                        provider.latitude, provider.longitude,
                        inc.latitude, inc.longitude
                    );
                    return dist <= (provider.service_radius || 20);
                });
                return res.json({ success: true, incidents: nearby });
            }
        }
        
        const { data: incidents } = await query;
        res.json({ success: true, incidents: incidents || [] });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/incidents/:id', authenticate, async (req, res) => {
    try {
        const { data: incident } = await supabase
            .from('incidents')
            .select('*, requester:users!requester_id(*)')
            .eq('incident_id', req.params.id)
            .single();
        
        if (!incident) return res.status(404).json({ error: 'Incident not found' });
        
        // Video access control: only requester, provider, admin
        if (incident.video_url) {
            const isRequester = incident.requester_id === req.user.user_id;
            const isProvider = req.user.role === 'provider';
            const isAdmin = req.user.role === 'admin';
            
            if (!isRequester && !isProvider && !isAdmin) {
                incident.video_url = null;
            }
        }
        
        res.json({ success: true, incident });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/incidents/:id/status', authenticate, isProvider, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['assigned', 'en_route', 'on_scene', 'completed', 'cancelled'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const updateData = { status };
        if (status === 'assigned') updateData.assigned_provider_id = req.user.user_id;
        if (status === 'completed') updateData.completed_at = new Date();
        
        await supabase
            .from('incidents')
            .update(updateData)
            .eq('incident_id', req.params.id);
        
        res.json({ success: true, message: `Status updated to ${status}` });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SEARCH ROUTE (Inverted Index)
// ============================================
app.get('/api/search', authenticate, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.status(400).json({ error: 'Query must be at least 2 characters' });
        }
        
        const incidentIds = invertedIndex.search(q);
        
        if (incidentIds.length === 0) {
            return res.json({ success: true, incidents: [] });
        }
        
        const { data: incidents } = await supabase
            .from('incidents')
            .select('*')
            .in('incident_id', incidentIds)
            .order('final_priority', { ascending: false });
        
        res.json({ success: true, incidents: incidents || [] });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PROVIDER ROUTES
// ============================================
app.put('/api/provider/location', authenticate, isProvider, async (req, res) => {
    try {
        const { latitude, longitude, service_radius } = req.body;
        
        await supabase
            .from('providers')
            .update({ latitude, longitude, service_radius: service_radius || 20 })
            .eq('provider_id', req.user.user_id);
        
        await supabase
            .from('users')
            .update({ latitude, longitude })
            .eq('user_id', req.user.user_id);
        
        res.json({ success: true, message: 'Location updated' });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/provider/availability', authenticate, isProvider, async (req, res) => {
    try {
        const { is_available } = req.body;
        await supabase
            .from('providers')
            .update({ is_available })
            .eq('provider_id', req.user.user_id);
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/provider/assigned', authenticate, isProvider, async (req, res) => {
    try {
        const { data: incidents } = await supabase
            .from('incidents')
            .select('*')
            .eq('assigned_provider_id', req.user.user_id)
            .order('created_at', { ascending: false });
        
        res.json({ success: true, incidents: incidents || [] });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ADMIN ROUTES
// ============================================
app.get('/api/admin/unverified-providers', authenticate, isAdmin, async (req, res) => {
    try {
        const { data: providers } = await supabase
            .from('providers')
            .select('*, users!provider_id(email, full_name, phone)')
            .eq('verified_by_admin', false);
        
        res.json({ success: true, providers: providers || [] });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/verify-provider/:id', authenticate, isAdmin, async (req, res) => {
    try {
        await supabase
            .from('providers')
            .update({ verified_by_admin: true })
            .eq('provider_id', req.params.id);
        
        await supabase
            .from('users')
            .update({ is_verified: true })
            .eq('user_id', req.params.id);
        
        res.json({ success: true, message: 'Provider verified' });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/boost-incident/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { boost_amount } = req.body; // 5% boost
        
        const { data: incident } = await supabase
            .from('incidents')
            .select('*')
            .eq('incident_id', req.params.id)
            .single();
        
        if (!incident) return res.status(404).json({ error: 'Incident not found' });
        
        const newAdminBoost = (incident.admin_boost || 0) + (boost_amount || 5);
        const { finalScore } = calculateWeightedScore({
            ...incident,
            admin_boost: newAdminBoost,
            created_at: incident.created_at
        });
        
        await supabase
            .from('incidents')
            .update({ admin_boost: newAdminBoost, final_priority: finalScore })
            .eq('incident_id', req.params.id);
        
        res.json({ success: true, new_priority: finalScore, boost_applied: boost_amount || 5 });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const { count: totalIncidents } = await supabase
            .from('incidents')
            .select('*', { count: 'exact', head: true });
        
        const { count: activeIncidents } = await supabase
            .from('incidents')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'assigned', 'en_route', 'on_scene']);
        
        const { count: totalProviders } = await supabase
            .from('providers')
            .select('*', { count: 'exact', head: true });
        
        const { count: verifiedProviders } = await supabase
            .from('providers')
            .select('*', { count: 'exact', head: true })
            .eq('verified_by_admin', true);
        
        res.json({
            success: true,
            stats: {
                totalIncidents,
                activeIncidents,
                totalProviders,
                verifiedProviders
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Export for Vercel
module.exports = app;

// Start server
if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}