const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const { setupDb } = require('./database');

const app = express();
const port = 5000;

app.use(cors({
    origin: ['https://proj.ruppin.ac.il', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'DELETE'],
    credentials: true
}));
app.use(express.json());

// ─────────────────────────────────────────────────────────────────
// HEALTH CHECK — Used by UptimeRobot to keep Render awake
// ─────────────────────────────────────────────────────────────────
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});


let db;
setupDb().then(database => {
    db = database;
    console.log("SQL Database is Ready!");
});

// ─────────────────────────────────────────────────────────────────
// HELPER — run predictor.py and return the RESULT|... line
// ─────────────────────────────────────────────────────────────────
function runPredictor(args, res) {
    const pythonProcess = spawn('python3', ['predictor.py', ...args]);

    let result = '';

    pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        const cleanResult = result.trim().split('\n')
            .find(line => line.startsWith('RESULT|') || line.startsWith('ERROR|'));

        if (cleanResult && cleanResult.startsWith('RESULT|')) {
            res.json({ raw: cleanResult });
        } else {
            res.status(500).json({
                error: cleanResult || "Python script failed",
                fullOutput: result
            });
        }
    });
}

// ─────────────────────────────────────────────────────────────────
// 1a. Prediction Route — WITH horizon
//     GET /api/predict/AAPL/1h
//     GET /api/predict/AAPL/1d
//     GET /api/predict/AAPL/1wk
//     GET /api/predict/AAPL/1mo
//     GET /api/predict/AAPL/6mo
//     GET /api/predict/AAPL/1y
// ─────────────────────────────────────────────────────────────────
app.get('/api/predict/:ticker/:horizon', (req, res) => {
    const ticker  = req.params.ticker.toUpperCase();
    const horizon = req.params.horizon.toLowerCase();
    const source  = req.query.source || "manual";

    const VALID_HORIZONS = ['1h', '1d', '1wk', '1mo', '6mo', '1y'];
    if (!VALID_HORIZONS.includes(horizon)) {
        return res.status(400).json({
            error: `Invalid horizon '${horizon}'. Valid options: ${VALID_HORIZONS.join(', ')}`
        });
    }

    runPredictor([ticker, horizon, source], res);
});

// ─────────────────────────────────────────────────────────────────
// 1b. Prediction Route — WITHOUT horizon (defaults to 1h)
//     GET /api/predict/AAPL
//     Kept for backwards compatibility with existing frontend calls
// ─────────────────────────────────────────────────────────────────
app.get('/api/predict/:ticker', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const source = req.query.source || "manual";

    runPredictor([ticker, '1h', source], res);
});

// ─────────────────────────────────────────────────────────────────
// 2. Add to Watchlist
// ─────────────────────────────────────────────────────────────────
app.post('/api/watchlist', async (req, res) => {
    const { ticker, price, verdict } = req.body;
    try {
        await db.run(
            `INSERT INTO watchlist (ticker, price, verdict) 
             VALUES (?, ?, ?) 
             ON CONFLICT(ticker) DO UPDATE SET 
             price=excluded.price, 
             verdict=excluded.verdict`,
            [ticker, price, verdict]
        );
        res.json({ success: true, message: "Saved/Updated in SQL!" });
    } catch (err) {
        console.error(err);
        res.status(400).json({ success: false, error: "Database error" });
    }
});

// ─────────────────────────────────────────────────────────────────
// 3. Get Watchlist
// ─────────────────────────────────────────────────────────────────
app.get('/api/watchlist', async (req, res) => {
    const list = await db.all('SELECT * FROM watchlist');
    res.json(list);
});

// ─────────────────────────────────────────────────────────────────
// 4. Delete from Watchlist
// ─────────────────────────────────────────────────────────────────
app.delete('/api/watchlist/:ticker', async (req, res) => {
    const ticker = req.params.ticker;
    try {
        await db.run('DELETE FROM watchlist WHERE ticker = ?', [ticker]);
        res.json({ success: true, message: `Removed ${ticker} from SQL!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Database error" });
    }
});

// ─────────────────────────────────────────────────────────────────
// 5. Get Prediction Log
// ─────────────────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'prediction_log.csv');

app.get('/api/log', (req, res) => {
    try {
        if (!fs.existsSync(LOG_PATH)) {
            return res.json([]);
        }

        const raw   = fs.readFileSync(LOG_PATH, 'utf8');
        const lines = raw.trim().split('\n').filter(Boolean);

        if (lines.length < 2) {
            return res.json([]);
        }

        // Skip header row, parse the rest
        // CSV columns: timestamp, ticker, horizon, price, verdict,
        //              confidence_pct, cv_accuracy_pct, source
        const rows = lines.slice(1).map((line) => {
            const parts = line.split(',');
            // Handle both old format (no horizon) and new format (with horizon)
            if (parts.length >= 8) {
                // New format with horizon
                const [timestamp, ticker, horizon, price, verdict,
                       confidence_pct, cv_accuracy_pct, source] = parts;
                return {
                    timestamp, ticker, horizon,
                    price:           parseFloat(price),
                    verdict,
                    confidence_pct:  parseFloat(confidence_pct),
                    cv_accuracy_pct: parseFloat(cv_accuracy_pct),
                    source:          source?.trim() ?? "manual",
                };
            } else {
                // Old format without horizon
                const [timestamp, ticker, price, verdict,
                       confidence_pct, cv_accuracy_pct, source] = parts;
                return {
                    timestamp, ticker, horizon: '1h',
                    price:           parseFloat(price),
                    verdict,
                    confidence_pct:  parseFloat(confidence_pct),
                    cv_accuracy_pct: parseFloat(cv_accuracy_pct),
                    source:          source?.trim() ?? "manual",
                };
            }
        });

        res.json(rows.reverse());
    } catch (err) {
        console.error('Error reading prediction log:', err);
        res.status(500).json({ error: 'Could not read prediction log' });
    }
});

// ─────────────────────────────────────────────────────────────────
// 6. Clear Prediction Log
// ─────────────────────────────────────────────────────────────────
app.delete('/api/log', (req, res) => {
    try {
        if (fs.existsSync(LOG_PATH)) {
            fs.unlinkSync(LOG_PATH);
        }
        res.json({ success: true, message: "Log cleared." });
    } catch (err) {
        console.error('Error clearing log:', err);
        res.status(500).json({ error: 'Could not clear log file.' });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
