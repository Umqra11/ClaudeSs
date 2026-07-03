# KPSS Takip

KPSS'ye hazırlanırken **ne kadar çalıştığını** takip eden, arkadaşlarınla
**oda kurup canlı sıralama** görebildiğin, telefona uygulama gibi kurulabilen
ücretsiz bir web uygulaması (PWA).

- **Kronometre**: Başlat / Duraklat / Durdur. Uygulamayı kapatsan, telefonu
  yeniden başlatsan bile süre doğru işler.
- **Haftalık toplam**: Ana ekranda görünür; her **Salı 00:00**'da
  (Türkiye saati) otomatik sıfırlanır.
- **Odalar**: Oda kur, 6 haneli kodu arkadaşlarına gönder. Odada kim şu an
  çalışıyor, kim kaç saat yapmış — canlı görürsün.
- Marketten indirilmez: bir **link** ile paylaşılır, "Ana ekrana ekle"
  denince telefonda uygulama gibi durur.

---

## Nasıl çalışır?

İlk açılışta yalnızca **adını** yazarsın — şifre, e-posta yok. Cihaz seni
hatırlar, bir daha sorulmaz.

> **Önemli uyarı:** Hesabın bu cihazın tarayıcısına bağlıdır. Tarayıcı
> verilerini (site verileri / geçmiş "tüm zamanlar") silersen hesabın ve
> sürelerin kaybolur. Normal kullanımda hiçbir şey yapmana gerek yok.

### Yerel mod nedir?

Aşağıdaki Firebase kurulumu yapılmadan uygulama **yerel modda** çalışır:
kronometre ve haftalık toplam tamamen çalışır ama veriler yalnızca o
cihazda kalır ve odalar arkadaşlarla paylaşılamaz. Arkadaşlarınla birlikte
kullanmak için bir kere aşağıdaki kurulumu yapman yeterli (yaklaşık 10 dakika,
tamamen ücretsiz).

---

## Kurulum (bir kez, ~10 dakika)

Uygulamanın internette yayınlanması ve odaların çalışması için Google'ın
ücretsiz **Firebase** hizmeti kullanılır. Kredi kartı istemez.

### 1. Firebase projesi aç

1. Tarayıcıda [console.firebase.google.com](https://console.firebase.google.com) adresine git, Google hesabınla gir.
2. **"Proje oluştur"** (Create a project) düğmesine bas.
3. Proje adı olarak örneğin `kpss-takip` yaz, devam et.
4. "Google Analytics" sorusunu **kapat** (gerekmiyor) ve projeyi oluştur.

### 2. Girişleri aç (Anonymous Authentication)

1. Sol menüden **Build → Authentication**'a gir, **"Get started"** de.
2. **"Sign-in method"** sekmesinde **"Anonymous"** (Anonim) seçeneğini bul,
   aç (Enable) ve kaydet.

### 3. Veritabanını aç (Firestore)

1. Sol menüden **Build → Firestore Database**'e gir, **"Create database"** de.
2. Konum sorarsa `europe-west1` gibi bir Avrupa bölgesi seç.
3. **"Production mode"** ile başlat (güvenlik kurallarını birazdan biz yükleyeceğiz).

### 4. Uygulama anahtarlarını kopyala

1. Konsolda sol üstteki **dişli (⚙) → Project settings**'e gir.
2. Aşağıda **"Your apps"** bölümünde **`</>` (Web)** simgesine bas.
3. Takma ad olarak `kpss-takip-web` yaz, **"Register app"** de.
   ("Firebase Hosting" kutusunu işaretlemene gerek yok.)
4. Ekranda `const firebaseConfig = { apiKey: "...", ... }` diye bir kod
   görünecek. Bu değerleri kopyala.
5. Bu depodaki **`src/firebase-config.ts`** dosyasını aç ve
   `BURAYA_YAPISTIR` yazan alanları kendi değerlerinle değiştir.

### 5. Bilgisayarında yayınla

Bilgisayarında [Node.js](https://nodejs.org) kurulu olmalı (LTS sürümü).
Sonra bu klasörde sırayla:

```bash
npm install
npm run build
npx firebase-tools login
npx firebase-tools use --add        # listeden kendi projeni seç
npx firebase-tools deploy
```

> `.firebaserc` dosyasındaki `BURAYA-PROJE-ID` yerine proje kimliğini
> yazarsan `use --add` adımına gerek kalmaz.

`deploy` bitince ekranda **Hosting URL** diye bir link çıkar
(örn. `https://kpss-takip.web.app`). **Uygulaman artık yayında!**
Bu komut aynı zamanda `firestore.rules` dosyasındaki güvenlik kurallarını da
yükler (herkes yalnızca kendi verisini yazabilir).

### 6. Linki paylaş

Çıkan linki arkadaşlarına gönder. Herkes kendi adıyla girer, sen bir oda
kurup kodu paylaşırsın — hepsi bu.

---

## Telefona uygulama gibi ekleme

**iPhone (Safari):**
1. Linki Safari'de aç.
2. Alttaki **Paylaş** düğmesine (kare + yukarı ok) bas.
3. **"Ana Ekrana Ekle"** de. Artık ana ekranda KPSS Takip simgesi var.

**Android (Chrome):**
1. Linki Chrome'da aç.
2. Sağ üst **⋮** menüsünden **"Uygulamayı yükle"** (veya "Ana ekrana ekle") de.

---

## Sık sorulanlar

**Süre arka planda işler mi?** Evet. Kronometre "saymaz", başlangıç saatini
kaydeder; uygulamaya dönünce geçen süre saatten hesaplanır. Telefon kapansa
bile doğrudur.

**Haftalık süre ne zaman sıfırlanır?** Her Salı gece 00:00'da
(Türkiye saati). Sıralama da buna göre yeniden başlar.

**Verilerim nerede?** Kendi Firebase projende (Google sunucularında),
yalnızca senin projenin kullanıcılarına görünür. Yerel modda ise sadece
cihazında.

**Ücret çıkar mı?** Bu ölçekte hayır — Firebase'in ücretsiz katmanı bir
arkadaş grubunun kullanımının çok üzerinde kota sunar.
