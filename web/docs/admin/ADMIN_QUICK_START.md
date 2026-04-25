# Admin Panel - Quick Start

## 🚀 Get Started in 3 Steps

### Step 1: Visit Setup Page
Navigate to: **`http://localhost:3001/admin/setup`**

### Step 2: Follow the Wizard
1. **Connect to Supabase** - Enter your Supabase credentials
2. **Setup Database** - Creates admin tables (automatic or manual SQL)
3. **Create Admin User** - Set up your first admin account
4. **Complete** - You're done!

### Step 3: Start Managing
After setup, you'll be automatically logged in and redirected to the admin dashboard.

## 📍 Admin Routes

- **`/admin/setup`** - Initial setup wizard (use this first!)
- **`/admin/login`** - Login page
- **`/admin`** - Main dashboard
- **`/admin/music`** - Music library management
- **`/admin/gallery`** - Gallery management  
- **`/admin/content`** - Content management

## 🔑 What You Need

Before starting, make sure you have:
- ✅ Supabase project created
- ✅ Supabase URL (from project settings)
- ✅ Supabase Anon Key (from project settings → API)
- ✅ Supabase Service Role Key (from project settings → API)

## 🛠️ Troubleshooting

### "Cannot find module" error
```bash
cd web
rm -rf .next
npm run dev
```

### Setup page not loading
- Clear browser cache
- Restart dev server
- Check browser console for errors

### Can't connect to Supabase
- Verify your Supabase credentials are correct
- Check that your Supabase project is active
- Ensure you're using the correct keys (Anon vs Service Role)

## 📝 After Setup

Once setup is complete:
1. Add Supabase credentials to `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ADMIN_EMAILS=admin@example.com
   ```

2. You can now log in at `/admin/login` anytime

3. Add more admins through the dashboard (coming soon) or manually in Supabase

## 🎯 Next Steps

- Customize the admin dashboard
- Add more management features
- Set up content management workflows
- Configure analytics and reporting

---

**Need help?** Check `ADMIN_SETUP_GUIDE.md` for detailed instructions.
