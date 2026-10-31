
const params=new URLSearchParams(location.search);
const CAT_LABELS={
  wedding:"Wedding Photography", prewedding:"Pre-Wedding", maternity:"Maternity Shoot",
  baby:"Baby Shoot", birthday:"Birthday Photography", event:"Event Photography",
  outdoor:"Outdoor Photography", drone:"Drone Videography",
  video:"Videography", album:"Album Designing", housewarming:"House Warming",
  sareefunction:"Saree Function", traditionalphoto:"Traditional Photography",
  traditionalvideo:"Traditional Videography", cinematicvideo:"Cinematic Videography",
  candidphoto:"Candid Photography", ledscreens:"LED Screens"
};

function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

const cat=params.get("category")||"";
const catLabel=CAT_LABELS[cat]||"Photography";
const pkg=params.get("package")||"Selected Package";
const price=params.get("price")||"";
const name=params.get("name")||"Guest";
const phone=params.get("phone")||"";
const email=params.get("email")||"";
const venue=params.get("venue")||"—";
const msg=params.get("msg")||"—";
const date=params.get("date")||"";
const time=params.get("time")||"";
const eventSchedule=(params.get("events")||"").split("||").filter(Boolean);

const equipments=params.get("equipments")||"";

/* if this page is opened directly with no booking data, send visitors back
   instead of showing a blank/broken confirmation */
if(!params.get("package")){
  window.location.replace("photography.html");
}

document.title=`Booking Confirmed — ${pkg} — Sai Kumar Digital Lab & Studio`;
document.getElementById("sName").textContent=name;
document.getElementById("sSummary").innerHTML=`
    <div><b>Package:</b> ${esc(pkg)} (${esc(price)})</div>
    <div><b>Category:</b> ${esc(catLabel)}</div>
    ${equipments?`<div><b>Selected Equipment Add-ons:</b> ${esc(equipments)}</div>`:""}
    <div><b>Name:</b> ${esc(name)}</div>
    <div><b>Phone:</b> +91 ${esc(phone)}</div>
    <div><b>Email:</b> ${esc(email)}</div>
    ${date?`<div><b>Event Date:</b> ${esc(date)} at ${esc(time)}</div>`:""}
    <div><b>Venue:</b> ${esc(venue)}</div>
    ${eventSchedule.length?`<div><b>Event Schedule:</b><br>${eventSchedule.map(e=>`&nbsp;&nbsp;• ${esc(e)}`).join("<br>")}</div>`:""}
    <div><b>Requirements:</b> ${esc(msg)}</div>`;
