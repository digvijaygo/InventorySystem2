const requestOtpForm = document.getElementById('requestOtpForm');
const verifyOtpForm = document.getElementById('verifyOtpForm');
const mobileNumberInput = document.getElementById('mobileNumber');
const otpCodeInput = document.getElementById('otpCode');
const statusText = document.getElementById('statusText');
const changeMobileBtn = document.getElementById('changeMobileBtn');
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');

let activeMobileNumber = '';
let currentSlide = 0;

function setStatus(message, isError = false) {
    statusText.textContent = message || '';
    statusText.classList.toggle('error', Boolean(isError));
}

function normalizeMobileNumber(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function runBrandCarousel() {
    if (!slides.length || !dots.length) {
        return;
    }

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
        if (response.ok) {
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Session check failed', error);
    }
}

requestOtpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mobileNumber = normalizeMobileNumber(mobileNumberInput.value);

    if (!/^\d{10}$/.test(mobileNumber)) {
        setStatus('Enter a valid 10-digit mobile number.', true);
        return;
    }

    setStatus('Sending OTP...');

    try {
        const response = await fetch('./api/auth/request-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ mobile_number: mobileNumber })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'Failed to send OTP.');
        }

        activeMobileNumber = mobileNumber;
        requestOtpForm.classList.add('hidden');
        verifyOtpForm.classList.remove('hidden');

       // const devOtpHint = payload.otp ? ` OTP (dev): ${payload.otp}` : '';
       // setStatus(`OTP sent successfully.${devOtpHint}`);
        const otpHint = payload.otp ? ` OTP: ${payload.otp}` : '';
        setStatus(`OTP generated successfully.${otpHint}`);
    } catch (error) {
        setStatus(error.message || 'Failed to send OTP.', true);
    }
});

verifyOtpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const otpCode = String(otpCodeInput.value || '').trim();

    if (!/^\d{6}$/.test(otpCode)) {
        setStatus('Enter a valid 6-digit OTP.', true);
        return;
    }

    setStatus('Verifying OTP...');

    try {
        const response = await fetch('./api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                mobile_number: activeMobileNumber,
                otp_code: otpCode
            })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'OTP verification failed.');
        }

        setStatus('Login successful. Redirecting...');
        window.location.href = 'index.html';
    } catch (error) {
        setStatus(error.message || 'OTP verification failed.', true);
    }
});

changeMobileBtn.addEventListener('click', () => {
    activeMobileNumber = '';
    otpCodeInput.value = '';
    verifyOtpForm.classList.add('hidden');
    requestOtpForm.classList.remove('hidden');
    setStatus('');
});

checkExistingSession();
runBrandCarousel();
