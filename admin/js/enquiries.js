/* Admin > Enquiries - the contact-form messages customers submit from
   contact-us.html. These were being saved to the database and emailed to the
   owner all along, but nothing in the panel could read them back, so an enquiry
   whose notification email failed (best-effort by design - see
   backend/app/routers/contact.py) had no second route to anyone's attention,
   and ContactMessage.is_read could never actually be set. */
routes.enquiries = renderEnquiries;

let _enquiriesUnreadOnly = false;

async function renderEnquiries() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head">
      <h1>Enquiries</h1>
      <label class="inline" style="font-weight:400;">
        <input type="checkbox" id="enqUnreadOnly" ${_enquiriesUnreadOnly ? "checked" : ""}> Unread only
      </label>
    </header>
    <div id="enquiriesWrap">${LOADING}</div>`;
  document.getElementById("enqUnreadOnly").addEventListener("change", (e) => {
    _enquiriesUnreadOnly = e.target.checked;
    loadEnquiries();
  });
  await loadEnquiries();
}

async function loadEnquiries() {
  const wrap = document.getElementById("enquiriesWrap");
  if (!wrap) return;
  let messages;
  try {
    messages = await Api.contactMessages(_enquiriesUnreadOnly);
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Could not load enquiries: ${esc(err.message)}</div>`;
    return;
  }
  if (!messages.length) {
    wrap.innerHTML = `<div class="empty-state">${_enquiriesUnreadOnly ? "No unread enquiries." : "No enquiries yet."}</div>`;
    return;
  }
  const isOwner = CURRENT_USER && CURRENT_USER.role === "owner";
  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Received</th><th>From</th><th>Topic</th><th>Subject &amp; message</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${messages.map(m => `
          <tr class="${m.is_read ? "" : "row-unread"}">
            <td style="white-space:nowrap;">${esc(fmtIST(m.created_at))}</td>
            <td>
              <div><b>${esc(m.name)}</b></div>
              <div><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></div>
              <div><a href="tel:${esc(m.phone)}">${esc(m.phone)}</a></div>
            </td>
            <td>${esc(m.topic || "—")}</td>
            <td>
              <div><b>${esc(m.subject)}</b></div>
              <div class="enq-message">${esc(m.message)}</div>
            </td>
            <td><span class="badge ${m.is_read ? "off" : "on"}">${m.is_read ? "Read" : "New"}</span></td>
            <td class="actions">
              <button class="btn secondary" onclick="toggleEnquiryRead('${m.id}', ${m.is_read ? "false" : "true"}, this)">
                ${m.is_read ? "Mark unread" : "Mark read"}
              </button>
              ${isOwner ? `<button class="btn danger" onclick="removeEnquiry('${m.id}', this)">Delete</button>` : ""}
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function toggleEnquiryRead(id, isRead, btn) {
  try {
    await withBusy(btn, "…", () => Api.setContactMessageRead(id, isRead));
    loadEnquiries();
  } catch (err) {
    alert(err.message);
  }
}

async function removeEnquiry(id, btn) {
  if (!confirm("Delete this enquiry permanently? This cannot be undone.")) return;
  try {
    await withBusy(btn, "…", () => Api.deleteContactMessage(id));
    loadEnquiries();
  } catch (err) {
    alert(err.message);
  }
}
