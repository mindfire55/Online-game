/* Strike Zone - fullscreen on laptop + phone, and a cleaner touch screen.
   Browsers only allow fullscreen after a tap/click/key press, so it starts on your first tap/click/key
   and again whenever you press PLAY / ONLINE MULTIPLAYER. */
(function () {
  'use strict';
  var de = document.documentElement;

  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function goFull() {
    if (isFull()) return;
    var fn = de.requestFullscreen || de.webkitRequestFullscreen || de.msRequestFullscreen;
    if (!fn) return;                                   // e.g. iPhone Safari has no fullscreen API (see the home-screen meta tags in index.html)
    try {
      var p = fn.call(de, { navigationUI: 'hide' });
      if (p && p.then) p.then(lockLandscape, function () { /* refused: ignore */ });
      else lockLandscape();
    } catch (e) { /* ignore */ }
  }
  function lockLandscape() {
    try {
      var coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;
      if (coarse && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  // first interaction anywhere on the page
  function first() {
    goFull();
    ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (t) { document.removeEventListener(t, first, true); });
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (t) { document.addEventListener(t, first, true); });

  // PLAY and multiplayer buttons always bring fullscreen back if the player left it
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#btn-play, #btn-online, #mp-create, #mp-join, #mp-start') : null;
    if (t) goFull();
  }, true);

  // touch screens: drop the keyboard hints that cover the screen (the on-screen buttons already say DODGE / NADE / JUMP)
  var css = document.createElement('style');
  css.textContent = '@media (hover:none) and (pointer:coarse){'
    + '#abilities{display:none!important}'
    + '#hint{display:none!important}'
    + '.feat-a,.brief .tip{display:none!important}'
    + '#slots .slot em{display:none!important}'
    + '}';
  document.head.appendChild(css);
})();
