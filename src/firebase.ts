import { initializeApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { firebaseConfig, isFirebaseConfigured } from './firebase-config'

// Config doldurulmamışsa Firebase hiç başlatılmaz; uygulama
// localStorage tabanlı "yerel mod"a düşer (bkz. services/db.ts).
export let firebaseAuth: Auth | null = null
export let firebaseDb: Firestore | null = null

if (isFirebaseConfigured()) {
  const app = initializeApp(firebaseConfig)
  firebaseAuth = getAuth(app)
  // Çevrimdışı kalıcılık: profil/oda verisi cihazda (IndexedDB) saklanır;
  // soğuk açılışta okumalar sunucuyu beklemeden yerel kopyadan gelir,
  // yazımlar çevrimdışıyken kuyruklanıp bağlanınca gönderilir.
  firebaseDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  })
}
