"""Transcribes today's hardcoded storefront data into the database.

Run with: python -m app.seed

Covers Photography (js/photography.js — 12 tiered service categories + 5
equipment-only categories), Corporate (js/corporate.js), Gifts (js/gifts.js),
and Studio (js/studio.js). The public storefront pages for Corporate/Gifts/
Studio still render from their own hardcoded JS, not this data yet — this only
makes the catalog manageable from the admin dashboard. bulk-orders.html has no
product data of its own (a plain inquiry form), so nothing to seed there.
"""
import json
import re
from pathlib import Path
from urllib.parse import quote

from .database import Base, SessionLocal, engine
from .models import Category, Media, Product, Setting, SitePage, User
from .security import hash_password
from .config import get_settings

CLOUD = "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e"
SEED_DATA_DIR = Path(__file__).resolve().parent / "seed_data"


def _load_json(name: str):
    with open(SEED_DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def _to_price(value):
    """Corporate/Studio prices arrive as "₹1,299" strings; Gifts prices arrive as
    plain numbers. Normalizes both to a float, or None if there's nothing to parse."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    digits = re.sub(r"[^\d.]", "", str(value))
    return float(digits) if digits else None


def _cloud_url(raw: str | None) -> str | None:
    """Corporate's data mixes full Cloudinary URLs with bare relative paths
    (e.g. "corporate_assets/10--dairy combos.avif") — this normalizes both to a
    full URL, url-encoding spaces in the relative-path case."""
    if not raw:
        return None
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    return f"{CLOUD}/{quote(raw, safe='/%')}"

# ---------------------------------------------------------------- photography data
# transcribed verbatim from js/photography.js

CATEGORIES = [
    {"id": "wedding", "icon": "💍", "name": "Wedding Photography", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/wedding.jpg"},
    {"id": "prewedding", "icon": "💑", "name": "Pre-Wedding", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/prewedding-platinum.jpg"},
    {"id": "maternity", "icon": "🤰", "name": "Maternity Shoot", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/maternity%20standard.jpg"},
    {"id": "baby", "icon": "👶", "name": "Baby Shoot", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/baby%20shoot.jpg"},
    {"id": "birthday", "icon": "🎂", "name": "Birthday Photography", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/birthday.jpg"},
    {"id": "event", "icon": "🎉", "name": "Event Photography", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/event.jpg"},
    {"id": "outdoor", "icon": "🏞️", "name": "Outdoor Photography", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/outdoor.jpg"},
    {"id": "drone", "icon": "🛸", "name": "Drone Videography", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/drone.jpg"},
    {"id": "video", "icon": "🎥", "name": "Videography", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/videography.jpg"},
    {"id": "album", "icon": "📔", "name": "Album Designing", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/album.jpg"},
    {"id": "housewarming", "icon": "🏠", "name": "House Warming", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/housewarming.jpg"},
    {"id": "sareefunction", "icon": "🥻", "name": "Saree Function", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/saree%20ceremony.png"},
    {"id": "traditionalphoto", "icon": "🪔", "name": "Traditional Photography", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/traditional-photography.png"},
    {"id": "traditionalvideo", "icon": "🎞️", "name": "Traditional Videography", "image": f"{CLOUD}/Photography_assets/assets/portfolio/traditional-photography-3.png"},
    {"id": "cinematicvideo", "icon": "🎬", "name": "Cinematic Videography", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/cinematic-videography.png"},
    {"id": "candidphoto", "icon": "📷", "name": "Candid Photography", "image": f"{CLOUD}/Photography_assets/assets/portfolio/wedding-4.png"},
    {"id": "ledscreens", "icon": "💡", "name": "LED Screens", "image": f"{CLOUD}/Photography_assets/assets/All%20Services/led-screens.png"},
]

SIDEBAR_FUNCTION_IDS = ["wedding", "prewedding", "maternity", "baby", "birthday", "housewarming", "sareefunction", "event"]
SIDEBAR_EQUIPMENT_IDS = ["drone", "outdoor", "video", "album", "traditionalphoto", "traditionalvideo", "cinematicvideo", "candidphoto", "ledscreens"]

PACKAGES = {
    "wedding": [
        {"tier": "Standard", "title": "Standard Wedding Photography", "price": 24999, "feat": ["1 Professional Photographer", "1 Professional Videographer", "150+ High-Res Edited Photos", "Standard Digital Delivery", "1 Event Day Coverage"]},
        {"tier": "Premium", "title": "Premium Wedding Photography", "price": 44999, "featured": True, "feat": ["2 Professional Photographers", "1 Cinematic Videographer", "300+ High-Res Edited Photos", "Cinematic Highlight Teaser", "Premium Photo Album Book", "Drone Shoot Included"]},
        {"tier": "Platinum", "title": "Platinum Wedding Photography", "price": 74999, "feat": ["2 Premium Photographers", "2 Cinematic Videographers", "500+ High-Res Edited Photos", "Full Cinematic Film Coverage", "2 Premium Lay-Flat Albums", "Crane & Drone Video Coverage", "Complementary Pre-Wedding Shoot"]},
    ],
    "prewedding": [
        {"tier": "Standard", "title": "Standard Pre-Wedding Photography", "price": 19999, "feat": ["4 Hours Outdoor Shoot", "1 Scenic Location", "30 High-Res Edited Photos", "Full Digital Album Delivery", "Outfit Changes Allowed (Max 2)"]},
        {"tier": "Premium", "title": "Premium Pre-Wedding Photography", "price": 34999, "featured": True, "feat": ["Full Day Shoot (8 Hours)", "2 Premium Locations", "60 High-Res Edited Photos", "2-Minute Cinematic Love Teaser", "Shoot Props & Helper Assist"]},
        {"tier": "Platinum", "title": "Platinum Pre-Wedding Photography", "price": 54999, "feat": ["Full Day Shoot (10 Hours)", "3 Premium/Exotic Locations", "100 High-Res Edited Photos", "4-Minute Cinematic Love Film", "Outfit Styling & Makeup Artist", "Drone Shots Included"]},
    ],
    "maternity": [
        {"tier": "Standard", "title": "Standard Maternity Shoot", "price": 8999, "feat": ["3 Hours Studio/Garden Session", "Outfit Changes Allowed (Max 2)", "25 High-Res Edited Photos", "Digital High-Res Delivery"]},
        {"tier": "Premium", "title": "Premium Maternity Shoot", "price": 17999, "featured": True, "feat": ["Outdoor & Indoor Studio Sessions", "3 Premium Maternity Gowns Provided", "Professional Hair & Makeup Artist", "Premium Canvas Print (16x20)"]},
        {"tier": "Platinum", "title": "Platinum Maternity Shoot", "price": 27999, "feat": ["Full Day Outdoor + Studio Session", "5 Premium Maternity Gowns Provided", "Professional Hair & Makeup Artist", "Partner & Family Portraits Included", "Premium Canvas Print (24x36)", "Cinematic Maternity Video Reel"]},
    ],
    "baby": [
        {"tier": "Standard", "title": "Standard Baby Shoot", "price": 6999, "feat": ["2 Hours Studio Session", "2 Customized Props & Themes", "15 High-Res Edited Photos", "Digital High-Res Delivery"]},
        {"tier": "Premium", "title": "Premium Baby Shoot", "price": 12999, "featured": True, "feat": ["4 Hours Studio Session", "4 Customized Props & Themes", "30 High-Res Edited Photos", "Family Portrait Portion Included", "Hardcover Baby Photobook"]},
        {"tier": "Platinum", "title": "Platinum Baby Shoot", "price": 19999, "feat": ["Full Day Studio Session", "6 Customized Props & Themes", "50 High-Res Edited Photos", "Family Portrait Session Included", "Premium Hardcover Baby Photobook", "Cinematic Baby Milestone Video"]},
    ],
    "birthday": [
        {"tier": "Standard", "title": "Standard Birthday Photography", "price": 7999, "feat": ["3 Hours Party Coverage", "Traditional + Candid Photos", "100+ High-Res Digital Delivery", "Fast 3-Day Turnaround"]},
        {"tier": "Premium", "title": "Premium Birthday Photography", "price": 14999, "featured": True, "feat": ["Full Birthday Event Video", "2 Photographers (Candid/Traditional)", "Premium Birthday Album Book", "Animated Digital Invites"]},
        {"tier": "Platinum", "title": "Platinum Birthday Photography", "price": 22999, "feat": ["Full Day Event Coverage", "3 Photographers + 1 Videographer", "Cinematic Highlight Film", "Premium Birthday Album Book", "Drone Shots for Outdoor Parties"]},
    ],
    "event": [
        {"tier": "Standard", "title": "Standard Event Coverage", "price": 13999, "feat": ["4 Hours Event Coverage", "Traditional + Candid Coverage", "200+ High-Res Digital Delivery", "Digital Album Download Link"]},
        {"tier": "Premium", "title": "Premium Event Coverage", "price": 24999, "featured": True, "feat": ["8 Hours Event Coverage", "2 Professional Photographers", "Event Video Coverage Included", "Printed Hardcover Album Link"]},
        {"tier": "Platinum", "title": "Platinum Event Coverage", "price": 39999, "feat": ["Full Day + Evening Coverage", "3 Professional Photographers", "Cinematic Event Highlight Film", "Drone Aerial Coverage Included", "Premium Printed Hardcover Album", "Same-Day Photo Highlights Reel"]},
    ],
    "outdoor": [
        {"tier": "Standard", "title": "Standard Outdoor Photography", "price": 4999, "feat": ["2 Hours Outdoor Session", "1 Selected Scenic Location", "20 High-Res Edited Photos", "Full Digital Album Delivery"]},
        {"tier": "Premium", "title": "Premium Outdoor Photography", "price": 9999, "featured": True, "feat": ["4 Hours Shoot", "Up to 2 Locations", "45 High-Res Edited Photos", "Premium Lay-Flat Album Book", "Drone Shots Included"]},
        {"tier": "Platinum", "title": "Platinum Outdoor Photography", "price": 16999, "feat": ["Full Day Shoot (6 Hours)", "Up to 3 Premium Locations", "75 High-Res Edited Photos", "Premium Lay-Flat Album Book", "Drone Shots Included", "Professional Styling Assistance"]},
    ],
    "drone": [
        {"tier": "Standard", "title": "Standard Aerial Coverage", "price": 7999, "feat": ["2 Hours Drone Shoot", "High-Resolution Aerial Photos", "4K Video RAW Footage Clips", "1 Edited Aerial Video Teaser"]},
        {"tier": "Premium", "title": "Premium Aerial Production", "price": 14999, "featured": True, "feat": ["Full Day Aerial Coverage", "Cinematic Aerial Videography", "Color Graded & Edited Footage", "3D Mapping/Panoramas"]},
        {"tier": "Platinum", "title": "Platinum Aerial Production", "price": 24999, "feat": ["Full Day Multi-Location Coverage", "2 Licensed Drone Pilots", "4K Cinematic Aerial Film", "3D Mapping & Panoramas", "Color Graded Highlight Reel", "Same-Day Raw Footage Delivery"]},
    ],
    "video": [
        {"tier": "Standard", "title": "Standard Event Video", "price": 9999, "feat": ["1 Professional Videographer", "3-5 Minute Cinematic Highlight Film", "Full HD 1080p Delivery", "Digital Video Link Delivery"]},
        {"tier": "Premium", "title": "Premium Documentary Film", "price": 19999, "featured": True, "feat": ["2 Professional Videographers", "60-Minute Documented Event Film", "4K Ultra HD Resolution", "Custom Intro & Background Score"]},
        {"tier": "Platinum", "title": "Platinum Cinematic Film", "price": 34999, "feat": ["2 Cinematic Videographers", "90-Minute Full Feature Film", "4K Ultra HD with Drone Shots", "Custom Background Score & Titles", "Same-Day Highlight Reel", "Premium USB/Cloud Delivery"]},
    ],
    "album": [
        {"tier": "Standard", "title": "Standard Photo Book", "price": 2999, "feat": ["20 Designed Pages (10 Sheets)", "Glossy or Matte Paper Option", "Digital Design Review Preview", "Personalized Photo Cover"]},
        {"tier": "Premium", "title": "Premium Lay-flat Album", "price": 5999, "featured": True, "feat": ["40 Designed Pages (20 Sheets)", "Premium Thick Lay-flat Pages", "Leathery or Canvas Cover Option", "Premium Album Case Storage Box"]},
        {"tier": "Platinum", "title": "Platinum Lay-flat Album", "price": 9999, "feat": ["60 Designed Pages (30 Sheets)", "Premium Leather-Bound Cover", "Gold Foil Personalized Embossing", "Luxury Album Box with Fabric Lining", "Complimentary Parents' Mini Album"]},
    ],
    "housewarming": [
        {"tier": "Standard", "title": "Standard House Warming Photography", "price": 8999, "feat": ["3 Hours Ceremony Coverage", "Traditional Ritual Photography", "100+ High-Res Edited Photos", "Digital Album Delivery"]},
        {"tier": "Premium", "title": "Premium House Warming Photography", "price": 15999, "featured": True, "feat": ["6 Hours Ceremony Coverage", "2 Photographers (Rituals + Candid)", "200+ High-Res Edited Photos", "Short Highlight Video Reel", "Printed Photo Album"]},
        {"tier": "Platinum", "title": "Platinum House Warming Photography", "price": 24999, "feat": ["Full Day Coverage (Puja + Celebration)", "2 Photographers + 1 Videographer", "300+ High-Res Edited Photos", "Cinematic Highlight Film", "Premium Printed Photo Album", "Drone Shots for House & Venue"]},
    ],
    "sareefunction": [
        {"tier": "Standard", "title": "Standard Saree Function Photography", "price": 7999, "feat": ["3 Hours Ceremony Coverage", "Traditional Ritual Photography", "100+ High-Res Edited Photos", "Digital Album Delivery"]},
        {"tier": "Premium", "title": "Premium Saree Function Photography", "price": 14999, "featured": True, "feat": ["5 Hours Ceremony Coverage", "2 Photographers (Rituals + Candid)", "200+ High-Res Edited Photos", "Short Highlight Video Reel", "Printed Photo Album"]},
        {"tier": "Platinum", "title": "Platinum Saree Function Photography", "price": 22999, "feat": ["Full Day Ceremony Coverage", "2 Photographers + 1 Videographer", "300+ High-Res Edited Photos", "Cinematic Highlight Film", "Premium Printed Photo Album", "Drone Shots for Venue"]},
    ],
}

FOLIO = {
    "wedding": ["Mandap Ceremony", "Bride Portrait", "Candid Rituals", "Couple Golden Hour", "Reception Stage", "Baraat Entry", "Ring Exchange", "Family Group Shot"],
    "prewedding": ["Sunset Silhouette", "Beach Couple", "Heritage Fort", "Flower Field", "Cafe Candid", "Rainy Day Shoot"],
    "maternity": ["Studio Glow", "Garden Session", "Partner Portrait", "Silhouette Bump", "Gown Series", "Family Frame"],
    "baby": ["Prop Theme Setup", "Studio Newborn", "Sibling Frame", "Milestone Cake", "Bathtub Theme", "Cozy Wrap"],
    "birthday": ["Cake Cutting", "Candid Laughs", "Balloon Decor", "Theme Party", "Family Frame", "Photo Booth"],
    "event": ["Stage Coverage", "Crowd Candid", "Corporate Event", "Award Moment", "Cultural Show", "Aerial View"],
    "outdoor": ["Scenic Portrait", "Lake View", "City Skyline", "Nature Trail", "Golden Hour", "Drone Wide"],
    "drone": ["Aerial Wedding", "Top-Down Shot", "Panorama Sweep", "Venue Flyover", "4K Cinematic", "Sunset Aerial"],
    "video": ["Highlight Reel", "Cinematic Frame", "Documentary", "Titles & Score", "4K Coverage", "Same-Day Edit"],
    "album": ["Lay-Flat Spread", "Leather Cover", "Gold Embossing", "Photobook Set", "Canvas Print", "Luxury Box"],
    "housewarming": ["Puja Rituals", "Ceremony Frame", "Family Portrait", "Decor Detail", "Candid Guests", "Venue Drone"],
    "sareefunction": ["Saree Draping Ceremony", "Traditional Rituals", "Family Blessings", "Candid Moments", "Decor Details", "Group Portrait"],
}

FOLIO_TITLES = {
    "wedding": "Wedding Photography Portfolio", "prewedding": "Pre-Wedding Portfolio", "maternity": "Maternity Portfolio",
    "baby": "Baby Shoot Portfolio", "birthday": "Birthday Portfolio", "event": "Event Coverage Portfolio",
    "outdoor": "Outdoor Portfolio", "drone": "Drone Videography Portfolio",
    "video": "Videography Reel", "album": "Album Designs", "housewarming": "House Warming Portfolio",
    "sareefunction": "Saree Function Portfolio",
    "traditionalphoto": "Traditional Photography Portfolio", "traditionalvideo": "Traditional Videography Portfolio",
    "cinematicvideo": "Cinematic Videography Portfolio", "candidphoto": "Candid Photography Portfolio",
    "ledscreens": "LED Screens Portfolio",
}

CATEGORY_IMAGES = {
    "wedding": f"{CLOUD}/Photography_assets/assets/hero/wedding.png",
    "prewedding": f"{CLOUD}/Photography_assets/assets/hero/pre-wedding.png",
    "maternity": f"{CLOUD}/Photography_assets/assets/hero/maternity.jpg",
    "baby": f"{CLOUD}/Photography_assets/assets/hero/baby-shower.jpg",
    "birthday": f"{CLOUD}/Photography_assets/assets/hero/birthday-event.jpg",
    "outdoor": f"{CLOUD}/Photography_assets/assets/hero/outdoor.jpg",
    "drone": f"{CLOUD}/Photography_assets/assets/hero/drone.jpg",
    "video": f"{CLOUD}/Photography_assets/assets/hero/video.jpg",
    "album": f"{CLOUD}/Photography_assets/assets/hero/album%20designing.jpg",
    "event": f"{CLOUD}/Photography_assets/assets/hero/event.png",
    "housewarming": f"{CLOUD}/Photography_assets/assets/hero/house%20warming.png",
    "sareefunction": f"{CLOUD}/Photography_assets/assets/hero/saree%20ceremony.png",
}

HERO_TAGLINE = {
    "wedding": "Cinematic candid & traditional coverage",
    "prewedding": "Love stories at exotic locations",
    "maternity": "Elegant studio & outdoor sessions",
    "baby": "Adorable themed newborn shoots",
    "birthday": "Fun-filled party coverage",
    "event": "Full-scale event documentation",
    "outdoor": "Scenic outdoor portraits",
    "drone": "4K cinematic aerial coverage",
    "video": "Cinematic films & highlight reels",
    "album": "Premium lay-flat photo albums",
    "housewarming": "Traditional ceremony coverage",
    "sareefunction": "Traditional saree ceremony coverage",
}

HERO_EXCLUDE = ["traditionalphoto", "video", "candidphoto", "ledscreens", "cinematicvideo", "traditionalvideo"]

PORTFOLIO_FILES = {
    "wedding": ["wedding-1.png", "wedding-2.png", "wedding-3.png", "wedding-4.png", "wedding-5.png", "wedding-6.png", "wedding-7.png", "wedding-8.png"],
    "prewedding": ["pre-wedding-1.png", "pre-wedding-2.png", "pre-wedding-3.png", "pre-wedding-4.png", "pre-wedding-5.png", "pre-wedding-6.png"],
    "maternity": ["maternity-1.png", "maternity-2.png", "maternity-3.png", "maternity_4.jpg", "maternity_5.jpg", "maternity_6.jpg"],
    "baby": ["baby_1.jpg", "baby_2.jpg", "baby_3.jpg", "baby_4.jpg", "baby_5.jpg", "baby_6.jpg"],
    "birthday": ["birthday_1.jpg", "birthday_2.jpg", "birthday_3.jpg", "birthday_4.jpg", "birthday_5.jpg", "birthday_6.jpg"],
    "event": ["event_1.jpg", "event_2.jpg", "event_3.jpg", "event_4.jpg", "event_5.jpg", "event_6.jpg"],
    "outdoor": ["outdoor_1.jpg", "outdoor_2.jpg", "outdoor_3.jpg", "outdoor_4.jpg", "outdoor_5.jpg", "outdoor_6.jpg"],
    "drone": ["drone_1.jpg", "drone_2.jpg", "drone_3.jpg", "drone_4.jpg", "drone_5.jpg", "drone_6.jpg"],
    "video": ["video_1.jpg", "video_2.jpg", "video_3.jpg", "video_4.jpg", "video_5.jpg", "video_6.jpg"],
    "album": ["album_1.jpg", "album_2.jpg", "album_3.jpg", "album_4.jpg", "album_5.jpg", "album_6.jpg"],
    "housewarming": ["housewarming_1.jpg", "housewarming_2.jpg", "housewarming_3.jpg", "housewarming_4.jpg", "housewarming_5.jpg", "housewarming_6.jpg"],
    "sareefunction": ["saree-ceremony-1..png", "saree-ceremony-2.png", "saree-ceremony-3.png", "saree-ceremony-4.png", "saree-ceremony-5.png", "saree-ceremony-6.png"],
}

PACKAGE_IMAGES = {
    "wedding|standard": ["wedding%20standard-1.jpg", "wedding%20standard-2.jpg", "wedding%20standard-3.jpg"],
    "wedding|premium": ["wedding%20premium-1.jpg", "wedding%20premium-2.jpg", "wedding%20premium-3.jpg"],
    "wedding|platinum": ["wedding%20platinum-1.jpg", "wedding%20platinum-2.jpg", "wedding%20platinum-3.jpg"],
    "prewedding|standard": ["prewedding_standard_1.jpg", "prewedding_standard_2.jpg", "prewedding_standard_3.jpg"],
    "prewedding|premium": ["prewedding-premium_1.jpg", "prewedding-premium_2.jpg", "prewedding-premium_3.jpg"],
    "prewedding|platinum": ["prewedding-platinum_1.jpg", "prewedding-platinum_2.jpg", "prewedding-platinum_3.jpg"],
    "maternity|standard": ["maternity%20standard_1.jpg", "maternity%20standard_2.jpg", "maternity%20standard_3.jpg"],
    "maternity|premium": ["maternity%20premium_1.jpg", "maternity%20premium_2.jpg", "maternity%20premium_3.jpg"],
    "maternity|platinum": ["maternity-platinum-1.png", "maternity-platinum-2.png", "maternity-platinum-3.png"],
    "baby|standard": ["baby-standard-1.png", "baby-standard-2.jpg", "baby-standard-3.jpg"],
    "baby|premium": ["baby-premium-1.jpg", "baby-premium-2.jpg", "baby-premium-3.jpg"],
    "baby|platinum": ["baby-platinum-1.jpg", "baby-platinum-2.jpg", "baby-platinum-3.jpg"],
    "birthday|standard": ["birthday-standard-1.jpg", "birthday-standard-2.jpg", "birthday-standard-3.jpg"],
    "birthday|premium": ["birthday-premium-1.jpg", "birthday-premium-2.jpg", "birthday-premium-3.jpg"],
    "birthday|platinum": ["birthday-platinum-1.jpg", "birthday-platinum-2.jpg", "birthday-platinum-3.jpg"],
    "event|standard": ["event-standard-1.png", "event-standard-2.png", "event-standard-3.png"],
    "event|premium": ["event-premium-1.png", "event-premium-2.png", "event-premium-3.png"],
    "event|platinum": ["event-platinum-1.png", "event-platinum-2.png", "event-platinum-3.png"],
    "outdoor|standard": ["outdoor-standard-1.png", "outdoor-standard-2.jpg", "outdoor-standard-3.png"],
    "outdoor|premium": ["outdoor-premium-1.png", "outdoor-premium-2.png", "outdoor-premium-3.png"],
    "outdoor|platinum": ["outdoor-platinum-1.png", "outdoor-platinum-2.png", "outdoor-platinum-3.png"],
    "drone|standard": ["drone_standard-1.png", "drone_standard-2.png", "drone_standard-3.png"],
    "drone|premium": ["drone_premium-1.png", "drone_premium-2.png", "drone_premium-3.png"],
    "drone|platinum": ["drone_platinum-1.png", "drone_platinum-2.png", "drone_platinum-3.png"],
    "video|standard": ["vedio_standard-1.png", "vedio_standard-2.png", "video_standard-3.jpg"],
    "video|premium": ["video%20premium-1.jpg", "video%20premium-2.jpg", "video%20premium-3.jpg"],
    "video|platinum": ["video%20platinum-1.jpg", "video%20platinum-2.jpg", "video%20platinum-3.jpg"],
    "album|standard": ["album%20standard-1.jpg", "album%20standard-2.jpg", "album%20standard-3.jpg"],
    "album|premium": ["album%20premium-1.jpg", "album%20premium-2.jpg", "album%20premium-3.jpg"],
    "album|platinum": ["album%20platinum-1.jpg", "album%20platinum-2.jpg", "album%20platinum-3.jpg"],
    "housewarming|standard": ["housewarming%20standard-1.jpg", "housewarming%20standard-2.jpg", "housewarming%20standard-3.jpg"],
    "housewarming|premium": ["housewarming%20premium-1.jpg", "housewarming%20premium-2.jpg", "housewarming%20premium-3.jpg"],
    "housewarming|platinum": ["housewarming%20platinum-1.jpg", "housewarming%20platinum-2.jpg", "house%20warming%20platinum-3.jpg"],
    "sareefunction|standard": ["saree-ceremony-standard-1.jpg", "saree-ceremony-standard-2.jpg", "saree-ceremony-standard-3.jpg"],
    "sareefunction|premium": ["saree-ceremony-premium-1.jpg", "saree-ceremony-premium-2.jpg", "saree-ceremony-premium-3.jpg"],
    "sareefunction|platinum": ["saree-ceremony-platinum-1.jpg", "saree-ceremony-platinum-2.jpg", "saree-ceremony-platinum-3.jpg"],
}


# Equipment-only categories (no tiered PACKAGES entry — a single fixed, quote-based
# service) - transcribed verbatim from js/photography.js's EQUIPMENT_DATA, which used
# to be the only place this content lived. Stored as one non-tiered Product per
# category so the client can edit crew/hours/gear/deliverables from the admin panel
# instead of a developer editing hardcoded JS. `extra.price_on_request=True` tells
# the API to render "On Request" instead of formatting `price` (kept at 0).
EQUIPMENT_PRODUCTS = {
    "candidphoto": {
        "tagline": "Unscripted, natural emotional moments captured seamlessly with zero forced posing.",
        "crew": "2 Senior Candid Photographers",
        "hours": "8 – 10 Hours (Full Event)",
        "gear": [
            "Sony Alpha A7IV & A7SIII Full-Frame Bodies",
            "Sony FE 35mm f/1.4 GM & 85mm f/1.4 GM Prime Lenses",
            "Silent Electronic/Mechanical Shutters for quiet ceremony shooting",
            "Godox V1 Round-Head Speedlites with Wireless Triggers",
        ],
        "deliverables": [
            "250+ High-Res Retouched Candid Photos",
            "Private Online Password-Protected Cloud Gallery",
            "All Raw Unedited Images on USB Flash Drive",
        ],
        "gallery": ["portfolio/wedding-1.png", "portfolio/wedding-2.png", "portfolio/wedding-3.png"],
    },
    "traditionalphoto": {
        "tagline": "Complete formal documentation of every ritual, family group, and stage greeting.",
        "crew": "2 Senior Traditional Photographers",
        "hours": "Full Event Ceremony (No Hourly Cutoff)",
        "gear": [
            "Canon EOS 5D Mark IV & Nikon Z6II Professional Bodies",
            "Canon EF 24-70mm f/2.8L II USM Zoom Lenses",
            "Godox AD600Pro Off-Camera Strobe Lighting Rigs",
            "Heavy-Duty Heavy Light Stands & Softbox Diffusers",
        ],
        "deliverables": [
            "500+ Fully Color Corrected Formal & Ritual Photos",
            "Structured Ceremonial Photo Folders",
            "High-Resolution Print-Ready JPEG Files",
        ],
        "gallery": [
            "portfolio/traditional-photography-1.png",
            "portfolio/traditional-photography-2.png",
            "portfolio/traditional-photography-3.png",
        ],
    },
    "traditionalvideo": {
        "tagline": "Full-length chronological video record capturing every mantra, chant, and blessing without cuts.",
        "crew": "2 Professional Event Videographers",
        "hours": "Full Event Duration",
        "gear": [
            "Sony HXR-NX80 4K Camcorders & PXW-Z190 3-CMOS Video Bodies",
            "Libec & Manfrotto Professional Fluid Head Tripods",
            "Rode Shotgun Mics & Direct Soundboard Recorders",
            "High-Output COB LED Light Panels with Diffusers",
        ],
        "deliverables": [
            "1.5 – 2 Hours Full Length Ceremony Video (1080p / 4K)",
            "Branded Pendrive with Custom Engraved Box",
            "Direct Mobile-Streamable Digital Download Link",
        ],
        "gallery": ["portfolio/video_1.jpg", "portfolio/video_2.jpg", "portfolio/video_3.jpg"],
    },
    "cinematicvideo": {
        "tagline": "Movie-quality storytelling with dynamic camera motion, cinema color grading & custom audio.",
        "crew": "2 Senior Cinema Directors / Videographers",
        "hours": "8 – 12 Hours (Full Day Event)",
        "gear": [
            "Sony FX3 Cinema Line Full-Frame Cameras",
            "DJI RS 3 Pro Gimbal Stabilizer & Motorized Sliders",
            "Sirui Cine Anamorphic Lenses for true widescreen depth",
            "Sennheiser AVX Wireless Lavalier Mics & Zoom F6 Recorders",
        ],
        "deliverables": [
            "4-5 Min Cinematic Teaser Trailer (4K HDR)",
            "20-30 Min Master Feature Film",
            "Custom Composed Background Score & Dialogue Mix",
        ],
        "gallery": [
            "portfolio/cinematic-videography-1.png",
            "portfolio/cinematic-videography-2.png",
            "portfolio/cinematic-videography-3.png",
        ],
    },
    "ledscreens": {
        "tagline": "High-brightness stage backdrops & live camera feed walls so every guest gets a front-row view.",
        "crew": "2 Live Video Technicians & Switcher Operator",
        "hours": "Full Event Duration (Setup 3 Hours Prior)",
        "gear": [
            "P2.5 Ultra High Brightness HD LED Panels (10ft x 15ft Modular)",
            "Novastar VX4S All-In-One HD Video Processor",
            "Blackmagic Design ATEM Mini Pro Live Production Switcher",
            "Heavy Duty Aluminum Truss System & Rigging",
        ],
        "deliverables": [
            "Real-time Live Camera Video Streaming to LED Wall",
            "Custom Graphic Backdrops & Couple Slide Animations",
            "Complete On-Site Technical Management",
        ],
        "gallery": ["portfolio/led-screens-1.png", "portfolio/led-screens-2.png", "portfolio/led-screens-3.png"],
    },
}


def _group_label(cat_id: str) -> str | None:
    if cat_id in SIDEBAR_FUNCTION_IDS:
        return "Functions"
    if cat_id in SIDEBAR_EQUIPMENT_IDS:
        return "Equipment"
    return None


def seed_photography(db):
    page = db.query(SitePage).filter(SitePage.slug == "photography").first()
    if not page:
        page = SitePage(slug="photography", name="Photography", sort=1)
        db.add(page)
        db.flush()

    for i, cat in enumerate(CATEGORIES):
        slug = cat["id"]
        category = db.query(Category).filter(Category.page_id == page.id, Category.slug == slug).first()
        if not category:
            category = Category(page_id=page.id, slug=slug)
            db.add(category)

        category.name = cat["name"]
        category.icon = cat["icon"]
        category.thumb_image_url = cat["image"]
        category.hero_image_url = CATEGORY_IMAGES.get(slug)
        category.hero_tagline = HERO_TAGLINE.get(slug)
        category.show_in_hero = slug in CATEGORY_IMAGES and slug not in HERO_EXCLUDE
        category.folio_title = FOLIO_TITLES.get(slug)
        category.group_label = _group_label(slug)
        category.sort = i
        category.is_active = True
        db.flush()

        # portfolio gallery (only categories with real FOLIO captions get photos)
        captions = FOLIO.get(slug, [])
        files = PORTFOLIO_FILES.get(slug, [])
        existing_portfolio = {m.alt: m for m in category.media if m.kind == "portfolio"}
        for idx, caption in enumerate(captions):
            file = files[idx % len(files)] if files else None
            if not file:
                continue
            url = f"{CLOUD}/Photography_assets/assets/portfolio/{file}"
            m = existing_portfolio.get(caption)
            if not m:
                db.add(Media(category_id=category.id, url=url, alt=caption, kind="portfolio", sort=idx))
            else:
                m.url, m.sort = url, idx

        # tiered packages
        pkgs = PACKAGES.get(slug, [])
        for sort, pkg in enumerate(pkgs):
            tier_key = pkg["tier"].lower()
            pslug = f"photography-{slug}-{tier_key}"
            product = db.query(Product).filter(Product.slug == pslug).first()
            if not product:
                product = Product(category_id=category.id, slug=pslug)
                db.add(product)
            product.category_id = category.id
            product.tier = pkg["tier"]
            product.title = pkg["title"]
            product.type = "service"
            product.price = pkg["price"]
            product.features = pkg["feat"]
            product.is_active = True
            product.sort = sort
            db.flush()

            images = PACKAGE_IMAGES.get(f"{slug}|{tier_key}", [])
            existing_pkg_media = sorted([m for m in product.media if m.kind == "package"], key=lambda m: m.sort)
            for idx, file in enumerate(images):
                url = f"{CLOUD}/Photography_assets/assets/packages/{file}"
                if idx < len(existing_pkg_media):
                    existing_pkg_media[idx].url = url
                else:
                    db.add(Media(product_id=product.id, url=url, alt="", kind="package", sort=idx))

        # equipment-only categories: one fixed, quote-based product instead of tiers
        equip = EQUIPMENT_PRODUCTS.get(slug)
        if equip and not pkgs:
            pslug = f"photography-{slug}-service"
            product = db.query(Product).filter(Product.slug == pslug).first()
            if not product:
                product = Product(category_id=category.id, slug=pslug)
                db.add(product)
            product.category_id = category.id
            product.tier = None
            product.title = cat["name"]
            product.type = "service"
            product.description = equip["tagline"]
            product.price = 0
            product.features = equip["deliverables"]
            product.is_active = True
            product.sort = 0
            product.extra = {
                "price_on_request": True,
                "crew": equip["crew"],
                "hours": equip["hours"],
                "gear": equip["gear"],
            }
            db.flush()

            existing_equip_media = sorted([m for m in product.media if m.kind == "package"], key=lambda m: m.sort)
            for idx, file in enumerate(equip["gallery"]):
                url = f"{CLOUD}/Photography_assets/assets/{file}"
                if idx < len(existing_equip_media):
                    existing_equip_media[idx].url = url
                else:
                    db.add(Media(product_id=product.id, url=url, alt="", kind="package", sort=idx))


CORPORATE_ICONS = {
    "sets": "🎁", "kits": "👜", "pens": "🖊️", "diaries": "📓", "bottles": "🍶",
    "wallets": "👛", "mementos": "🏅", "shields": "🛡️", "trophies": "🏆", "promotional": "☕",
}

GIFTS_ICONS = {
    "accessories": "🔑", "frames": "🖼️", "clocks": "🕰️", "mirror": "🪞", "pillows": "🛏️",
    "crystal": "💎", "decor": "🏺", "drinkware": "☕", "combos": "🎁",
}

STUDIO_ICONS = {
    "photo_printing": "🖨️", "photo_lamination": "📄", "photo_restoration": "🩹",
    "photo_portrait": "🖼️", "id_card_printing": "🪪", "certificate_printing": "📜",
    "scanning": "🖨️", "cd_dvd_copying": "💿", "xerox_printing": "🖨️",
}


def _upsert_package_media(product: Product, urls: list[str]):
    existing = sorted([m for m in product.media if m.kind == "package"], key=lambda m: m.sort)
    for idx, url in enumerate(urls):
        if not url:
            continue
        if idx < len(existing):
            existing[idx].url = url
        else:
            product.media.append(Media(url=url, kind="package", sort=idx))


def seed_corporate(db):
    """Transcribes js/corporate.js's `categoriesData` (flat product lists, no
    tiers) into the database. Data was extracted once via a Node script into
    backend/app/seed_data/corporate.json to avoid hand-copying ~50 products."""
    page = db.query(SitePage).filter(SitePage.slug == "corporate").first()
    if not page:
        page = SitePage(slug="corporate", name="Corporate Gifting", sort=2)
        db.add(page)
        db.flush()

    data = _load_json("corporate.json")
    for i, (key, cat) in enumerate(data.items()):
        category = db.query(Category).filter(Category.page_id == page.id, Category.slug == key).first()
        if not category:
            category = Category(page_id=page.id, slug=key)
            db.add(category)
        category.name = cat["title"]
        category.icon = CORPORATE_ICONS.get(key, "🎁")
        image = _cloud_url(cat.get("icon"))
        category.thumb_image_url = image
        category.hero_image_url = image
        category.hero_tagline = cat.get("desc")
        category.show_in_hero = False
        category.sort = i
        category.is_active = True
        db.flush()

        for pi, prod in enumerate(cat.get("products", [])):
            pslug = f"corporate-{key}-{pi + 1}"
            product = db.query(Product).filter(Product.slug == pslug).first()
            if not product:
                product = Product(category_id=category.id, slug=pslug)
                db.add(product)
            product.category_id = category.id
            product.title = prod["name"]
            product.type = "product"
            product.description = prod.get("subtitle", "") or ""
            product.price = _to_price(prod.get("price")) or 0
            product.mrp = _to_price(prod.get("oldPrice"))
            product.features = [prod["subtitle"]] if prod.get("subtitle") else []
            product.is_active = True
            product.sort = pi
            db.flush()
            _upsert_package_media(product, [_cloud_url(prod.get("img"))])


def seed_gifts(db):
    """Transcribes js/gifts.js's `productNavigationCategories` + `products`
    (flat, ~100 items) into the database. Extracted via Node into
    backend/app/seed_data/gifts.json."""
    page = db.query(SitePage).filter(SitePage.slug == "gifts").first()
    if not page:
        page = SitePage(slug="gifts", name="Personalised Gifts", sort=3)
        db.add(page)
        db.flush()

    data = _load_json("gifts.json")
    by_cat: dict[str, list] = {}
    for p in data["products"]:
        by_cat.setdefault(p["category"], []).append(p)

    for i, cat in enumerate(data["categories"]):
        key = cat["id"]
        category = db.query(Category).filter(Category.page_id == page.id, Category.slug == key).first()
        if not category:
            category = Category(page_id=page.id, slug=key)
            db.add(category)
        category.name = cat["name"]
        category.icon = GIFTS_ICONS.get(key, "🎁")
        image = _cloud_url(cat.get("image"))
        category.thumb_image_url = image
        category.hero_image_url = image
        category.show_in_hero = False
        category.sort = i
        category.is_active = True
        db.flush()

        for pi, prod in enumerate(by_cat.get(key, [])):
            pslug = f"gifts-{key}-{pi + 1}"
            product = db.query(Product).filter(Product.slug == pslug).first()
            if not product:
                product = Product(category_id=category.id, slug=pslug)
                db.add(product)
            product.category_id = category.id
            product.title = prod["name"]
            product.type = "product"
            product.price = _to_price(prod.get("price")) or 0
            product.mrp = _to_price(prod.get("old"))
            product.is_active = True
            product.sort = pi
            db.flush()
            _upsert_package_media(product, [_cloud_url(prod.get("image"))])


def seed_studio(db):
    """Transcribes js/studio.js's `categoriesData` (photo printing/lamination/
    restoration etc. services, with per-package quantity/size variants folded
    into `features` since there's no variant-pricing column) into the database.
    Extracted via Node into backend/app/seed_data/studio.json."""
    page = db.query(SitePage).filter(SitePage.slug == "studio").first()
    if not page:
        page = SitePage(slug="studio", name="Studio Prints & Services", sort=4)
        db.add(page)
        db.flush()

    data = _load_json("studio.json")
    for i, (key, cat) in enumerate(data.items()):
        category = db.query(Category).filter(Category.page_id == page.id, Category.slug == key).first()
        if not category:
            category = Category(page_id=page.id, slug=key)
            db.add(category)
        category.name = cat["title"]
        category.icon = STUDIO_ICONS.get(key, "🖨️")
        image = _cloud_url(cat.get("icon"))
        category.thumb_image_url = image
        category.hero_image_url = image
        category.hero_tagline = cat.get("desc")
        category.show_in_hero = False
        category.sort = i
        category.is_active = True
        db.flush()

        for pi, pkg in enumerate(cat.get("packages", [])):
            pslug = f"studio-{key}-{pi + 1}"
            product = db.query(Product).filter(Product.slug == pslug).first()
            if not product:
                product = Product(category_id=category.id, slug=pslug)
                db.add(product)
            product.category_id = category.id
            product.title = pkg["name"]
            product.type = "product"
            product.description = pkg.get("subtitle", "") or ""
            product.price = _to_price(pkg.get("price")) or 0
            product.mrp = _to_price(pkg.get("oldPrice"))

            features = list(pkg.get("highlights") or [])
            if pkg.get("turnaround"):
                features.append(f"Turnaround: {pkg['turnaround']}")
            if pkg.get("quantityOptions"):
                opts = ", ".join(f"{o['label']} – ₹{o['price']}" for o in pkg["quantityOptions"])
                features.append(f"Quantity options: {opts}")
            if pkg.get("purposeOptions"):
                features.append(f"{pkg.get('purposeLabel', 'Sizes')}: " + ", ".join(pkg["purposeOptions"]))
            product.features = features

            product.is_active = True
            product.sort = pi
            db.flush()

            images = pkg.get("images") or ([pkg["img"]] if pkg.get("img") else [])
            _upsert_package_media(product, [_cloud_url(u) for u in images])


def seed_admin_user(db):
    settings = get_settings()
    email = settings.admin_email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if user:
        return
    default_password = type(settings).model_fields["admin_password"].default
    if settings.admin_password == default_password:
        # Refuse to create the owner account with the exact password shipped as
        # config.py's fallback default - that string is visible to anyone who can
        # read this repo, and admin.py has no in-app "change my password" flow, so
        # a seeded-then-forgotten default here would sit unrotated indefinitely.
        raise RuntimeError(
            "ADMIN_PASSWORD is still set to the default shipped in config.py. "
            "Set a real ADMIN_PASSWORD in backend/.env before running the seed script."
        )
    db.add(User(
        email=email,
        name=settings.admin_name,
        role="owner",
        password_hash=hash_password(settings.admin_password),
    ))


DEFAULT_SETTINGS = {
    "branding": {
        "site_name": "Sai Kumar Digital Lab & Studio",
        "tagline": "Photography, personalized gifts & prints",
        "logo_url": "",
        "primary_color": "#5C0930",
        "accent_color": "#E4258F",
    },
    "contact": {
        "phone": "+91 98492 33501",
        "email": "hello@saikumarstudio.in",
        "address": "Main Road, Andhra Pradesh",
        "whatsapp": "919849233501",
    },
    "shipping": {
        "free_above": 999,
        "flat_rate": 0,
        "delivery_days": "3-6",
        "zones": ["Andhra Pradesh", "Telangana", "All India"],
    },
}


def seed_settings(db):
    for key, value in DEFAULT_SETTINGS.items():
        if not db.get(Setting, key):
            db.add(Setting(key=key, value=value))


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_admin_user(db)
        seed_settings(db)
        seed_photography(db)
        seed_corporate(db)
        seed_gifts(db)
        seed_studio(db)
        db.commit()
        print("Seed complete.")
        print(f"  Site pages: {db.query(SitePage).count()}")
        print(f"  Categories: {db.query(Category).count()}")
        print(f"  Products:   {db.query(Product).count()}")
        print(f"  Media:      {db.query(Media).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
