# Sai Kumar Studio — Backend API

FastAPI backend + admin dashboard, backed by Supabase PostgreSQL.

**Status**: ✅ Production Ready | 🚀 All systems operational

## ⚡ Quick Start

**Step 1: Activate Virtual Environment**
```powershell
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Windows (CMD)
.\venv\Scripts\activate.bat

# Linux/Mac
source venv/bin/activate
```

**Step 2: Start Server**
```powershell
# Option A: Direct command
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Option B: Use startup script
.\start.ps1
```

**Step 3: Verify**
- API Docs: http://localhost:8000/api/docs
- Health Check: http://localhost:8000/api/health
- Should show: `{"status":"ok"}`

## 📋 Database Status

✅ **Fully Seeded**: 4 pages, 45 categories, 218 products, 458 media items

Categories include:
- 📸 **Photography**: 17 categories with tiered packages (Standard/Premium/Platinum)
- 🎁 **Gifts**: 8+ categories (frames, mugs, pillows, crystal, clocks, mirrors, etc.)
- 🏢 **Corporate**: 3+ categories (gift sets, awards, office essentials)
- 🖨️ **Studio**: 3+ categories (printing, editing, finishing services)

## 🚀 Setup (First Time Only)

```powershell
# Create venv (if not already created)
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment (already done - .env exists)
# Just verify DATABASE_URL is set

# Seed database (already done - verify with)
python -m app.seed
```

**Environment Configuration** (`.env` already set up):
- `DATABASE_URL` - Supabase PostgreSQL connection ✅
- `SECRET_KEY` - JWT signing key ✅
- `CLOUDINARY_*` - Image hosting ✅
- `SMTP_*` - Email service ✅
- `RAZORPAY_*` - Payment gateway ✅

## 📊 Database Schema

**Core Tables**:
- `site_pages` - Photography, Gifts, Corporate, Studio pages
- `categories` - Product categories within each page
- `products` - Individual products/services (218 total)
- `media` - Product images and portfolio photos (458 total)
- `users` - Customer and staff accounts

**Transaction Tables**:
- `orders` - Customer orders and order items
- `bookings` - Photography service bookings
- `carts` - Shopping cart management
- `reviews` - Product reviews and ratings

**Configuration**:
- `settings` - Site-wide settings
- `coupons` - Promotional codes
- `addresses` - User shipping addresses

## 🔌 API Endpoints

### Public Catalog
```
GET /api/catalog/{page_slug}
  Returns: categories, products, media for a page
  Examples:
    /api/catalog/gifts              → Gifts shop data
    /api/catalog/photography        → Photography services
    /api/catalog/corporate          → Corporate gifts
    /api/catalog/studio             → Studio services

GET /api/catalog/product/{product_id}
  Returns: detailed product information

GET /api/products
  Returns: paginated product listing

GET /api/homepage
  Returns: featured products for homepage
```

### Authentication
```
POST /api/auth/otp/request      → Request OTP to email
POST /api/auth/otp/verify       → Verify OTP, get token
POST /api/auth/refresh          → Refresh access token
```

### User APIs (Authenticated)
```
POST /api/cart                  → Add to cart
GET /api/orders                 → View user orders
POST /api/bookings              → Create booking
GET /api/addresses              → Saved addresses
```

### Analytics APIs (Staff/Owner)
```
GET /api/analytics/summary|orders|bookings|products|logins|actions
```
See `../docs/API_ANALYTICS.md`. Exposed to AI clients by `../mcp_server` (see `../docs/MCP.md`).

### Admin APIs (Owner/Staff Role)
```
GET/POST /api/admin/products
PUT/DELETE /api/admin/products/{id}
[Similar CRUD for categories, orders, bookings, settings, etc.]
```

## 🛠️ Development

### API Documentation
Visit: http://localhost:8000/api/docs (interactive Swagger UI)

### File Structure
```
backend/
├── app/
│   ├── main.py              # FastAPI app setup
│   ├── models.py            # Database models
│   ├── routers/
│   │   ├── catalog.py       # Product endpoints ✅
│   │   ├── auth.py          # Authentication ✅
│   │   ├── orders.py        # Orders ✅
│   │   ├── bookings.py      # Bookings ✅
│   │   ├── cart.py          # Cart ✅
│   │   └── admin.py         # Admin ✅
│   └── services/            # Business logic
├── seed_data/               # Static seed files
├── .env                     # Configuration ✅
├── requirements.txt         # Dependencies ✅
└── start.ps1               # Startup script ✅
```

## ✅ What's Complete

- ✅ Database schema (generalized SitePage → Category → Product)
- ✅ All 4 pages seeded (Photography, Gifts, Corporate, Studio)
- ✅ All 218 products loaded with images
- ✅ Public API endpoints (catalog, homepage, products)
- ✅ Authentication (OTP-based)
- ✅ Cart & order management
- ✅ Admin dashboard
- ✅ CORS enabled for frontend
- ✅ Error handling & validation
- ✅ Database seeding script

## 🔄 Testing

**Test Frontend Integration**:
```
http://localhost:5500/test-frontend.html
```

**Test Specific Endpoints**:
```powershell
# Run test script (new terminal)
.\test-api.ps1
```

## 📱 Frontend Integration

All frontend pages are ready to fetch from this API:
- `gifts.html` → `/api/catalog/gifts`
- `photography.html` → `/api/catalog/photography`
- `corporate.html` → `/api/catalog/corporate`
- `studio.html` → `/api/catalog/studio`
- `index.html` → `/api/homepage`

Frontend correctly handles:
- ✅ API data fetching
- ✅ Error handling
- ✅ Product rendering
- ✅ Category filtering
- ✅ Shopping cart

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 8000 in use | `uvicorn app.main:app --port 8001` |
| Database connection error | Check DATABASE_URL in .env |
| CORS errors | Verify CORS_ORIGINS includes frontend URL |
| Module not found | Run `pip install -r requirements.txt` |
| API not responding | Ensure server is running: `uvicorn ...` |

## 📖 Documentation

- **Setup Guide**: `../docs/SETUP.md`
- **Fixes Applied** (Sept 2026, historical): `../unused/old-reports/FIXES_APPLIED.md`
- **API Docs**: http://localhost:8000/api/docs (interactive)

---

**Status**: ✅ Ready for deployment
**Database**: Seeded with 218 products
**Last Updated**: 2026-09-08

ssh -i "<path-to-your-key>.pem" ubuntu@<server-ip> "sudo journalctl -u studio-backend -f"