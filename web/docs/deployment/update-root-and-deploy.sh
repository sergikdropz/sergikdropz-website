#!/bin/bash

# Script to update Vercel root directory and deploy
# This requires updating the root directory in Vercel dashboard first

echo "⚠️  IMPORTANT: The Vercel project root directory needs to be updated."
echo ""
echo "Please follow these steps:"
echo "1. Go to: https://vercel.com/jordan-cabogas-projects/sergikdropz-website/settings"
echo "2. Scroll to 'Root Directory'"
echo "3. Set it to 'web'"
echo "4. Click 'Save'"
echo ""
echo "After updating, press Enter to continue with deployment..."
read

echo "🚀 Deploying to Vercel..."
npx vercel --yes --prod
