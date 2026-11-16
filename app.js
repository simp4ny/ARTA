/* ============================================================
   ARTA — logika aplikasi
   Tidak ada URL atau PIN di file ini: keduanya kamu isi di layar
   "Hubungkan" dan hanya tersimpan di HP-mu.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- alat kecil ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const KUNCI = { cfg: 'arta.cfg', data: 'arta.data', antre: 'arta.antrean', kat: 'arta.kategori', sinkron: 'arta.sinkron' };
  const simpanLokal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* penyimpanan penuh */ } };
  const bacaLokal = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };

  const KATEGORI_BAWAAN = {
    pengeluaran: ['Makan & Minum', 'Transportasi', 'Belanja', 'Tagihan', 'Tempat Tinggal', 'Pendidikan', 'Kesehatan', 'Hiburan', 'Pulsa & Internet', 'Lainnya'],
    pemasukan: ['Gaji', 'Uang Saku', 'Usaha', 'Bonus', 'Hadiah', 'Investasi', 'Lainnya']
  };
  const PERIODE = [
    { id: 'hari', nama: 'Hari ini' }, { id: 'minggu', nama: 'Minggu ini' },
    { id: 'bulan', nama: 'Bulan ini' }, { id: 'kustom', nama: 'Kustom' }
  ];
  const JUDUL_HAL = { beranda: 'Ringkasan', grafik: 'Grafik', riwayat: 'Riwayat', setelan: 'Setelan' };
  const WARNA = { nila: '#5b5bf0', teal: '#0e9c8f', garis: '#eceef6', tinta: '#15172e', tinta3: '#868ba6' };

  /* ---------- keadaan aplikasi ---------- */
  const S = {
    cfg: bacaLokal(KUNCI.cfg, null),
    data: bacaLokal(KUNCI.data, []),
    antre: bacaLokal(KUNCI.antre, []),
    katKustom: bacaLokal(KUNCI.kat, { pengeluaran: [], pemasukan: [] }),
    sinkronTerakhir: bacaLokal(KUNCI.sinkron, 0),
    hal: 'beranda',
    periode: 'bulan',
    kustom: { dari: '', sampai: '' },
    tren: 'harian',
    filter: { cari: '', jenis: 'semua', kategori: '', dari: '', sampai: '', batas: 60 },
    status: 'ok',
    statusPesan: '',
    perluMuat: false,
    pernahMuat: false,
    ditolak: new Set(),
    rantai: Promise.resolve(),
    pasang: null
  };
  const F = { mode: 'tambah', id: null, jenis: 'pengeluaran', kategori: '', minus: false };
  const grafik = {};

  /* ---------- tanggal ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const keISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dariISO = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const hariIni = () => keISO(new Date());
  const geser = (iso, n) => { const d = dariISO(iso); d.setDate(d.getDate() + n); return keISO(d); };
  const selisih = (a, b) => Math.round((dariISO(b) - dariISO(a)) / 864e5);
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const tglPendek = (iso) => { const d = dariISO(iso); return d.getDate() + ' ' + BLN[d.getMonth()]; };
  const tglLengkap = (iso) => { const d = dariISO(iso); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear(); };
  const tglRamah = (iso) => {
    const h = hariIni();
    if (iso === h) return 'Hari ini';
    if (iso === geser(h, -1)) return 'Kemarin';
    return tglLengkap(iso);
  };

  /* ---------- rupiah ---------- */
  const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const rp = (n) => (n < 0 ? '−' : '') + 'Rp ' + fmt.format(Math.abs(Math.round(n)));
  const ringkas = (n) => {
    const a = Math.abs(n);
    const f = (x, s) => String(Math.round(x * 10) / 10).replace('.', ',') + s;
    if (a >= 1e9) return f(n / 1e9, ' M');
    if (a >= 1e6) return f(n / 1e6, ' jt');
    if (a >= 1e3) return f(n / 1e3, ' rb');
    return String(Math.round(n));
  };

  /* ---------- periode ---------- */
  function rentang() {
    const h = hariIni();
    const d = dariISO(h);
    if (S.periode === 'hari') {
      return { dari: h, sampai: h, sblm: [geser(h, -1), geser(h, -1)], nama: 'hari ini', namaSblm: 'kemarin' };
    }
    if (S.periode === 'minggu') {
      const sen = geser(h, -((d.getDay() + 6) % 7));
      return { dari: sen, sampai: geser(sen, 6), sblm: [geser(sen, -7), geser(h, -7)], nama: 'minggu ini', namaSblm: 'minggu lalu' };
    }
    if (S.periode === 'bulan') {
      const y = d.getFullYear(), m = d.getMonth();
      const akhirLalu = new Date(y, m, 0).getDate();
      return {
        dari: keISO(new Date(y, m, 1)), sampai: keISO(new Date(y, m + 1, 0)),
        sblm: [keISO(new Date(y, m - 1, 1)), keISO(new Date(y, m - 1, Math.min(d.getDate(), akhirLalu)))],
        nama: 'bulan ini', namaSblm: 'bulan lalu'
      };
    }
    let a = S.kustom.dari || h, b = S.kustom.sampai || h;
    if (a > b) { const t = a; a = b; b = t; }
    const n = selisih(a, b) + 1;
    return { dari: a, sampai: b, sblm: [geser(a, -n), geser(a, -1)], nama: tglPendek(a) + ' – ' + tglPendek(b), namaSblm: 'periode sebelumnya', kustom: true };
  }

  function hitung(dari, sampai) {
    const h = { masuk: 0, keluar: 0, perKat: {}, n: 0 };
    for (const t of S.data) {
      if (t.tanggal < dari || t.tanggal > sampai) continue;
      h.n++;
      if (t.jenis === 'pemasukan') h.masuk += t.nominal;
      else {
        h.keluar += t.nominal;
        h.perKat[t.kategori] = (h.perKat[t.kategori] || 0) + t.nominal;
      }
    }
    h.saldo = h.masuk - h.keluar;
    return h;
  }

  const terurut = () => S.data.map((t, i) => [t, i])
    .sort((a, b) => (a[0].tanggal < b[0].tanggal ? 1 : a[0].tanggal > b[0].tanggal ? -1 : b[1] - a[1]))
    .map((x) => x[0]);

  const idTunda = () => new Set(S.antre.map((o) => (o.t ? o.t.id : o.id)));

  /* ---------- kategori ---------- */
  function daftarKategori(jenis) {
    const hit = {};
    S.data.forEach((t) => { if (t.jenis === jenis) hit[t.kategori] = (hit[t.kategori] || 0) + 1; });
    const lihat = new Set(), semua = [];
    Object.keys(hit).concat(KATEGORI_BAWAAN[jenis], S.katKustom[jenis] || []).forEach((k) => {
      const kunci = k.toLowerCase();
      if (!lihat.has(kunci)) { lihat.add(kunci); semua.push(k); }
    });
    const urutBawaan = (k) => { const i = KATEGORI_BAWAAN[jenis].indexOf(k); return i < 0 ? 50 : i; };
    return semua.sort((a, b) => {
      const la = a.toLowerCase() === 'lainnya', lb = b.toLowerCase() === 'lainnya';
      if (la !== lb) return la ? 1 : -1;
      return (hit[b] || 0) - (hit[a] || 0) || urutBawaan(a) - urutBawaan(b);
    });
  }

  /* ---------- toast & dialog ---------- */
  let toastJam = 0;
  const IKON_TOAST = {
    sukses: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    galat: '<svg viewBox="0 0 24 24"><path d="M12 6v8M12 18v.5"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M12 6v8M12 18v.5"/></svg>',
    proses: ''
  };
  function toast(teks, jenis) {
    jenis = jenis || 'sukses';
    const el = $('#toast');
    clearTimeout(toastJam);
    el.hidden = true;
    void el.offsetWidth; // ulang animasi
    el.dataset.jenis = jenis;
    el.innerHTML = '<span class="toast-ikon">' + IKON_TOAST[jenis] + '</span><span>' + esc(teks) + '</span>';
    el.hidden = false;
    if (jenis !== 'proses') toastJam = setTimeout(() => { el.hidden = true; }, jenis === 'galat' ? 5200 : 2800);
    else toastJam = setTimeout(() => { el.hidden = true; }, 30000);
  }

  let dialogSelesai = null;
  function konfirmasi(o) {
    $('#dialog-judul').textContent = o.judul;
    $('#dialog-teks').textContent = o.teks;
    $('#dialog-ya').textContent = o.ya || 'Hapus';
    $('#dialog').hidden = false;
    $('#dialog-batal').focus();
    return new Promise((res) => { dialogSelesai = res; });
  }
  function tutupDialog(jawab) {
    $('#dialog').hidden = true;
    if (dialogSelesai) { const f = dialogSelesai; dialogSelesai = null; f(jawab); }
  }

  /* ---------- komunikasi dengan Apps Script ---------- */
  async function panggil(aksi, isi, cfg) {
    cfg = cfg || S.cfg;
    const galatJaringan = () => Object.assign(new Error('Tidak ada koneksi.'), { jaringan: true });
    if (navigator.onLine === false) throw galatJaringan();
    const kendali = new AbortController();
    const jam = setTimeout(() => kendali.abort(), 30000);
    let res;
    try {
      // Tanpa header khusus supaya browser tidak mengirim "preflight" (Apps Script tidak melayaninya).
      res = await fetch(cfg.url, {
        method: 'POST', redirect: 'follow', signal: kendali.signal,
        body: JSON.stringify(Object.assign({ pin: cfg.pin, aksi: aksi }, isi || {}))
      });
    } catch (e) {
      throw galatJaringan();
    } finally {
      clearTimeout(jam);
    }
    let json;
    try { json = JSON.parse(await res.text()); } catch (e) {
      throw Object.assign(new Error('URL itu bukan penghubung Arta. Periksa URL dan pastikan akses deployment diatur ke “Siapa saja”.'), { kode: 'URL' });
    }
    if (!json.ok) throw Object.assign(new Error(json.pesan || 'Permintaan ditolak.'), { kode: json.kode || 'GALAT' });
    return json;
  }

  const GALAT_BERHENTI = ['PIN_SALAH', 'TERKUNCI', 'PIN_BELUM_DIATUR', 'URL', 'SHEET', 'STRUKTUR'];

  async function kirimAntrean() {
    while (S.antre.length) {
      const op = S.antre[0];
      try {
        if (op.aksi === 'hapus') await panggil('hapus', { id: op.id });
        else await panggil(op.aksi, { t: op.t });
      } catch (e) {
        if (e.jaringan || GALAT_BERHENTI.indexOf(e.kode) >= 0) throw e; // antrean tetap disimpan
        // Ditolak karena isinya: buang supaya antrean tidak macet, lalu muat ulang dari spreadsheet.
        S.antre.shift(); simpanLokal(KUNCI.antre, S.antre);
        S.ditolak.add(op.t ? op.t.id : op.id);
        S.perluMuat = true;
        toast('Satu perubahan ditolak: ' + e.message, 'galat');
        continue;
      }
      S.antre.shift(); simpanLokal(KUNCI.antre, S.antre);
    }
  }

  async function jalankanSinkron() {
    if (!S.cfg) return;
    aturStatus('sinkron');
    try {
      await kirimAntrean();
      if (S.perluMuat && S.antre.length === 0) {
        const r = await panggil('muat');
        if (S.antre.length === 0) { // tidak ada perubahan baru selama memuat
          S.data = r.data || [];
          simpanLokal(KUNCI.data, S.data);
          S.perluMuat = false;
        }
        S.pernahMuat = true;
      }
      S.sinkronTerakhir = Date.now();
      simpanLokal(KUNCI.sinkron, S.sinkronTerakhir);
      aturStatus('ok');
    } catch (e) {
      if (e.jaringan) aturStatus('offline');
      else aturStatus('galat', e.kode === 'PIN_SALAH' ? 'PIN salah. Buka Setelan lalu ubah koneksi.' : e.message);
    }
    render();
  }

  function sinkron(o) {
    o = o || {};
    if (o.muat) S.perluMuat = true;
    S.rantai = S.rantai.then(jalankanSinkron).catch(() => { /* jaga rantai tetap hidup */ }).then(() => {
      if (o.berisik) {
        if (S.status === 'ok') toast('Data sudah sama dengan spreadsheet');
        else if (S.status === 'offline') toast('Sedang offline. Data akan disinkronkan saat online.', 'info');
        else toast(S.statusPesan, 'galat');
      }
    });
    return S.rantai;
  }

  function aturStatus(status, pesan) {
    S.status = status; S.statusPesan = pesan || '';
    const el = $('#status');
    el.dataset.status = status;
    const n = S.antre.length;
    $('#status-teks').textContent =
      status === 'sinkron' ? 'Menyinkronkan' :
      status === 'offline' ? (n ? 'Offline, ' + n + ' menunggu' : 'Offline') :
      status === 'galat' ? 'Perlu dicek' : 'Tersinkron';
  }

  /* ---------- render: periode ---------- */
  function renderPeriode() {
    $$('[data-periode]').forEach((el) => {
      el.innerHTML = PERIODE.map((p) =>
        '<button type="button" class="chip' + (S.periode === p.id ? ' aktif' : '') + '" data-p="' + p.id + '" aria-pressed="' + (S.periode === p.id) + '">' + p.nama + '</button>').join('');
      let k = el.nextElementSibling;
      if (!k || !k.hasAttribute('data-kustom')) {
        k = document.createElement('div');
        k.className = 'kustom';
        k.setAttribute('data-kustom', '');
        k.innerHTML = '<label class="isian"><span>Dari tanggal</span><input type="date" data-k="dari"></label>' +
          '<label class="isian"><span>Sampai tanggal</span><input type="date" data-k="sampai"></label>';
        el.after(k);
      }
      k.hidden = S.periode !== 'kustom';
      $('[data-k="dari"]', k).value = S.kustom.dari;
      $('[data-k="sampai"]', k).value = S.kustom.sampai;
    });
  }

  /* ---------- render: baris transaksi ---------- */
  function barisTx(t, tunda, denganTanggal) {
    const masuk = t.jenis === 'pemasukan';
    const ket = [denganTanggal ? tglRamah(t.tanggal) : '', t.catatan].filter(Boolean).join(', ') || (masuk ? 'Pemasukan' : 'Pengeluaran');
    return '<button type="button" class="tx" data-ubah="' + esc(t.id) + '">' +
      '<span class="tx-avatar' + (masuk ? ' masuk' : '') + '" aria-hidden="true">' + esc((t.kategori || '?').trim().charAt(0).toUpperCase()) + '</span>' +
      '<span class="tx-tengah"><span class="tx-kat">' + esc(t.kategori) + '</span><span class="tx-ket">' + esc(ket) + '</span></span>' +
      '<span class="tx-nominal' + (masuk ? ' masuk' : '') + '">' + (masuk ? '+' : '−') + rp(t.nominal) +
      (tunda.has(t.id) ? '<span class="tx-tunda">menunggu dikirim</span>' : '') + '</span></button>';
  }

  const GAMBAR_KOSONG = '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M22 12h36a4 4 0 0 1 4 4v52l-7-5-7 5-8-5-8 5-7-5-7 5V16a4 4 0 0 1 4-4Z"/><path d="M30 28h20M30 38h20M30 48h11"/></svg>';

  function rangka() {
    return '<div class="rangka r1"></div><div class="rangka r2"></div><div class="rangka r3"></div><div class="rangka r3"></div>';
  }
  const sedangMuatAwal = () => S.data.length === 0 && !S.pernahMuat && S.status === 'sinkron';

  /* ---------- render: ringkasan ---------- */
  function renderBeranda() {
    const el = $('#beranda-isi');
    if (sedangMuatAwal()) { el.innerHTML = rangka(); return; }
    const r = rentang();
    const h = hitung(r.dari, r.sampai);
    const tunda = idTunda();
    let html = '';

    // Kartu saldo
    html += '<article class="saldo"><p class="saldo-label">Saldo bersih ' + esc(r.nama) + '</p>' +
      '<p class="saldo-angka' + (h.saldo < 0 ? ' minus' : '') + '">' + rp(h.saldo) + '</p>';
    if (h.masuk > 0) {
      const pct = Math.round((h.keluar / h.masuk) * 100);
      const lebih = h.keluar > h.masuk;
      html += '<div class="aliran"><div class="aliran-rel"><div class="aliran-isi' + (lebih ? ' lebih' : '') + '" style="width:' + Math.min(100, pct) + '%"></div></div>' +
        '<p class="aliran-ket">' + (lebih ? 'Pengeluaran melebihi pemasukan sebesar ' + rp(h.keluar - h.masuk)
          : h.keluar === 0 ? 'Pemasukan belum terpakai' : pct + '% pemasukan sudah terpakai') + '</p></div>';
    }
    html += '<div class="duo"><div><span class="duo-label"><span class="titik masuk"></span>Pemasukan</span><strong class="duo-nilai">' + rp(h.masuk) + '</strong></div>' +
      '<div><span class="duo-label"><span class="titik keluar"></span>Pengeluaran</span><strong class="duo-nilai">' + rp(h.keluar) + '</strong></div></div></article>';

    // Wawasan
    const wawasan = susunWawasan(r, h);
    if (wawasan.length) {
      html += '<section class="blok"><div class="blok-kepala"><h2>Yang perlu kamu tahu</h2></div><div class="kartu wawasan">' +
        wawasan.map((w) => '<div class="wawasan-item"><span class="wawasan-ikon ' + (w.nada || '') + '">' + w.ikon + '</span><div><p class="wawasan-judul">' + esc(w.judul) +
          '</p><p class="wawasan-isi">' + esc(w.isi) + (w.kecil ? '<small>' + esc(w.kecil) + '</small>' : '') + '</p></div></div>').join('') + '</div></section>';
    }

    // Transaksi terbaru
    html += '<section class="blok"><div class="blok-kepala"><h2>Transaksi terbaru</h2>' +
      (S.data.length ? '<button type="button" class="tautan" data-hal="riwayat">Lihat semua</button>' : '') + '</div>';
    if (S.data.length === 0) {
      html += '<div class="kartu kosong">' + GAMBAR_KOSONG + '<h3>Belum ada transaksi</h3><p>Catat pemasukan atau pengeluaran pertamamu. Hasilnya langsung masuk ke spreadsheet.</p>' +
        '<button type="button" class="tombol utama" data-tambah>Tambah transaksi</button></div>';
    } else {
      html += '<div class="kartu daftar">' + terurut().slice(0, 5).map((t) => barisTx(t, tunda, true)).join('') + '</div>';
    }
    html += '</section>';
    el.innerHTML = html;
  }

  const IKON = {
    puncak: '<svg viewBox="0 0 24 24"><path d="M12 3v18M6 9l6-6 6 6"/></svg>',
    kalender: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    naik: '<svg viewBox="0 0 24 24"><path d="M5 17 11 11l3 3 5-6"/><path d="M15 8h4v4"/></svg>',
    turun: '<svg viewBox="0 0 24 24"><path d="m5 7 6 6 3-3 5 6"/><path d="M15 16h4v-4"/></svg>',
    struk: '<svg viewBox="0 0 24 24"><path d="M7 4h10v16l-2.5-1.5L12 20l-2.5-1.5L7 20Z"/><path d="M10 9h4M10 13h4"/></svg>',
    tabung: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.2c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7c0 2.3-5 1.3-5 3.6 0 1 1 1.7 2.5 1.7s2.5-.7 2.5-1.7"/></svg>'
  };

  function susunWawasan(r, h) {
    const w = [];
    const hi = hariIni();
    const kat = Object.keys(h.perKat).sort((a, b) => h.perKat[b] - h.perKat[a]);
    if (kat.length) {
      const pct = Math.round((h.perKat[kat[0]] / h.keluar) * 100);
      w.push({ ikon: IKON.puncak, judul: 'Pengeluaran terbesar', isi: kat[0] + ', ' + rp(h.perKat[kat[0]]), kecil: pct + '% dari seluruh pengeluaran ' + r.nama });
    }
    // Rata-rata harian
    if (S.periode === 'hari') {
      const tujuh = hitung(geser(hi, -6), hi);
      if (tujuh.keluar > 0) {
        const rata = tujuh.keluar / 7;
        w.push({ ikon: IKON.kalender, judul: 'Rata-rata pengeluaran harian', isi: rp(rata) + ' per hari', kecil: 'Dihitung dari 7 hari terakhir. Hari ini ' + (h.keluar > rata ? 'di atas' : 'di bawah') + ' rata-rata.' });
      }
    } else if (h.keluar > 0 && r.dari <= hi) {
      const akhir = r.sampai < hi ? r.sampai : hi;
      const hari = Math.max(1, selisih(r.dari, akhir) + 1);
      w.push({ ikon: IKON.kalender, judul: 'Rata-rata pengeluaran harian', isi: rp(h.keluar / hari) + ' per hari', kecil: 'Dihitung dari ' + hari + ' hari yang sudah berjalan' });
    }
    // Dibanding periode sebelumnya (rentang hari yang sama)
    const akhirKini = r.sampai < hi ? r.sampai : hi;
    const kini = r.dari <= hi ? hitung(r.dari, akhirKini).keluar : 0;
    const lalu = hitung(r.sblm[0], r.sblm[1]).keluar;
    if (lalu > 0) {
      const beda = Math.round(((kini - lalu) / lalu) * 100);
      const teks = beda === 0 ? 'Pengeluaran sama dengan ' + r.namaSblm
        : 'Pengeluaran ' + (beda > 0 ? 'naik ' : 'turun ') + Math.abs(beda) + '% dari ' + r.namaSblm;
      w.push({ ikon: beda > 0 ? IKON.naik : IKON.turun, nada: beda > 0 ? 'awas' : 'baik', judul: 'Dibanding ' + r.namaSblm, isi: teks,
        kecil: rp(kini) + ' sekarang, ' + rp(lalu) + (S.periode === 'hari' ? ' kemarin' : ' pada rentang hari yang sama') });
    } else if (kini > 0) {
      w.push({ ikon: IKON.naik, judul: 'Dibanding ' + r.namaSblm, isi: 'Belum ada pembanding', kecil: 'Tidak ada pengeluaran tercatat ' + r.namaSblm });
    }
    if (h.masuk > 0 && h.saldo > 0 && S.periode !== 'hari') {
      w.push({ ikon: IKON.tabung, nada: 'baik', judul: 'Sisa pemasukan', isi: Math.round((h.saldo / h.masuk) * 100) + '% pemasukan masih tersisa', kecil: rp(h.saldo) + ' dari ' + rp(h.masuk) });
    }
    return w;
  }

  /* ---------- render: grafik ---------- */
  function hancurkanGrafik() {
    Object.keys(grafik).forEach((k) => { if (grafik[k]) { grafik[k].destroy(); grafik[k] = null; } });
  }

  function dataTren() {
    const hi = hariIni();
    if (S.tren === 'bulanan') {
      const d = dariISO(hi), label = [], nilai = [], judul = [];
      for (let i = 11; i >= 0; i--) {
        const a = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const b = new Date(a.getFullYear(), a.getMonth() + 1, 0);
        label.push(BLN[a.getMonth()]);
        judul.push(BLN[a.getMonth()] + ' ' + a.getFullYear());
        nilai.push(hitung(keISO(a), keISO(b)).keluar);
      }
      return { label, nilai, judul, sub: 'Per bulan, 12 bulan terakhir' };
    }
    const r = rentang();
    let a = r.dari, b = r.sampai, sub;
    if (S.periode === 'hari') { b = hi; a = geser(hi, -6); sub = 'Per hari, 7 hari terakhir'; }
    else {
      if (selisih(a, b) > 61) a = geser(b, -61);
      sub = 'Per hari, ' + tglPendek(a) + ' – ' + tglPendek(b);
    }
    const n = selisih(a, b) + 1, per = {};
    S.data.forEach((t) => { if (t.jenis === 'pengeluaran' && t.tanggal >= a && t.tanggal <= b) per[t.tanggal] = (per[t.tanggal] || 0) + t.nominal; });
    const label = [], nilai = [], judul = [];
    for (let i = 0; i < n; i++) {
      const iso = geser(a, i), d = dariISO(iso);
      label.push(n <= 7 ? HARI[d.getDay()] : String(d.getDate()));
      judul.push(tglLengkap(iso));
      nilai.push(per[iso] || 0);
    }
    return { label, nilai, judul, sub };
  }

  function dataEnamBulan() {
    const d = dariISO(hariIni()), label = [], masuk = [], keluar = [], judul = [];
    for (let i = 5; i >= 0; i--) {
      const a = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const b = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      const h = hitung(keISO(a), keISO(b));
      label.push(BLN[a.getMonth()]); judul.push(BLN[a.getMonth()] + ' ' + a.getFullYear());
      masuk.push(h.masuk); keluar.push(h.keluar);
    }
    return { label, masuk, keluar, judul };
  }

  function opsiBatang(judul, ganda) {
    return {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 450 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(21,23,46,.94)', padding: 10, cornerRadius: 10, displayColors: !!ganda, boxWidth: 8, boxHeight: 8, boxPadding: 4,
          titleFont: { weight: '600', size: 12 }, bodyFont: { weight: '700', size: 13 },
          callbacks: {
            title: (items) => judul[items[0].dataIndex],
            label: (c) => (ganda ? c.dataset.label + ': ' : '') + rp(c.parsed.y)
          }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, color: WARNA.tinta3 } },
        y: { beginAtZero: true, border: { display: false }, grid: { color: WARNA.garis }, ticks: { maxTicksLimit: 4, color: WARNA.tinta3, callback: (v) => ringkas(v) } }
      }
    };
  }
  const batang = (label, data, warna) => ({
    label: label, data: data, backgroundColor: warna, hoverBackgroundColor: warna,
    borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 24, categoryPercentage: 0.72, barPercentage: 0.86
  });

  function renderGrafik() {
    const el = $('#grafik-isi');
    hancurkanGrafik();
    if (sedangMuatAwal()) { el.innerHTML = rangka(); return; }
    const r = rentang();
    const h = hitung(r.dari, r.sampai);

    // 1. Pengeluaran per kategori: batang berperingkat
    const kat = Object.keys(h.perKat).sort((a, b) => h.perKat[b] - h.perKat[a]);
    let baris = kat.slice(0, 7).map((k) => ({ nama: k, nilai: h.perKat[k], klik: true }));
    if (kat.length > 7) {
      const sisa = kat.slice(7);
      baris.push({ nama: sisa.length + ' kategori lain', nilai: sisa.reduce((s, k) => s + h.perKat[k], 0) });
    }
    const maks = baris.length ? baris[0].nilai : 0;
    let html = '<article class="kartu grafik-kartu blok"><h2>Pengeluaran per kategori</h2><p class="sub">' +
      (baris.length ? 'Total ' + rp(h.keluar) + ' ' + esc(r.nama) + '. Ketuk kategori untuk melihat transaksinya.' : 'Periode: ' + esc(r.nama)) + '</p>';
    if (!baris.length) {
      html += '<div class="kosong">' + GAMBAR_KOSONG + '<h3>Belum ada pengeluaran ' + esc(r.nama) + '</h3><p>Pilih periode lain, atau catat pengeluaran lewat tombol tambah.</p></div>';
    } else {
      html += '<div class="peringkat">' + baris.map((b) => {
        const isi = '<span class="peringkat-atas"><span class="peringkat-nama">' + esc(b.nama) + '</span><span class="peringkat-nilai">' + rp(b.nilai) +
          '<small>' + Math.round((b.nilai / h.keluar) * 100) + '%</small></span></span>' +
          '<span class="peringkat-rel" style="display:block"><span class="peringkat-isi" style="display:block;width:' + Math.max(2, (b.nilai / maks) * 100) + '%"></span></span>';
        return b.klik ? '<button type="button" class="peringkat-item" data-kat="' + esc(b.nama) + '">' + isi + '</button>' : '<div class="peringkat-item">' + isi + '</div>';
      }).join('') + '</div>';
    }
    html += '</article>';

    // 2. Tren pengeluaran
    const tren = dataTren();
    const adaTren = tren.nilai.some((v) => v > 0);
    html += '<article class="kartu grafik-kartu blok"><div class="grafik-kepala"><div><h2>Tren pengeluaran</h2><p class="sub">' + esc(tren.sub) + '</p></div>' +
      '<div class="saklar" role="group" aria-label="Rentang tren"><button type="button" data-tren="harian" class="' + (S.tren === 'harian' ? 'aktif' : '') + '">Harian</button>' +
      '<button type="button" data-tren="bulanan" class="' + (S.tren === 'bulanan' ? 'aktif' : '') + '">Bulanan</button></div></div>' +
      (adaTren ? '<div class="kanvas"><canvas id="g-tren" role="img" aria-label="Grafik batang tren pengeluaran"></canvas></div>'
        : '<div class="kosong"><p>Belum ada pengeluaran pada rentang ini.</p></div>') + '</article>';

    // 3. Pemasukan vs pengeluaran
    const enam = dataEnamBulan();
    const adaEnam = enam.masuk.concat(enam.keluar).some((v) => v > 0);
    html += '<article class="kartu grafik-kartu blok"><h2>Pemasukan dan pengeluaran</h2><p class="sub">Per bulan, 6 bulan terakhir</p>' +
      (adaEnam ? '<div class="legenda"><span><i class="titik masuk"></i>Pemasukan</span><span><i class="titik keluar"></i>Pengeluaran</span></div>' +
        '<div class="kanvas"><canvas id="g-banding" role="img" aria-label="Grafik batang pemasukan dan pengeluaran per bulan"></canvas></div>'
        : '<div class="kosong"><p>Belum ada transaksi dalam 6 bulan terakhir.</p></div>') + '</article>';

    el.innerHTML = html;

    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11;
    if (adaTren) {
      grafik.tren = new Chart($('#g-tren'), { type: 'bar', data: { labels: tren.label, datasets: [batang('Pengeluaran', tren.nilai, WARNA.nila)] }, options: opsiBatang(tren.judul, false) });
    }
    if (adaEnam) {
      grafik.banding = new Chart($('#g-banding'), {
        type: 'bar',
        data: { labels: enam.label, datasets: [batang('Pemasukan', enam.masuk, WARNA.teal), batang('Pengeluaran', enam.keluar, WARNA.nila)] },
        options: opsiBatang(enam.judul, true)
      });
    }
  }

  /* ---------- render: riwayat ---------- */
  function filterAktif() {
    const f = S.filter;
    return (f.kategori ? 1 : 0) + (f.dari ? 1 : 0) + (f.sampai ? 1 : 0);
  }

  function renderRiwayat() {
    const f = S.filter;
    $$('#filter-jenis .chip').forEach((b) => b.classList.toggle('aktif', b.dataset.jenis === f.jenis));
    const n = filterAktif();
    const tombol = $('#filter-buka');
    tombol.textContent = n ? 'Filter (' + n + ')' : 'Filter';
    tombol.classList.toggle('aktif', n > 0);

    const semuaKat = Array.from(new Set(S.data.map((t) => t.kategori))).sort((a, b) => a.localeCompare(b, 'id'));
    if (f.kategori && semuaKat.indexOf(f.kategori) < 0) semuaKat.push(f.kategori);
    $('#filter-kategori').innerHTML = '<option value="">Semua kategori</option>' +
      semuaKat.map((k) => '<option value="' + esc(k) + '"' + (k === f.kategori ? ' selected' : '') + '>' + esc(k) + '</option>').join('');
    $('#filter-dari').value = f.dari; $('#filter-sampai').value = f.sampai;
    if ($('#cari').value !== f.cari) $('#cari').value = f.cari;
    renderDaftarRiwayat();
  }

  function renderDaftarRiwayat() {
    const el = $('#riwayat-isi');
    if (sedangMuatAwal()) { el.innerHTML = '<div class="rangka r3"></div><div class="rangka r3"></div><div class="rangka r3"></div>'; return; }
    const f = S.filter;
    const q = f.cari.trim().toLowerCase();
    const qAngka = q.replace(/[^\d]/g, '');
    const hasil = terurut().filter((t) => {
      if (f.jenis !== 'semua' && t.jenis !== f.jenis) return false;
      if (f.kategori && t.kategori !== f.kategori) return false;
      if (f.dari && t.tanggal < f.dari) return false;
      if (f.sampai && t.tanggal > f.sampai) return false;
      if (!q) return true;
      return t.kategori.toLowerCase().indexOf(q) >= 0 || (t.catatan || '').toLowerCase().indexOf(q) >= 0 ||
        (qAngka.length >= 2 && String(Math.round(t.nominal)).indexOf(qAngka) >= 0);
    });

    if (S.data.length === 0) {
      el.innerHTML = '<div class="kosong">' + GAMBAR_KOSONG + '<h3>Riwayat masih kosong</h3><p>Transaksi yang kamu catat akan muncul di sini, yang terbaru di atas.</p>' +
        '<button type="button" class="tombol utama" data-tambah>Tambah transaksi</button></div>';
      return;
    }
    if (hasil.length === 0) {
      el.innerHTML = '<div class="kosong">' + GAMBAR_KOSONG + '<h3>Tidak ada yang cocok</h3><p>Coba kata kunci lain atau longgarkan filternya.</p>' +
        '<button type="button" class="tombol" data-hapus-filter>Hapus semua filter</button></div>';
      return;
    }
    const tunda = idTunda();
    const total = hasil.reduce((s, t) => s + (t.jenis === 'pemasukan' ? t.nominal : -t.nominal), 0);
    const tampil = hasil.slice(0, f.batas);
    let html = '<p class="ringkas-riwayat">' + hasil.length + ' transaksi, selisih ' + rp(total) + '</p>';
    let tgl = null, buka = false;
    const perHari = {};
    hasil.forEach((t) => { perHari[t.tanggal] = (perHari[t.tanggal] || 0) + (t.jenis === 'pemasukan' ? t.nominal : -t.nominal); });
    tampil.forEach((t) => {
      if (t.tanggal !== tgl) {
        if (buka) html += '</div>';
        tgl = t.tanggal; buka = true;
        html += '<div class="tgl-grup"><span>' + esc(tglRamah(tgl)) + '</span><span>' + (perHari[tgl] > 0 ? '+' : '') + rp(perHari[tgl]) + '</span></div><div class="kartu daftar">';
      }
      html += barisTx(t, tunda, false);
    });
    if (buka) html += '</div>';
    if (hasil.length > tampil.length) html += '<button type="button" class="tombol lebih" data-lebih>Tampilkan ' + Math.min(60, hasil.length - tampil.length) + ' lagi</button>';
    el.innerHTML = html;
  }

  /* ---------- render: setelan ---------- */
  function renderSetelan() {
    const d = S.sinkronTerakhir ? new Date(S.sinkronTerakhir) : null;
    const kapan = d ? tglRamah(keISO(d)) + ' pukul ' + pad(d.getHours()) + '.' + pad(d.getMinutes()) : 'Belum pernah';
    const mandiri = window.matchMedia('(display-mode: standalone)').matches;
    const kustom = ['pengeluaran', 'pemasukan'].map((j) => (S.katKustom[j] || []).map((k) =>
      '<span class="chip-hapus">' + esc(k) + '<button type="button" data-buang-kat="' + esc(k) + '" data-j="' + j + '" aria-label="Hapus kategori ' + esc(k) + '"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></span>').join('')).join('');

    let html = '<div class="kartu setelan-grup">' +
      '<div class="setelan-baris"><div><strong>Sinkronisasi</strong><small>Terakhir: ' + esc(kapan) + '</small></div><button type="button" class="tombol" data-sinkron>Sinkronkan</button></div>' +
      (S.antre.length ? '<div class="setelan-baris"><div><strong>' + S.antre.length + ' perubahan menunggu dikirim</strong><small>Tersimpan di HP ini dan dikirim otomatis saat online.</small></div></div>' : '') +
      (S.status === 'galat' ? '<div class="setelan-baris"><div><strong>Perlu dicek</strong><small>' + esc(S.statusPesan) + '</small></div></div>' : '') +
      '<div class="setelan-baris"><div><strong>Koneksi spreadsheet</strong><small>URL dan PIN tersimpan di HP ini</small></div><button type="button" class="tombol" data-ubah-koneksi>Ubah</button></div></div>';

    html += '<h2 class="setelan-judul">Kategori tambahan buatanmu</h2><div class="chips" style="margin-top:10px">' +
      (kustom || '<p style="font-size:13.5px;color:var(--tinta-2)">Belum ada. Buat lewat pilihan “+ Baru” saat mencatat transaksi.</p>') + '</div>';

    html += '<div class="kartu setelan-grup" style="margin-top:22px">';
    if (!mandiri) {
      html += '<div class="setelan-baris"><div><strong>Pasang di layar utama</strong><small>' +
        (S.pasang ? 'Buka Arta seperti aplikasi biasa, tanpa bilah alamat.' : 'Di Chrome, buka menu ⋮ lalu pilih “Tambahkan ke layar utama”.') + '</small></div>' +
        (S.pasang ? '<button type="button" class="tombol" data-pasang>Pasang</button>' : '') + '</div>';
    }
    html += '<div class="setelan-baris"><div><strong>Keluar dari HP ini</strong><small>Menghapus URL, PIN, dan salinan data di HP ini. Spreadsheet tidak berubah.</small></div>' +
      '<button type="button" class="tombol bahaya-garis" data-keluar>Keluar</button></div></div>' +
      '<p class="versi">Arta versi 1.0</p>';
    $('#setelan-isi').innerHTML = html;
  }

  /* ---------- render utama ---------- */
  function render() {
    if (!S.cfg) return;
    aturStatus(S.status, S.statusPesan);
    if (S.hal === 'beranda') renderBeranda();
    else if (S.hal === 'grafik') renderGrafik();
    else if (S.hal === 'riwayat') renderRiwayat();
    else renderSetelan();
  }

  function bukaHal(hal) {
    S.hal = hal;
    $$('.hal').forEach((el) => { el.hidden = el.id !== 'hal-' + hal; });
    $$('.nav-item').forEach((b) => {
      const aktif = b.dataset.hal === hal;
      b.classList.toggle('aktif', aktif);
      if (aktif) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#judul-hal').textContent = JUDUL_HAL[hal];
    renderPeriode();
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- lembar transaksi ---------- */
  function renderJenisForm() {
    $$('#tx-jenis button').forEach((b) => {
      const aktif = b.dataset.jenis === F.jenis;
      b.classList.toggle('aktif', aktif);
      b.setAttribute('aria-pressed', aktif);
    });
  }
  function renderKategoriForm() {
    const el = $('#tx-kategori');
    el.dataset.jenis = F.jenis;
    const daftar = daftarKategori(F.jenis);
    if (F.kategori && daftar.indexOf(F.kategori) < 0) daftar.unshift(F.kategori);
    el.innerHTML = daftar.map((k) =>
      '<button type="button" class="chip' + (k === F.kategori ? ' aktif' : '') + '" data-pilih-kat="' + esc(k) + '" aria-pressed="' + (k === F.kategori) + '">' + esc(k) + '</button>').join('') +
      '<button type="button" class="chip tambah" id="kat-buka">+ Baru</button>';
  }
  function renderTanggalForm() {
    const v = $('#tx-tanggal').value, h = hariIni();
    $$('.baris-tanggal .chip').forEach((b) => b.classList.toggle('aktif', v === geser(h, Number(b.dataset.geser))));
  }
  function galatIsian(id, pesan) {
    const el = $('#' + id);
    el.textContent = pesan || '';
    el.hidden = !pesan;
  }
  function bersihkanGalat() {
    galatIsian('galat-nominal'); galatIsian('galat-kategori'); galatIsian('galat-tanggal');
    $('.nominal').classList.remove('salah');
  }

  function bukaLembar(t) {
    F.mode = t ? 'ubah' : 'tambah';
    F.id = t ? t.id : null;
    F.jenis = t ? t.jenis : 'pengeluaran';
    F.kategori = t ? t.kategori : '';
    F.minus = false;
    $('#lembar-judul').textContent = t ? 'Ubah transaksi' : 'Tambah transaksi';
    $('#tx-simpan').textContent = t ? 'Simpan perubahan' : 'Simpan';
    $('#tx-hapus').hidden = !t;
    $('#tx-nominal').value = t ? fmt.format(Math.round(t.nominal)) : '';
    $('#tx-tanggal').value = t ? t.tanggal : hariIni();
    $('#tx-catatan').value = t ? (t.catatan || '') : '';
    $('#kat-baru').hidden = true; $('#kat-input').value = '';
    bersihkanGalat();
    renderJenisForm(); renderKategoriForm(); renderTanggalForm();
    $('#lembar').hidden = false;
    $('.lembar-gulir').scrollTop = 0;
    try { history.pushState({ lembar: true }, ''); } catch (e) { /* abaikan */ }
    if (!t) $('#tx-nominal').focus();
  }
  function sembunyikanLembar() { $('#lembar').hidden = true; }
  function tutupLembar() {
    if ($('#lembar').hidden) return;
    if (history.state && history.state.lembar) history.back(); // popstate yang menyembunyikan
    else sembunyikanLembar();
  }

  function tambahKategoriBaru() {
    const nama = $('#kat-input').value.trim().replace(/\s+/g, ' ');
    if (!nama) { $('#kat-input').focus(); return; }
    const ada = daftarKategori(F.jenis).find((k) => k.toLowerCase() === nama.toLowerCase());
    if (ada) F.kategori = ada;
    else {
      S.katKustom[F.jenis] = (S.katKustom[F.jenis] || []).concat(nama);
      simpanLokal(KUNCI.kat, S.katKustom);
      F.kategori = nama;
    }
    $('#kat-baru').hidden = true; $('#kat-input').value = '';
    galatIsian('galat-kategori');
    renderKategoriForm();
  }

  const idBaru = () => 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  async function simpanTransaksi() {
    bersihkanGalat();
    const digit = $('#tx-nominal').value.replace(/[^\d]/g, '');
    const nominal = Number(digit);
    const tanggal = $('#tx-tanggal').value;
    let salah = false;
    if (!digit) { galatIsian('galat-nominal', 'Isi nominalnya dulu.'); salah = true; }
    else if (!(nominal > 0)) { galatIsian('galat-nominal', 'Nominal harus lebih dari 0.'); salah = true; }
    if (salah) $('.nominal').classList.add('salah');
    if (!F.kategori) { galatIsian('galat-kategori', 'Pilih satu kategori.'); salah = true; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) { galatIsian('galat-tanggal', 'Pilih tanggal transaksinya.'); salah = true; }
    if (salah) {
      const pertama = $('.galat:not([hidden])', $('#form-tx'));
      if (pertama) pertama.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!digit || !(nominal > 0)) $('#tx-nominal').focus();
      return;
    }
    const mode = F.mode;
    const t = { id: mode === 'ubah' ? F.id : idBaru(), jenis: F.jenis, tanggal: tanggal, nominal: nominal, kategori: F.kategori, catatan: $('#tx-catatan').value.trim() };
    if (mode === 'ubah') {
      const i = S.data.findIndex((x) => x.id === t.id);
      if (i >= 0) S.data[i] = t; else S.data.push(t);
    } else S.data.push(t);
    S.antre.push({ aksi: mode, t: t });
    simpanLokal(KUNCI.data, S.data); simpanLokal(KUNCI.antre, S.antre);
    tutupLembar();
    render();
    toast('Menyimpan…', 'proses');
    await sinkron();
    laporHasil(t.id, mode === 'ubah' ? 'Perubahan tersimpan ke spreadsheet' : 'Tersimpan ke spreadsheet');
  }

  function laporHasil(id, pesanSukses) {
    if (S.ditolak.has(id)) { S.ditolak.delete(id); return; } // toast penolakan sudah tampil
    if (!idTunda().has(id)) toast(pesanSukses, 'sukses');
    else if (S.status === 'offline') toast('Tersimpan di HP. Akan dikirim otomatis saat online.', 'info');
    else toast('Belum masuk ke spreadsheet: ' + S.statusPesan, 'galat');
  }

  async function hapusTransaksi() {
    const t = S.data.find((x) => x.id === F.id);
    if (!t) { tutupLembar(); return; }
    const yakin = await konfirmasi({
      judul: 'Hapus transaksi ini?',
      teks: t.kategori + ', ' + rp(t.nominal) + ' pada ' + tglRamah(t.tanggal).toLowerCase() + '. Barisnya juga dihapus dari spreadsheet dan tidak bisa dikembalikan dari aplikasi.',
      ya: 'Hapus'
    });
    if (!yakin) return;
    S.data = S.data.filter((x) => x.id !== t.id);
    S.antre.push({ aksi: 'hapus', id: t.id });
    simpanLokal(KUNCI.data, S.data); simpanLokal(KUNCI.antre, S.antre);
    tutupLembar();
    render();
    toast('Menghapus…', 'proses');
    await sinkron();
    if (!idTunda().has(t.id)) toast('Transaksi dihapus', 'sukses');
    else if (S.status === 'offline') toast('Dihapus di HP. Spreadsheet menyusul saat online.', 'info');
    else toast('Belum terhapus di spreadsheet: ' + S.statusPesan, 'galat');
  }

  /* ---------- layar hubungkan ---------- */
  function tampilSetup(ubah) {
    $('#utama').hidden = true; $('#setup').hidden = false;
    $('#in-url').value = S.cfg ? S.cfg.url : '';
    $('#in-pin').value = '';
    $('#setup-batal').hidden = !ubah;
    $('#setup-galat').hidden = true;
  }
  function tampilUtama() {
    $('#setup').hidden = true; $('#utama').hidden = false;
    bukaHal(S.hal);
  }

  async function kirimSetup(ev) {
    ev.preventDefault();
    const url = $('#in-url').value.trim();
    const pin = $('#in-pin').value;
    const galat = (p) => { const el = $('#setup-galat'); el.textContent = p; el.hidden = false; };
    if (!/^https:\/\/script\.google\.com\/.+\/exec(\?.*)?$/.test(url)) {
      galat('URL harus berawalan https://script.google.com/ dan berakhiran /exec. Salin dari menu Deploy di Apps Script.'); return;
    }
    if (!pin) { galat('Masukkan PIN yang kamu tulis di Code.gs.'); return; }
    const tombol = $('#setup-tombol');
    tombol.disabled = true; tombol.textContent = 'Menghubungkan…';
    $('#setup-galat').hidden = true;
    try {
      const r = await panggil('muat', null, { url: url, pin: pin });
      S.cfg = { url: url, pin: pin };
      S.data = r.data || []; S.pernahMuat = true; S.perluMuat = false;
      S.sinkronTerakhir = Date.now(); S.status = 'ok';
      simpanLokal(KUNCI.cfg, S.cfg); simpanLokal(KUNCI.data, S.data); simpanLokal(KUNCI.sinkron, S.sinkronTerakhir);
      tampilUtama();
      toast(S.data.length ? 'Terhubung. ' + S.data.length + ' transaksi dimuat.' : 'Terhubung ke spreadsheet');
      sinkron(); // kirim antrean lama kalau ada
    } catch (e) {
      galat(e.jaringan
        ? (navigator.onLine === false ? 'Tidak ada koneksi internet.' : 'URL itu tidak bisa dihubungi. Periksa URL-nya dan pastikan akses deployment diatur ke “Siapa saja”.')
        : e.message);
    }
    tombol.disabled = false; tombol.textContent = 'Hubungkan';
  }

  /* ---------- peristiwa ---------- */
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, [data-tutup]');
    if (!t) return;
    const d = t.dataset;

    if (t.id === 'fab' || 'tambah' in d) { bukaLembar(null); return; }
    if ('tutup' in d) { tutupLembar(); return; }
    if (d.hal) { bukaHal(d.hal); return; }
    if (d.p) {
      S.periode = d.p;
      if (d.p === 'kustom' && !S.kustom.dari) { const h = hariIni(); S.kustom = { dari: h.slice(0, 8) + '01', sampai: h }; }
      renderPeriode(); render(); return;
    }
    if (d.ubah) { const tx = S.data.find((x) => x.id === d.ubah); if (tx) bukaLembar(tx); return; }
    if (d.kat) {
      const r = rentang();
      S.filter = { cari: '', jenis: 'pengeluaran', kategori: d.kat, dari: r.dari, sampai: r.sampai, batas: 60 };
      $('#filter-panel').hidden = false; $('#filter-buka').setAttribute('aria-expanded', 'true');
      bukaHal('riwayat'); return;
    }
    if (d.tren) { S.tren = d.tren; renderGrafik(); return; }

    // riwayat
    if (t.closest('#filter-jenis') && d.jenis) { S.filter.jenis = d.jenis; S.filter.batas = 60; renderRiwayat(); return; }
    if (t.id === 'filter-buka') {
      const p = $('#filter-panel'); p.hidden = !p.hidden; t.setAttribute('aria-expanded', String(!p.hidden)); return;
    }
    if (t.id === 'filter-hapus' || 'hapusFilter' in d) {
      S.filter = { cari: '', jenis: 'semua', kategori: '', dari: '', sampai: '', batas: 60 }; renderRiwayat(); return;
    }
    if ('lebih' in d) { S.filter.batas += 60; renderDaftarRiwayat(); return; }

    // lembar transaksi
    if (t.closest('#tx-jenis') && d.jenis) {
      if (F.jenis !== d.jenis) { F.jenis = d.jenis; F.kategori = ''; }
      renderJenisForm(); renderKategoriForm(); return;
    }
    if (d.pilihKat) { F.kategori = d.pilihKat; galatIsian('galat-kategori'); renderKategoriForm(); return; }
    if (t.id === 'kat-buka') { $('#kat-baru').hidden = false; $('#kat-input').focus(); return; }
    if (t.id === 'kat-tambah') { tambahKategoriBaru(); return; }
    if (d.geser != null && t.closest('.baris-tanggal')) { $('#tx-tanggal').value = geser(hariIni(), Number(d.geser)); galatIsian('galat-tanggal'); renderTanggalForm(); return; }
    if (t.id === 'tx-hapus') { hapusTransaksi(); return; }

    // dialog
    if (t.id === 'dialog-batal') { tutupDialog(false); return; }
    if (t.id === 'dialog-ya') { tutupDialog(true); return; }

    // status & setelan
    if (t.id === 'status' || 'sinkron' in d) { sinkron({ muat: true, berisik: true }); return; }
    if ('ubahKoneksi' in d) { tampilSetup(true); return; }
    if (t.id === 'setup-batal') { tampilUtama(); return; }
    if (d.buangKat) {
      S.katKustom[d.j] = (S.katKustom[d.j] || []).filter((k) => k !== d.buangKat);
      simpanLokal(KUNCI.kat, S.katKustom); renderSetelan(); return;
    }
    if ('pasang' in d && S.pasang) {
      S.pasang.prompt();
      S.pasang.userChoice.then(() => { S.pasang = null; renderSetelan(); });
      return;
    }
    if ('keluar' in d) {
      konfirmasi({
        judul: 'Keluar dari HP ini?',
        teks: (S.antre.length ? S.antre.length + ' perubahan yang belum terkirim akan hilang. ' : '') + 'URL, PIN, dan salinan data di HP ini dihapus. Data di spreadsheet tetap aman.',
        ya: 'Keluar'
      }).then((ya) => {
        if (!ya) return;
        Object.keys(KUNCI).forEach((k) => { try { localStorage.removeItem(KUNCI[k]); } catch (e) { /* abaikan */ } });
        location.reload();
      });
    }
  });

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'tx-nominal') {
      const adaMinus = t.value.indexOf('-') >= 0;
      const digit = t.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 13);
      t.value = digit ? fmt.format(Number(digit)) : '';
      if (adaMinus) F.minus = true; else if (!digit) F.minus = false;
      $('.nominal').classList.remove('salah');
      galatIsian('galat-nominal', F.minus ? 'Tanda minus dihapus karena nominal tidak boleh negatif. Untuk uang keluar, pilih jenis Pengeluaran.' : '');
    } else if (t.id === 'cari') {
      S.filter.cari = t.value; S.filter.batas = 60; renderDaftarRiwayat();
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.k) { S.kustom[t.dataset.k] = t.value; renderPeriode(); render(); }
    else if (t.id === 'filter-kategori') { S.filter.kategori = t.value; S.filter.batas = 60; renderRiwayat(); }
    else if (t.id === 'filter-dari') { S.filter.dari = t.value; renderRiwayat(); }
    else if (t.id === 'filter-sampai') { S.filter.sampai = t.value; renderRiwayat(); }
    else if (t.id === 'tx-tanggal') { galatIsian('galat-tanggal'); renderTanggalForm(); }
  });

  $('#form-tx').addEventListener('submit', (ev) => { ev.preventDefault(); simpanTransaksi(); });
  $('#form-setup').addEventListener('submit', kirimSetup);
  $('#kat-input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); tambahKategoriBaru(); } });

  window.addEventListener('popstate', () => {
    if (!$('#dialog').hidden) tutupDialog(false);
    sembunyikanLembar();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!$('#dialog').hidden) tutupDialog(false);
    else tutupLembar();
  });

  window.addEventListener('online', () => sinkron());
  window.addEventListener('offline', () => { aturStatus('offline'); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !S.cfg) return;
    sinkron({ muat: Date.now() - S.sinkronTerakhir > 2 * 60 * 1000 });
    render(); // tanggal "hari ini" bisa sudah berganti
  });
  setInterval(() => { if (S.cfg && S.antre.length) sinkron(); }, 45000);

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault(); S.pasang = ev;
    if (S.hal === 'setelan' && S.cfg) renderSetelan();
  });
  window.addEventListener('appinstalled', () => { S.pasang = null; toast('Arta terpasang di layar utama'); });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* tetap jalan tanpa mode offline */ }); });
  }

  /* ---------- mulai ---------- */
  if (!S.cfg) tampilSetup(false);
  else {
    S.status = 'sinkron';
    tampilUtama();
    sinkron({ muat: true });
  }
})();
