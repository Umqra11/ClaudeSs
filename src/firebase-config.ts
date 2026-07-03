// ============================================================
// Firebase yapılandırması
//
// Uygulamayı arkadaşlarınla birlikte kullanmak (odalar, canlı
// scoreboard) için ücretsiz bir Firebase projesi gerekir:
//
//   1. console.firebase.google.com adresinde yeni proje aç
//   2. Build > Authentication > Sign-in method > Anonymous'u etkinleştir
//   3. Build > Firestore Database > veritabanı oluştur
//   4. Proje ayarları > Genel > "Web uygulaması" ekle,
//      çıkan firebaseConfig değerlerini aşağıya yapıştır
//
// İki yol var:
//   • Değerleri doğrudan aşağıya yapıştır (bilgisayardan Firebase
//     Hosting ile yayınlıyorsan en kolayı budur), VEYA
//   • Vercel gibi bir serviste yayınlıyorsan değerleri panele
//     "Environment Variables" olarak gir (VITE_FIREBASE_* adlarıyla).
//     Ortam değişkeni doluysa, aşağıdaki elle girilen değerin yerine
//     otomatik olarak o kullanılır.
//
// Not: Bu anahtarlar "gizli" değildir; herkese açık yayınlanabilir.
// Güvenlik, Firestore kuralları (firestore.rules) ve Firebase'deki
// "Yetkili alan adları" listesiyle sağlanır.
//
// Config doldurulmadığı sürece uygulama "yerel mod"da çalışır:
// veriler yalnızca bu cihazda (localStorage) tutulur, odalar kapalıdır.
// ============================================================

const env = import.meta.env as Record<string, string | undefined>

/** Ortam değişkeni doluysa onu, değilse elle girilen değeri kullanır. */
function pick(envKey: string, manual: string): string {
  const value = env[envKey]
  return value && value.length > 0 ? value : manual
}

export const firebaseConfig = {
  apiKey: pick('VITE_FIREBASE_API_KEY', 'AIzaSyBAxMJDvTEr-S7F5BswOaq5FrQhOZ036Tw'),
  authDomain: pick('VITE_FIREBASE_AUTH_DOMAIN', 'kpss-love.firebaseapp.com'),
  projectId: pick('VITE_FIREBASE_PROJECT_ID', 'kpss-love'),
  storageBucket: pick('VITE_FIREBASE_STORAGE_BUCKET', 'kpss-love.firebasestorage.app'),
  messagingSenderId: pick('VITE_FIREBASE_MESSAGING_SENDER_ID', '665449572529'),
  appId: pick('VITE_FIREBASE_APP_ID', '1:665449572529:web:fb1441fdc8bdfaa5b29a90'),
}

/** Config'in gerçek değerlerle doldurulup doldurulmadığını söyler. */
export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every(
    (value) => value.length > 0 && value !== 'BURAYA_YAPISTIR',
  )
}
