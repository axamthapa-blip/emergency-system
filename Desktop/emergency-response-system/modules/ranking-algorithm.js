export class RankingAlgorithm {
    constructor() {
        this.weights = {
            severity: 0.55,
            timeElapsed: 0.20,
            proximity: 0.20,
            adminBoost: 0.05
        };
        
        this.severityMap = {
            'Medical': 7,
            'Fire': 9,
            'Police': 6,
            'Accident': 8,
            'NaturalDisaster': 10
        };
    }
    
    calculateSeverityScore(incident) {
        const baseSeverity = this.severityMap[incident.type] || 5;
        const keywords = incident.details?.toLowerCase() || '';
        let modifier = 0;
        
        if (keywords.includes('critical')) modifier += 2;
        if (keywords.includes('child') || keywords.includes('elderly')) modifier += 1.5;
        if (keywords.includes('multiple')) modifier += 1;
        if (keywords.includes('fire spreading')) modifier += 2;
        
        return Math.min(10, Math.max(0, baseSeverity + modifier));
    }
    
    calculateTimeScore(timestamp) {
        const incidentTime = new Date(timestamp).getTime();
        const now = new Date().getTime();
        const minutesElapsed = (now - incidentTime) / (1000 * 60);
        
        // Exponential decay after 30 minutes
        if (minutesElapsed <= 30) return 100;
        return Math.max(0, 100 * Math.exp(-(minutesElapsed - 30) / 60));
    }
    
    calculateProximityScore(incident) {
        const hash = this.hashCode(incident.locationDesc || incident.id);
        return 50 + (Math.abs(hash) % 50);
    }
    
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }
    
    calculateScore(incident, historicalData = []) {
        const severityScore = this.calculateSeverityScore(incident) * 10;
        const timeScore = this.calculateTimeScore(incident.timestamp);
        const proximityScore = this.calculateProximityScore(incident);
        const adminBoost = incident.adminBoost || 0;
        
        const finalScore = (severityScore * 0.55) + (timeScore * 0.20) + (proximityScore * 0.20) + (adminBoost * 0.05);
        
        let priority = 'ROUTINE';
        if (finalScore >= 80) priority = 'CRITICAL';
        else if (finalScore >= 60) priority = 'HIGH';
        else if (finalScore >= 40) priority = 'MEDIUM';
        else if (finalScore >= 20) priority = 'LOW';
        
        return {
            total: finalScore,
            priority: priority,
            breakdown: { severity: severityScore, time: timeScore, proximity: proximityScore, adminBoost: adminBoost }
        };
    }
    
    rankIncidents(incidents, historicalData = []) {
        const ranked = incidents.map(incident => ({
            incident,
            ranking: this.calculateScore(incident, historicalData)
        }));
        return ranked.sort((a, b) => b.ranking.total - a.ranking.total);
    }
}