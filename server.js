/**
 * FelixAC Web Dashboard Backend
 * Node.js + Express + MySQL
 */

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
let config = {
    port: process.env.PORT || 3000,
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'felixac'
    },
    fivem: {
        host: process.env.FIVEM_HOST || '127.0.0.1',
        port: process.env.FIVEM_PORT || 30120,
        apiKey: process.env.FIVEM_API_KEY || 'felixac_change_this_key'
    }
};

// Database connection pool
let db = null;

async function initDatabase() {
    try {
        db = await mysql.createPool({
            host: config.db.host,
            port: config.db.port,
            user: config.db.user,
            password: config.db.password,
            database: config.db.database,
            waitForConnections: true,
            connectionLimit: 10
        });

        // Create tables if they don't exist
        await db.execute(`
            CREATE TABLE IF NOT EXISTS bans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                license VARCHAR(255),
                discord VARCHAR(255),
                steam VARCHAR(255),
                ip VARCHAR(45),
                reason TEXT,
                admin VARCHAR(255) DEFAULT 'FelixAC',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                active BOOLEAN DEFAULT TRUE,
                INDEX idx_license (license),
                INDEX idx_discord (discord),
                INDEX idx_steam (steam)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS kicks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                license VARCHAR(255),
                discord VARCHAR(255),
                reason TEXT,
                admin VARCHAR(255) DEFAULT 'FelixAC',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS warns (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                license VARCHAR(255),
                discord VARCHAR(255),
                reason TEXT,
                admin VARCHAR(255) DEFAULT 'FelixAC',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                active BOOLEAN DEFAULT TRUE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS detections (
                id INT AUTO_INCREMENT PRIMARY KEY,
                player_name VARCHAR(255) NOT NULL,
                player_id INT,
                license VARCHAR(255),
                type VARCHAR(100) NOT NULL,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_type (type),
                INDEX idx_created (created_at)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS player_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                count INT NOT NULL,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_recorded (recorded_at)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                license VARCHAR(255) UNIQUE,
                discord VARCHAR(255),
                role ENUM('admin', 'moderator', 'viewer') DEFAULT 'viewer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type VARCHAR(100) NOT NULL,
                player_name VARCHAR(255),
                player_id INT,
                data JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_type (type),
                INDEX idx_created (created_at)
            )
        `);

        console.log('[DB] Connected to MySQL database');
        return true;
    } catch (error) {
        console.error('[DB] Connection failed:', error.message);
        return false;
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// FiveM API helper
async function fivemRequest(endpoint, method = 'GET', data = null) {
    const url = `http://${config.fivem.host}:${config.fivem.port}/felixac/${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.fivem.apiKey}`
        }
    };

    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        console.error('[FiveM] Request failed:', error.message);
        return { success: false, error: error.message };
    }
}

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('[WS] Client connected');

    ws.on('close', () => {
        clients.delete(ws);
        console.log('[WS] Client disconnected');
    });
});

function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// API Routes

// Status
app.get('/api/status', async (req, res) => {
    const fivemStatus = await fivemRequest('status');
    const dbConnected = db !== null;

    res.json({
        success: true,
        data: {
            serverName: fivemStatus.data?.serverName || 'My Server',
            version: fivemStatus.data?.version || '1.0.0',
            maxPlayers: fivemStatus.data?.maxPlayers || 128,
            playersOnline: fivemStatus.data?.playersOnline || 0,
            dbConnected,
            fivemConnected: fivemStatus.success
        }
    });
});

// Dashboard data
app.get('/api/dashboard', async (req, res) => {
    try {
        // Get counts from database
        const [[{ bans }]] = await db.execute('SELECT COUNT(*) as bans FROM bans WHERE active = TRUE');
        const [[{ kicks }]] = await db.execute('SELECT COUNT(*) as kicks FROM kicks WHERE DATE(created_at) = CURDATE()');
        const [[{ warns }]] = await db.execute('SELECT COUNT(*) as warns FROM warns WHERE active = TRUE');

        // Get player history
        const [history] = await db.execute(`
            SELECT count, DATE_FORMAT(recorded_at, '%H:%i') as time
            FROM player_history
            WHERE recorded_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY recorded_at ASC
        `);

        // Get recent detections
        const [detections] = await db.execute(`
            SELECT id, player_name as player, player_id as playerId, type, details,
                   DATE_FORMAT(created_at, '%H:%i:%s') as time
            FROM detections
            ORDER BY created_at DESC
            LIMIT 20
        `);

        // Get FiveM live data
        const fivemData = await fivemRequest('dashboard');

        // Get mini chart data
        const [warnHistory] = await db.execute(`
            SELECT COUNT(*) as count, DATE(created_at) as date
            FROM warns
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 10 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `);

        const [kickHistory] = await db.execute(`
            SELECT COUNT(*) as count, DATE(created_at) as date
            FROM kicks
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 10 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `);

        const [banHistory] = await db.execute(`
            SELECT COUNT(*) as count, DATE(created_at) as date
            FROM bans
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 10 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `);

        res.json({
            success: true,
            data: {
                stats: {
                    bans,
                    kicks,
                    warns,
                    playersOnline: fivemData.data?.stats?.playersOnline || 0
                },
                playerHistory: history.map(h => ({ time: h.time, count: h.count })),
                warnHistory: warnHistory.map(w => w.count),
                kickHistory: kickHistory.map(k => k.count),
                banHistory: banHistory.map(b => b.count),
                recentDetections: detections,
                ai: fivemData.data?.ai || { running: false }
            }
        });
    } catch (error) {
        console.error('[API] Dashboard error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Players
app.get('/api/players', async (req, res) => {
    const fivemData = await fivemRequest('players');
    res.json(fivemData);
});

app.get('/api/player/:id', async (req, res) => {
    const fivemData = await fivemRequest(`player/${req.params.id}`);
    res.json(fivemData);
});

// Bans
app.get('/api/bans', async (req, res) => {
    try {
        const [bans] = await db.execute(`
            SELECT id, name, license, discord, steam, reason, admin,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as time,
                   expires_at, active
            FROM bans
            ORDER BY created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, data: bans });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/bans', async (req, res) => {
    const { name, license, discord, steam, reason, admin, expiresAt } = req.body;
    try {
        await db.execute(
            'INSERT INTO bans (name, license, discord, steam, reason, admin, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, license, discord, steam, reason, admin || 'Web Admin', expiresAt]
        );
        broadcast({ type: 'ban', data: { name, reason } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/bans/:id', async (req, res) => {
    try {
        await db.execute('UPDATE bans SET active = FALSE WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Kicks
app.get('/api/kicks', async (req, res) => {
    try {
        const [kicks] = await db.execute(`
            SELECT id, name, license, discord, reason, admin,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as time
            FROM kicks
            ORDER BY created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, data: kicks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/kicks', async (req, res) => {
    const { name, license, discord, reason, admin } = req.body;
    try {
        await db.execute(
            'INSERT INTO kicks (name, license, discord, reason, admin) VALUES (?, ?, ?, ?, ?)',
            [name, license, discord, reason, admin || 'Web Admin']
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Warns
app.get('/api/warns', async (req, res) => {
    try {
        const [warns] = await db.execute(`
            SELECT id, name, license, discord, reason, admin, active,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as time
            FROM warns
            ORDER BY created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, data: warns });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/warns', async (req, res) => {
    const { name, license, discord, reason, admin } = req.body;
    try {
        await db.execute(
            'INSERT INTO warns (name, license, discord, reason, admin) VALUES (?, ?, ?, ?, ?)',
            [name, license, discord, reason, admin || 'Web Admin']
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/warns/:id', async (req, res) => {
    try {
        await db.execute('UPDATE warns SET active = FALSE WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Detections
app.get('/api/detections', async (req, res) => {
    try {
        const [detections] = await db.execute(`
            SELECT id, player_name as player, player_id as playerId, license, type, details,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as time
            FROM detections
            ORDER BY created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, data: detections });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/detections', async (req, res) => {
    const { playerName, playerId, license, type, details } = req.body;
    try {
        await db.execute(
            'INSERT INTO detections (player_name, player_id, license, type, details) VALUES (?, ?, ?, ?, ?)',
            [playerName, playerId, license, type, details]
        );
        broadcast({ type: 'detection', data: { playerName, type, details } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lookup
app.get('/api/lookup', async (req, res) => {
    const q = req.query.q;
    if (!q) {
        return res.json({ success: true, data: [] });
    }

    try {
        const searchTerm = `%${q}%`;
        const [results] = await db.execute(`
            SELECT DISTINCT name, license, discord, steam,
                (SELECT COUNT(*) FROM bans b WHERE b.license = t.license AND b.active = TRUE) as banCount,
                (SELECT COUNT(*) FROM warns w WHERE w.license = t.license AND w.active = TRUE) as warnCount,
                (SELECT MAX(created_at) FROM bans b WHERE b.license = t.license) as lastSeen
            FROM (
                SELECT name, license, discord, steam FROM bans
                UNION
                SELECT name, license, discord, NULL FROM kicks
                UNION
                SELECT name, license, discord, NULL FROM warns
            ) t
            WHERE name LIKE ? OR license LIKE ? OR discord LIKE ? OR steam LIKE ?
            LIMIT 20
        `, [searchTerm, searchTerm, searchTerm, searchTerm]);

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin actions (proxy to FiveM)
app.post('/api/action', async (req, res) => {
    const { action, playerId, reason } = req.body;

    // Log to database
    if (action === 'ban') {
        const playerData = await fivemRequest(`player/${playerId}`);
        if (playerData.success) {
            await db.execute(
                'INSERT INTO bans (name, license, discord, steam, reason, admin) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    playerData.data.name,
                    playerData.data.identifiers?.license,
                    playerData.data.identifiers?.discord,
                    playerData.data.identifiers?.steam,
                    reason,
                    'Web Admin'
                ]
            );
        }
    } else if (action === 'kick') {
        const playerData = await fivemRequest(`player/${playerId}`);
        if (playerData.success) {
            await db.execute(
                'INSERT INTO kicks (name, license, discord, reason, admin) VALUES (?, ?, ?, ?, ?)',
                [
                    playerData.data.name,
                    playerData.data.identifiers?.license,
                    playerData.data.identifiers?.discord,
                    reason,
                    'Web Admin'
                ]
            );
        }
    } else if (action === 'warn') {
        const playerData = await fivemRequest(`player/${playerId}`);
        if (playerData.success) {
            await db.execute(
                'INSERT INTO warns (name, license, discord, reason, admin) VALUES (?, ?, ?, ?, ?)',
                [
                    playerData.data.name,
                    playerData.data.identifiers?.license,
                    playerData.data.identifiers?.discord,
                    reason,
                    'Web Admin'
                ]
            );
        }
    }

    // Forward to FiveM
    const result = await fivemRequest('action', 'POST', { action, playerId, reason });
    res.json(result);
});

// Admin actions
app.post('/api/admin', async (req, res) => {
    const result = await fivemRequest('admin', 'POST', req.body);
    res.json(result);
});

// Announcement
app.post('/api/announce', async (req, res) => {
    const result = await fivemRequest('announce', 'POST', req.body);
    res.json(result);
});

// AI toggle
app.post('/api/ai/toggle', async (req, res) => {
    const result = await fivemRequest('ai/toggle', 'POST', req.body);
    res.json(result);
});

// Events
app.get('/api/events', async (req, res) => {
    try {
        const [events] = await db.execute(`
            SELECT id, type, player_name, player_id, data,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as time
            FROM events
            ORDER BY created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, data: events });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Resources (from FiveM)
app.get('/api/resources', async (req, res) => {
    const result = await fivemRequest('resources');
    res.json(result);
});

// Admins
app.get('/api/admins', async (req, res) => {
    try {
        const [admins] = await db.execute(`
            SELECT id, name, license, discord, role,
                   DATE_FORMAT(created_at, '%Y-%m-%d') as joined
            FROM admins
            ORDER BY role, name
        `);
        res.json({ success: true, data: admins });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Record player history periodically
setInterval(async () => {
    if (!db) return;
    try {
        const fivemData = await fivemRequest('status');
        if (fivemData.success) {
            await db.execute(
                'INSERT INTO player_history (count) VALUES (?)',
                [fivemData.data.playersOnline || 0]
            );
        }
    } catch (error) {
        console.error('[History] Failed to record:', error.message);
    }
}, 60000); // Every minute

// Start server
async function start() {
    const dbReady = await initDatabase();

    server.listen(config.port, () => {
        console.log('');
        console.log('  ╔═══════════════════════════════════════════════╗');
        console.log('  ║       FelixAC Web Dashboard Backend           ║');
        console.log('  ╠═══════════════════════════════════════════════╣');
        console.log(`  ║  Dashboard:  http://localhost:${config.port}             ║`);
        console.log(`  ║  API:        http://localhost:${config.port}/api         ║`);
        console.log(`  ║  WebSocket:  ws://localhost:${config.port}               ║`);
        console.log('  ║                                               ║');
        console.log(`  ║  Database:   ${dbReady ? 'Connected' : 'Not connected'}                    ║`);
        console.log(`  ║  FiveM:      ${config.fivem.host}:${config.fivem.port}               ║`);
        console.log('  ╚═══════════════════════════════════════════════╝');
        console.log('');
    });
}

start();
