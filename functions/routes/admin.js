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

// TEMPORARY SETUP: Create initial admin
router.get('/setup-first-admin', async (req, res) => {
    try {
        await db.collection('users').doc('admin_init').set({
            admission_number: 'umeshsirexam',
            password: 'secondflooradmin',
            role: 'admin',
            name: 'Umesh Sir'
        });
        res.json({ success: true, message: 'Admin user successfully created!' });
    } catch (err) {
        res.json({ success: false, message: 'Failed: ' + err.message });
    }
});

// Get all students
router.get('/students', isAdmin, async (req, res) => {
    try {
        const clSnapshot = await db.collection('users').where('role', '==', 'cohort_leader').get();
        const cohortLeaders = {};
        clSnapshot.docs.forEach(doc => {
            cohortLeaders[doc.id] = doc.data().name;
        });

        const snapshot = await db.collection('users').where('role', '==', 'student').get();
        const students = snapshot.docs.map(doc => {
            const u = doc.data();
            const sd = u.details || {};
            const v = u.verification || {};
            const a = u.approvals || {};

            return {
                id: doc.id,
                name: u.name,
                admission_number: u.admission_number,
                course: u.course,
                cohort_leader_id: u.cohort_leader_id,
                cohort_leader_name: cohortLeaders[u.cohort_leader_id] || null,
                form_status: sd.status,
                printouts_taken: sd.printouts_taken || 0,
                verification_status: v.status,
                admin_approval: a.admin_approval,
                final_approval: a.final_approval,
                registration_number: a.registration_number,
                cohort_approval: a.cohort_approval
            };
        });

        students.sort((a, b) => b.id.localeCompare(a.id)); // Not strictly numeric desc, but sorts reverse chronologically if IDs are chronological
        res.json({ success: true, students });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Get all Cohort Leaders
router.get('/cohort-leaders', isAdmin, async (req, res) => {
    try {
        const studentSnapshot = await db.collection('users').where('role', '==', 'student').get();
        const studentCounts = {};
        studentSnapshot.docs.forEach(doc => {
            const clId = doc.data().cohort_leader_id;
            if (clId) {
                studentCounts[clId] = (studentCounts[clId] || 0) + 1;
            }
        });

        const clSnapshot = await db.collection('users').where('role', '==', 'cohort_leader').get();
        const cohortLeaders = clSnapshot.docs.map(doc => {
            const u = doc.data();
            return {
                id: doc.id,
                name: u.name,
                admission_number: u.admission_number,
                password: u.password,
                cohort_code: u.cohort_code || '',
                student_count: studentCounts[doc.id] || 0
            };
        });

        res.json({ success: true, cohortLeaders });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Assign Cohort Leader to student
router.post('/assign-cohort-leader', isAdmin, async (req, res) => {
    const { studentId, cohortLeaderId } = req.body;
    if (!studentId || !cohortLeaderId) {
        return res.json({ success: false, message: 'Please select both student and cohort leader.' });
    }

    try {
        await db.collection('users').doc(studentId).update({ cohort_leader_id: cohortLeaderId });

        // Update all existing messages for this student to the new cohort leader
        const msgSnapshot = await db.collection('messages').where('student_id', '==', studentId).get();
        const batch = db.batch();
        msgSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { cohort_leader_id: cohortLeaderId });
        });
        await batch.commit();

        res.json({ success: true, message: 'Cohort Leader assigned and messages transferred successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
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
router.get('/stats', isAdmin, async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        let totalStudents = 0;
        let totalCohortLeaders = 0;
        let pendingVerification = 0;
        let approved = 0;

        usersSnapshot.docs.forEach(doc => {
            const u = doc.data();
            if (u.role === 'cohort_leader') {
                totalCohortLeaders++;
            } else if (u.role === 'student') {
                totalStudents++;
                const status = (u.details && u.details.status) ? u.details.status : null;
                if (!status || status === 'draft') {
                    pendingVerification++;
                } else if (status === 'submitted') {
                    approved++;
                }
            }
        });

        res.json({ success: true, stats: { totalStudents, totalCohortLeaders, pendingVerification, approved } });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Add a new Cohort Leader
router.post('/cohort-leader', isAdmin, async (req, res) => {
    const { name, cohortLeaderId, password, cohortCode } = req.body;

    if (!name || !cohortLeaderId || !password) {
        return res.json({ success: false, message: 'Please fill in all required fields (Name, ID, Password).' });
    }

    try {
        const checkSnapshot = await db.collection('users').where('admission_number', '==', cohortLeaderId).limit(1).get();
        if (!checkSnapshot.empty) {
            return res.json({ success: false, message: 'Cohort Leader ID already registered.' });
        }

        await db.collection('users').add({
            name,
            admission_number: cohortLeaderId,
            password,
            cohort_code: cohortCode || '',
            role: 'cohort_leader'
        });

        res.json({ success: true, message: 'Cohort Leader created successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Add a single new student manually
router.post('/student', isAdmin, async (req, res) => {
    const { name, admissionNumber, course, cohortCode } = req.body;

    if (!name || !admissionNumber || !course) {
        return res.json({ success: false, message: 'Please fill in all fields.' });
    }

    try {
        const checkSnapshot = await db.collection('users').where('admission_number', '==', admissionNumber).limit(1).get();
        if (!checkSnapshot.empty) {
            return res.json({ success: false, message: 'Admission Number already exists.' });
        }

        let cohortLeaderId = null;
        if (cohortCode) {
            const clSnap = await db.collection('users').where('role', '==', 'cohort_leader').where('cohort_code', '==', cohortCode).limit(1).get();
            if (!clSnap.empty) {
                cohortLeaderId = clSnap.docs[0].id;
            }
        }

        const newStudent = {
            name,
            admission_number: admissionNumber,
            course,
            role: 'student'
        };
        if (cohortLeaderId) {
            newStudent.cohort_leader_id = cohortLeaderId;
        }

        await db.collection('users').add(newStudent);

        res.json({ success: true, message: 'Student created successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Edit student details manually
router.put('/student/:id', isAdmin, async (req, res) => {
    const { name, admissionNumber, course, cohortCode } = req.body;
    const studentId = req.params.id;

    if (!name || !admissionNumber || !course) {
        return res.json({ success: false, message: 'Name, Admission No., and Course are required.' });
    }

    try {
        const checkSnapshot = await db.collection('users').where('admission_number', '==', admissionNumber).get();
        const conflictingDoc = checkSnapshot.docs.find(d => d.id !== studentId);
        if (conflictingDoc) {
            return res.json({ success: false, message: 'Admission Number is already used by another user.' });
        }

        const updateData = {
            name,
            admission_number: admissionNumber,
            course
        };

        if (cohortCode) {
            const clSnap = await db.collection('users').where('role', '==', 'cohort_leader').where('cohort_code', '==', cohortCode).limit(1).get();
            if (!clSnap.empty) {
                updateData.cohort_leader_id = clSnap.docs[0].id;
            } else {
                updateData.cohort_leader_id = null; // optionally clear if invalid code, or just ignore
            }
        }

        await db.collection('users').doc(studentId).update(updateData);

        res.json({ success: true, message: 'Student updated successfully!' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Delete a student and cascade to all their data
router.delete('/student/:id', isAdmin, async (req, res) => {
    const studentId = req.params.id;

    try {
        await db.collection('users').doc(studentId).delete();

        // Delete associated messages
        const msgSnapshot = await db.collection('messages').where('student_id', '==', studentId).get();
        const batch = db.batch();
        msgSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        res.json({ success: true, message: 'Student completely deleted.' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// Delete a Cohort Leader
router.delete('/cohort-leader/:id', isAdmin, async (req, res) => {
    const clId = req.params.id;

    try {
        // Remove cohort leader assignment from students
        const studentSnapshot = await db.collection('users').where('role', '==', 'student').where('cohort_leader_id', '==', clId).get();
        const batch = db.batch();
        studentSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { cohort_leader_id: null });
        });
        await batch.commit();

        // Delete cohort leader user
        await db.collection('users').doc(clId).delete();

        res.json({ success: true, message: 'Cohort Leader deleted.' });
    } catch (err) {
        res.json({ success: false, message: 'Database error.' });
    }
});

// ── AARAMBH COHORT SYNC ──────────────────────────────────────────

// Preview Aarambh Sync
router.post('/preview-aarambh-sync', isAdmin, async (req, res) => {
    try {
        const response = await fetch('https://admin-aarambh-team.vercel.app/api/public/student-cohorts?secret=aarambh2026read');
        const data = await response.json();
        
        if (!data.success || !data.students) {
            return res.json({ success: false, message: 'Failed to fetch data from external API.' });
        }
        
        const externalStudents = data.students;
        
        // Fetch all cohort leaders from our DB
        const clSnap = await db.collection('users').where('role', '==', 'cohort_leader').get();
        const cohortLeadersMap = {};
        clSnap.docs.forEach(doc => {
            const clData = doc.data();
            if (clData.cohort_code) {
                cohortLeadersMap[clData.cohort_code.toUpperCase()] = {
                    id: doc.id,
                    name: clData.name
                };
            }
        });
        
        // Fetch all students from our DB
        const studentsSnap = await db.collection('users').where('role', '==', 'student').get();
        const internalStudentsMap = {};
        studentsSnap.docs.forEach(doc => {
            const sData = doc.data();
            if (sData.admission_number) {
                internalStudentsMap[sData.admission_number.toUpperCase()] = { id: doc.id, ...sData };
            }
        });
        
        const matched = [];
        const unmatchedExternal = [];
        const externalAppNos = new Set();
        
        externalStudents.forEach(extS => {
            if (!extS.applicationNo) return;
            const appNo = extS.applicationNo.toUpperCase();
            externalAppNos.add(appNo);
            
            if (internalStudentsMap[appNo]) {
                const internalS = internalStudentsMap[appNo];
                const newCohortCode = (extS.cohort || '').toUpperCase();
                const matchedLeader = cohortLeadersMap[newCohortCode];
                matched.push({
                    id: internalS.id,
                    applicationNo: appNo,
                    name: internalS.name || extS.name,
                    oldCohortCode: internalS.cohort_code || 'None',
                    newCohortCode: newCohortCode,
                    cohortLeaderId: matchedLeader ? matchedLeader.id : null,
                    cohortLeaderName: matchedLeader ? matchedLeader.name : 'No Leader Found'
                });
            } else {
                unmatchedExternal.push(extS);
            }
        });
        
        const unmatchedInternal = [];
        for (const [appNo, internalS] of Object.entries(internalStudentsMap)) {
            if (!externalAppNos.has(appNo)) {
                unmatchedInternal.push({
                    applicationNo: appNo,
                    name: internalS.name,
                    course: internalS.course
                });
            }
        }
        
        res.json({
            success: true,
            matched,
            unmatchedExternal,
            unmatchedInternal
        });
        
    } catch (error) {
        console.error('Preview sync error:', error);
        res.json({ success: false, message: 'Server error during preview.' });
    }
});

// Execute Aarambh Sync
router.post('/sync-aarambh-cohorts', isAdmin, async (req, res) => {
    try {
        const { matched } = req.body;
        if (!matched || !Array.isArray(matched)) {
            return res.json({ success: false, message: 'Invalid data provided for sync.' });
        }
        
        const batch = db.batch();
        let updateCount = 0;
        
        for (const s of matched) {
            const studentRef = db.collection('users').doc(s.id);
            const updateData = {
                cohort_code: s.newCohortCode
            };
            if (s.cohortLeaderId) {
                updateData.cohort_leader_id = s.cohortLeaderId;
            } else {
                updateData.cohort_leader_id = null;
            }
            batch.update(studentRef, updateData);
            updateCount++;
            
            // Note: We might also want to update messages, but usually sync happens early.
            // If we need to move existing messages, we'd have to do it, but for 100s of students
            // a single batch might hit limits. Let's just update the student profile for now.
        }
        
        if (updateCount > 0) {
            // Firestore batch has a limit of 500 operations.
            if (updateCount > 490) {
                // If more than 500, we should split batches, but we assume < 500 for now.
                // There are only 170 total students, so one batch is fine.
            }
            await batch.commit();
        }
        
        res.json({ success: true, message: `Successfully synced ${updateCount} students.` });
        
    } catch (error) {
        console.error('Sync error:', error);
        res.json({ success: false, message: 'Server error during sync.' });
    }
});

module.exports = router;