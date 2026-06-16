const express = require('express');
const router = express.Router();
const db = require('../database');

function isAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.json({ success: false, message: 'Access denied.' });
    }
    next();
}

// Get admin info
router.get('/me', isAdmin, (req, res) => {
    res.json({ success: true, user: req.session.user });
});

// Get all students
router.get('/students', isAdmin, (req, res) => {
    const query = `
        SELECT u.id, u.name, u.admission_number, u.course, u.cohort_leader_id,
               cl.name as cohort_leader_name,
               sd.status as form_status, sd.printouts_taken,
               v.status as verification_status,
               a.admin_approval, a.final_approval,
               a.registration_number, a.cohort_approval
        FROM users u
        LEFT JOIN users cl ON u.cohort_leader_id = cl.id
        LEFT JOIN student_details sd ON u.id = sd.user_id
        LEFT JOIN verification v ON u.id = v.user_id
        LEFT JOIN approvals a ON u.id = a.user_id
        WHERE u.role = 'student'
        ORDER BY u.id DESC
    `;
    db.query(query, (err, results) => {
        if (err) { console.error(err); return res.json({ success: false, message: err.message }); }
        res.json({ success: true, students: results });
    });
});

// Get all Cohort Leaders
router.get('/cohort-leaders', isAdmin, (req, res) => {
    const query = `
        SELECT u.id, u.name, u.admission_number, u.password,
               COUNT(s.id) as student_count
        FROM users u
        LEFT JOIN users s ON s.cohort_leader_id = u.id AND s.role = 'student'
        WHERE u.role = 'cohort_leader'
        GROUP BY u.id
    `;
    db.query(query, (err, results) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, cohortLeaders: results });
    });
});

// Assign Cohort Leader to student
router.post('/assign-cohort-leader', isAdmin, (req, res) => {
    const { studentId, cohortLeaderId } = req.body;
    if (!studentId || !cohortLeaderId) {
        return res.json({ success: false, message: 'Please select both student and cohort leader.' });
    }
    const query = 'UPDATE users SET cohort_leader_id = ? WHERE id = ? AND role = "student"';
    db.query(query, [cohortLeaderId, studentId], (err) => {
        if (err) return res.json({ success: false, message: err.message });
        
        // Also update all existing messages for this student to the new cohort leader
        const transferQuery = 'UPDATE messages SET cohort_leader_id = ? WHERE student_id = ?';
        db.query(transferQuery, [cohortLeaderId, studentId], (err) => {
            if (err) console.error('Failed to transfer student messages to new cohort leader:', err);
            res.json({ success: true, message: 'Cohort Leader assigned and messages transferred successfully!' });
        });
    });
});

// Verify student documents (Stubbed/Removed)
router.post('/verify/:id', isAdmin, (req, res) => {
    res.json({ success: false, message: 'Verification feature removed.' });
});

// Final approve student (Stubbed/Removed)
router.post('/final-approve/:id', isAdmin, (req, res) => {
    res.json({ success: false, message: 'Final approval feature removed.' });
});

// Get stats
router.get('/stats', isAdmin, (req, res) => {
    const results = {};
    let completed = 0;
    const total = 4;

    function done() {
        completed++;
        if (completed === total) {
            res.json({ success: true, stats: results });
        }
    }

    db.query('SELECT COUNT(*) as count FROM users WHERE role = "student"', (err, rows) => {
        results.totalStudents = err ? 0 : rows[0].count;
        done();
    });

    db.query('SELECT COUNT(*) as count FROM users WHERE role = "cohort_leader"', (err, rows) => {
        results.totalCohortLeaders = err ? 0 : rows[0].count;
        done();
    });

    db.query(`SELECT COUNT(*) as count FROM users u 
        LEFT JOIN student_details sd ON u.id = sd.user_id 
        WHERE u.role = "student" 
        AND (sd.status IS NULL OR sd.status = 'draft')`, (err, rows) => {
        results.pendingVerification = err ? 0 : rows[0].count;
        done();
    });

    db.query(`SELECT COUNT(*) as count FROM users u 
        LEFT JOIN student_details sd ON u.id = sd.user_id 
        WHERE u.role = "student" 
        AND sd.status = 'submitted'`, (err, rows) => {
        results.approved = err ? 0 : rows[0].count;
        done();
    });
});

// Add a new Cohort Leader
router.post('/cohort-leader', isAdmin, (req, res) => {
    const { name, cohortLeaderId, password } = req.body;

    if (!name || !cohortLeaderId || !password) {
        return res.json({ success: false, message: 'Please fill in all fields.' });
    }

    // Check if user already exists
    const checkQuery = 'SELECT * FROM users WHERE admission_number = ?';
    db.query(checkQuery, [cohortLeaderId], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });

        if (results.length > 0) {
            return res.json({ success: false, message: 'Cohort Leader ID already registered.' });
        }

        const insertQuery = 'INSERT INTO users (name, admission_number, password, role) VALUES (?, ?, ?, "cohort_leader")';
        db.query(insertQuery, [name, cohortLeaderId, password], (err) => {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, message: 'Cohort Leader created successfully!' });
        });
    });
});

// Add a single new student manually
router.post('/student', isAdmin, (req, res) => {
    const { name, admissionNumber, course } = req.body;

    if (!name || !admissionNumber || !course) {
        return res.json({ success: false, message: 'Please fill in all fields.' });
    }

    const checkQuery = 'SELECT * FROM users WHERE admission_number = ?';
    db.query(checkQuery, [admissionNumber], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        if (results.length > 0) return res.json({ success: false, message: 'Admission Number already exists.' });

        const insertQuery = 'INSERT INTO users (name, admission_number, course, role) VALUES (?, ?, ?, "student")';
        db.query(insertQuery, [name, admissionNumber, course], (err) => {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, message: 'Student created successfully!' });
        });
    });
});

// Edit student details manually
router.put('/student/:id', isAdmin, (req, res) => {
    const { name, admissionNumber, course } = req.body;
    const studentId = req.params.id;

    if (!name || !admissionNumber || !course) {
        return res.json({ success: false, message: 'Name, Admission No., and Course are required.' });
    }

    // Check if admission number is being used by someone else
    db.query('SELECT id FROM users WHERE admission_number = ? AND id != ?', [admissionNumber, studentId], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        if (results.length > 0) return res.json({ success: false, message: 'Admission Number is already used by another user.' });

        let updateQuery = 'UPDATE users SET name = ?, admission_number = ?, course = ? WHERE id = ? AND role = "student"';
        const queryParams = [name, admissionNumber, course, studentId];

        db.query(updateQuery, queryParams, (err) => {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, message: 'Student details updated successfully!' });
        });
    });
});

// Delete a student and cascade to all their data
router.delete('/student/:id', isAdmin, (req, res) => {
    const studentId = req.params.id;

    // Delete in order to avoid foreign key constraints if they exist, though here we just clear all associated tables manually
    const tablesToClear = ['student_details', 'approvals', 'verification', 'messages', 'documents', 'undertakings', 'withdrawals'];
    let clearedCount = 0;

    const finalizeDelete = () => {
        db.query('DELETE FROM users WHERE id = ? AND role = "student"', [studentId], (err, results) => {
            if (err) return res.json({ success: false, message: err.message });
            if (results.affectedRows === 0) return res.json({ success: false, message: 'Student not found.' });
            res.json({ success: true, message: 'Student completely deleted.' });
        });
    };

    if (tablesToClear.length === 0) return finalizeDelete();

    tablesToClear.forEach(table => {
        const query = table === 'messages' ? 'DELETE FROM messages WHERE student_id = ?' : `DELETE FROM ${table} WHERE user_id = ?`;
        db.query(query, [studentId], (err) => {
            if (err) console.error(`Failed deleting from ${table}: `, err);
            clearedCount++;
            if (clearedCount === tablesToClear.length) finalizeDelete();
        });
    });
});

// Delete a Cohort Leader
router.delete('/cohort-leader/:id', isAdmin, (req, res) => {
    const clId = req.params.id;

    // Remove cohort leader assignment from students
    db.query('UPDATE users SET cohort_leader_id = NULL WHERE cohort_leader_id = ? AND role = "student"', [clId], (err) => {
        if (err) console.error('Failed to clear cohort_leader_id from students', err);

        // Delete cohort leader user
        db.query('DELETE FROM users WHERE id = ? AND role = "cohort_leader"', [clId], (err, results) => {
            if (err) return res.json({ success: false, message: err.message });
            if (results.affectedRows === 0) return res.json({ success: false, message: 'Cohort Leader not found.' });
            res.json({ success: true, message: 'Cohort Leader deleted.' });
        });
    });
});

module.exports = router;