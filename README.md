# FelixAC Web Dashboard - Deployment Guide

## Quick Deploy to Railway (FREE)

### Step 1: Create Railway Account
1. Go to https://railway.app
2. Sign up with GitHub (recommended)

### Step 2: Create New Project
1. Click "New Project"
2. Choose "Deploy from GitHub repo" OR "Empty Project"

### Step 3: Add MySQL Database
1. Click "+ New" in your project
2. Select "Database" > "MySQL"
3. Wait for it to provision
4. Click on MySQL > "Variables" tab
5. Copy these values:
   - `MYSQLHOST` 
   - `MYSQLPORT`
   - `MYSQLDATABASE`
   - `MYSQLUSER`
   - `MYSQLPASSWORD`

### Step 4: Deploy Backend
**Option A: From GitHub**
1. Push this `backend` folder to a GitHub repo
2. In Railway, click "+ New" > "GitHub Repo"
3. Select your repo

**Option B: Upload directly**
1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. In this folder, run: `railway up`

### Step 5: Set Environment Variables
In Railway, go to your backend service > Variables tab:

```
DB_HOST=<MYSQLHOST value>
DB_PORT=<MYSQLPORT value>
DB_USER=<MYSQLUSER value>
DB_PASS=<MYSQLPASSWORD value>
DB_NAME=<MYSQLDATABASE value>
FIVEM_HOST=<your FiveM server IP>
FIVEM_PORT=30120
FIVEM_API_KEY=felixac_change_this_key
```

### Step 6: Get Your URL
After deploying, Railway gives you a URL like:
`https://felixac-production-xxxx.up.railway.app`

This is your web dashboard!

### Step 7: Update FiveM Config
In your FiveM server `FelixAC/shared/config.lua`:

```lua
WebAPI = {
    Enabled = true,
    Key = "felixac_change_this_key",
    BackendURL = "https://felixac-production-xxxx.up.railway.app"
}
```

---

## Files Structure

```
backend/
├── public/           # Frontend files (served automatically)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server.js         # Node.js server
├── package.json      # Dependencies
├── Procfile          # Railway start command
├── .env.example      # Config template
└── setup.sql         # Database schema (auto-created)
```

---

## Local Testing

1. Copy `.env.example` to `.env`
2. Fill in your MySQL credentials
3. Run: `npm install`
4. Run: `npm start`
5. Open: http://localhost:3000
