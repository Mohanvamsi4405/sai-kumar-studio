
const params=new URLSearchParams(location.search);
const pid=params.get("pid")||"";
const cat=params.get("category")||"";
const pkg=params.get("package")||"Selected Package";
const tier=(params.get("tier")||"").toLowerCase();
const price=params.get("price")||"";
/* Handed over by booking.js so the saved booking keeps the package's own photo and
   the service's display label — "My Photography Bookings" renders both. */
const catLabel=params.get("catlabel")||"";
const packageImage=params.get("image")||"";
/* [{name, price, icon}] for the Equipment & Coverage add-ons picked on booking.html —
   the `equipments` param below is the same list as a plain names string, kept for the
   existing summary line and the confirmation page. */
let addons=[];
try{ addons=JSON.parse(params.get("addons")||"[]"); }catch(e){ addons=[]; }
if(!Array.isArray(addons)) addons=[];

/* "Change package" must return to this same service's packages on the Photography page,
   not always the default Wedding view */
document.getElementById("changePackageLink").href=cat?`photography.html?category=${encodeURIComponent(cat)}`:"photography.html";

document.getElementById("lkPkg").textContent=pkg;
document.getElementById("lkPrice").textContent=price;

/* Equipment & Coverage add-ons are selected on booking.html and handed over in the URL;
   show them here so the customer can see what is attached, and carry them through to
   the confirmation page */
const equipments=params.get("equipments")||"";
if(equipments){
  document.getElementById("selectedEquipSummaryField").style.display="";
  const listEl=document.getElementById("selectedEquipListDisplay");
  listEl.innerHTML="";
  equipments.split(",").map(n=>n.trim()).filter(Boolean).forEach(n=>{
    const span=document.createElement("span");
    span.className="equip-tag";
    span.textContent=n;
    listEl.appendChild(span);
  });
}
document.title=`Book ${pkg} — Sai Kumar Digital Lab & Studio`;

const hSel=document.getElementById("fHour");
for(let h=1;h<=12;h++){const o=document.createElement("option");o.textContent=String(h).padStart(2,"0");hSel.appendChild(o);}
const todayISO=new Date().toISOString().split("T")[0];
document.getElementById("fDate").min=todayISO;

/* Multi-event schedule (with per-event Event Type, Date, Start/End Time) applies to Wedding Photography and
   House Warming — both involve multiple functions on their own dates/times. It replaces both the single
   Event Date field and the single Preferred Time field for those categories. Other services keep the standard field set. */
const isWedding=cat==="wedding";
const isHousewarming=cat==="housewarming";
const usesEventSchedule=isWedding||isHousewarming;
document.getElementById("eventDateField").style.display=usesEventSchedule?"none":"";
document.getElementById("preferredTimeField").style.display=usesEventSchedule?"none":"";
document.getElementById("weddingEventsField").style.display=usesEventSchedule?"":"none";

const EVENT_TYPE_OPTIONS_BY_CATEGORY={
  wedding:["Wedding Ceremony","Engagement","Haldi","Mehendi","Sangeet","Reception","Other"],
  housewarming:["Griha Pravesh","Vastu Puja","Homam","Ganapathi Puja","Kalash Puja","Family Gathering","Other"]
};
const EVENT_TYPE_OPTIONS=EVENT_TYPE_OPTIONS_BY_CATEGORY[cat]||[];
const HOUR_OPTIONS=Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0"));
function hourOptionsHTML(){return '<option value="" selected disabled>Hour</option>'+HOUR_OPTIONS.map(h=>`<option>${h}</option>`).join("");}
function minOptionsHTML(){return '<option value="" selected disabled>Min</option>'+["00","15","30","45"].map(m=>`<option>${m}</option>`).join("");}
function merOptionsHTML(){return '<option value="" selected disabled>AM/PM</option><option>AM</option><option>PM</option>';}
function eventTypeOptionsHTML(){return '<option value="" selected disabled>Select Event</option>'+EVENT_TYPE_OPTIONS.map(t=>`<option value="${t}">${t}</option>`).join("");}
/* 12-hour H/M/AM-PM -> minutes since midnight, for End-after-Start comparison */
function timeToMinutes(h,m,ap){
  let hh=parseInt(h,10)%12;
  if(ap==="PM") hh+=12;
  return hh*60+parseInt(m,10);
}

let eventRowSeq=0;
function addEventRow(){
  eventRowSeq++;
  const row=document.createElement("div");
  row.className="event-row";
  row.innerHTML=`
    <div class="ev-fields">
      <div class="field">
        <label>Event Type <span class="req">*</span></label>
        <select class="evType">${eventTypeOptionsHTML()}</select>
        <span class="err">Please select an event type.</span>
      </div>
      <div class="field">
        <label>Date <span class="req">*</span></label>
        <input type="date" class="evDate" min="${todayISO}">
        <span class="err">Select a date.</span>
      </div>
      <div class="field">
        <label>Start Time <span class="req">*</span></label>
        <div class="time-row">
          <select class="evStartH">${hourOptionsHTML()}</select>
          <span class="time-sep">:</span>
          <select class="evStartM">${minOptionsHTML()}</select>
          <select class="evStartMer">${merOptionsHTML()}</select>
        </div>
        <span class="err">Select a start time.</span>
      </div>
      <div class="field">
        <label>End Time <span class="req">*</span></label>
        <div class="time-row">
          <select class="evEndH">${hourOptionsHTML()}</select>
          <span class="time-sep">:</span>
          <select class="evEndM">${minOptionsHTML()}</select>
          <select class="evEndMer">${merOptionsHTML()}</select>
        </div>
        <span class="err">Select an end time after the start time.</span>
      </div>
    </div>
    <button type="button" class="remove-event-btn" onclick="removeEventRow(this)" aria-label="Remove event">✕</button>`;
  document.getElementById("eventsList").appendChild(row);
}
function removeEventRow(btn){
  /* a booking using the event schedule must always keep at least one event row to validate against */
  if(document.getElementById("eventsList").children.length>1) btn.closest(".event-row").remove();
}
if(usesEventSchedule) addEventRow(); /* seed with one event row so the schedule isn't empty by default */

function markInvalid(id,bad){document.getElementById(id).closest(".field").classList.toggle("invalid",bad);}
function validateEventRows(){
  let ok=true;
  document.querySelectorAll(".event-row").forEach(row=>{
    const typeField=row.querySelector(".evType").closest(".field");
    const dateField=row.querySelector(".evDate").closest(".field");
    const startField=row.querySelector(".evStartH").closest(".field");
    const endField=row.querySelector(".evEndH").closest(".field");

    const typeOk=!!row.querySelector(".evType").value;
    const dateOk=!!row.querySelector(".evDate").value;
    const sh=row.querySelector(".evStartH").value, sm=row.querySelector(".evStartM").value, sap=row.querySelector(".evStartMer").value;
    const eh=row.querySelector(".evEndH").value, em=row.querySelector(".evEndM").value, eap=row.querySelector(".evEndMer").value;
    const startOk=!!sh&&!!sm&&!!sap;
    const endOk=!!eh&&!!em&&!!eap;
    const timeOk=startOk&&endOk&&timeToMinutes(eh,em,eap)>timeToMinutes(sh,sm,sap);

    typeField.classList.toggle("invalid",!typeOk);
    dateField.classList.toggle("invalid",!dateOk);
    startField.classList.toggle("invalid",!startOk);
    endField.classList.toggle("invalid",!timeOk);
    row.classList.toggle("invalid",!(typeOk&&dateOk&&startOk&&timeOk));
    if(!typeOk||!dateOk||!startOk||!timeOk) ok=false;
  });
  return ok;
}
let pendingBooking=null; // {payload, q} collected once the form validates, submitted once logged in

function submitBooking(){
  const name=document.getElementById("fName").value.trim();
  const phone=document.getElementById("fPhone").value.replace(/\D/g,"");
  const email=document.getElementById("fEmail").value.trim();
  const date=document.getElementById("fDate").value;
  let ok=true;
  markInvalid("fName",!name); if(!name)ok=false;
  const phoneOk=Validators.isValidPhone(phone); markInvalid("fPhone",!phoneOk); if(!phoneOk)ok=false;
  const emailOk=Validators.isValidEmail(email); markInvalid("fEmail",!emailOk); if(!emailOk)ok=false;
  if(!usesEventSchedule){ markInvalid("fDate",!date); if(!date)ok=false; }
  const eventsOk=usesEventSchedule?validateEventRows():true;
  if(!ok||!eventsOk){
    const invalidEl=document.querySelector(".field.invalid input,.field.invalid select");
    if(invalidEl){
      invalidEl.scrollIntoView({behavior:"smooth",block:"center"});
      invalidEl.focus();
    }
    return;
  }

  const time=`${document.getElementById("fHour").value}:${document.getElementById("fMin").value} ${document.getElementById("fMer").value}`;
  const venue=document.getElementById("fVenue").value.trim()||"—";
  const msg=document.getElementById("fMsg").value.trim()||"—";
  const eventSchedule=usesEventSchedule?Array.from(document.querySelectorAll(".event-row")).map(row=>{
    const type=row.querySelector(".evType").value;
    const evDate=row.querySelector(".evDate").value;
    const sh=row.querySelector(".evStartH").value, sm=row.querySelector(".evStartM").value, sap=row.querySelector(".evStartMer").value;
    const eh=row.querySelector(".evEndH").value, em=row.querySelector(".evEndM").value, eap=row.querySelector(".evEndMer").value;
    return `${type} — ${evDate}, ${sh}:${sm} ${sap} – ${eh}:${em} ${eap}`;
  }):[];

  const q=new URLSearchParams({category:cat,package:pkg,tier,price,name,phone,email,venue,msg});
  if(pid){ q.set("pid",pid); }
  if(!usesEventSchedule){ q.set("date",date); q.set("time",time); }
  if(eventSchedule.length){ q.set("events",eventSchedule.join("||")); }
  if(equipments){ q.set("equipments",equipments); }

  pendingBooking={
    q,
    body:{
      product_id:pid||null,
      customer_name:name,
      customer_phone:phone,
      customer_email:email,
      event_date:usesEventSchedule?(document.querySelector(".evDate")?.value||null):(date||null),
      slot:usesEventSchedule?null:time,
      details:{category:cat,category_label:catLabel||null,package:pkg,tier,price,image:packageImage||null,
               venue,message:msg,equipments:equipments||null,addons,event_schedule:eventSchedule},
    },
  };

  if(!isCustomerLoggedIn()){
    showBookingLoginGate();
    return;
  }
  doSubmitBooking();
}

/* ---------- login gate (email OTP — a booking must belong to a real account) ---------- */

let bookingLoginEmail="";

function showBookingLoginGate(){
  document.getElementById("confirmBookingBtn").style.display="none";
  const gate=document.getElementById("bookingLoginGate");
  gate.style.display="block";
  document.getElementById("bookingLoginMsg").style.display="none";
  bookingLoginEmail=getCustomerEmail()||document.getElementById("fEmail").value.trim()||"";
  document.getElementById("bookingLoginEmail").value=bookingLoginEmail;
  document.getElementById("bookingLoginOtp").value="";
  document.getElementById("bookingLoginEmailStep").style.display="block";
  document.getElementById("bookingLoginOtpStep").style.display="none";
  gate.scrollIntoView({behavior:"smooth",block:"center"});
}

function cancelBookingLogin(){
  document.getElementById("bookingLoginGate").style.display="none";
  document.getElementById("confirmBookingBtn").style.display="";
}

function backToBookingEmailStep(){
  document.getElementById("bookingLoginEmailStep").style.display="block";
  document.getElementById("bookingLoginOtpStep").style.display="none";
  document.getElementById("bookingLoginMsg").style.display="none";
}

async function sendBookingOtp(){
  const email=document.getElementById("bookingLoginEmail").value.trim();
  const msgEl=document.getElementById("bookingLoginMsg");
  msgEl.style.display="none";
  if(!Validators.isValidEmail(email)){
    msgEl.textContent="Please enter a valid email address.";
    msgEl.style.display="block";
    return;
  }
  const btn=document.getElementById("bookingSendOtpBtn");
  if(window.SkLoading)window.SkLoading.button(btn,true);else btn.disabled=true;
  try{
    await CustomerAuth.requestOtp(email);
    bookingLoginEmail=email;
    document.getElementById("bookingOtpSentTo").textContent=`(sent to ${email})`;
    document.getElementById("bookingLoginEmailStep").style.display="none";
    document.getElementById("bookingLoginOtpStep").style.display="block";
    document.getElementById("bookingLoginOtp").focus();
  }catch(err){
    msgEl.textContent=err.message||"Could not send the OTP. Please try again.";
    msgEl.style.display="block";
  }finally{
    if(window.SkLoading)window.SkLoading.button(btn,false);else btn.disabled=false;
  }
}

async function verifyBookingOtp(){
  const code=document.getElementById("bookingLoginOtp").value.trim();
  const msgEl=document.getElementById("bookingLoginMsg");
  msgEl.style.display="none";
  if(!/^\d{6}$/.test(code)){
    msgEl.textContent="Please enter the 6-digit code.";
    msgEl.style.display="block";
    return;
  }
  const btn=document.getElementById("bookingVerifyOtpBtn");
  if(window.SkLoading)window.SkLoading.button(btn,true);else btn.disabled=true;
  try{
    await CustomerAuth.verifyOtp(bookingLoginEmail,code,document.getElementById("fName").value.trim());
    document.getElementById("bookingLoginGate").style.display="none";
    document.getElementById("confirmBookingBtn").style.display="";
    await doSubmitBooking();
  }catch(err){
    msgEl.textContent=err.message||"That code didn’t work. Please try again.";
    msgEl.style.display="block";
  }finally{
    if(window.SkLoading)window.SkLoading.button(btn,false);else btn.disabled=false;
  }
}

/* ---------- actual save — only reached once the customer is signed in ---------- */

async function doSubmitBooking(){
  if(!pendingBooking) return;
  const {q,body}=pendingBooking;
  const errorEl=document.getElementById("submitError");
  const btn=document.getElementById("confirmBookingBtn");
  errorEl.style.display="none";
  btn.disabled=true;
  btn.textContent="Booking…";

  try{
    const booking=await customerApi("/api/bookings",{method:"POST",body:JSON.stringify(body)});
    q.set("bookingId",booking.id);
    window.location.href="booking-confirmation.html?"+q.toString();
  }catch(err){
    errorEl.textContent=err.message&&err.message!=="Failed to fetch"
      ? err.message
      : "Couldn't reach the booking server. Please check your connection and try again, or contact us directly.";
    errorEl.style.display="block";
    errorEl.scrollIntoView({behavior:"smooth",block:"center"});
    btn.disabled=false;
    btn.textContent="Confirm Booking";
  }
}
