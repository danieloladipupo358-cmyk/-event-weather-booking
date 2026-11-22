# SETMORE API

## Local setup

1. Copy `.env.example` to `.env`, then set a private `JWT_SECRET` of at least 32 random characters. Do not commit `.env`.
2. For the practice demo, set `DEMO_AUTH=true`. Account records are saved in the ignored local file `.demo-users.json`, and passwords are stored as bcrypt hashes. Set `DEMO_ADMIN_EMAIL` to the email address you want to use for your admin account, register with that address, and choose your own password. Do not use this mode in production.
3. For PostgreSQL-backed event and booking data, also start PostgreSQL, set `DATABASE_URL`, and use the normal database setup below.
4. Install the API packages and generate the Prisma client:

   ```sh
   npm install
   npm run db:generate
   npm run db:migrate
   npm run dev
   ```

5. In `apps/customer-web`, set `VITE_API_URL=http://localhost:4000/api` in `.env.local` if needed, then start Vite with `npm run dev`.

The API listens on port 4000 by default. `CUSTOMER_ORIGIN` must match the frontend origin so credentialed requests and the HttpOnly session cookie work. Keep `COOKIE_SAME_SITE=lax` for localhost or same-site subdomains. For frontend and API hosted on entirely different sites, set `COOKIE_SAME_SITE=none` and use HTTPS (which turns on Secure cookies).

## Admin account

In PostgreSQL mode, public registration always creates a `CUSTOMER`; clients cannot choose or submit the admin role. Register the account first, then promote it through a trusted database console:

```sql
UPDATE "User" SET "role" = 'ADMIN' WHERE "email" = 'admin@example.com';
```

Log out and log in again after changing the role. Protected endpoints reload the user's role from PostgreSQL on every request.

In local demo mode, the API assigns `ADMIN` only to a newly registered account whose email matches `DEMO_ADMIN_EMAIL` from the local `.env`. The browser cannot submit a role.

## Sessions and payments

Sessions use a signed 12-hour JWT in an HttpOnly, SameSite cookie. Production cookies are Secure. Passwords are hashed with bcrypt. No payment provider is configured; bookings do not claim payment succeeded. Password recovery email is not enabled because no mail delivery provider or credentials are configured.

## Main routes

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/users/me`, `PATCH /api/users/me`
- `GET /api/events`, `GET /api/events/:id`
- `POST /api/bookings`, `GET /api/bookings/me`, `POST /api/bookings/:id/cancel`
- Admin only: `/api/admin/events`, `/api/admin/bookings`, `/api/admin/customers`
