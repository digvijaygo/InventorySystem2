const loginForm = document.getElementById('loginForm');
const mobileNumberInput = document.getElementById('mobileNumber');
const passwordInput = document.getElementById('passwordInput');
const statusText = document.getElementById('statusText');
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const resetMobileInput = document.getElementById('resetMobileNumber');
const resetSubmit = document.getElementById('resetPasswordSubmit');

let currentSlide = 0;

function setStatus(message, isError = false) {
    statusText.textContent = message || '';
    statusText.classList.toggle('error', Boolean(isError));
}

function normalizeMobileNumber(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function runBrandCarousel() {
    if (!slides.length || !dots.length) return;
    setInterval(() => {
        slides[currentSlide].classList.remove('active');
        dots[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
    }, 3000);
}

async function checkExistingSession() {
    try {
        const response = await fetch('./api/auth/session', { credentials: 'include' });
        if (response.ok) window.location.href = 'index.html';
    } catch (error) {
        console.error('Session check failed', error);
    }
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mobileNumber = normalizeMobileNumber(mobileNumberInput.value);
    const password = String(passwordInput.value || '');

    if (!/^\d{10}$/.test(mobileNumber)) {
        setStatus('Enter a valid 10-digit mobile number.', true);
        return;
    }
    if (!password) {
        setStatus('Enter your password.', true);
        return;
    }

    setStatus('Signing in...');

    try {
        const response = await fetch('./api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ mobile_number: mobileNumber, password })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Login failed.');

        setStatus('Login successful. Redirecting...');
        window.location.href = 'index.html';
    } catch (error) {
        setStatus(error.message || 'Login failed.', true);
    }
});

function showLoginForm() {
    forgotPasswordForm.hidden = true;
    loginForm.hidden = false;
    mobileNumberInput.value = resetMobileInput.value || mobileNumberInput.value;
    passwordInput.value = '';
    passwordInput.focus();
    setStatus('');
}

document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
    forgotPasswordForm.reset();
    resetMobileInput.value = normalizeMobileNumber(mobileNumberInput.value);
    resetMobileInput.readOnly = false;
    resetSubmit.textContent = 'Reset Password';
    loginForm.hidden = true;
    forgotPasswordForm.hidden = false;
    resetMobileInput.focus();
    setStatus('');
});
document.getElementById('backToLoginBtn').addEventListener('click', showLoginForm);

forgotPasswordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mobile = normalizeMobileNumber(resetMobileInput.value);
    if (!/^\d{10}$/.test(mobile)) return setStatus('Enter a valid 10-digit mobile number.', true);
    resetSubmit.disabled = true;
    setStatus('Resetting password...');
    try {
        const response = await fetch('./api/auth/reset-password', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile_number: mobile })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Password reset failed.');
        showLoginForm();
        setStatus(result.message);
    } catch (error) {
        setStatus(error.message || 'Password reset failed.', true);
    } finally {
        resetSubmit.disabled = false;
    }
});

checkExistingSession();
runBrandCarousel();