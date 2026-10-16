# Password Reset

The login page's Forgot password flow resets the stored password to the registered 10-digit mobile number without an SMS or verification-code step. It supports active accounts of every role, including Super Admin.

No SMS configuration is required. Enter the registered mobile number and select Reset Password, then sign in using that number as both the mobile number and password.

Passwords remain hashed. Successful resets invalidate existing sessions without changing the account's role, status, or permissions. Unknown and inactive numbers receive the same generic response without changing any account.

Security limitation: looking up a mobile number does not verify ownership. Anyone who knows a registered mobile number can reset that account, including Super Admin, and sign in using its predictable password. Do not expose this flow to an untrusted network. Verified recovery or an authenticated administrator reset is preferable for production.

Restart the server after deploying these changes.

Requests are limited to three per mobile and ten per client IP per 15 minutes. Limits are in memory for a single Node process; use a shared store for multiple instances. Deploy behind HTTPS and configure trusted proxy handling before relying on client-IP limits behind a reverse proxy.

Resetting to a mobile number creates a predictable password. Users should change it after signing in. A verified, user-chosen replacement password is preferable for production systems.