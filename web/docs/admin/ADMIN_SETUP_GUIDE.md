# Admin Login Setup Guide

This guide will help you set up the admin authentication system for your website.

## Quick Setup (Recommended)

**Use the automated setup wizard!**

1. Navigate to: `http://localhost:3001/admin/setup`
2. Follow the step-by-step wizard:
   - Enter your Supabase credentials
   - Setup database tables (automatic or manual)
   - Create your first admin user
3. You're done! The wizard handles everything.

## Manual Setup

If you prefer to set up manually or the wizard doesn't work for your setup:

### Prerequisites

- Supabase project set up (see `SUPABASE_SETUP_GUIDE.md`)
- Environment variables configured

## Manual Setup Steps

### 1. Create Admin User in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Users**
3. Click **"Add user"** → **"Create new user"**
4. Enter the admin email and password
5. Click **"Create user"**
6. **Copy the User ID** (you'll need this for step 2)

### 2. Set Up Admin Database

1. Go to **SQL Editor** in Supabase Dashboard
2. Open the file `web/supabase/admin-setup.sql`
3. Copy and paste the SQL into the editor
4. **Important**: At the bottom of the SQL file, uncomment and update the INSERT statement with your actual user ID and email:

```sql
INSERT INTO admins (user_id, email, active) 
VALUES ('your-user-id-from-step-1', 'admin@example.com', true);
```

5. Click **"Run"** to execute the SQL

### 3. Configure Environment Variables

Add the following to your `web/.env.local` file:

```bash
# Admin emails (comma-separated list)
ADMIN_EMAILS=admin@example.com,another-admin@example.com

# Supabase (should already be set)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

**Note**: The `ADMIN_EMAILS` environment variable is a quick way to grant admin access. The database table (`admins`) is the more flexible and recommended approach for production.

### 4. Test the Admin Login

1. Start your development server:
   ```bash
   cd web
   npm run dev
   ```

2. Navigate to: `http://localhost:3001/admin/login`

3. Log in with the email and password you created in step 1

4. You should be redirected to the admin dashboard at `/admin`

## Admin Routes

- `/admin/setup` - **Automated setup wizard** (use this first!)
- `/admin/login` - Login page
- `/admin` - Dashboard
- `/admin/music` - Music library management
- `/admin/gallery` - Gallery management
- `/admin/content` - Content management

## Security Features

- ✅ Server-side authentication checks
- ✅ Protected routes with automatic redirects
- ✅ Session management with secure cookies
- ✅ Admin-only access to admin routes
- ✅ Database-backed admin user management

## Adding More Admins

### Method 1: Using Environment Variable (Quick)

Add the email to `ADMIN_EMAILS` in `.env.local`:

```bash
ADMIN_EMAILS=admin1@example.com,admin2@example.com,admin3@example.com
```

### Method 2: Using Database (Recommended)

1. Create the user in Supabase Auth (step 1 above)
2. Run this SQL in Supabase SQL Editor:

```sql
INSERT INTO admins (user_id, email, active) 
VALUES ('new-user-id', 'new-admin@example.com', true);
```

## Troubleshooting

### "Access denied" error

- Make sure the user exists in Supabase Auth
- Verify the user is in the `admins` table or `ADMIN_EMAILS` env var
- Check that `active = true` in the database

### Can't log in

- Verify Supabase environment variables are set correctly
- Check browser console for errors
- Ensure the user was created in Supabase Auth (not just the database)

### Session not persisting

- Check that cookies are enabled in your browser
- Verify the cookie settings in `app/api/auth/login/route.ts`
- In production, ensure HTTPS is enabled (required for secure cookies)

## Next Steps

- Customize the admin dashboard (`web/app/admin/page.tsx`)
- Add more management pages as needed
- Implement CRUD operations for music, gallery, etc.
- Add analytics and reporting features

## Support

For issues or questions, check:
- Supabase Auth docs: https://supabase.com/docs/guides/auth
- Next.js docs: https://nextjs.org/docs
