(function () {
  const STUDIO = '5491124043503';
  const OLD = '5491130108299';
  window.STUDIO_WHATSAPP_NUMBER = STUDIO;

  function patchHref(anchor) {
    if (!anchor || !anchor.href) return;
    if (anchor.href.indexOf(OLD) !== -1) {
      anchor.href = anchor.href.split(OLD).join(STUDIO);
    }
  }

  function patchAll() {
    if (typeof setStudioWhatsAppNumber === 'function') {
      setStudioWhatsAppNumber(STUDIO);
    }
    document.querySelectorAll('a[href*="wa.me"], a.whatsapp-float, #whatsapp-order-link').forEach(patchHref);
  }

  window.patchStudioWhatsAppLinks = patchAll;
  document.addEventListener('DOMContentLoaded', function () {
    patchAll();
    setTimeout(patchAll, 400);
    setTimeout(patchAll, 1600);
  });
})();
