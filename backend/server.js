const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const { setupDb } = require('./database');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

let db;
setupDb().then(database => {
    db = database;
    console.log("SQL Database is Ready!");
});

// 1. Existing Prediction Route
app.get('/api/predict/:ticker', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const source = req.query.source || "manual"; // "manual" or "auto"
 
    const pythonProcess = spawn('python', ['predictor.py', ticker, source]);
 
    let result = '';
 
    pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
    });
 
    pythonProcess.stderr.on('data', (data) => {
        // Capture Python errors for debugging
        console.error(`Python stderr: ${data}`);
    });
 
    pythonProcess.on('close', (code) => {
        const cleanResult = result.trim().split('\n')
            .find(line => line.startsWith('RESULT|') || line.startsWith('ERROR|'));
 
        if (cleanResult && cleanResult.startsWith('RESULT|')) {
            res.json({ raw: cleanResult });
        } else {
            res.status(500).json({ error: cleanResult || "Python script failed" });
        }
    });
});

// add to Watchlist
//  Now accepts price and verdict in the body
app.post('/api/watchlist', async (req, res) => {
    const { ticker, price, verdict } = req.body;
    try {
        // This stops the "7 duplicates" issue
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

// 3. NEW: Get Watchlist
app.get('/api/watchlist', async (req, res) => {
    // We use * to get ticker, price, verdict, and id
    const list = await db.all('SELECT * FROM watchlist'); 
    res.json(list);
});

// 4. NEW: Delete from Watchlist
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


// this reads prediction_log.csv and returns it as JSON.
// The CSV is written by predictor.py every time a prediction runs.
// CSV columns written by predictor.py:
//   timestamp, ticker, price, verdict, confidence_pct, cv_accuracy_pct

const fs   = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'prediction_log.csv');
//  Adjust this path if prediction_log.csv sits somewhere else.
//   __dirname is your server/ folder. '..' goes up one level to the project root.

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

        // Skip header row (index 0), parse the rest
        const rows = lines.slice(1).map((line) => {
            const [timestamp, ticker, price, verdict, confidence_pct, cv_accuracy_pct, source] = line.split(',');
            return {
                timestamp, ticker,
                price: parseFloat(price),
                verdict,
                confidence_pct: parseFloat(confidence_pct),
                cv_accuracy_pct: parseFloat(cv_accuracy_pct),
                source: source?.trim() ?? "manual",
            };
        });

        // Return newest first
        res.json(rows.reverse());
    } catch (err) {
        console.error('Error reading prediction log:', err);
        res.status(500).json({ error: 'Could not read prediction log' });
    }
});

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