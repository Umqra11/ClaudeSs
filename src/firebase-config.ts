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
// Config doldurulmadığı sürece uygulama "yerel mod"da çalışır:
// veriler yalnızca bu cihazda (localStorage) tutulur, odalar kapalıdır.
// ============================================================

export const firebaseConfig = {
  apiKey: 'BURAYA_YAPISTIR',
  authDomain: 'BURAYA_YAPISTIR',
  projectId: 'BURAYA_YAPISTIR',
  storageBucket: 'BURAYA_YAPISTIR',
  messagingSenderId: 'BURAYA_YAPISTIR',
  appId: 'BURAYA_YAPISTIR',
}

/** Config'in gerçek değerlerle doldurulup doldurulmadığını söyler. */
export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every(
    (value) => value.length > 0 && value !== 'BURAYA_YAPISTIR',
  )
}
