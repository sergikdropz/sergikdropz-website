# 🔄 Restart Next.js Server

## Issue
The server is running but returning 404 errors for all routes.

## Solution

**Restart the Next.js development server:**

```bash
cd web
npm run dev
```

Then visit: `http://localhost:3001/instagram-helper`

## If That Doesn't Work

1. **Kill all Node processes:**
   ```bash
   pkill -f "next dev"
   ```

2. **Clear Next.js cache:**
   ```bash
   cd web
   rm -rf .next
   ```

3. **Restart:**
   ```bash
   npm run dev
   ```

## Verify It's Working

Once restarted, you should see:
- ✅ Next.js compilation messages
- ✅ "Ready" message with localhost URL
- ✅ Routes should work: `http://localhost:3000/instagram-helper`
