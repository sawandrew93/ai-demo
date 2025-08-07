@echo off
echo Pushing Excel search fix to GitHub...

git add .
git commit -m "Fix Excel file search issue - add missing embeddings and improve processing"
git push origin main

echo Done! Changes pushed to GitHub.
pause