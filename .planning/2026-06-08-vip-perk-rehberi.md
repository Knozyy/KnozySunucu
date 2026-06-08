# VIP Perk Rehberi — FTB Ranks tabanlı kademeli VIP

**Tarih:** 2026-06-08
**Durum:** ✅ Tasarım onaylandı (kademeli: VIP / VIP+ / MVP · "dengeli" duruş, /fly–/heal yok).
**İzin sistemi:** FTB Ranks (`config/ftbranks/ranks.snbt`). FTB Essentials + FTB Chunks düğümleri kullanılır.
**Doğrulama:** Tüm düğüm isimleri resmi FTB dokümanlarından teyit edildi (bkz. kaynaklar, en altta).

> **Mantık — iki katman:**
> 1. **Sunucuda (bir kez):** Her kademe `ranks.snbt`'de bir rütbe olarak tanımlanır; tüm perkler rütbenin içinde durur.
> 2. **Panelde (her oyuncu):** VIP paketi sadece `ftbranks add/remove {nick} <rütbe>` çalıştırır. Perk eklemek/çıkarmak = `ranks.snbt`'yi düzenlemek (panele dokunmadan).

---

## Onaylanan perk dağılımı

| Perk | VIP | VIP+ | MVP | Düğüm (node) |
|------|:---:|:---:|:---:|------|
| Renkli isim / prefix | `&b[VIP]` | `&a[VIP+]` | `&6[MVP]` | `ftbranks.name_format` |
| Home sayısı | 10 | 20 | 35 | `ftbessentials.home.max` |
| Home bekleme (cooldown) | 30 | 10 | 0 | `ftbessentials.home.cooldown` |
| `/back` | ✓ | ✓ | ✓ | `command.back` |
| `/rtp` (rastgele ışınla) | — | ✓ | ✓ | `command.rtp` |
| `/enderchest` | — | — | ✓ | `command.enderchest` |
| Claim chunk (mutlak toplam) | 750 | 1200 | 2000 | `ftbchunks.max_claimed` |
| Force-load chunk (mutlak) | 80 | 120 | 200 | `ftbchunks.max_force_loaded` |
| Discord rolü (verince) | VIP rolü | VIP+ rolü | MVP rolü | *(panelde paket başına seçilir)* |
| Duyuru (verince, 1 kez) | ✓ | ✓ | ✓ | *(panel `say` komutu)* |

> **Çıkarılan perkler (bilerek):** `/tpa`, günlük kit, `/heal` `/feed`, `/fly`. Daha adil bir VIP için dışarıda bırakıldı. İleride istenirse aynı yöntemle eklenir.

---

## Adım 1 — `ranks.snbt`'ye 3 rütbe ekle (sunucuda, bir kez)

Dosya: **`config/ftbranks/ranks.snbt`**
Mevcut `ranks: { ... }` bloğunun **içine**, varsayılan rütbenin (genelde `player`/`member`) **yanına** aşağıdaki üç bloğu ekle:

```snbt
	vip: {
		name: "VIP"
		power: 50
		"ftbranks.name_format": "&b[VIP] {name}&r"
		"ftbessentials.home.max": 10
		"ftbessentials.home.cooldown": 30
		"command.back": true
		"ftbchunks.max_claimed": 750
		"ftbchunks.max_force_loaded": 80
	}

	vip_plus: {
		name: "VIP+"
		power: 60
		"ftbranks.name_format": "&a[VIP+] {name}&r"
		"ftbessentials.home.max": 20
		"ftbessentials.home.cooldown": 10
		"command.back": true
		"command.rtp": true
		"ftbchunks.max_claimed": 1200
		"ftbchunks.max_force_loaded": 120
	}

	mvp: {
		name: "MVP"
		power: 70
		"ftbranks.name_format": "&6[MVP] {name}&r"
		"ftbessentials.home.max": 35
		"ftbessentials.home.cooldown": 0
		"command.back": true
		"command.rtp": true
		"command.enderchest": true
		"ftbchunks.max_claimed": 2000
		"ftbchunks.max_force_loaded": 200
	}
```

**Önemli kurallar:**
- **`condition` YOK** → bu rütbeler kendiliğinden atanmaz, sadece `ftbranks add` ile (yani panelden) verilir. Doğru olan bu.
- **Vermediğin komutu hiç yazma** (örn. VIP'te `/rtp`). `false` YAZMA — `false` açıkça *yasaklar* ve varsayılan rütbenin herkese verdiği bir komutu VIP'ten geri alabilir.
- **`power`** çakışmayı çözer: bir oyuncuda iki rütbe varsa yüksek power kazanır (MVP 70 > VIP+ 60 > VIP 50).
- **Üst kademe alttakini kapsar** — her blok kendi içinde tam (FTB Ranks'te grup mirası yok, o yüzden perkleri her rütbede tekrar yazdık).

Düzenledikten sonra konsolda (veya panel terminalinde):
```
ftbranks reload
```
Ardından **logda sözdizimi hatası var mı** bak — hata olursa FTB Ranks eski yapıyı korur, yeni rütbeler görünmez.

> ⚠️ **Sürüm notu (snbt yapısı):** Yukarıdaki biçim güncel FTB Ranks'e göredir (düğümler doğrudan rütbenin içinde). Senin sürümünde düğümler `permissions: { ... }` bloğunun içine veya bir liste hâlinde yazılıyorsa, **mevcut varsayılan rütbenin yapısını kopyala**, sadece değerleri değiştir. Her zaman dosyandaki çalışan örneği referans al.

---

## Adım 2 — Panelde 3 VIP paketi oluştur

Panel → **VIP** sayfası → **Paketler** → **Paket Ekle**. Her kademe için:

| Paket adı | Renk | Süre (gün) | Discord sunucusu/rolü | grant komutları | revoke komutları |
|-----------|------|:---:|---|---|---|
| **VIP** | `#3498db` | 30 | (seç → VIP rolü) | `ftbranks add {nick} vip`<br>`say {nick} sunucuya VIP olarak katildi! Hayirli olsun.` | `ftbranks remove {nick} vip` |
| **VIP+** | `#2ecc71` | 30 | (seç → VIP+ rolü) | `ftbranks add {nick} vip_plus`<br>`say {nick} artik VIP+ oldu!` | `ftbranks remove {nick} vip_plus` |
| **MVP** | `#f1c40f` | 30 | (seç → MVP rolü) | `ftbranks add {nick} mvp`<br>`say {nick} artik MVP oldu!` | `ftbranks remove {nick} mvp` |

**İpuçları:**
- Paket editöründeki **"Hazır perk ekle"** kataloğundan **"FTB Ranks rütbesi"**ni seçip rütbe adını (`vip` / `vip_plus` / `mvp`) yazarsan, `grant`/`revoke` komutları **otomatik** üretilir. Duyuru için ayrıca **"Duyuru mesajı"** perkini ekleyebilirsin.
- Panel komutları konsola gider → **başına `/` koyma** (mevcut katalog da koymuyor).
- `{nick}` panel tarafından oyuncunun MC nick'iyle değiştirilir. `{discord}` de kullanılabilir.
- **`say` renksizdir** — vanilla `say` `&b` gibi renk kodlarını işlemez (düz metin gösterir). Renkli duyuru istersen `say` yerine şunu kullan:
  `tellraw @a {"text":"{nick} artik VIP oldu!","color":"aqua","bold":true}`

---

## Adım 3 — Test & doğrulama

1. `ftbranks reload` → log temiz mi?
2. Kendine test ver: panelden bir test oyuncusuna VIP ver **veya** konsolda `ftbranks add <nick> vip`.
3. Oyunda doğrula:
   - Chat'te isim `[VIP]` renkli mi?
   - `/sethome` ile 1'den fazla home kurulabiliyor mu (limit 10)?
   - `/back` çalışıyor mu? (VIP+ için `/rtp`, MVP için `/enderchest`)
   - FTB Chunks'ta claim limiti arttı mı? (`/ftbchunks` arayüzünde görünür)
4. Geri alma: `ftbranks remove <nick> vip` → perkler kalkmalı.
5. Süre testi: panelde kısa süre (örn. 1 gün) verip `vip_grants` süresi dolunca otomatik `ftbranks remove` çalışıyor mu kontrol et (panelde her dakika kontrol var).

---

## Notlar & ayar payı

- **Claim sayıları mutlaktır**, "+X" değil. `serverconfig/ftbchunks-server.snbt` içindeki **varsayılan** `max_claimed` / `max_force_loaded` değerine bak; rütbe değerlerini onların **üstünde** ver (aksi halde VIP daha az claim alır). Yukarıdaki 750/1200/2000 örnektir — kendi varsayılanına göre ayarla.
- **Home cooldown birimi** sürüme göre saniye veya tik olabilir. `/home` art arda deneyip bekleme süresini gözle doğrula; gerekirse değeri ayarla. `0` = beklemesiz.
- **`/fly` istersen** (örn. sadece MVP'ye, daha güçlü VIP için): `mvp` bloğuna `"command.fly": true` ekle. FTB Essentials `/fly` **global**'dir (sadece claim içinde uçuş yok — o ekstra mod ister).
- **Günlük kit istersen:** Oyun içinde `/kit create vipdaily` (envanterinden kit oluşturur) → cooldown ayarla → ilgili rütbeye `"ftbessentials.give_me_kit.vipdaily": true` ekle → oyuncu `/kit vipdaily` ile alır.
- **Upgrade/downgrade:** Oyuncuyu üst kademeye alırken alt kademeyi geri al (panelde eski VIP'i "Geri Al", sonra MVP ver). İki rütbe birden kalırsa power sayesinde üst kazanır ama temizlik için alttakini kaldır.

---

## Kaynaklar (doğrulama)

- FTB Ranks — Configuration (ranks.snbt biçimi, name_format, power, condition): https://docs.feed-the-beast.com/mod-docs/mods/suite/Ranks/Configuration/
- FTB Essentials — Ranks Integration (`command.<ad>` düğüm formatı, `ftbessentials.home.max`, `home.cooldown`, `give_me_kit`): https://docs.feed-the-beast.com/mod-docs/mods/suite/Essentials/Ranks_Integration/
- FTB Essentials — Commands (`/back`, `/rtp`, `/enderchest`, `/home` vb.): https://docs.feed-the-beast.com/mod-docs/mods/suite/Essentials/Commands/
- FTB Chunks — `ftbchunks.max_claimed`, `ftbchunks.max_force_loaded`: https://wiki.enigmatica.net/enigmatica6/administration/ftb-chunks-claims-and-chunkloading
