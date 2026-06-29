// ── TAB SWITCHING ────────────────────────────────────────
function switchTab(tab, event) {
    // Hide all tabs
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // Show selected tab
    const tabEl = document.getElementById('tab-' + tab);
    if (tabEl) tabEl.style.display = 'block';
    if (event && event.target) event.target.classList.add('active');
}

// Removed custom loadCaptcha

// ── STUDENT LOGIN ────────────────────────────────────────
function autoFillStudentLoginPrefix() {
    const course = document.getElementById('loginCourse').value;
    const admissionInput = document.getElementById('loginAdmission');
    if (course) {
        admissionInput.value = `JKLU/${course}/2026/`;
        admissionInput.focus();
    } else {
        admissionInput.value = '';
    }
}


async function checkStudentPasswordStatus() {
    const admissionNumber = document.getElementById('loginAdmission').value.trim();
    if (!admissionNumber) {
        document.getElementById('studentPasswordField').style.display = 'none';
        return;
    }

    try {
        const res = await fetch('/api/auth/check-student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admissionNumber })
        });
        const data = await res.json();
        
        // We decide WHICH fields to show based on `data.hasPassword`.
        if (data.success && data.hasPassword) {
            document.getElementById('studentPasswordField').style.display = 'block';
        } else {
            document.getElementById('studentPasswordField').style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to check student password status', e);
        document.getElementById('studentPasswordField').style.display = 'none';
    }
}

async function handleStudentLogin() {
    const name = document.getElementById('loginName').value.trim();
    const admissionNumber = document.getElementById('loginAdmission').value.trim();
    const course = document.getElementById('loginCourse') ? document.getElementById('loginCourse').value.trim() : '';
    const password = document.getElementById('loginPassword').value.trim();
    const errDiv = document.getElementById('studentLoginError');


    errDiv.textContent = '';

    if (!admissionNumber) {
        errDiv.textContent = 'Please enter your Application Number.';
        return;
    }
    
    // Check which mode we are in (Password mode vs Name mode)
    const isPasswordMode = document.getElementById('studentPasswordField').style.display === 'block';

    if (isPasswordMode) {
        if (!password) {
            errDiv.textContent = 'Please enter your password.';
            return;
        }
    } else {
        if (!name || !course) {
            errDiv.textContent = 'First time logging in? Please enter your Full Name and Course.';
            return;
        }
    }

    try {
        const recaptchaToken = await grecaptcha.execute('6Leg9i4tAAAAABGUYzbLq1nDysawl-y0vSFnWU9F', {action: 'student_login'});
        const res = await fetch('/api/auth/login/student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, admissionNumber, course, password, captcha: recaptchaToken })
        });
        const data = await res.json();

        if (data.success) {
            window.location.href = '/pages/student-dashboard.html';
        } else {
            errDiv.textContent = data.message || 'Login failed.';
        }
    } catch (err) {
        errDiv.textContent = 'Server error. Please try again.';
    }
}


// ── COHORT LEADER LOGIN ───────────────────────────────────
async function handleCohortLeaderLogin() {
    const cohortLeaderId = document.getElementById('cohortLeaderId').value.trim();
    const password = document.getElementById('cohortLeaderPassword').value.trim();
    const errDiv = document.getElementById('cohortLeaderLoginError');

    errDiv.textContent = '';

    if (!cohortLeaderId || !password) {
        errDiv.textContent = 'Please fill in all fields.';
        return;
    }

    try {
        const recaptchaToken = await grecaptcha.execute('6Leg9i4tAAAAABGUYzbLq1nDysawl-y0vSFnWU9F', {action: 'cohort_leader_login'});
        const res = await fetch('/api/auth/login/cohort_leader', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cohortLeaderId, password, captcha: recaptchaToken })
        });
        const data = await res.json();

        if (data.success) {
            window.location.href = '/pages/cohort-dashboard.html';
        } else {
            errDiv.textContent = data.message || 'Login failed.';
        }
    } catch (err) {
        errDiv.textContent = 'Server error. Please try again.';
    }
}

// ── ADMIN LOGIN ───────────────────────────────────────────
async function handleAdminLogin() {
    const adminId = document.getElementById('adminId').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    const errDiv = document.getElementById('adminLoginError');

    errDiv.textContent = '';

    if (!adminId || !password) {
        errDiv.textContent = 'Please fill in all fields.';
        return;
    }

    try {
        const recaptchaToken = await grecaptcha.execute('6Leg9i4tAAAAABGUYzbLq1nDysawl-y0vSFnWU9F', {action: 'admin_login'});
        const res = await fetch('/api/auth/login/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminId, password, captcha: recaptchaToken })
        });
        const data = await res.json();

        if (data.success) {
            window.location.href = '/pages/admin-dashboard.html';
        } else {
            errDiv.textContent = data.message || 'Login failed.';
        }
    } catch (err) {
        errDiv.textContent = 'Server error. Please try again.';
    }
}

// ── CHECK SESSION ON LOAD ─────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success && data.user) {
            const role = data.user.role;
            if (role === 'student') window.location.href = '/pages/student-dashboard.html';
            else if (role === 'cohort_leader') window.location.href = '/pages/cohort-dashboard.html';
            else if (role === 'admin') window.location.href = '/pages/admin-dashboard.html';
        }
    } catch (err) {
        // Not logged in — stay on login page
    }
});

// ── TOGGLE PASSWORD VISIBILITY ────────────────────────────
function togglePasswordVisibility(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        // Eye icon with a slash or closed eye (you can use whatever emoji or text)
        iconElement.textContent = '🙈';
    } else {
        input.type = 'password';
        iconElement.textContent = '👁️';
    }
}