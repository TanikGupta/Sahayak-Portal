const { onRequest } = require('firebase-functions/v2/https');
const express = require('express');
const session = require('express-session');
const { FirestoreStore } = require('@google-cloud/connect-firestore');
const path = require('path');
require('dotenv').config();

const app = express();
const db = require('./database');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

app.use(session({
    store: new FirestoreStore({
        dataset: db,
        kind: 'sessions'
    }),
    name: '__session',
    secret: process.env.SESSION_SECRET || 'mysecretkey_v2_instant',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // No maxAge means it expires immediately when browser closes
}));

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const cohortRoutes = require('./routes/cohort');
const adminRoutes = require('./routes/admin');
const excelRoutes = require('./routes/excel');

app.use('/api/auth', authRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/cohort', cohortRoutes);
app.use('/api/admin', adminRoutes);

// Export the Express app as a Firebase Cloud Function named 'api'
exports.api = onRequest({
    invoker: 'public',
    minInstances: 0,       // Scale down to 0 when idle to save CPU/Memory costs
    maxInstances: 10,      // Cap maximum instances to prevent runaway costs
    concurrency: 80,       // Allow a single instance to handle up to 80 requests simultaneously
    memory: '256MiB',      // Explicitly request minimal memory
    timeoutSeconds: 60     // Short timeout to free up resources quickly
}, app);
