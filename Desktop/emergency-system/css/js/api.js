// API Configuration
const API_URL = '/api';

const api = {
    // Auth
    async register(userData) {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await response.json();
        if (data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
        }
        return data;
    },

    async login(email, password) {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
        }
        return data;
    },

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    },

    getToken() {
        return localStorage.getItem('token');
    },

    getCurrentUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    isAuthenticated() {
        return !!localStorage.getItem('token');
    },

    // Incidents
    async createIncident(formData) {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/incidents`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        return response.json();
    },

    async getIncidents() {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/incidents`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },

    async getIncidentById(id) {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/incidents/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },

    async updateIncidentStatus(id, status) {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/incidents/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });
        return response.json();
    },

    async searchIncidents(query) {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },

    // Provider
    async updateProviderLocation(latitude, longitude, service_radius) {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/provider/location`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ latitude, longitude, service_radius })
        });
        return response.json();
    },

    async updateProviderAvailability(is_available) {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/provider/availability`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ is_available })
        });
        return response.json();
    },

    async getAssignedIncidents() {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/provider/assigned`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },

    // Admin
    async getUnverifiedProviders() {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/admin/unverified-providers`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },

    async verifyProvider(providerId) {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/admin/verify-provider/${providerId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },

    async boostIncident(incidentId, boost_amount = 5) {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/admin/boost-incident/${incidentId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ boost_amount })
        });
        return response.json();
    },

    async getAdminStats() {
        const token = this.getToken();
        const response = await fetch(`${API_URL}/admin/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    }
};

window.api = api;