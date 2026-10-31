routes.settings = renderSettings;

const SETTINGS_PANELS = [
  {
    key: "branding", title: "Branding",
    fields: [
      { name: "site_name", label: "Site name" },
      { name: "tagline", label: "Tagline" },
      { name: "logo_url", label: "Logo URL" },
      { name: "primary_color", label: "Primary color (hex)" },
      { name: "accent_color", label: "Accent color (hex)" },
    ],
  },
  {
    key: "contact", title: "Contact",
    fields: [
      { name: "phone", label: "Phone" },
      { name: "email", label: "Email" },
      { name: "address", label: "Address" },
      { name: "whatsapp", label: "WhatsApp number (digits only, with country code)" },
    ],
  },
  {
    key: "shipping", title: "Shipping",
    fields: [
      { name: "free_above", label: "Free delivery above (₹)", type: "number" },
      { name: "flat_rate", label: "Flat delivery rate (₹)", type: "number" },
      { name: "delivery_days", label: "Delivery days (e.g. \"3-6\")" },
      { name: "zones", label: "Delivery zones (one per line)", type: "list" },
    ],
  },
  {
    key: "order_policy", title: "Order Policy",
    fields: [
      { name: "default_address_change_window_hours", label: "Default address-change window (hours after ordering) — used for any product that doesn't set its own", type: "number" },
    ],
  },
];

async function renderSettings() {
  const view = document.getElementById("view");
  view.innerHTML = `<header class="page-head"><h1>Settings</h1></header><div id="settingsWrap">${LOADING}</div>`;
  const all = await Api.allSettings();
  const wrap = document.getElementById("settingsWrap");
  // Gone if the admin navigated to another section while allSettings() was in flight -
  // the route they moved to owns the view now, so there is nothing to render into.
  if (!wrap) return;
  const isColor = (f) => f.name === "primary_color" || f.name === "accent_color";

  wrap.innerHTML = SETTINGS_PANELS.map(panel => `
    <form class="settings-panel" id="panel-${panel.key}" data-key="${panel.key}">
      <h3>${esc(panel.title)}</h3>
      ${panel.fields.map(f => `
        <label>${esc(f.label)}</label>
        ${f.type === "list"
          ? `<textarea rows="3" data-field="${f.name}">${esc((all[panel.key]?.[f.name] || []).join("\n"))}</textarea>`
          : isColor(f)
          ? `<div class="color-field">
               <input type="color" data-swatch-for="${f.name}" value="${esc(all[panel.key]?.[f.name] || "#7a1e2c")}">
               <input type="text" data-field="${f.name}" value="${esc(all[panel.key]?.[f.name] ?? "")}" placeholder="#7a1e2c">
             </div>`
          : `<input type="${f.type || "text"}" data-field="${f.name}" value="${esc(all[panel.key]?.[f.name] ?? "")}">`}
      `).join("")}
      ${panel.key === "branding" ? `<p style="color:var(--text-dim);font-size:12px;margin:10px 0 0;">Primary/accent colors also re-theme this admin dashboard for everyone, next time they load it.</p>` : ""}
      <div class="modal-actions" style="justify-content:flex-start;">
        <button type="submit" class="btn">Save ${esc(panel.title)}</button>
        <span class="save-msg" style="color:var(--text-dim);font-size:12px;"></span>
      </div>
    </form>
  `).join("");

  wrap.querySelectorAll("[data-swatch-for]").forEach(swatch => {
    swatch.addEventListener("input", () => {
      const textEl = swatch.closest("form").querySelector(`[data-field="${swatch.dataset.swatchFor}"]`);
      textEl.value = swatch.value;
    });
  });

  SETTINGS_PANELS.forEach(panel => {
    document.getElementById(`panel-${panel.key}`).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const value = {};
      panel.fields.forEach(f => {
        const el = form.querySelector(`[data-field="${f.name}"]`);
        if (f.type === "number") value[f.name] = Number(el.value || 0);
        else if (f.type === "list") value[f.name] = el.value.split("\n").map(s => s.trim()).filter(Boolean);
        else value[f.name] = el.value;
      });
      const msg = form.querySelector(".save-msg");
      const btn = form.querySelector('button[type="submit"]');
      try {
        await withBusy(btn, "Saving…", () => Api.setSetting(panel.key, value));
        msg.textContent = "Saved.";
        if (panel.key === "branding") applyBrandTheme();
        setTimeout(() => (msg.textContent = ""), 2000);
      } catch (err) {
        msg.textContent = err.message;
      }
    });
  });
}
