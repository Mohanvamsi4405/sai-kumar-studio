routes.artwork = renderArtwork;

/* Customer-uploaded order artwork and its retention.

   These are photographs customers sent us to print. We hold them because we
   needed them to produce an order; once it is delivered and the complaint
   window has closed, keeping them is a liability rather than an asset. The
   backend schedules each file for deletion when its order reaches a terminal
   status and a sweep removes it on the day (see backend/app/services/
   retention.py) - this screen is the human control over that: see what is
   about to go, keep anything still needed, and delete on request.

   Deleting is irreversible, so every destructive control here confirms first
   and says plainly what will happen. */

const ARTWORK_TABS = [
  ["scheduled", "Scheduled for deletion"],
  ["held", "On hold"],
  ["orphan", "Never ordered"],
  ["purged", "Already deleted"],
  ["all", "All"],
];

let artworkTab = "scheduled";

function artworkDaysLeft(purgeAfter) {
  if (!purgeAfter) return null;
  const due = new Date(purgeAfter + "T00:00:00");
  return Math.ceil((due - new Date()) / 86400000);
}

function artworkDueLabel(row) {
  if (row.purged_at) return `Deleted ${fmtISTDate(row.purged_at)}`;
  if (row.purge_hold) return "On hold — kept indefinitely";
  if (!row.purge_after) {
    return row.order_id ? "Not scheduled (order still open)" : "Not ordered yet";
  }
  const days = artworkDaysLeft(row.purge_after);
  if (days <= 0) return `Due now (${row.purge_after})`;
  return `${days} day${days === 1 ? "" : "s"} left (${row.purge_after})`;
}

async function renderArtwork() {
  const view = document.getElementById("view");
  view.innerHTML = `<div class="page-head"><h1>Order Artwork</h1></div><p class="muted">Loading…</p>`;

  let data;
  try {
    data = await api(`/api/admin/artwork?status_filter=${encodeURIComponent(artworkTab)}&limit=300`);
  } catch (e) {
    view.innerHTML = `<div class="page-head"><h1>Order Artwork</h1></div><p class="error">${esc(e.message)}</p>`;
    return;
  }

  const isOwner = CURRENT_USER && CURRENT_USER.role === "owner";
  const rows = data.items || [];

  view.innerHTML = `
    <div class="page-head">
      <h1>Order Artwork</h1>
      ${isOwner ? `<button class="btn secondary" id="artworkSweepBtn">Run deletion sweep now</button>` : ""}
    </div>

    <div class="panel" style="margin-bottom:18px;">
      <p class="muted" style="margin-top:0;">
        Photos customers uploaded for their orders. Each one is deleted automatically
        <strong>${data.retention_days} days after its order is delivered</strong>
        (or cancelled/refunded). Put a file on hold to keep it past that — for a reprint,
        a damage claim or a dispute.
      </p>
      ${isOwner ? `
      <div class="row" style="align-items:flex-end;gap:10px;">
        <div>
          <label for="artworkRetentionDays">Keep artwork for (days after delivery)</label>
          <input id="artworkRetentionDays" type="number" min="1" max="3650" value="${data.retention_days}" style="max-width:120px;">
        </div>
        <button class="btn" id="artworkRetentionSave">Save</button>
        <span class="muted" style="font-size:12px;">Applies to orders completed from now on — files already scheduled keep the date they were given.</span>
      </div>` : ""}
    </div>

    <div class="tabs" style="margin-bottom:14px;">
      ${ARTWORK_TABS.map(([key, label]) => `
        <button class="btn ${key === artworkTab ? "" : "secondary"}" data-tab="${key}">${label}</button>
      `).join("")}
    </div>

    ${rows.length === 0 ? `<p class="muted">Nothing here.</p>` : `
    <table>
      <thead><tr>
        <th class="table-thumb-col"></th><th>Order</th><th>File</th><th>Size</th>
        <th>Uploaded</th><th>Deletion</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="table-thumb-col">${r.url
              ? `<a href="${esc(r.url)}" target="_blank" rel="noopener"><img class="table-thumb" src="${esc(r.url)}" alt=""></a>`
              : `<div class="table-thumb-empty" title="File deleted"></div>`}</td>
            <td>${r.order_number
              ? `<a href="#/orders?q=${encodeURIComponent(r.order_number)}">${esc(r.order_number)}</a><br><small class="muted">${esc(r.order_status || "")}</small>`
              : `<span class="muted">—</span>`}</td>
            <td>${esc(r.filename || "photo")}</td>
            <td>${r.bytes ? (r.bytes / 1024).toFixed(0) + " KB" : "—"}</td>
            <td>${fmtISTDate(r.created_at)}</td>
            <td>
              ${esc(artworkDueLabel(r))}
              ${r.purge_note ? `<br><small class="muted">${esc(r.purge_note)}</small>` : ""}
            </td>
            <td class="actions">
              ${r.purged_at ? "" : `
                <button class="btn secondary" data-hold="${esc(r.id)}" data-on="${r.purge_hold ? "0" : "1"}">
                  ${r.purge_hold ? "Release" : "Hold"}
                </button>
                ${isOwner ? `<button class="btn danger" data-purge="${esc(r.id)}">Delete now</button>` : ""}
              `}
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`}
  `;

  view.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => { artworkTab = btn.dataset.tab; renderArtwork(); });
  });

  view.querySelectorAll("[data-hold]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const turningOn = btn.dataset.on === "1";
      let note = "";
      if (turningOn) {
        note = prompt("Why is this being kept? (shown in this list later)", "") || "";
      }
      btn.disabled = true;
      try {
        await api(`/api/admin/artwork/${btn.dataset.hold}/hold`, {
          method: "PUT", body: JSON.stringify({ hold: turningOn, note }),
        });
        renderArtwork();
      } catch (e) { alert(e.message); btn.disabled = false; }
    });
  });

  view.querySelectorAll("[data-purge]").forEach(btn => {
    btn.addEventListener("click", async () => {
      // Irreversible and immediate - say so rather than a bare "Are you sure?".
      if (!confirm("Delete this customer's photo from storage permanently?\n\nThis cannot be undone, and the file will no longer be available for a reprint.")) return;
      btn.disabled = true;
      try {
        await api("/api/admin/artwork/purge-now", {
          method: "POST", body: JSON.stringify({ ids: [btn.dataset.purge] }),
        });
        renderArtwork();
      } catch (e) { alert(e.message); btn.disabled = false; }
    });
  });

  const sweepBtn = document.getElementById("artworkSweepBtn");
  if (sweepBtn) sweepBtn.addEventListener("click", async () => {
    if (!confirm("Delete every file whose retention window has already passed?\n\nThis is the same thing the scheduled sweep does — it only removes files that are already due.")) return;
    sweepBtn.disabled = true;
    try {
      const res = await api("/api/admin/artwork/run-sweep", { method: "POST" });
      alert(`${res.purged} file(s) deleted${res.failed ? `, ${res.failed} failed` : ""}.`);
      renderArtwork();
    } catch (e) { alert(e.message); sweepBtn.disabled = false; }
  });

  const saveBtn = document.getElementById("artworkRetentionSave");
  if (saveBtn) saveBtn.addEventListener("click", async () => {
    const days = parseInt(document.getElementById("artworkRetentionDays").value, 10);
    if (!Number.isFinite(days) || days < 1) return alert("Enter a number of days (1 or more).");
    saveBtn.disabled = true;
    try {
      await api("/api/admin/artwork/retention", { method: "PUT", body: JSON.stringify({ days }) });
      renderArtwork();
    } catch (e) { alert(e.message); saveBtn.disabled = false; }
  });
}
