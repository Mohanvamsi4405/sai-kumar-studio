# Windows PowerShell startup script for the backend

# Activate virtual environment
& ".\venv\Scripts\Activate.ps1"

# Start the backend server
Write-Host "Starting backend server on http://localhost:8000"
Write-Host "Database has been seeded with 4 pages, 45 categories, and 218 products"
Write-Host ""
Write-Host "Once the server is running, open:"
Write-Host "  - Frontend: http://localhost:5500 (or your frontend server)"
Write-Host "  - API Docs: http://localhost:8000/api/docs"
Write-Host ""

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
