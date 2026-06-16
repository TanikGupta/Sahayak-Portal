const functions = require('firebase-functions');
const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'mysecretkey123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
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
exports.api = functions.https.onRequest(app);
