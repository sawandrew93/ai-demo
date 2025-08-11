@echo off
echo Pushing updates to GitHub...

git add .
git commit -m "Update chat widget to collect company info upfront and remove human agent popup"
git push origin main

echo Done! Changes pushed to GitHub.
pause