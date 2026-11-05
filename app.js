/**
 * FelixAC Web Dashboard Frontend
 * Connects to Node.js backend with MySQL database
 */

// Configuration
const API_URL = window.location.origin + '/api';
let ws = null;

// State
let state = {
    connected: false,
    currentPage: 'dashboard',
    selectedPlayer: null,
    pendingAction: null,
    data: {}
};

// Charts
let charts = {
    players: null,
    warns: null,
    kicks: null,
    bans: null
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCharts();
    loadSettings();
    connect();
    startAutoRefresh();
    initWebSocket();
});

// WebSocket
function initWebSocket() {
    const wsUrl = `ws://${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onclose = () => {
        console.log('[WS] Disconnected, reconnecting...');
        setTimeout(initWebSocket, 3000);
    };
}

function handleWebSocketMessage(data) {
    if (data.type === 'detection') {
        showToast(`Detection: ${data.data.playerName} - ${data.data.type}`, 'warning');
        if (state.currentPage === 'dashboard') refreshDashboard();
    } else if (data.type === 'ban') {
        showToast(`Player banned: ${data.data.name}`, 'error');
        if (state.currentPage === 'bans') refreshBans();
    }
}

// Navigation
function initNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.page);
        });
    });
}

function toggleNavGroup(header) {
    header.closest('.nav-group').classList.toggle('open');
}

function navigateTo(page) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');

    state.currentPage = page;

    // Load page data
    switch (page) {
        case 'dashboard': refreshDashboard(); break;
        case 'players': refreshPlayers(); break;
        case 'bans': refreshBans(); break;
        case 'kicks': refreshKicks(); break;
        case 'warns': refreshWarns(); break;
        case 'monitoring': refreshMonitoring(); break;
        case 'events': refreshEvents(); break;
        case 'admins': refreshAdmins(); break;
        case 'logbook': refreshLogbook(); break;
    }
}

// API
async function api(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };

    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_URL}/${endpoint}`, options);
    return response.json();
}

// Connection
async function connect() {
    setConnectionStatus('connecting');

    try {
        const response = await api('status');
        if (response.success) {
            state.connected = true;
            setConnectionStatus('connected');
            updateServerInfo(response.data);
            refreshDashboard();
        } else {
            throw new Error('Connection failed');
        }
    } catch (error) {
        setConnectionStatus('error');
        console.error('Connection error:', error);
    }
}

function setConnectionStatus(status) {
    const el = document.getElementById('connection-status');
    el.className = 'connection-status ' + status;

    const texts = {
        connecting: 'Connecting...',
        connected: 'Connected',
        error: 'Connection Failed'
    };
    el.innerHTML = `<span class="status-dot"></span>${texts[status]}`;
}

function updateServerInfo(data) {
    document.getElementById('server-name').textContent = data.serverName || 'My Server';
    document.getElementById('server-title').textContent = data.serverName || 'My Server';
    document.getElementById('meta-version').textContent = data.version || '1.0.0';
    document.getElementById('ac-version').textContent = `v${data.version || '1.0.0'}`;
    document.getElementById('max-count').textContent = data.maxPlayers || 128;
    document.getElementById('online-count').textContent = data.playersOnline || 0;
    document.getElementById('player-count').textContent = data.playersOnline || 0;

    document.getElementById('server-description').textContent =
        `${data.playersOnline || 0} players online · FelixAC v${data.version || '1.0.0'}`;
}

// Dashboard
async function refreshDashboard() {
    try {
        const response = await api('dashboard');
        if (response.success) {
            updateDashboard(response.data);
        }
    } catch (error) {
        console.error('Dashboard refresh failed:', error);
    }
}

function updateDashboard(data) {
    state.data = data;

    // Update stats
    document.getElementById('online-count').textContent = data.stats?.playersOnline || 0;
    document.getElementById('warns-count').textContent = data.stats?.warns || 0;
    document.getElementById('kicks-count').textContent = data.stats?.kicks || 0;
    document.getElementById('bans-count').textContent = data.stats?.bans || 0;

    // Update charts
    updatePlayersChart(data.playerHistory || []);
    updateMiniChart('warns-chart', data.warnHistory || [], '#f59e0b');
    updateMiniChart('kicks-chart', data.kickHistory || [], '#fb923c');
    updateMiniChart('bans-chart', data.banHistory || [], '#f87171');
}

function startAutoRefresh() {
    setInterval(() => {
        if (state.connected && state.currentPage === 'dashboard') {
            refreshDashboard();
        }
    }, 10000);
}

// Charts
function initCharts() {
    // Players chart
    const playersCtx = document.getElementById('players-chart')?.getContext('2d');
    if (playersCtx) {
        charts.players = new Chart(playersCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: '#22d3ee',
                    backgroundColor: 'rgba(34, 211, 238, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#22d3ee',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#111820',
                        borderColor: '#1e2a38',
                        borderWidth: 1,
                        titleColor: '#e4e8ed',
                        bodyColor: '#22d3ee',
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            title: (items) => items[0]?.label || '',
                            label: (item) => `${item.raw} Online Players`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                        ticks: { color: '#4a5568', maxTicksLimit: 8, font: { size: 11 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                        ticks: { color: '#4a5568', font: { size: 11 } },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // Time filter buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // TODO: Fetch data for selected time range
        });
    });
}

function updatePlayersChart(data) {
    if (!charts.players) return;

    charts.players.data.labels = data.map(d => d.time);
    charts.players.data.datasets[0].data = data.map(d => d.count);
    charts.players.update('none');
}

function updateMiniChart(id, data, color) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    // Ensure we have at least 10 data points
    while (data.length < 10) data.unshift(0);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map((_, i) => i),
            datasets: [{
                data: data,
                borderColor: color,
                backgroundColor: color + '33',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false, beginAtZero: true } }
        }
    });
}

// Players
async function refreshPlayers() {
    try {
        const response = await api('players');
        if (response.success) {
            renderPlayersTable(response.data);
        }
    } catch (error) {
        console.error('Players refresh failed:', error);
    }
}

function renderPlayersTable(players) {
    const tbody = document.getElementById('players-table');
    if (!tbody) return;

    if (!players?.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6b7a8f;padding:40px">No players online</td></tr>';
        return;
    }

    tbody.innerHTML = players.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${escapeHtml(p.name)}</td>
            <td style="font-size:11px;color:#6b7a8f">${p.identifiers?.license?.substring(0, 20) || 'N/A'}...</td>
            <td>${p.ping}ms</td>
            <td>${formatTime(p.playTime)}</td>
            <td class="actions">
                <button class="btn btn-sm btn-secondary" onclick="viewPlayer(${p.id})">View</button>
                <button class="btn btn-sm btn-outline" onclick="prepareAction('warn', ${p.id}, '${escapeHtml(p.name)}')">Warn</button>
                <button class="btn btn-sm btn-outline" onclick="prepareAction('kick', ${p.id}, '${escapeHtml(p.name)}')">Kick</button>
                <button class="btn btn-sm btn-danger" onclick="prepareAction('ban', ${p.id}, '${escapeHtml(p.name)}')">Ban</button>
            </td>
        </tr>
    `).join('');
}

function filterPlayers() {
    const search = document.getElementById('player-search').value.toLowerCase();
    const rows = document.querySelectorAll('#players-table tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

// Bans
async function refreshBans() {
    try {
        const response = await api('bans');
        if (response.success) {
            renderBansTable(response.data);
        }
    } catch (error) {
        console.error('Bans refresh failed:', error);
    }
}

function renderBansTable(bans) {
    const tbody = document.getElementById('bans-table');
    if (!tbody) return;

    if (!bans?.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#6b7a8f;padding:40px">No bans</td></tr>';
        return;
    }

    tbody.innerHTML = bans.map(b => `
        <tr>
            <td>${b.time}</td>
            <td>${escapeHtml(b.name)}</td>
            <td>${escapeHtml(b.reason || 'No reason')}</td>
            <td>${escapeHtml(b.admin)}</td>
            <td class="actions">
                <button class="btn btn-sm btn-secondary" onclick="unban(${b.id})">Unban</button>
            </td>
        </tr>
    `).join('');
}

async function unban(id) {
    if (!confirm('Are you sure you want to unban this player?')) return;

    try {
        await api(`bans/${id}`, 'DELETE');
        showToast('Player unbanned', 'success');
        refreshBans();
    } catch (error) {
        showToast('Failed to unban', 'error');
    }
}

// Kicks
async function refreshKicks() {
    try {
        const response = await api('kicks');
        if (response.success) {
            renderKicksTable(response.data);
        }
    } catch (error) {
        console.error('Kicks refresh failed:', error);
    }
}

function renderKicksTable(kicks) {
    const tbody = document.getElementById('kicks-table');
    if (!tbody) return;

    if (!kicks?.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#6b7a8f;padding:40px">No kicks</td></tr>';
        return;
    }

    tbody.innerHTML = kicks.map(k => `
        <tr>
            <td>${k.time}</td>
            <td>${escapeHtml(k.name)}</td>
            <td>${escapeHtml(k.reason || 'No reason')}</td>
            <td>${escapeHtml(k.admin)}</td>
        </tr>
    `).join('');
}

// Warns
async function refreshWarns() {
    try {
        const response = await api('warns');
        if (response.success) {
            renderWarnsTable(response.data);
        }
    } catch (error) {
        console.error('Warns refresh failed:', error);
    }
}

function renderWarnsTable(warns) {
    const tbody = document.getElementById('warns-table');
    if (!tbody) return;

    if (!warns?.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#6b7a8f;padding:40px">No warnings</td></tr>';
        return;
    }

    tbody.innerHTML = warns.map(w => `
        <tr>
            <td>${w.time}</td>
            <td>${escapeHtml(w.name)}</td>
            <td>${escapeHtml(w.reason || 'No reason')}</td>
            <td>${escapeHtml(w.admin)}</td>
            <td class="actions">
                <button class="btn btn-sm btn-secondary" onclick="removeWarn(${w.id})">Remove</button>
            </td>
        </tr>
    `).join('');
}

async function removeWarn(id) {
    if (!confirm('Remove this warning?')) return;

    try {
        await api(`warns/${id}`, 'DELETE');
        showToast('Warning removed', 'success');
        refreshWarns();
    } catch (error) {
        showToast('Failed to remove warning', 'error');
    }
}

// Actions
function prepareAction(action, playerId, playerName) {
    state.pendingAction = { action, playerId, playerName };
    document.getElementById('action-modal-title').textContent =
        `${action.charAt(0).toUpperCase() + action.slice(1)} Player`;
    document.getElementById('action-modal-player').textContent = `Player: ${playerName}`;
    document.getElementById('action-reason').value = '';
    openModal('action-modal');
}

async function confirmAction() {
    if (!state.pendingAction) return;

    const { action, playerId } = state.pendingAction;
    const reason = document.getElementById('action-reason').value || 'No reason provided';

    try {
        const response = await api('action', 'POST', { action, playerId, reason });
        if (response.success) {
            showToast(`Player ${action}ed successfully`, 'success');
            closeModal('action-modal');
            refreshDashboard();
        } else {
            showToast(`Failed to ${action} player`, 'error');
        }
    } catch (error) {
        showToast('Action failed', 'error');
    }

    state.pendingAction = null;
}

// Admin actions
async function adminAction(action) {
    try {
        const response = await api('admin', 'POST', { action });
        if (response.success) {
            showToast(`${action} executed`, 'success');
        }
    } catch (error) {
        showToast('Action failed', 'error');
    }
}

// Announcements
function showAnnouncementModal() {
    document.getElementById('announce-title').value = '';
    document.getElementById('announce-message').value = '';
    openModal('announcement-modal');
}

async function sendAnnouncement() {
    const title = document.getElementById('announce-title').value;
    const message = document.getElementById('announce-message').value;

    if (!title || !message) {
        showToast('Please fill all fields', 'warning');
        return;
    }

    try {
        await api('announce', 'POST', { title, message });
        showToast('Announcement sent', 'success');
        closeModal('announcement-modal');
    } catch (error) {
        showToast('Failed to send announcement', 'error');
    }
}

// Lookup
async function lookupPlayer() {
    const query = document.getElementById('lookup-input').value.trim();
    if (!query) return;

    try {
        const response = await api(`lookup?q=${encodeURIComponent(query)}`);
        if (response.success) {
            renderLookupResults(response.data);
        }
    } catch (error) {
        showToast('Lookup failed', 'error');
    }
}

function renderLookupResults(results) {
    const container = document.getElementById('lookup-results');

    if (!results?.length) {
        container.innerHTML = '<div style="text-align:center;color:#6b7a8f;padding:40px">No results found</div>';
        return;
    }

    container.innerHTML = results.map(r => `
        <div style="background:#151d27;border-radius:8px;padding:16px;margin-top:12px">
            <h4 style="color:#22d3ee;margin-bottom:12px">${escapeHtml(r.name)}</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
                <div><span style="color:#6b7a8f">License:</span> ${r.license || 'N/A'}</div>
                <div><span style="color:#6b7a8f">Discord:</span> ${r.discord || 'N/A'}</div>
                <div><span style="color:#6b7a8f">Steam:</span> ${r.steam || 'N/A'}</div>
                <div><span style="color:#6b7a8f">Bans:</span> <span style="color:#f87171">${r.banCount || 0}</span></div>
            </div>
        </div>
    `).join('');
}

// Monitoring
async function refreshMonitoring() {
    const content = document.getElementById('monitoring-content');
    content.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">
            <div style="background:#151d27;padding:16px;border-radius:8px;text-align:center">
                <div style="color:#6b7a8f;font-size:12px">AI Status</div>
                <div style="color:#22d3ee;font-size:24px;font-weight:600" id="ai-status">Checking...</div>
            </div>
            <div style="background:#151d27;padding:16px;border-radius:8px;text-align:center">
                <div style="color:#6b7a8f;font-size:12px">Monitored</div>
                <div style="color:#22d3ee;font-size:24px;font-weight:600" id="ai-monitored">0</div>
            </div>
            <div style="background:#151d27;padding:16px;border-radius:8px;text-align:center">
                <div style="color:#6b7a8f;font-size:12px">Alerts Today</div>
                <div style="color:#f59e0b;font-size:24px;font-weight:600" id="ai-alerts">0</div>
            </div>
        </div>
        <button class="btn btn-primary" onclick="toggleAI()">Toggle AI Spectator</button>
    `;

    const data = state.data?.ai;
    if (data) {
        document.getElementById('ai-status').textContent = data.running ? 'Running' : 'Stopped';
        document.getElementById('ai-monitored').textContent = data.monitored || 0;
        document.getElementById('ai-alerts').textContent = data.alertsToday || 0;
    }
}

async function toggleAI() {
    try {
        const current = state.data?.ai?.running || false;
        await api('ai/toggle', 'POST', { enabled: !current });
        showToast(`AI Spectator ${!current ? 'started' : 'stopped'}`, 'success');
        refreshDashboard();
    } catch (error) {
        showToast('Failed to toggle AI', 'error');
    }
}

// Events
async function refreshEvents() {
    try {
        const response = await api('events');
        const container = document.getElementById('events-list');

        if (!response.success || !response.data?.length) {
            container.innerHTML = '<div style="text-align:center;color:#6b7a8f;padding:40px">No events</div>';
            return;
        }

        container.innerHTML = response.data.map(e => `
            <div style="background:#151d27;padding:12px;border-radius:8px;margin-bottom:8px;border-left:3px solid #3b9eff">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span style="color:#22d3ee;font-weight:500">${escapeHtml(e.player_name || 'System')}</span>
                    <span style="color:#6b7a8f;font-size:12px">${e.time}</span>
                </div>
                <div style="color:#f59e0b;font-size:13px">${escapeHtml(e.type)}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Events refresh failed:', error);
    }
}

// Admins
async function refreshAdmins() {
    try {
        const response = await api('admins');
        const container = document.getElementById('admins-list');

        if (!response.success || !response.data?.length) {
            container.innerHTML = '<div style="text-align:center;color:#6b7a8f;padding:40px">No admins configured</div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead><tr><th>Name</th><th>Role</th><th>Joined</th></tr></thead>
                <tbody>
                    ${response.data.map(a => `
                        <tr>
                            <td>${escapeHtml(a.name)}</td>
                            <td><span style="color:#3b9eff">${a.role}</span></td>
                            <td>${a.joined}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Admins refresh failed:', error);
    }
}

// Logbook
async function refreshLogbook() {
    try {
        const response = await api('detections');
        const container = document.getElementById('logbook-content');

        if (!response.success || !response.data?.length) {
            container.innerHTML = '<div style="text-align:center;color:#6b7a8f;padding:40px">No detections logged</div>';
            return;
        }

        container.innerHTML = response.data.map(d => `
            <div style="background:#151d27;padding:12px;border-radius:8px;margin-bottom:8px;border-left:3px solid #f59e0b">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span style="color:#22d3ee;font-weight:500">${escapeHtml(d.player)} (ID: ${d.playerId})</span>
                    <span style="color:#6b7a8f;font-size:12px">${d.time}</span>
                </div>
                <div style="color:#f59e0b;font-size:13px;margin-bottom:4px">${escapeHtml(d.type)}</div>
                <div style="color:#6b7a8f;font-size:12px">${escapeHtml(d.details || '')}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Logbook refresh failed:', error);
    }
}

// Settings
function loadSettings() {
    document.getElementById('server-ip').value = localStorage.getItem('fivem_ip') || '';
    document.getElementById('server-port').value = localStorage.getItem('fivem_port') || '30120';
    document.getElementById('api-key').value = localStorage.getItem('api_key') || '';
}

function saveServerSettings() {
    localStorage.setItem('fivem_ip', document.getElementById('server-ip').value);
    localStorage.setItem('fivem_port', document.getElementById('server-port').value);
    localStorage.setItem('api_key', document.getElementById('api-key').value);
    showToast('Settings saved', 'success');
    connect();
}

function saveDbSettings() {
    showToast('Database settings saved', 'success');
}

// Modals
function openModal(id) {
    document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
}

// Toast
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Utilities
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(minutes) {
    if (!minutes) return '0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
