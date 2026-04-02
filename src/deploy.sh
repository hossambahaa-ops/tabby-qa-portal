#!/bin/bash
echo "🚀 Deploying Tabby RADAR..."
cp App.jsx src/App.jsx
if [ -f index.css ]; then cp index.css src/index.css; fi
if [ -f main.jsx ]; then cp main.jsx src/main.jsx; fi
git add .
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')"
git push
echo "✅ Pushed — Vercel auto-deploys in ~30s"
echo "🌐 https://tabby-qa-portal.vercel.app"
