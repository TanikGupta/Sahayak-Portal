const express = require('express');
const router = express.Router();
const db = require('../database');

// GENERATE CAPTCHA
router.get('/captcha', (req, res) => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    req.session.captchaAnswer = num1 + num2;
    res.json({ success: true, text: `What is ${num1} + ${num2}?` });
});

// CHECK IF STUDENT HAS PASSWORD
router.post('/check-student', (req, res) => {
    const { admissionNumber } = req.body;
    if (!admissionNumber) return res.json({ success: false });

    const query = 'SELECT password FROM users WHERE admission_number = ? AND role = "student"';
    db.query(query, [admissionNumber], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false });
        const user = results[0];
        const hasPassword = user.password && user.password.trim() !== '';
        res.json({ success: true, hasPassword });
    });
});

// STUDENT LOGIN
router.post('/login/student', (req, res) => {
    const { name, admissionNumber, course, password, captcha } = req.body;

    if (!req.session.captchaAnswer || parseInt(captcha) !== req.session.captchaAnswer) {
        req.session.captchaAnswer = null; // Clear it to prevent replay
        return res.json({ success: false, message: 'Incorrect CAPTCHA answer.' });
    }
    req.session.captchaAnswer = null; // Clear on success as well

    if (!admissionNumber) {
        return res.json({ success: false, message: 'Please provide an Application Number.' });
    }

    const query = 'SELECT * FROM users WHERE admission_number = ? AND role = "student"';
    db.query(query, [admissionNumber], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });

        if (results.length === 0) {
            return res.json({ success: false, message: 'Invalid Application Number. Please check your details.' });
        }

        const user = results[0];

        // If user has a password set, require password
        if (user.password && user.password.trim() !== '') {
            if (user.password !== password) {
                return res.json({ success: false, message: 'Invalid password. If you forgot your password, please contact admin.' });
            }
        } else {
            // No password set, fallback to name matching (case-insensitive)
            if (!name) {
                return res.json({ success: false, message: 'First time logging in? Please enter your Full Name.' });
            }
            if (user.name.toLowerCase().trim() !== name.toLowerCase().trim()) {
                return res.json({ success: false, message: 'Name does not match our records.' });
            }
        }
        req.session.user = {
            id: user.id,
            name: user.name,
            role: user.role,
            course: user.course,
            admissionNumber: user.admission_number
        };

        res.json({ success: true, role: 'student', name: user.name });
    });
});

// COHORT LEADER LOGIN (was mentor login)
router.post('/login/cohort_leader', (req, res) => {
    const { cohortLeaderId, password, captcha } = req.body;

    if (!req.session.captchaAnswer || parseInt(captcha) !== req.session.captchaAnswer) {
        req.session.captchaAnswer = null;
        return res.json({ success: false, message: 'Incorrect CAPTCHA answer.' });
    }
    req.session.captchaAnswer = null;

    if (!cohortLeaderId || !password) {
        return res.json({ success: false, message: 'Please fill in all fields.' });
    }

    const query = 'SELECT * FROM users WHERE admission_number = ? AND password = ? AND role = "cohort_leader"';
    db.query(query, [cohortLeaderId, password], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });

        if (results.length === 0) {
            return res.json({ success: false, message: 'Invalid Cohort Leader ID or Password.' });
        }

        const user = results[0];
        req.session.user = {
            id: user.id,
            name: user.name,
            role: user.role,
            admissionNumber: user.admission_number
        };

        res.json({ success: true, role: 'cohort_leader', name: user.name });
    });
});

// ADMIN LOGIN
router.post('/login/admin', (req, res) => {
    const { adminId, password, captcha } = req.body;

    if (!req.session.captchaAnswer || parseInt(captcha) !== req.session.captchaAnswer) {
        req.session.captchaAnswer = null;
        return res.json({ success: false, message: 'Incorrect CAPTCHA answer.' });
    }
    req.session.captchaAnswer = null;

    if (!adminId || !password) {
        return res.json({ success: false, message: 'Please fill in all fields.' });
    }

    const query = 'SELECT * FROM users WHERE admission_number = ? AND password = ? AND role = "admin"';
    db.query(query, [adminId, password], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });

        if (results.length === 0) {
            return res.json({ success: false, message: 'Invalid Admin ID or Password.' });
        }

        const user = results[0];
        req.session.user = {
            id: user.id,
            name: user.name,
            role: user.role,
            admissionNumber: user.admission_number
        };

        res.json({ success: true, role: 'admin', name: user.name });
    });
});

// LOGOUT
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// CHECK SESSION
router.get('/me', (req, res) => {
    if (req.session.user) {
        res.json({ success: true, user: req.session.user });
    } else {
        res.json({ success: false });
    }
});

// SET PASSWORD FOR STUDENT
router.post('/set-password', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim() === '') {
        return res.json({ success: false, message: 'Password cannot be empty.' });
    }

    const query = 'UPDATE users SET password = ? WHERE id = ?';
    db.query(query, [newPassword.trim(), req.session.user.id], (err, result) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        res.json({ success: true, message: 'Password updated successfully!' });
    });
});

module.exports = router;