#!/bin/bash
# Tabby RADAR — Deploy Script
# Run this from your tabby-qa-portal root directory

echo "🚀 Deploying Tabby RADAR..."

# Copy files to src/
cp App.jsx src/App.jsx
if [ -f index.css ]; then cp index.css src/index.css; fi
if [ -f main.jsx ]; then cp main.jsx src/main.jsx; fi

# Git add, commit, push
git add .
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')"
git push

echo "✅ Pushed to GitHub — Vercel will auto-deploy in ~30 seconds"
echo "🌐 https://tabby-qa-portal.vercel.app"
