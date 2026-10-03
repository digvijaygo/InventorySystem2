window.authReady = (async function enforceAuth() {
    const isLoginPage = /\/login\.html$/i.test(window.location.pathname);
    if (isLoginPage) {
        return null;
    }

    try {
        const response = await fetch('./api/auth/session', {
            credentials: 'include'
        });

        if (response.ok) {
            return response.json();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }

    if (window.top && window.top !== window.self) {
        window.top.location.href = 'login.html';
        return;
    }

    window.location.href = 'login.html';
    return null;
})();
