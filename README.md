# Sayfa — Kitap Okuyucu

PDF, Word (DOC/DOCX), EPUB, ODT, RTF, TXT ve Markdown dosyalarını gerçek bir kitap gibi okumak için
telefona kurulabilen bir web uygulaması (PWA). Honor Magic V3 gibi katlanabilir telefonlar düşünülerek hazırlandı.

## Özellikler

- **Gerçekçi kitap görünümü**: kağıt dokusu, cilt gölgesi, sayfa kalınlığı, üst bilgide bölüm adı, alt bilgide sayfa numarası,
  bölüm başında büyük ilk harf. Her bölüm yeni sayfadan başlar.
- **Sayfa çevirme**: parmakla köşeden tutup kıvırarak ya da kaydırarak çevirme. Ekranın sol veya sağ kenarına dokunarak da çevrilebilir.
- **Sayfa çevirme sesi**: hışırtı, kağıt çıtırtısı ve sayfanın yerine oturma sesi. Her çevirişte ses biraz farklıdır. Açılıp kapatılabilir, ses düzeyi ayarlanabilir.
- **Katlanabilir ekran desteği**: telefon açıkken iki sayfalık açık kitap, katlıyken tek sayfa gösterilir. Katlayıp açınca kaldığınız yer korunur.
- **Gece modu**: Gündüz, Sepya, Gece ve Siyah (AMOLED) temaları. Ek karartma ayarı var; PDF sayfaları da gece moduna uyarlanır.
- **Sesli okuma**: okunan cümle vurgulanır, sayfa bitince kitap kendiliğinden çevrilir. Ses, okuma hızı ve ses tonu seçilebilir. Uyku zamanlayıcısı vardır.
- **Ekranı açık tutma**: sesli okuma sürerken ekran kapanmaz. İsterseniz normal okumada da ekranı hep açık tutabilirsiniz.
- **Kaldığım yer**: her kitapta konum otomatik kaydedilir. Kitaplıkta "Kaldığım Yer" bölümü son okunan satırlarla birlikte görünür.
  Kurdele simgesiyle yer imi eklenir; işaretli sayfalarda kırmızı bir kurdele görünür.
- **İçindekiler**: DOCX, EPUB ve ODT başlıklarından, PDF yer imlerinden oluşturulur. DOC, RTF ve TXT'de "Bölüm 1", "Önsöz" gibi başlıklar otomatik tanınır.
- **Türkçe heceleme**: iki yana yaslı metinde kelime arası boşlukların açılmaması için kelimeler Türkçe hece kurallarına göre bölünür.
- **Çevrimdışı çalışma**: kitaplar telefonda saklanır. İlk açılıştan sonra internet gerekmez.
- **Paylaş menüsü**: dosya yöneticisinde ya da WhatsApp'ta bir PDF veya Word dosyasına uzun basıp *Paylaş → Sayfa* derseniz dosya kitaplığa eklenir.

## Telefona kurulum

Uygulamanın **HTTPS** adresinde yayınlanması gerekir. Ekranı açık tutma, çevrimdışı çalışma ve ana ekrana kurma yalnızca güvenli bağlantıda çalışır.

### 1. Yayınlama (bir kez yapılır, ücretsizdir)

**GitHub Pages ile:**
1. github.com'da ücretsiz bir hesap açın ve yeni bir depo (repository) oluşturun, örneğin `sayfa`.
2. *Add file → Upload files* ile bu klasördeki şu dosyaları yükleyin: `index.html`, `app.js`, `formats.js`, `styles.css`, `sw.js`, `manifest.webmanifest` ve `icons` klasörü.
3. *Settings → Pages* bölümünde *Branch: main* seçip kaydedin.
4. Bir dakika içinde adres hazır olur: `https://KULLANICIADINIZ.github.io/sayfa/`

**Alternatif, Netlify Drop ile:** app.netlify.com/drop adresine giriş yapın ve bu klasörü sürükleyip bırakın.

### 2. Telefona kurma
1. Honor Magic V3'te adresi **Chrome** ile açın.
2. Sağ üstteki ⋮ menüsünden **Uygulamayı yükle** ya da **Ana ekrana ekle**'ye dokunun.
3. Ana ekrandaki **Sayfa** simgesiyle açın. Uygulama tam ekran açılır.

### 3. Daha doğal Türkçe ses için
*Ayarlar → Erişilebilirlik → Metin okuma çıkışı* yolunu izleyin. Tercih edilen motor olarak **Google Konuşma Hizmetleri**'ni seçin,
ardından motor ayarlarından **Türkçe** ses paketini indirin. Uygulamadaki *Ayarlar → Sesli okuma* bölümünden sesi seçebilirsiniz.

## Kullanım ipuçları

| Hareket | Sonuç |
|---|---|
| Sağ kenara dokunma veya sola kaydırma | Sonraki sayfa |
| Sol kenara dokunma veya sağa kaydırma | Önceki sayfa |
| Sayfa köşesini tutup sürükleme | Sayfayı elle kıvırarak çevirme |
| Ekranın ortasına dokunma | Menüleri göster veya gizle |
| Alttaki kaydırıcı | Hızlıca başka bir sayfaya gitme |

## Bilinen sınırlar

- Sesli okuma yalnızca uygulama ekranda açıkken devam eder. Tarayıcılar ekran kapanınca konuşmayı durdurur; ekranı açık tutma özelliği bu yüzden var.
- Eski **.doc** dosyalarında Word 97 ve sonrası desteklenir. Metin eksiksiz gelir ama biçimlendirme (kalın, italik) aktarılmaz. En iyi sonuç için Word'de *.docx* olarak kaydedin.
- Taranmış (fotoğraf) PDF'ler resim olarak gösterilir. Bu dosyalar sesli okunamaz.

## Bilgisayarda deneme

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```
Ardından tarayıcıda `http://localhost:8765` adresini açın.

## Dosyalar

| Dosya | Görev |
|---|---|
| `index.html` | Arayüz iskeleti |
| `styles.css` | Temalar, kitap ve sayfa görünümü |
| `app.js` | Sayfalama, çevirme, ses, sesli okuma, kaldığım yer, kitaplık |
| `formats.js` | Dosya biçimlerini okuma (PDF, DOCX, DOC, EPUB, ODT, RTF, TXT, MD, HTML) |
| `sw.js` | Çevrimdışı önbellek ve Paylaş menüsünden dosya alma |
| `manifest.webmanifest` | Telefona kurulum bilgileri |

Kullanılan açık kaynak kütüphaneler: pdf.js (PDF), mammoth.js (DOCX), JSZip (EPUB/ODT), StPageFlip (sayfa çevirme animasyonu).
