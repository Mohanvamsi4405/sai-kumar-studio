#!/bin/bash

# Activate virtual environment
source venv/Scripts/activate

# Check if database is seeded, if not seed it
echo "Checking database..."
python -c "from app.database import SessionLocal; from app.models import Product; db = SessionLocal(); count = db.query(Product).count(); db.close(); exit(0 if count > 0 else 1)" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Database empty, seeding now..."
    python -m app.seed
fi

# Start the backend server
echo "Starting backend server on http://localhost:8000"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
