/* Product-detail gallery media helpers.

   An admin can attach a short video to a product alongside its photos (server
   side that's a Media row with media_type="video" - see backend/app/models.py).
   The catalog API deliberately hands videos back in their own `videos` array
   rather than mixing them into `images`, because every other surface in the app
   takes images[0] as a cover and renders it in a plain <img>: cards, heroes, the
   homepage, search results, cart lines, order snapshots. The product detail page
   is the only place with anywhere to play a clip.

   All three detail views (studio's preview modal, corporate's detail modal and
   the gifts product page) were written separately and each has its own gallery
   markup, so what they genuinely share - the ordering rule, the URL sniff and
   the "never leave a clip playing off-screen" rule - lives here rather than
   being written three slightly different ways. */
(function (global) {
  var VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

  function isVideoUrl(url) {
    return VIDEO_EXT.test(String(url || ''));
  }

  /* One ordered [{type, url}] list for a gallery to walk.

     Videos come after the photos on purpose: index 0 is the cover every one of
     these views paints first and uses for its share/OG image, so a clip sitting
     there would open the product on a black frame. An admin who drags a video to
     the front of the list in the panel still gets it second here - that ordering
     controls the photos' order among themselves, which is what it's for. */
  /* `fullImages` (optional) is the API's full_images: the same photos in the
     same order, uncompressed. Each image item carries its original as `full`
     so a view can show the thumbnail in its strip and the original large. */
  function build(images, videos, fullImages) {
    var items = [];
    (images || []).forEach(function (url, i) {
      if (!url) return;
      var item = { type: 'image', url: url };
      if (fullImages && fullImages[i]) item.full = fullImages[i];
      items.push(item);
    });
    (videos || []).forEach(function (url) {
      if (url) items.push({ type: 'video', url: url });
    });
    return items;
  }

  /* Pauses every <video> under `root` apart from `keep` (pass nothing to pause
     them all). Called whenever a gallery changes slide or closes - otherwise a
     clip keeps playing audio from behind whatever the visitor moved on to. */
  function pauseAll(root, keep) {
    if (!root) return;
    root.querySelectorAll('video').forEach(function (v) {
      if (v !== keep && !v.paused) v.pause();
    });
  }

  global.ProductMedia = {
    VIDEO_EXT: VIDEO_EXT,
    isVideoUrl: isVideoUrl,
    build: build,
    pauseAll: pauseAll,
  };
})(window);
