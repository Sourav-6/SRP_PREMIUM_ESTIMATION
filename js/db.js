import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve('./data');
const DB_PATH = path.join(DB_DIR, 'database.db');

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// Open / Create the SQLite database
const db = new Database(DB_PATH);

/**
 * Initializes the database tables if they do not exist.
 */
export function initDatabase() {
    // 1. Create sessions table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
            phone_number TEXT PRIMARY KEY,
            current_step TEXT NOT NULL,
            session_data TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // 2. Create quotes table for log history
    db.prepare(`
        CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT NOT NULL,
            inputs TEXT NOT NULL,
            base_premium INTEGER NOT NULL,
            final_premium INTEGER NOT NULL,
            pdf_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // Create indexes for fast querying
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_quotes_phone ON quotes(phone_number)`).run();
}

/**
 * Retrieves the active session for a given phone number.
 * @param {string} phoneNumber 
 * @returns {Object|null} The session details or null if no active session
 */
export function getSession(phoneNumber) {
    const row = db.prepare('SELECT current_step, session_data FROM sessions WHERE phone_number = ?').get(phoneNumber);
    if (!row) return null;

    try {
        return {
            currentStep: row.current_step,
            sessionData: JSON.parse(row.session_data)
        };
    } catch (e) {
        console.error(`Failed to parse session data for ${phoneNumber}:`, e);
        return null;
    }
}

/**
 * Saves or updates a session for a given phone number.
 * @param {string} phoneNumber 
 * @param {string} currentStep 
 * @param {Object} sessionData 
 */
export function saveSession(phoneNumber, currentStep, sessionData) {
    const dataString = JSON.stringify(sessionData);
    db.prepare(`
        INSERT INTO sessions (phone_number, current_step, session_data, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(phone_number) DO UPDATE SET
            current_step = excluded.current_step,
            session_data = excluded.session_data,
            updated_at = CURRENT_TIMESTAMP
    `).run(phoneNumber, currentStep, dataString);
}

/**
 * Deletes the active session for a phone number.
 * @param {string} phoneNumber 
 */
export function clearSession(phoneNumber) {
    db.prepare('DELETE FROM sessions WHERE phone_number = ?').run(phoneNumber);
}

/**
 * Logs a completed premium quote calculation.
 * @param {string} phoneNumber 
 * @param {Object} inputs 
 * @param {number} basePremium 
 * @param {number} finalPremium 
 * @param {string|null} pdfUrl 
 * @returns {number} The ID of the inserted quote record
 */
export function logQuote(phoneNumber, inputs, basePremium, finalPremium, pdfUrl = null) {
    const inputsString = JSON.stringify(inputs);
    const info = db.prepare(`
        INSERT INTO quotes (phone_number, inputs, base_premium, final_premium, pdf_url)
        VALUES (?, ?, ?, ?, ?)
    `).run(phoneNumber, inputsString, basePremium, finalPremium, pdfUrl);
    
    return Number(info.lastInsertRowid);
}

/**
 * Retrieves the complete quote history for a given phone number.
 * @param {string} phoneNumber 
 * @returns {Array} List of past quotes sorted from newest to oldest
 */
export function getQuoteHistory(phoneNumber) {
    const rows = db.prepare('SELECT * FROM quotes WHERE phone_number = ? ORDER BY created_at DESC').all(phoneNumber);
    return rows.map(row => {
        try {
            return {
                id: row.id,
                phoneNumber: row.phone_number,
                inputs: JSON.parse(row.inputs),
                basePremium: row.base_premium,
                finalPremium: row.final_premium,
                pdfUrl: row.pdf_url,
                createdAt: row.created_at
            };
        } catch (e) {
            console.error(`Failed to parse quote history record id ${row.id}:`, e);
            return null;
        }
    }).filter(Boolean);
}
