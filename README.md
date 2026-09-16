# Threads Unfollowers

Threads'te **takip ettiğin ama seni geri takip etmeyen** hesapları bulur ve seçtiklerini
takipten çıkarır. Instagram için yazılan `InstagramUnfollowers` aracının Threads karşılığı.

> © 2026 Ali Can YILDIZ — Tüm hakları saklıdır. Kişisel kullanım için serbesttir;
> kopyalanamaz, başka bir yerde yayınlanamaz, değiştirilemez veya ticari amaçla
> kullanılamaz. Ayrıntılar: [LICENSE](LICENSE).
>
> Kaynak kodun açık olması onu serbest kullanıma açmaz — kod, ne çalıştırdığını
> görebilesin diye açık.

Her şey senin tarayıcında çalışır. Veriler geliştiriciye veya üçüncü taraf bir
sunucuya gönderilmez; işlemler doğrudan tarayıcın ile Threads arasında gerçekleşir.
Hiçbir yere şifre girmezsin.

---

## Neden farklı yazıldı?

Threads'in artık Instagram'dan **ayrı bir takip grafiği** var ve web arayüzü listeleri
`/api/graphql` üzerinden, düzenli olarak değişen `doc_id` değerleriyle çekiyor.
Sabit bir endpoint yazmak birkaç hafta içinde bozulur.

Bu yüzden araç şunu yapıyor: sayfanın **kendi isteklerini dinliyor**, takipçi/takip listesi
açıldığında o isteği bir şablon olarak kaydediyor ve sonra imleci (cursor) değiştirerek
aynı isteği sayfa sayfa kendisi tekrarlıyor. Threads API'sini değiştirdiğinde de çalışmaya
devam eder, çünkü hiçbir şey sabit kodlanmadı.

---

## Kullanım

1. **threads.com**'a git ve giriş yaptığından emin ol.
2. `F12` → **Console** sekmesini aç.
   Chrome ilk seferde yapıştırmaya izin vermez: konsola `allow pasting` yazıp Enter'a bas.
3. [`threads-unfollowers.js`](threads-unfollowers.js) dosyasının **tamamını** kopyalayıp
   konsola yapıştır, Enter. Sağ üstte panel açılır.
4. Panel "Hazır" diyorsa doğrudan 5. adıma geç. Demiyorsa **bir kereliğine** kalibrasyon:
   - Kendi profiline git.
   - **Takipçiler**'e tıkla, listeyi birkaç saniye kaydır, kapat.
   - **Takip edilenler**'e tıkla, listeyi birkaç saniye kaydır, kapat.
   - İki satır yeşile döndüğünde hazırsın.
5. **Taramayı başlat**. Liste büyüklüğüne göre birkaç dakika sürebilir; sekmeyi açık tut.
6. Sonuç ekranında seç, sonra **"Seçilenleri takipten çık"**.

> **Kalibrasyon bir kez yapılır.** Yakalanan bağlantı tarayıcıda saklanır; sonraki
> açılışlarda panel doğrudan "Hazır" der. Oturum jetonları diske yazılmaz, her
> istekte sayfadan tazelenir. Bağlantı eskirse araç bunu fark edip tek seferlik
> kalibrasyonu yeniden ister.

Panel sürüklenebilir; `–` ile küçültüp Threads'te gezinmeye devam edebilirsin.

---

## Tek tıkla çalıştırma

Her seferinde konsola yapıştırmak zorunda değilsin. Önce bir kez:

```bash
node build.js
```

Bu komut `extension/` klasörünü ve `bookmarklet.html` dosyasını tek kaynaktan üretir.
Kodu her değiştirdiğinde tekrar çalıştır.

### A) Chrome eklentisi — önerilen

1. Chrome'da `chrome://extensions` adresini aç.
2. Sağ üstten **Geliştirici modu**'nu aç.
3. **Paketlenmemiş öğe yükle** → bu projedeki `extension` klasörünü seç.
4. Araç çubuğundaki puzzle ikonundan mavi ikonu **sabitle**.
5. threads.com'dayken ikona tıkla — panel açılır.

Eklenti kuruluyken script, Threads her açıldığında **sessiz modda** yüklenir: panel
görünmez, sadece ağ dinleyicisi çalışır. Sen normal şekilde gezinirken listeler
kendiliğinden yakalanır, butona bastığında panel çoğu zaman doğrudan "Hazır" der.

Kod değişince: `node build.js`, sonra `chrome://extensions` sayfasındaki yenile ikonu.

### B) Bookmarklet — kurulum yok

1. `bookmarklet.html` dosyasını tarayıcıda aç.
2. Mavi butonu yer imleri çubuğuna sürükle (`Ctrl+Shift+B` ile çubuğu açabilirsin).
3. threads.com'dayken yer imine tıkla.

Yer imi ~97 KB. Bazı tarayıcılar çok uzun yer imi adreslerini kırpar; panel açılmazsa A yolunu kullan.

> **Neden sıradan bir content script değil:** araç, sayfanın kendi `fetch` / `XMLHttpRequest`
> çağrılarını yamalayarak takipçi listesi isteklerini yakalıyor. Content script'ler izole
> dünyada çalıştığı için sayfanın isteklerini göremez. Bu yüzden eklenti
> `world: "MAIN"` ile enjekte ediyor — bu detay değişirse araç hiçbir şey yakalayamaz.

---

## Siteyi yayına alma

`docs/index.html` hazır bir tanıtım sitesi: büyük "Kodu kopyala" butonu, adım adım
anlatım, `allow pasting` uyarısı ve sürükle-bırak bookmarklet. Kullanıcı hiçbir dosya
indirmez, tek tıkla kodu kopyalayıp konsola yapıştırır.

İki çıktı üretilir, ikisi de aynı sayfadan:

| Çıktı | Ne zaman |
|---|---|
| `docs/` (2 dosya) | GitHub Pages veya dosya yükleyebildiğin herhangi bir hosting |
| `dist/index.html` (tek dosya, ~76 KB) | Kod sayfaya gömülü; **tek dosya yükleyebildiğin her yere** atılır |

Tek dosya sürümü hiçbir dış istek yapmaz — yanında `.js` dosyası olmasa da çalışır.

### Kendi alan adında yayınlamak

Dosya yükleyebiliyorsan **2 dosyalık sürümü** tercih et: kod ayrı bir URL'de durduğu
için meraklı kullanıcı okuyabilir, sayfadaki "Kodu incele" bağlantısı ona gider.

```
senin-siten.com/threads-unfollowers/index.html              ← docs/index.html
senin-siten.com/threads-unfollowers/threads-unfollowers.js  ← docs/threads-unfollowers.js
```

Sadece tek dosya atabiliyorsan `dist/index.html` yeter; o sürümde "Kodu incele"
gömülü kodu blob olarak açar, yine çalışır.

> **HTTPS şart.** Pano API'si yalnızca güvenli bağlamda çalışır. Site `http://`
> ise kopyala butonu yedek yola düşer (kodu kutuda gösterip elle kopyalatır).

### GitHub Pages'te yayınlamak

Depo: `github.com/alicanyildizofficial/ThreadsUnfollowers`
Yayın adresi: `https://alicanyildizofficial.github.io/ThreadsUnfollowers/`

GitHub'da boş bir depo aç (README ekletme), sonra:

```bash
git remote add origin https://github.com/alicanyildizofficial/ThreadsUnfollowers.git
git push -u origin main
```

Sonra depoda: **Settings → Pages → Source: `main` / `docs`** → Save.
Birkaç dakika içinde adres yayında olur.

> Kodu değiştirdiğinde `node build.js` çalıştırıp dosyaları yeniden yüklemeyi unutma,
> yoksa site eski sürümü dağıtır.

---

## Sekmeler

| Sekme | Ne gösterir |
|---|---|
| **Geri takip etmeyen** | Takip ettiklerin arasından seni takip etmeyenler (beyaz liste hariç) |
| **Karşılıklı** | Karşılıklı takipleştiklerin |
| **Takip etmediklerin** | Seni takip eden ama senin takip etmediklerin (salt okunur) |
| **Beyaz liste** | Korumaya aldıkların |

Her satırdaki **★** ikonu hesabı beyaz listeye alır/çıkarır. Beyaz liste tarayıcıda
(`localStorage`) saklanır, ayarlardan dışa/içe aktarılabilir.

Listeyi panoya kopyalayabilir, CSV veya JSON olarak indirebilirsin.

---

## Takipten çıkarma nasıl çalışıyor?

İki yol denenir:

1. `POST /api/v1/friendships/destroy/<id>/` (çerezindeki `csrftoken` ile) — normalde bu yeterli.
2. Olmazsa, **senin elle yaptığın bir takipten çıkma isteğini** şablon olarak kullanır.

İkincisi için: Threads'te herhangi bir hesabı bir kez elle takipten çık. Araç o isteği öğrenir,
gerisini kendisi halleder. Panel zaten hiçbir yol bulamazsa sana bunu söyler ve boşuna beklemez.

---

## Hız sınırları ve risk

Threads/Instagram, hızlı toplu işlemleri **geçici engel** (action block) ile cezalandırır.
Gecikmeler bilerek yavaş tutuldu ve **arayüzden değiştirilemez**:

| Kural | Değer |
|---|---|
| İstekler arası | 0,9 – 2,2 sn (rastgele) |
| 6 istekte bir mola | 12 sn |
| Takipten çıkarmalar arası | ~4 sn (±%25 rastgele) |
| 5 çıkarmada bir mola | **5 dakika (zorunlu)** |

Yani 100 hesap ≈ 1,5 – 2 saat.

Bu değerler kaynak koddaki `TIMINGS` sabitinde durur; ayar ekranı onları yalnızca
**gösterir**, değiştiremez ve `localStorage`'dan da geçersiz kılınamaz. "Biraz
hızlandırayım" diyen kullanıcının hesabını yakmasını engellemek için böyle.

Mola sırasında panel geri sayım gösterir ve "Durdur" anında çalışır — bekleme
kısalmaz ama kullanıcı işlemi iptal edebilir.

Araç ayrıca `429` / checkpoint yanıtı görürse veya üst üste 3 hata alırsa kendini durdurur.

---

## Sorun giderme

**Panel açılmıyor / "yalnızca threads.com üzerinde çalışır" diyor**
Adres çubuğunda `threads.com` veya `threads.net` olmalı; `instagram.com` değil.

**İki satır bir türlü yeşile dönmüyor**
Listeleri *kendi* profilinde aç ve birkaç satır kaydır (ilk açılış bazen önbellekten gelir,
istek gitmez). Panel açıkken yap; script yalnızca yüklendikten sonraki istekleri görebilir.

**Tarama yarıda kesildi / "Partial" uyarısı**
Threads sınır koymuş olabilir. 15–30 dakika bekleyip tekrar dene. Takipçi listesi eksik
kalırsa bazı hesaplar yanlışlıkla "geri takip etmiyor" görünebilir — bu yüzden uyarı verilir.

**Takipten çıkarma hep başarısız**
Bir hesabı elle takipten çık (araç öğrensin), sonra tekrar dene.

**Sayfayı yenilersem?**
Toplanan liste kaybolur, baştan taraman gerekir. Beyaz liste kalır.

---

## Sınırlar

- Çok büyük listelerde (10 bin+) güvenlik sınırı olan 500 isteğe takılabilir.
- Gizli hesaplar listede görünür ama profil bilgileri sınırlıdır.
- Threads arayüzünü tamamen değiştirirse kalibrasyon adımı yeniden gerekebilir.

---

## Geliştirme

`threads-unfollowers.js` tek dosya, bağımlılığı yok. Tek gerçek kaynak odur;
`extension/threads-unfollowers.js` ve `bookmarklet.html` ondan üretilir.

```bash
node --check threads-unfollowers.js   # söz dizimi
node build.js                         # eklenti + bookmarklet üret
```

Dosya düzeni:

```
threads-unfollowers.js    kaynak (konsola yapıştırılan da bu)
build.js                  dağıtım üretici
docs/                     site (2 dosya) — GitHub Pages için
  index.html              tanıtım + kopyala butonu (elle yazılır)
  threads-unfollowers.js  kopya (build.js üretir)
dist/index.html           tek dosya site (build.js üretir)
extension/                Chrome eklentisi
  manifest.json           MV3; content_scripts world:"MAIN" (kritik)
  silent-mode.js          panel açmadan dinleme bayrağı
  background.js           toolbar butonu → panel aç
bookmarklet.html          sürükle-bırak yer imi (build.js üretir)
```

localStorage anahtarları: `tu_whitelist`, `tu_templates`.
