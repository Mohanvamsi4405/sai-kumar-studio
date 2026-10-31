/*
  Sai Kumar Digital Lab & Studio — FAQ Chatbot Widget
  Self-contained: injects its own styles + markup. Include once, right before </body>.
*/
(function () {
  "use strict";

  var FAQS = [
    {
      q: "What services do you offer?",
      a: "We offer four main things: <strong>Photography</strong> (wedding, pre-wedding, birthday, baby &amp; maternity, event), <strong>Personalized Gifts</strong> (mugs, frames, keychains, cushions), <strong>Studio &amp; Printing</strong> services, and <strong>Corporate Gifting &amp; Bulk Hampers</strong>."
    },
    {
      q: "What are your business hours?",
      a: "We're open <strong>7 days a week</strong>, from <strong>9:00 AM to 9:00 PM</strong>."
    },
    {
      q: "Where is your studio located?",
      a: "Sai Kumar Digital Lab &amp; Studio, 7-2-227 Srt 6, Bhagat Singh Nagar, Sanath Nagar, Hyderabad, Telangana 500018."
    },
    {
      q: "How can I contact you?",
      a: "Call/WhatsApp us at <a href=\"tel:+919876543210\">+91 98765 43210</a> or email <a href=\"mailto:saikumardigitallab@gmail.com\">saikumardigitallab@gmail.com</a>. You can also use our <a href=\"contact-us.html\">Contact Us</a> page."
    },
    {
      q: "How do I book a photography session?",
      a: "Share your event date and requirement with us by phone, WhatsApp, or the <a href=\"contact-us.html\">Contact Us</a> form, and our team will confirm your slot shortly."
    },
    {
      q: "Do you accept bulk or corporate orders?",
      a: "Yes! We handle branded corporate hampers and bulk gifting. Check out our <a href=\"corporate.html\">Corporate</a> and <a href=\"bulk-orders.html\">Bulk Orders</a> pages, or contact us directly for a custom quote."
    },
    {
      q: "What is the price range for personalized gifts?",
      a: "Prices vary by product — for example, photo mugs start around ₹399, keychains around ₹199, and LED photo frames around ₹999. Browse the <a href=\"gifts.html\">Gifts</a> page for full pricing."
    },
    {
      q: "How long does delivery or production take?",
      a: "Personalized gifts are typically ready within 1–2 days. Bulk and corporate orders can take longer depending on quantity — contact us for an exact timeline for your order."
    },
    {
      q: "What payment methods do you accept?",
      a: "We accept cash, UPI, cards, and bank transfer. For bulk or corporate orders, an advance payment may be required — our team will confirm this when you place your order."
    },
    {
      q: "Do you deliver outside Hyderabad?",
      a: "We serve local customers directly, and can arrange shipping for bulk/corporate orders on request. Please contact us to confirm delivery to your location."
    }
  ];

  var FALLBACK =
    "I don't have an exact answer for that yet. Please call/WhatsApp us at " +
    "<a href=\"tel:+919876543210\">+91 98765 43210</a>, email " +
    "<a href=\"mailto:saikumardigitallab@gmail.com\">saikumardigitallab@gmail.com</a>, or visit our " +
    "<a href=\"contact-us.html\">Contact Us</a> page — we're happy to help.";

  function findAnswer(text) {
    var t = text.toLowerCase();
    var best = null, bestScore = 0;
    FAQS.forEach(function (item) {
      var words = item.q.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(function (w) {
        return w.length > 3;
      });
      var score = 0;
      words.forEach(function (w) {
        if (t.indexOf(w) !== -1) score++;
      });
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });
    return bestScore > 0 ? best.a : FALLBACK;
  }

  var css = "\n#skcb-launcher{position:fixed;bottom:22px;right:22px;width:46px;height:46px;border-radius:50%;background:#5C0930;box-shadow:0 8px 20px rgba(92,9,48,.4);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:99998;border:none;transition:transform .2s ease,box-shadow .2s ease;}"
    + "\n#skcb-launcher:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 12px 24px rgba(92,9,48,.5);}"
    + "\n#skcb-launcher svg{width:20px;height:20px;transition:opacity .15s ease,transform .15s ease;}"
    + "\n#skcb-launcher .skcb-icon-close{position:absolute;opacity:0;transform:scale(.6) rotate(-45deg);}"
    + "\n#skcb-launcher.open .skcb-icon-chat{opacity:0;transform:scale(.6) rotate(45deg);}"
    + "\n#skcb-launcher.open .skcb-icon-close{opacity:1;transform:scale(1) rotate(0deg);}"
    + "\n#skcb-badge{position:absolute;top:-2px;right:-2px;background:#E11D48;color:#fff;font:700 9px/1 Inter,sans-serif;padding:3.5px 4.5px;border-radius:20px;box-shadow:0 0 0 2px #fff;}"
    + "\n#skcb-panel{position:fixed;bottom:78px;right:22px;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 124px);background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.25);display:flex;flex-direction:column;overflow:hidden;z-index:99999;font-family:'Inter',sans-serif;opacity:0;pointer-events:none;transform:translateY(16px) scale(.97);transition:opacity .2s ease,transform .2s ease;}"
    + "\n#skcb-panel.open{opacity:1;pointer-events:auto;transform:translateY(0) scale(1);}"
    + "\n#skcb-head{background:linear-gradient(120deg,#0F172A,#2563EB);color:#fff;padding:16px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0;}"
    + "\n#skcb-head .skcb-avatar{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.18);border:1.5px solid rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;flex-shrink:0;}"
    + "\n#skcb-head .skcb-title{font-size:14.5px;font-weight:700;line-height:1.2;}"
    + "\n#skcb-head .skcb-sub{font-size:11.5px;opacity:.85;display:flex;align-items:center;gap:5px;margin-top:2px;}"
    + "\n#skcb-head .skcb-sub::before{content:'';width:7px;height:7px;border-radius:50%;background:#22C55E;display:inline-block;}"
    + "\n#skcb-close{margin-left:auto;background:rgba(255,255,255,.15);border:none;width:28px;height:28px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}"
    + "\n#skcb-close:hover{background:rgba(255,255,255,.28);}"
    + "\n#skcb-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#F8FAFC;}"
    + "\n#skcb-body::-webkit-scrollbar{width:6px;}"
    + "\n#skcb-body::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:6px;}"
    + "\n.skcb-msg{max-width:86%;padding:10px 13px;border-radius:14px;font-size:13px;line-height:1.5;}"
    + "\n.skcb-msg a{color:inherit;text-decoration:underline;}"
    + "\n.skcb-msg.bot{background:#fff;color:#111827;border:1px solid #E2E8F0;border-bottom-left-radius:4px;align-self:flex-start;box-shadow:0 2px 6px rgba(15,23,42,.04);}"
    + "\n.skcb-msg.user{background:#2563EB;color:#fff;border-bottom-right-radius:4px;align-self:flex-end;}"
    + "\n#skcb-chips{display:flex;flex-wrap:nowrap;gap:8px;padding:10px 16px;flex-shrink:0;background:#F8FAFC;border-top:1px solid #E2E8F0;overflow-x:auto;}"
    + "\n#skcb-chips::-webkit-scrollbar{height:5px;}"
    + "\n#skcb-chips::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:6px;}"
    + "\n.skcb-chip{background:#fff;border:1.3px solid #2563EB;color:#2563EB;font-size:12px;font-weight:600;padding:7px 12px;border-radius:20px;cursor:pointer;transition:all .15s ease;line-height:1.3;white-space:nowrap;flex-shrink:0;}"
    + "\n.skcb-chip:hover{background:#2563EB;color:#fff;}"
    + "\n#skcb-inputrow{display:flex;gap:8px;padding:12px;border-top:1px solid #E2E8F0;background:#fff;flex-shrink:0;}"
    + "\n#skcb-input{flex:1;border:1.3px solid #E2E8F0;border-radius:22px;padding:10px 15px;font-size:13px;font-family:inherit;outline:none;color:#111827;}"
    + "\n#skcb-input:focus{border-color:#2563EB;}"
    + "\n#skcb-send{width:40px;height:40px;border-radius:50%;background:#F97316;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;border:none;transition:background .15s ease;}"
    + "\n#skcb-send:hover{background:#EA580C;}"
    + "\n@media(max-width:767px){#skcb-launcher{display:none!important;}#skcb-panel{display:none!important;}}";

  function injectStyles() {
    var style = document.createElement("style");
    style.id = "skcb-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function chatIconSVG() {
    return '<svg class="skcb-icon-chat" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
      + '<svg class="skcb-icon-close" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  }

  function buildDOM() {
    var launcher = document.createElement("button");
    launcher.id = "skcb-launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Chat with us");
    launcher.innerHTML = chatIconSVG() + '<span id="skcb-badge">1</span>';

    var panel = document.createElement("div");
    panel.id = "skcb-panel";
    panel.innerHTML =
      '<div id="skcb-head">'
      + '<div class="skcb-avatar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M23 19a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><path d="M12 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M1 19a7 7 0 0 1 11-5.7"/></svg></div>'
      + '<div><div class="skcb-title">Sai Kumar Assistant</div><div class="skcb-sub">Usually replies instantly</div></div>'
      + '<button id="skcb-close" type="button" aria-label="Close chat"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
      + '</div>'
      + '<div id="skcb-body"></div>'
      + '<div id="skcb-chips"></div>'
      + '<div id="skcb-inputrow">'
      + '<input id="skcb-input" type="text" placeholder="Ask a question…" autocomplete="off">'
      + '<button id="skcb-send" type="button" aria-label="Send"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>'
      + '</div>';

    document.body.appendChild(launcher);
    document.body.appendChild(panel);
    return { launcher: launcher, panel: panel };
  }

  function addMessage(body, role, html) {
    var el = document.createElement("div");
    el.className = "skcb-msg " + role;
    el.innerHTML = html;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function renderChips(chips) {
    chips.innerHTML = "";
    FAQS.forEach(function (item) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "skcb-chip";
      chip.textContent = item.q;
      chip.addEventListener("click", function () {
        ask(item.q, item.a);
      });
      chips.appendChild(chip);
    });
  }

  var body, chips, opened = false;

  function ask(question, knownAnswer) {
    addMessage(body, "user", question.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
    setTimeout(function () {
      addMessage(body, "bot", knownAnswer || findAnswer(question));
    }, 300);
  }

  function init() {
    injectStyles();
    var dom = buildDOM();
    body = dom.panel.querySelector("#skcb-body");
    chips = dom.panel.querySelector("#skcb-chips");
    var input = dom.panel.querySelector("#skcb-input");
    var send = dom.panel.querySelector("#skcb-send");
    var closeBtn = dom.panel.querySelector("#skcb-close");
    var badge = dom.launcher.querySelector("#skcb-badge");

    addMessage(body, "bot", "Hi! 👋 I'm the Sai Kumar Digital Lab &amp; Studio assistant. Pick a question below or type your own.");
    renderChips(chips);

    function toggle() {
      opened = !opened;
      dom.panel.classList.toggle("open", opened);
      dom.launcher.classList.toggle("open", opened);
      if (opened) {
        badge.style.display = "none";
        input.focus();
      }
    }

    dom.launcher.addEventListener("click", toggle);
    closeBtn.addEventListener("click", toggle);

    function submitText() {
      var val = input.value.trim();
      if (!val) return;
      ask(val);
      input.value = "";
    }

    send.addEventListener("click", submitText);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submitText();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
