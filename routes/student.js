const express = require('express');
const router = express.Router();
const db = require('../database');
const multer = require('multer');
const path = require('path');

// Middleware to check login
function isLoggedIn(req, res, next) {
    if (!req.session.user) {
        return res.json({ success: false, message: 'Please login first.' });
    }
    next();
}

// File upload setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// SAVE REGISTRATION DETAILS
router.post('/registration', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const {
        firstName, middleName, lastName, dob, bloodGroup, gender, category,
        phone, email, apaarId, fatherName, motherName,
        fatherOccupation, fatherDesignation, fatherCompany, motherOccupation, motherDesignation, motherCompany,
        fatherPhone, fatherLandline, fatherEmail, motherPhone, motherEmail,
        permanentAddress, permanentCity, permanentDistrict, permanentState, 
        localAddress, localCity, localDistrict, localState,
        emergencyName, emergencyRelation, emergencyPhone, emergencyMobile,
        specialization, academicYear, prevQual, status,
        availHostel, hostelAge, hostelMaritalStatus, hostelStayedBefore, hostelMedicalHistory, hostelMedicalDetails,
        hostelGuardianName, hostelGuardianRelation, hostelGuardianAddress, hostelGuardianPhone, hostelGuardianEmail,
        availTransport, transportAltMobile, transportAddress, transportArea, transportPincode, transportGmapsLink,
        transportPickupPoint, transportSuggestedPickup, transportDistance, transportLandmark, transportExpectedArea,
        transportOtherStudents, transportApproxStudents
    } = req.body;

    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    db.query('UPDATE users SET name = ? WHERE id = ?', [fullName, userId], (err) => {
        if (err) console.error('Failed to update users name in DB:', err);
    });
    if (req.session.user) {
        req.session.user.name = fullName;
    }

    const checkQuery = 'SELECT * FROM student_details WHERE user_id = ?';
    db.query(checkQuery, [userId], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });

        if (results.length > 0) {
            const updateQuery = `UPDATE student_details SET 
                first_name=?, middle_name=?, last_name=?, date_of_birth=?, blood_group=?,
                gender=?, category=?, phone=?, email=?, apaar_id=?,
                father_name=?, mother_name=?, father_occupation=?, father_designation=?, father_company=?,
                mother_occupation=?, mother_designation=?, mother_company=?, father_phone=?, father_landline=?, father_email=?, mother_phone=?, mother_email=?,
                address=?, permanent_city=?, permanent_district=?, permanent_state=?,
                local_address=?, local_city=?, local_district=?, local_state=?,
                emergency_name=?, emergency_relation=?,
                emergency_phone=?, emergency_mobile=?, specialization=?, academic_year=?,
                previous_qualification=?, status=?,
                avail_hostel=?, hostel_age=?, hostel_marital_status=?, hostel_stayed_before=?, hostel_medical_history=?,
                hostel_medical_details=?, hostel_guardian_name=?, hostel_guardian_relation=?, hostel_guardian_address=?,
                hostel_guardian_phone=?, hostel_guardian_email=?,
                avail_transport=?, transport_alt_mobile=?, transport_address=?, transport_area=?,
                transport_pincode=?, transport_gmaps_link=?, transport_pickup_point=?, transport_suggested_pickup=?,
                transport_distance=?, transport_landmark=?, transport_expected_area=?, transport_other_students=?,
                transport_approx_students=?
                WHERE user_id=?`;
            db.query(updateQuery, [
                firstName, middleName, lastName, dob || null, bloodGroup,
                gender, category, phone, email, apaarId,
                fatherName, motherName, fatherOccupation, fatherDesignation, fatherCompany,
                motherOccupation, motherDesignation, motherCompany, fatherPhone, fatherLandline, fatherEmail, motherPhone, motherEmail,
                permanentAddress, permanentCity, permanentDistrict, permanentState,
                localAddress, localCity, localDistrict, localState,
                emergencyName, emergencyRelation,
                emergencyPhone, emergencyMobile, specialization, academicYear,
                prevQual, status,
                availHostel, hostelAge || null, hostelMaritalStatus || null, hostelStayedBefore, hostelMedicalHistory,
                hostelMedicalDetails || null, hostelGuardianName || null, hostelGuardianRelation || null, hostelGuardianAddress || null,
                hostelGuardianPhone || null, hostelGuardianEmail || null,
                availTransport, transportAltMobile || null, transportAddress || null, transportArea || null,
                transportPincode || null, transportGmapsLink || null, transportPickupPoint || null, transportSuggestedPickup || null,
                transportDistance || null, transportLandmark || null, transportExpectedArea || null, transportOtherStudents || null,
                transportApproxStudents || null,
                userId
            ], (err) => {
                if (err) { console.error(err); return res.json({ success: false, message: err.message }); }
                
                if (status === 'submitted') {
                    const regNumber = req.session.user.admissionNumber;
                    db.query('SELECT * FROM approvals WHERE user_id = ?', [userId], (err, appRows) => {
                        if (err) {
                            console.error(err);
                            return res.json({ success: true, message: 'Registration submitted!' });
                        }
                        if (appRows.length > 0) {
                            db.query(`UPDATE approvals SET 
                                cohort_approval = 'approved', 
                                cohort_comments = NULL, 
                                admin_approval = 'approved', 
                                final_approval = 'approved', 
                                registration_number = ? 
                                WHERE user_id = ?`, [regNumber, userId], (err) => {
                                if (err) console.error(err);
                                res.json({ success: true, message: 'Registration submitted!' });
                            });
                        } else {
                            db.query(`INSERT INTO approvals 
                                (user_id, cohort_approval, cohort_comments, admin_approval, final_approval, registration_number) 
                                VALUES (?, 'approved', NULL, 'approved', 'approved', ?)`, [userId, regNumber], (err) => {
                                if (err) console.error(err);
                                res.json({ success: true, message: 'Registration submitted!' });
                            });
                        }
                    });
                } else {
                    res.json({ success: true, message: 'Draft saved!' });
                }
            });
        } else {
            const insertQuery = `INSERT INTO student_details 
                (user_id, first_name, middle_name, last_name, date_of_birth, blood_group,
                gender, category, phone, email, apaar_id, father_name, mother_name,
                father_occupation, father_designation, father_company, mother_occupation, mother_designation, mother_company,
                father_phone, father_landline, father_email, mother_phone, mother_email, address, permanent_city, permanent_district, permanent_state,
                local_address, local_city, local_district, local_state, emergency_name,
                emergency_relation, emergency_phone, emergency_mobile, specialization,
                academic_year, previous_qualification, status,
                avail_hostel, hostel_age, hostel_marital_status, hostel_stayed_before, hostel_medical_history,
                hostel_medical_details, hostel_guardian_name, hostel_guardian_relation, hostel_guardian_address,
                hostel_guardian_phone, hostel_guardian_email,
                avail_transport, transport_alt_mobile, transport_address, transport_area, transport_pincode, transport_gmaps_link,
                transport_pickup_point, transport_suggested_pickup, transport_distance, transport_landmark, transport_expected_area,
                transport_other_students, transport_approx_students) 
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
            db.query(insertQuery, [
                userId, firstName, middleName, lastName, dob || null, bloodGroup,
                gender, category, phone, email, apaarId, fatherName, motherName,
                fatherOccupation, fatherDesignation, fatherCompany, motherOccupation, motherDesignation, motherCompany,
                fatherPhone, fatherLandline, fatherEmail, motherPhone, motherEmail, permanentAddress, permanentCity, permanentDistrict, permanentState,
                localAddress, localCity, localDistrict, localState, emergencyName,
                emergencyRelation, emergencyPhone, emergencyMobile, specialization,
                academicYear, prevQual, status,
                availHostel, hostelAge || null, hostelMaritalStatus || null, hostelStayedBefore, hostelMedicalHistory,
                hostelMedicalDetails || null, hostelGuardianName || null, hostelGuardianRelation || null, hostelGuardianAddress || null,
                hostelGuardianPhone || null, hostelGuardianEmail || null,
                availTransport, transportAltMobile || null, transportAddress || null, transportArea || null, transportPincode || null,
                transportGmapsLink || null, transportPickupPoint || null, transportSuggestedPickup || null, transportDistance || null,
                transportLandmark || null, transportExpectedArea || null, transportOtherStudents || null, transportApproxStudents || null
            ], (err) => {
                if (err) { console.error(err); return res.json({ success: false, message: err.message }); }
                
                if (status === 'submitted') {
                    const regNumber = req.session.user.admissionNumber;
                    db.query('SELECT * FROM approvals WHERE user_id = ?', [userId], (err, appRows) => {
                        if (err) {
                            console.error(err);
                            return res.json({ success: true, message: 'Registration submitted!' });
                        }
                        if (appRows.length > 0) {
                            db.query(`UPDATE approvals SET 
                                cohort_approval = 'approved', 
                                cohort_comments = NULL, 
                                admin_approval = 'approved', 
                                final_approval = 'approved', 
                                registration_number = ? 
                                WHERE user_id = ?`, [regNumber, userId], (err) => {
                                if (err) console.error(err);
                                res.json({ success: true, message: 'Registration submitted!' });
                            });
                        } else {
                            db.query(`INSERT INTO approvals 
                                (user_id, cohort_approval, cohort_comments, admin_approval, final_approval, registration_number) 
                                VALUES (?, 'approved', NULL, 'approved', 'approved', ?)`, [userId, regNumber], (err) => {
                                if (err) console.error(err);
                                res.json({ success: true, message: 'Registration submitted!' });
                            });
                        }
                    });
                } else {
                    res.json({ success: true, message: 'Draft saved!' });
                }
            });
        }
    });
});

// GET REGISTRATION DETAILS
router.get('/registration', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;

    const query = `
        SELECT u.name, u.admission_number, u.course, u.role, 
               sd.*
        FROM users u
        LEFT JOIN student_details sd ON u.id = sd.user_id
        WHERE u.id = ?`;

    db.query(query, [userId], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        res.json({ success: true, data: results[0] });
    });
});

// SAVE UNDERTAKINGS
router.post('/undertakings', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const { antiRagging, codeOfConduct, feePolicy } = req.body;
    const ip = req.ip;

    const checkQuery = 'SELECT * FROM undertakings WHERE user_id = ?';
    db.query(checkQuery, [userId], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });

        if (results.length > 0) {
            const updateQuery = 'UPDATE undertakings SET anti_ragging=?, code_of_conduct=?, fee_policy=?, ip_address=? WHERE user_id=?';
            db.query(updateQuery, [antiRagging, codeOfConduct, feePolicy, ip, userId], (err) => {
                if (err) return res.json({ success: false, message: err.message });
                res.json({ success: true, message: 'Undertakings saved successfully!' });
            });
        } else {
            const insertQuery = 'INSERT INTO undertakings (user_id, anti_ragging, code_of_conduct, fee_policy, ip_address) VALUES (?, ?, ?, ?, ?)';
            db.query(insertQuery, [userId, antiRagging, codeOfConduct, feePolicy, ip], (err) => {
                if (err) return res.json({ success: false, message: err.message });
                res.json({ success: true, message: 'Undertakings saved successfully!' });
            });
        }
    });
});

// UPLOAD DOCUMENTS
router.post('/documents', isLoggedIn, upload.fields([
    { name: 'marksheet10' },
    { name: 'marksheet12' },
    { name: 'idProof' },
    { name: 'photo' },
    { name: 'migration' }
]), (req, res) => {
    const userId = req.session.user.id;
    const files = req.files;

    if (!files || Object.keys(files).length === 0) {
        return res.json({ success: false, message: 'No files uploaded.' });
    }

    const insertPromises = Object.keys(files).map(fieldName => {
        return new Promise((resolve, reject) => {
            const file = files[fieldName][0];
            const query = 'INSERT INTO documents (user_id, document_type, file_name, file_path) VALUES (?, ?, ?, ?)';
            db.query(query, [userId, fieldName, file.originalname, file.filename], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });

    Promise.all(insertPromises)
        .then(() => res.json({ success: true, message: 'Documents uploaded successfully!' }))
        .catch(err => res.json({ success: false, message: err.message }));
});

// SUBMIT WITHDRAWAL
router.post('/withdrawal', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const { reason, remarks } = req.body;

    const query = 'INSERT INTO withdrawals (user_id, reason, remarks) VALUES (?, ?, ?)';
    db.query(query, [userId, reason, remarks], (err) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, message: 'Withdrawal application submitted.' });
    });
});

// SAVE PRINTOUTS STATUS
router.put('/printouts', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const { printouts_taken } = req.body;
    
    const val = printouts_taken ? 1 : 0;
    db.query('UPDATE student_details SET printouts_taken = ? WHERE user_id = ?', [val, userId], (err) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        res.json({ success: true, message: 'Printouts status updated.' });
    });
});

// GET APPROVAL STATUS
router.get('/status', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const query = `
        SELECT
            sd.status as form_status,
            sd.printouts_taken,
            a.cohort_approval, a.cohort_comments,
            a.admin_approval, a.final_approval,
            a.registration_number,
            v.status as verification_status,
            (SELECT COUNT(*) FROM documents d WHERE d.user_id = ?) as doc_count,
            (SELECT COUNT(*) FROM undertakings ut WHERE ut.user_id = ?) as undertaking_done
        FROM users u
        LEFT JOIN student_details sd ON u.id = sd.user_id
        LEFT JOIN approvals a ON u.id = a.user_id
        LEFT JOIN verification v ON u.id = v.user_id
        WHERE u.id = ?
    `;
    db.query(query, [userId, userId, userId], (err, results) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, data: results[0] });
    });
});

// REQUEST PROFILE UNLOCK
router.post('/request-unlock', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;

    // Verify if profile is locked (submitted)
    db.query('SELECT status FROM student_details WHERE user_id = ?', [userId], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        if (results.length === 0 || results[0].status !== 'submitted') {
            return res.json({ success: false, message: 'Profile is not locked.' });
        }

        // Update cohort_approval to 'edit_requested'
        db.query('SELECT * FROM approvals WHERE user_id = ?', [userId], (err, appRows) => {
            if (err) return res.json({ success: false, message: err.message });
            if (appRows.length > 0) {
                db.query("UPDATE approvals SET cohort_approval = 'edit_requested' WHERE user_id = ?", [userId], (err) => {
                    if (err) return res.json({ success: false, message: err.message });
                    res.json({ success: true, message: 'Profile unlock request sent to Cohort Leader.' });
                });
            } else {
                db.query("INSERT INTO approvals (user_id, cohort_approval) VALUES (?, 'edit_requested')", [userId], (err) => {
                    if (err) return res.json({ success: false, message: err.message });
                    res.json({ success: true, message: 'Profile unlock request sent to Cohort Leader.' });
                });
            }
        });
    });
});

// GET MESSAGES
router.get('/messages', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    
    // Get the student's cohort leader ID
    const getLeaderQuery = 'SELECT cohort_leader_id FROM users WHERE id = ?';
    db.query(getLeaderQuery, [userId], (err, userRows) => {
        if (err) return res.json({ success: false, message: err.message });
        if (userRows.length === 0) return res.json({ success: false, message: 'Student not found.' });
        
        const cohortLeaderId = userRows[0].cohort_leader_id;
        if (!cohortLeaderId) {
            return res.json({ success: true, messages: [] }); // No cohort leader, so no messages yet
        }
        
        const query = `
            SELECT m.id, m.student_id, m.sender_id, m.message_text, m.created_at, u.name as sender_name, u.role as sender_role
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.student_id = ? AND m.cohort_leader_id = ?
            ORDER BY m.created_at ASC
        `;
        db.query(query, [userId, cohortLeaderId], (err, results) => {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, messages: results });
        });
    });
});

// SEND MESSAGE
router.post('/message', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const { message_text } = req.body;

    if (!message_text || !message_text.trim()) {
        return res.json({ success: false, message: 'Message text cannot be empty.' });
    }

    // Get the student's cohort leader ID
    const getLeaderQuery = 'SELECT cohort_leader_id FROM users WHERE id = ?';
    db.query(getLeaderQuery, [userId], (err, userRows) => {
        if (err) return res.json({ success: false, message: err.message });
        if (userRows.length === 0) return res.json({ success: false, message: 'Student not found.' });

        const cohortLeaderId = userRows[0].cohort_leader_id;
        if (!cohortLeaderId) {
            return res.json({ success: false, message: 'You cannot send a message because no Cohort Leader is currently assigned to you.' });
        }

        const query = 'INSERT INTO messages (student_id, cohort_leader_id, sender_id, message_text) VALUES (?, ?, ?, ?)';
        db.query(query, [userId, cohortLeaderId, userId, message_text], (err) => {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, message: 'Message sent successfully!' });
        });
    });
});

module.exports = router;

