
const API_BASE=window.SAI_API_BASE||"http://localhost:8000";
const params=new URLSearchParams(location.search);
const CAT_LABELS={
  wedding:"Wedding Photography", prewedding:"Pre-Wedding", maternity:"Maternity Shoot",
  baby:"Baby Shoot", birthday:"Birthday Photography", event:"Event Photography",
  outdoor:"Outdoor Photography", drone:"Drone Videography",
  video:"Videography", album:"Album Designing", housewarming:"House Warming",
  sareefunction:"Saree Function",
  /* services that are booked straight from the Equipment & Coverage modal on
     photography.html (directBookEquip) rather than from a package card */
  traditionalphoto:"Traditional Photography", traditionalvideo:"Traditional Videography",
  cinematicvideo:"Cinematic Videography", candidphoto:"Candid Photography",
  ledscreens:"LED Screens"
};
const CATEGORY_IMAGES={
  wedding:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/wedding.png",
  prewedding:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/pre-wedding.png",
  maternity:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/maternity.jpg",
  baby:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/baby-shower.jpg",
  birthday:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/birthday-event.jpg",
  outdoor:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/outdoor.jpg",
  drone:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/drone.jpg",
  video:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/video.jpg",
  album:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/album%20designing.jpg",
  event:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/wedding.png",
  housewarming:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/wedding.png",
  sareefunction:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/saree%20ceremony.png",
  traditionalphoto:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/traditional-photography-1.png",
  traditionalvideo:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/video_1.jpg",
  cinematicvideo:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/cinematic-videography-1.png",
  candidphoto:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/wedding-1.png",
  ledscreens:"https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/led-screens-1.png"
};
/* Cloudinary auto-format/auto-quality transform: purely size-reducing (no resize/crop),
   safe to wrap any URL — no-ops for non-Cloudinary URLs or already-transformed ones. */

/* Service names/images from the database (GET /api/catalog/photography, loaded by
   loadPhotographyCatalog() below). CAT_LABELS/CATEGORY_IMAGES above only cover the
   first paint before that lands, and any service an admin adds later is named and
   pictured from the database alone. */
let DB_CATEGORIES={};
function resolveCategoryImage(cat){
  const db=DB_CATEGORIES[cat];
  if(db&&(db.image_full||db.image)) return cldOpt(db.image_full||db.image);
  return cldOpt(CATEGORY_IMAGES[cat] || CATEGORY_IMAGES.wedding);
}

/* A package with no photos of its own (none uploaded yet) shows its service's image.
   Every package's real photos come from the database (p.images / p.full_images) - the
   hard-coded per-tier filename lists that used to live here had drifted from what the
   admin uploads and had no entry for tiers added later (e.g. Wedding Gold). */
function resolvePackageImages(cat,tier){
  const img=resolveCategoryImage(cat);
  return [img,img,img];
}

const cat=params.get("category")||"wedding";
let catLabel=CAT_LABELS[cat]||"Photography";  // replaced by the database name in loadPhotographyCatalog()
const genericFeats=["High-Quality Output","Premium Editing & Delivery","Professional Team","Quick Studio Handover"];

/* `current` is what actually gets submitted (goToBookingForm) and is what the page
   displays — starts from the link's own query params (instant paint, no loading
   flicker) and is OVERWRITTEN by the real database record once fetchAuthoritativeProduct()
   resolves below, same pattern as photography.js's PACKAGES coming from the API instead
   of being hardcoded. A visitor editing price/tier/feats by hand in the address bar no
   longer has any effect once that fetch lands - only what the database actually has for
   this product id ever reaches goToBookingForm()/the final booking. */
const current={
  pid:params.get("pid")||"",
  pkg:params.get("package")||"Standard Wedding Photography",
  tier:(params.get("tier")||"standard").toLowerCase(),
  price:params.get("price")||"₹24,999",
  feat:(params.get("feats")||"").split("|").filter(Boolean),
  extra:{},
  images:[],
};
let lastProductData=null;  // re-painted when the service's database name arrives

function goToBookingForm(){
  const q=new URLSearchParams({pid:current.pid,category:cat,package:current.pkg,tier:current.tier,price:current.price});
  /* the service label and this package's own photo are resolved here, where the
     maps that define them live, and travel with the booking so "My Photography
     Bookings" can show the customer the package they actually booked instead of
     just its name */
  q.set("catlabel",catLabel);
  const packageImages=current.images.length?current.images:resolvePackageImages(cat,current.tier);
  if(packageImages&&packageImages[0]) q.set("image",packageImages[0]);
  /* the Confirm Booking form lives on booking-form.html, so any add-ons picked in the
     Equipment & Coverage section above have to travel with it — names for the existing
     summary line, and name+price+photo per add-on so the booking record keeps what
     each one actually is, not just a bare label, once there's more than one of them */
  if(selectedEquipSet.size){
    const picked=Array.from(selectedEquipSet).map(id=>EQUIPMENT_DATA[id]);
    q.set("equipments",picked.map(e=>e.name).join(", "));
    q.set("addons",JSON.stringify(picked.map(e=>({name:e.name,price:e.priceAdd||"",icon:e.icon||"",image:e.bgImage||""}))));
  }
  window.location.href="booking-form.html?"+q.toString();
}

/* "Change package" must return to this same service's packages on the Photography page,
   not always the default Wedding view */
document.getElementById("changePackageLink").href=cat?`photography.html?category=${encodeURIComponent(cat)}`:"photography.html";

/* Paints every product-dependent part of the page from one record - called once
   immediately with the link's own params (fast first paint) and again with the
   authoritative database record once fetchAuthoritativeProduct() resolves. */
function applyProductData(p){
  current.pkg=p.pkg; current.tier=p.tier; current.price=p.price; current.feat=p.feat; current.extra=p.extra||{};
  if(p.images&&p.images.length) current.images=p.images;
  lastProductData=p;

  {
    const crumb=document.getElementById("crumb");
    crumb.textContent="Home / "+catLabel+" / ";
    const b=document.createElement("b");
    b.textContent=p.pkg;
    crumb.appendChild(b);
  }
  document.getElementById("iCat").textContent=catLabel;
  document.getElementById("iTitle").textContent=p.pkg;
  /* the package's own description (written by the client) when it has one - the card
     on photography.html clamps it to 2 lines, so this is where it is read in full */
  document.getElementById("iSub").textContent=p.description||(p.tier?p.tier.charAt(0).toUpperCase()+p.tier.slice(1)+" package — ":"")+"professionally shot & edited by Sai Kumar Digital Lab & Studio.";
  document.getElementById("iPrice").textContent=p.price;
  document.getElementById("lkPkg").textContent=p.pkg;
  document.getElementById("lkPrice").textContent=p.price;
  document.title=`Book ${p.pkg} — Sai Kumar Digital Lab & Studio`;

  const showFeats=p.feat.length?p.feat:genericFeats;
  document.getElementById("iHighlights").innerHTML=showFeats.map(f=>`<li>${f}</li>`).join("");

  renderPackageDetails(showFeats,p.extra||{});

  if(p.images&&p.images.length){
    renderGalleryThumbs(p.images);
  }
}

/* ================= RICH PACKAGE-DETAILS LAYOUT (every service) =================
   Package Includes, Events & Team Details, and the "Complete Your Booking" button
   (the Confirm Booking form lives on booking-form.html). Every line the client wrote
   for a package - deliverables, album finishes, photo frames, location-charge notes -
   is one of its database bullets and shows in Package Includes; the table comes from
   the admin-entered Product.extra.events. The old "Additional Benefits" box (generic
   studio promises, or Saree Function's hand-written list) and Saree Function's
   hard-coded event table with fixed 22/23-08-2026 dates were removed for that reason:
   they contradicted or duplicated the client's per-package copy. */
const SERVICE_DETAILS={
  sareefunction:{
    song:"🎵 We'll create a special song using your daughter's name and add it to your video—made just for you."
  }
};

/* icon for an inclusion line, matched on the words the package copy actually uses.
   Order matters: the specific patterns have to be tried before the general ones
   ("Cinematic Videographer" before "Videographer", "Photographers" before "Photos"). */
const INCLUDE_ICONS=[
  [/^note:/i,"ℹ️"],
  [/whatsapp|invit/i,"💌"],
  [/drone|aerial|crane/i,"🚁"],
  [/led screen|live stream/i,"📺"],
  [/candid/i,"📸"],
  [/photographer/i,"📷"],
  [/videographer|video|film|footage/i,"🎥"],
  [/teaser|reel|highlight/i,"🎬"],
  [/score|music|song/i,"🎵"],
  [/album|photobook|photo book|sheet|page|\bcover\b/i,"📖"],
  [/print|canvas|frame|emboss|paper|glossy|matte/i,"🖨️"],
  [/makeup|styl|gown|outfit/i,"💄"],
  [/prop|theme/i,"🎈"],
  [/hour|full day|session|shoot|coverage/i,"⏱️"],
  [/location|outdoor|venue|mapping|panorama/i,"📍"],
  [/invit/i,"💌"],
  [/photo|portrait/i,"🖼️"],
  [/deliver|digital|soft cop|usb|cloud|link|turnaround|resolution|4k|hd/i,"💾"]
];
function includeIcon(text){
  for(const [re,ico] of INCLUDE_ICONS){ if(re.test(text)) return ico; }
  return "✨";
}

/* The crew and the hours are already spelled out inside each package's own inclusions,
   so the Events & Team table is read off them rather than re-typed per service. Each
   matched phrase is blanked out as it is counted, so "1 Cinematic Videographer" counts
   once as a cinematic videographer and not again as a plain videographer. */
const CREW_PATTERNS=[
  [/(\d+)\s+(?:\w+\s+)?candid photographers?/i,"CANDID PHOTOGRAPHER"],
  [/(\d+)\s+(?:\w+\s+)?cinematic videographers?/i,"CINEMATIC VIDEOGRAPHER"],
  [/(\d+)\s+(?:\w+\s+)?drone pilots?/i,"DRONE PILOT"],
  [/(\d+)\s+(?:\w+\s+)?photographers?/i,"PHOTOGRAPHER"],
  [/(\d+)\s+(?:\w+\s+)?videographers?/i,"VIDEOGRAPHER"]
];
function parseCrew(list){
  const counts=new Map();
  list.forEach(item=>{
    CREW_PATTERNS.forEach(([re,label])=>{
      item=item.replace(new RegExp(re.source,"gi"),(m,n)=>{
        counts.set(label,(counts.get(label)||0)+Number(n));
        return " ";
      });
    });
  });
  return counts;
}
function parseDuration(list){
  for(const item of list){
    const m=item.match(/(\d+\s*(?:[-–]\s*\d+)?)\s*hours?/i);
    if(m) return m[1].replace(/\s+/g,"")+" hours";
  }
  if(list.some(item=>/full day/i.test(item))) return "Full day";
  return "";
}
/* Aerial work is its own crew line, and Photo Albums are a print product with nobody on
   site — neither should have a photographer/videographer inferred for it. */
const CREW_INFER_SKIP=["drone","album"];
function buildEventRows(list){
  const counts=parseCrew(list);
  /* a package often describes its crew loosely ("3 Hours Studio Session") instead of by
     head count — fill in the minimum the deliverables require, so the table is never
     blank, and never more than the package copy actually supports */
  if(!CREW_INFER_SKIP.includes(cat)){
    if(!counts.has("PHOTOGRAPHER")&&!counts.has("CANDID PHOTOGRAPHER")&&
       list.some(item=>/photograph|shoot|session|coverage|portrait/i.test(item))) counts.set("PHOTOGRAPHER",1);
    if(!counts.has("VIDEOGRAPHER")&&!counts.has("CINEMATIC VIDEOGRAPHER")&&
       list.some(item=>/video|film|reel|teaser/i.test(item))) counts.set("VIDEOGRAPHER",1);
  }
  if(!counts.has("DRONE PILOT")&&list.some(item=>/drone|aerial|crane/i.test(item))) counts.set("DRONE PILOT",1);

  const units=[]; let total=0;
  counts.forEach((n,label)=>{ units.push(`${n} - ${label}${n>1?"S":""}`); total+=n; });
  if(!units.length) units.push("Studio production — no on-site crew");
  const dur=parseDuration(list);
  return [[`<b>${catLabel}</b>${dur?`<span class="evt-note">(${dur})</span>`:""}`,units.join("<br>"),total||"—"]];
}

/* Equipment-only products (Drone/Traditional Videography/Candid Photography/...) carry
   their real crew/hours as plain text in Product.extra (see backend/app/seed.py
   EQUIPMENT_PRODUCTS) instead of needing it guessed out of a feature-bullet list - use
   that directly when present rather than running buildEventRows()'s regex inference. */
function buildEventRowsFromExtra(extra){
  const total=(String(extra.crew||"").match(/^(\d+)/)||[])[1]||"—";
  return [[`<b>${catLabel}</b>${extra.hours?`<span class="evt-note">(${extra.hours})</span>`:""}`,extra.crew||"Studio production — no on-site crew",total]];
}

/* Admin-entered rows (Product.extra.events, filled in on the "Add Product" form) take
   priority over every guessed/hand-written table below — this is the one path where the
   Events & Team Details table is explicitly authored per-product instead of inferred. */
function buildEventRowsFromAdmin(events){
  return events.map(row=>[
    `<b>${row.event||catLabel}</b>`,
    (row.team||"").replace(/\n/g,"<br>")||"Studio production — no on-site crew",
    row.total!=null?row.total:"—",
  ]);
}

function renderPackageDetails(showFeats,extra){
  const d=SERVICE_DETAILS[cat]||{};

  const includes=showFeats.map(f=>[includeIcon(f),f]);
  document.getElementById("pkgIncludesGrid").innerHTML=includes.map(([ico,label])=>
    `<div class="pi-item"><span class="pi-ico">${ico}</span><span>${label}</span></div>`).join("");

  const rows=(extra&&extra.events&&extra.events.length?buildEventRowsFromAdmin(extra.events):null)
    ||(extra&&extra.crew?buildEventRowsFromExtra(extra):buildEventRows(showFeats));
  document.getElementById("eventsTeamBody").innerHTML=rows.map(([evt,unitsHtml,total])=>
    `<tr><td>${evt}</td><td>${unitsHtml}</td><td class="total-col">${total}</td></tr>`).join("");

  document.getElementById("pkgIncludes").style.display="block";
  document.getElementById("eventsTeam").style.display="block";
  document.getElementById("detailCtaRow").style.display="flex";
  /* "Package Includes" above is the same list laid out properly — drop the plain one */
  document.getElementById("highlightsBlock").style.display="none";
  /* the Confirm Booking form now lives on booking-form.html for every service */
  document.getElementById("bookingSection").style.display="none";

  if(d.song){
    const chip=document.getElementById("songChip");
    chip.textContent=d.song;
    chip.style.display="flex";
  }
}

function renderGalleryThumbs(imgs){
  window._imgs=imgs;
  document.getElementById("thumbs").innerHTML=imgs.map((src,i)=>`
  <div class="thumb ${i===0?'active':''}" onclick="setMain(${i})">
    <img class="thumb-photo" src="${cldOpt(src)}" alt="view ${i+1}" loading="${i===0?'eager':'lazy'}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
    <div class="ph">Image ${i+1}<br>add photo</div>
  </div>`).join("");
  setMain(0);
}
function setMain(i){
  document.querySelectorAll(".thumb").forEach((t,j)=>t.classList.toggle("active",j===i));
  const box=document.getElementById("mainImg");
  box.querySelector(".main-photo")?.remove();
  const ph=document.getElementById("mainPh");
  ph.innerHTML="Image "+(i+1)+"<br>［ add photo ］";ph.style.display="flex";
  const img=document.createElement("img");
  img.className="main-photo";img.src=fullImg(window._imgs[i]);
  img.onload=()=>{ph.style.display="none";};
  img.onerror=()=>{img.remove();ph.style.display="flex";};
  box.prepend(img);
}

/* initial paint from the link's own params (instant, no loading flicker) - see
   fetchAuthoritativeProduct() near the end of this file for the real-data follow-up */
applyProductData({pkg:current.pkg,tier:current.tier,price:current.price,feat:current.feat,images:resolvePackageImages(cat,current.tier)});

/* The old inline "Confirm Booking" form (#bookingSection) that used to live here
   is permanently hidden - see renderPackageDetails() above, which unconditionally
   sets its display to "none" because "the Confirm Booking form now lives on
   booking-form.html for every service". Its JS (event-schedule builder, validation,
   and a submitBooking() that only ever built a query string for
   booking-confirmation.html and never called POST /api/bookings) was dead code
   that had already drifted from booking-form.js's real, backend-integrated
   version - removed to close off the risk of it silently going live again via a
   future CSS/markup change and quietly losing real bookings. */

/* ================= INSIDE-EVENT EQUIPMENT DATA & MODAL SYSTEM =================
   The add-on cards are the database's own products: every active product in the
   photography page's "Videography" group (Candid, Drone, LED Screens, Live Streaming,
   Album Book, ...) with its real title, price, photos, description, Package Includes
   and crew/hours - the same records photography.html shows. They used to be a
   hard-coded copy here whose names, photos and "+₹" add-on prices had drifted from
   the real products (Candid "+₹8,000" against ₹15,000) and which still listed
   Outdoor after it was hidden. Keyed by product id; `cat` is the product's service.
   Filled by loadPhotographyCatalog(). */
let EQUIPMENT_DATA = {};

function equipmentFromCatalog(data) {
  const out = {};
  (data.categories || []).filter(c => c.group_label === "Videography" && c.id !== cat).forEach(c => {
    ((data.packages || {})[c.id] || []).forEach(p => {
      const extra = p.extra || {};
      const photos = (p.full_images && p.full_images.length ? p.full_images : p.images || []).slice();
      const fallback = c.image_full || c.image || resolveCategoryImage(c.id);
      out[p.id] = {
        id: p.id, cat: c.id, product: p,
        name: p.title,
        icon: c.icon || "✨",
        tagline: p.description || c.description || (p.feat || [])[0] || "",
        crew: extra.crew || "",  // real crew details only; team-table rows can be non-crew ("LIVE STREAMING")
        hours: extra.hours || "",
        gear: Array.isArray(extra.gear) ? extra.gear : [],
        deliverables: p.feat || [],
        priceAdd: p.price,
        bgImage: photos[0] || fallback,
        gallery: photos.length ? photos : [fallback],
      };
    });
  });
  return out;
}

let selectedEquipSet = new Set();

function renderEquipCards() {
  const container = document.getElementById("equipCardsGrid");
  if (!container) return;

  const items = Object.values(EQUIPMENT_DATA);
  const section = document.getElementById("equipOptionsSection");
  if (section) section.style.display = items.length ? "" : "none";
  container.innerHTML = items.map(item => {
    const isSelected = selectedEquipSet.has(item.id);
    return `
      <div class="eq-card ${isSelected ? 'selected' : ''}" id="eqCard_${item.id}" onclick="goEquipProductPage('${item.id}')" title="Open ${item.name} product page">
        <div class="eq-media">
          <img src="${cldOpt(item.bgImage)}" alt="${item.name}" loading="lazy">
          <div class="eq-media-overlay">
            <div class="eq-media-title"><span>${item.icon}</span> ${item.name}</div>
          </div>
        </div>
        <div class="eq-body">
          <p class="eq-tagline">${item.tagline}</p>
          <div class="eq-specs-row">
            <span class="eq-spec-pill">💰 ${item.priceAdd}</span>
            ${item.crew ? `<span class="eq-spec-pill">👥 ${item.crew}</span>` : ""}
            ${item.hours ? `<span class="eq-spec-pill">⏱️ ${item.hours}</span>` : ""}
          </div>
          <div class="eq-actions">
            <button type="button" class="btn-explore" onclick="event.stopPropagation();goEquipProductPage('${item.id}')">🔍 View Product Page</button>
            <button type="button" class="btn-toggle-add" onclick="toggleEquipSelection('${item.id}', event)">
              ${isSelected ? '✓ Added' : '+ Add'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  updateEquipSummaryUI();
}

function toggleEquipSelection(id, event) {
  if (event) event.stopPropagation();
  if (selectedEquipSet.has(id)) {
    selectedEquipSet.delete(id);
  } else {
    selectedEquipSet.add(id);
  }
  renderEquipCards();
}

function updateEquipSummaryUI() {
  const count = selectedEquipSet.size;
  const countText = document.getElementById("equipCountText");
  if (countText) countText.textContent = `${count} Add-on${count === 1 ? '' : 's'} Selected`;

  const summaryField = document.getElementById("selectedEquipSummaryField");
  const displayBox = document.getElementById("selectedEquipListDisplay");
  if (summaryField && displayBox) {
    if (count === 0) {
      summaryField.style.display = "none";
      displayBox.innerHTML = "";
    } else {
      summaryField.style.display = "block";
      const list = Array.from(selectedEquipSet).map(id => {
        const eq = EQUIPMENT_DATA[id];
        return `<span class="equip-tag"><b>${eq.icon} ${eq.name}</b> (${eq.priceAdd})</span>`;
      });
      displayBox.innerHTML = list.join(" ");
    }
  }
}

/* Clicking an Equipment & Add-ons card goes straight to that product's own page
   (same as directBookEquip() in photography.js); the card already holds the product
   record it came from, so the link is built from it directly. */
function goEquipProductPage(id) {
  const item = EQUIPMENT_DATA[id];
  if (!item) return;
  const p = item.product;
  const q = new URLSearchParams({
    pid: p.id,
    category: item.cat,
    package: p.title,
    tier: (p.tier || "").toLowerCase(),
    price: p.price,
    feats: (p.feat || []).join("|"),
  });
  window.location.href = "booking.html?" + q.toString();
}

function openEquipModal(id) {
  const item = EQUIPMENT_DATA[id];
  if (!item) return;

  const isSelected = selectedEquipSet.has(id);
  const modalBody = document.getElementById("equipModalBody");
  
  modalBody.innerHTML = `
    <div class="modal-grid">
      <div class="modal-media-col">
        <div class="modal-media-main" id="modalMainMedia">
          <img src="${fullImg(item.gallery[0] || item.bgImage)}" id="modalMainImg" alt="${item.name}">
        </div>
        <div class="modal-gallery-thumbs">
          ${item.gallery.map((img, idx) => `
            <div class="modal-thumb ${idx === 0 ? 'active' : ''}" onclick="setModalMainImg('${img}', this)">
              <img src="${cldOpt(img)}" alt="Thumbnail ${idx + 1}" loading="${idx === 0 ? 'eager' : 'lazy'}">
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-info-col">
        <div class="modal-header-block">
          <h3><span>${item.icon}</span> ${item.name}</h3>
          <p>${item.tagline}</p>
        </div>

        <div class="modal-spec-grid">
          <div class="modal-spec-box">
            <div class="lbl">💰 Price</div>
            <div class="val">${item.priceAdd}</div>
          </div>
          ${item.crew ? `<div class="modal-spec-box">
            <div class="lbl">👥 Crew &amp; Personnel</div>
            <div class="val">${item.crew}</div>
          </div>` : ""}
          ${item.hours ? `<div class="modal-spec-box">
            <div class="lbl">⏱️ Coverage Hours</div>
            <div class="val">${item.hours}</div>
          </div>` : ""}
        </div>

        ${item.gear.length ? `<div class="modal-section-title">🎥 Camera &amp; Gear Models Used</div>
        <ul class="modal-gear-list">
          ${item.gear.map(g => `<li>${g}</li>`).join('')}
        </ul>` : ""}

        <div class="modal-section-title">🎁 Package Includes</div>
        <ul class="modal-gear-list" style="margin-bottom:0">
          ${item.deliverables.map(d => `<li>🎁 ${d}</li>`).join('')}
        </ul>

        <div class="modal-footer-cta">
          <button type="button" class="modal-add-btn ${isSelected ? 'in-cart' : ''}" onclick="toggleModalSelection('${item.id}')">
            ${isSelected ? '✓ Included in My Event Booking (Click to Remove)' : '+ Include this Equipment in My Booking'}
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("equipModal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function setModalMainImg(src, el) {
  const img = document.getElementById("modalMainImg");
  if (img) img.src = fullImg(src);
  document.querySelectorAll(".modal-thumb").forEach(t => t.classList.remove("active"));
  if (el) el.classList.add("active");
}

function toggleModalSelection(id) {
  if (selectedEquipSet.has(id)) {
    selectedEquipSet.delete(id);
  } else {
    selectedEquipSet.add(id);
  }
  renderEquipCards();
  openEquipModal(id);
}

function closeEquipModal(e) {
  if (e && e.target !== document.getElementById("equipModal") && !e.target.classList.contains("equip-modal-close")) return;
  document.getElementById("equipModal").style.display = "none";
  document.body.style.overflow = "";
}

/* One fetch of the photography page bundle supplies the add-on cards and this
   service's database name/image. Until it lands the section stays empty (hidden). */
function preSelectEquipFromURL() {
  // booking.html?category=wedding&...&equip=drone -> a Wedding package with Drone queued
  // as an add-on: that service's (first) card is selected and scrolled to. When the
  // equip IS the page's own service it's the primary product, not an add-on.
  const equipParam = params.get("equip");
  if (!equipParam || equipParam === params.get("category")) return;
  const item = Object.values(EQUIPMENT_DATA).find(e => e.cat === equipParam || e.id === equipParam);
  if (!item) return;
  selectedEquipSet.add(item.id);
  renderEquipCards();
  setTimeout(() => {
    const section = document.getElementById("equipOptionsSection");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 400);
}

(function loadPhotographyCatalog() {
  renderEquipCards();
  fetch(`${API_BASE}/api/catalog/photography`)
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
    .then(data => {
      DB_CATEGORIES = Object.fromEntries((data.categories || []).map(c => [c.id, c]));
      if (DB_CATEGORIES[cat]) {
        catLabel = DB_CATEGORIES[cat].name;
        if (lastProductData) applyProductData(lastProductData);
      }
      EQUIPMENT_DATA = equipmentFromCatalog(data);
      renderEquipCards();
      preSelectEquipFromURL();
    })
    .catch(err => console.error("Could not load the photography catalog for add-ons:", err));
})();

// ── Authoritative product data (fetched by id, not trusted from this page's own URL) ──
// The applyProductData() call near the top of this file paints instantly from
// category/package/tier/price/feats in the link's query string, purely so the page
// isn't blank while this fetch is in flight. This is what actually decides what's
// shown and what goToBookingForm()/the confirm-booking submit send onward - a visitor
// hand-editing the URL's price or feats no longer changes anything real once this lands.
(function fetchAuthoritativeProduct() {
  if (!current.pid) return; // old-format link with no pid - keep showing the link's own values
  fetch(`${API_BASE}/api/catalog/product/${encodeURIComponent(current.pid)}`)
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
    .then(p => applyProductData({
      pkg: p.title,
      tier: p.tier || "",
      price: p.price,
      feat: p.feat || [],
      description: p.description || "",
      extra: p.extra || {},
      // Originals (full_images) - this page shows one photo large; the thumbnail
      // strip shrinks them through cldOpt() itself.
      images: p.full_images && p.full_images.length ? p.full_images : (p.images && p.images.length ? p.images : resolvePackageImages(cat, p.tier)),
    }))
    .catch(err => console.error("Failed to load the authoritative product record, showing the link's own values:", err));
})();

