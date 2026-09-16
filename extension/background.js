/*
 * Arac cubugu butonu: paneli acar.
 *
 * Normalde script zaten content_script olarak (MAIN world, document_start) yuklu
 * ve arka planda dinliyordur; o zaman sadece open() cagirmak yeterli.
 * Eklenti sayfa acikken kurulduysa content script henuz enjekte olmamistir,
 * o durumda dosyayi elle enjekte ediyoruz.
 *
 * world: "MAIN" sart: script sayfanin kendi fetch/XHR cagrilarini yamalayarak
 * takipci listesi isteklerini yakaliyor. ISOLATED dunyada hicbir sey goremez.
 */

const THREADS_RE = /^https:\/\/(www\.)?threads\.(com|net)\//;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  if (!THREADS_RE.test(tab.url || '')) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert('Önce threads.com sekmesine geç, sonra butona bas.')
      });
    } catch (e) {
      console.warn('Bu sayfaya enjekte edilemiyor:', e);
    }
    return;
  }

  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        if (window.__THREADS_UNFOLLOWERS__) {
          window.__THREADS_UNFOLLOWERS__.open();
          return true;
        }
        return false;
      }
    });

    if (res && res.result) return; // zaten yukluydu, panel acildi

    // Content script henuz yuklenmemis (eklenti sayfa acikken kuruldu).
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['threads-unfollowers.js']
    });
  } catch (e) {
    console.error('Enjeksiyon basarisiz:', e);
  }
});
