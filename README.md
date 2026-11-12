# Ruang Catur

Game catur berbahasa Indonesia dengan tampilan responsif. Tidak memerlukan instalasi dependensi untuk dimainkan.

## Menjalankan

Dengan Node.js terpasang:

```sh
npm start
```

Buka **http://localhost:3000**. Di PowerShell yang membatasi skrip, gunakan `npm.cmd start` atau `node server.js`.

`index.html` juga bisa dibuka langsung. Server lokal direkomendasikan agar AI berjalan di Web Worker; pembukaan langsung memakai perhitungan AI di halaman sebagai cadangan.

## Fitur

- Lawan komputer dengan tiga tingkat, dua pemain lokal, atau komputer melawan komputer.
- Langkah sah, skak, skakmat, pat, rokade dua sisi, en passant, dan empat pilihan promosi.
- Remis otomatis setelah tiga pengulangan posisi, 50 langkah tanpa gerakan pion atau tangkapan, atau material yang tidak cukup.
- Riwayat notasi SAN, unduhan PGN, bidak tertangkap, dan keunggulan material.
- Urungkan langkah, termasuk rokade dan en passant. Saat melawan komputer, urungkan mengembalikan giliran pemain.
- Penyimpanan otomatis di browser, balik papan, suara opsional, dan navigasi keyboard.
- Undo dalam mode komputer vs komputer menjeda pemutaran; ubah tingkat kesulitan untuk melanjutkan.

Penyimpanan mengikuti alamat browser yang digunakan. Font Google bersifat opsional; font sistem digunakan jika offline. AI merupakan mesin lokal sederhana dengan pencarian kedalaman 1–3, bukan engine turnamen.

## Pengujian

```sh
npm test
```

Uji mesin menggunakan `node:test`, termasuk perft posisi awal dan Kiwipete. Uji browser membutuhkan Playwright atau `playwright-core` beserta Chromium. Arahkan `PLAYWRIGHT_MODULE` ke modul jika belum ada dalam proyek, lalu jalankan `npm run test:browser`.
