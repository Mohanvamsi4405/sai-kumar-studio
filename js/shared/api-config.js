// Sets the API base every other script reads via window.SAI_API_BASE.
// Backend runs on a standalone AWS VM behind a Cloudflare Tunnel (HTTPS is
// required so HTTPS frontends like GitHub Pages aren't blocked as mixed
// content). NOTE: this is a free "quick tunnel" - the URL changes if the
// cloudflared service on the VM restarts, so it may need updating.
(function () {
  // hostname is "" for a page opened directly as a file (file://), which only
  // happens when a developer double-clicks/opens the HTML locally - assume
  // that means "hit my local backend", not the production tunnel.
  var isLocalDev = window.location.hostname === "" || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  window.SAI_API_BASE = isLocalDev
    ? "http://127.0.0.1:8000"
    : "https://messenger-immediate-trans-jimmy.trycloudflare.com";
})();
