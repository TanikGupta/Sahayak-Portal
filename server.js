const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});