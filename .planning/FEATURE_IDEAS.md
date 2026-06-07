# Özellik Fikirleri (Backlog / Beyin Fırtınası)

**Tarih:** 2026-06-07
**Durum:** ⚠️ Fikir listesi — **HİÇBİRİ henüz yapılmadı / planlanmadı.** Takım görünürlüğü için kayıt.
**Not:** Hepsi mevcut altyapıya oturacak şekilde seçildi. ⭐ = yüksek değer / düşük maliyet.
Efor: **S** (saatler) · **M** (~gün) · **L** (çoklu oturum).

> Uygulamaya alınacaklar buradan seçilip ayrı spec → plan akışından geçirilecek (kod yazılmadan önce tasarım onayı).

---

## 👥 Oyuncu & Topluluk

| # | Özellik | Açıklama | Efor | Dayandığı altyapı |
|---|---------|----------|------|-------------------|
| 1 | ⭐ **Oyuncu 360 Profili** | Oyuncuya tıkla → oynama süresi grafiği, oturum geçmişi, ban/kick/not geçmişi, son görülme, **envanter/ender chest görüntüleyici** (playerdata NBT), alt-hesap (aynı IP) tespiti | M | player_sessions, player_notes, ban_log |
| 2 | ⭐ **Ban / Tempban / Kick / Mute Yöneticisi** | Tam UI: sebep, süre, toplu işlem, geçmiş, Discord bildirimi, "appeal" notu. Konsol komutlarıyla uygular | M | ban_log tablosu |
| 3 | **Discord ↔ MC Chat Köprüsü + Moderasyon** | İki yönlü chat relay, küfür/spam filtresi, aranabilir chat logu, kelime-yakalama uyarısı | M | discordBotService |
| 4 | ⭐ **Oynama Süresi Leaderboard + Otomatik Ödül** | En aktif oyuncular tablosu; eşikte otomatik whitelist/rol/rütbe | S–M | timed-whitelist |
| 5 | **LagGuard Faz 4 — Ceza Önerisi (shadow + manuel onay)** | Atıf verisinden lag yapan claim sahibi → kick/kısıtlama ÖNERİR, admin onaylar, Discord DM. Zaten tasarlandı (LAGGUARD_CHECKPOINT) | L | lag_attribution, notificationService |
| 6 | **Hoş Geldin / İlk Giriş Otomasyonu** | Yeni oyuncuya otomatik kit/komut/mesaj, "first join" tespiti, davet/referans takibi | S | automation |
| 7 | **Oyuncu Bildirimleri** | Belirli oyuncu girince/çıkınca push/Discord bildirimi; "VIP geldi" / "şüpheli alt-hesap" uyarısı | S | push, websocket events |

## 🧩 Mod & İçerik

| # | Özellik | Açıklama | Efor | Dayandığı altyapı |
|---|---------|----------|------|-------------------|
| 8 | ⭐ **Mod Güncelleme Denetleyici + Changelog** | CurseForge/Modrinth güncelleme kontrolü, changelog, **tek-tık güncelle (önce yedek)**, sürüm-kilidi/uyumluluk uyarısı | M | curseforgeService, ftbService |
| 9 | ⭐ **Mod Çakışma / Bağımlılık Analizörü** | mods tara: eksik bağımlılık, çift mod, **client-only modun sunucuda** olması, MC/loader uyuşmazlığı | M | mods dizini |
| 10 | **Config Snapshot & Rollback** | Config + mod durumu anlık görüntüsü, diff, geri al (config için "git") | M | configParser, restart-config kuyruğu |
| 11 | ⭐ **Akıllı Yedek (zamanlı + artımlı + off-site + restore önizleme)** | Cron zamanlama, artımlı (hardlink/rsync), retention, **S3/B2/rclone off-site**, tek-tık restore + önizleme, restart-öncesi otomatik yedek | M–L | backup |
| 12 | **Crash Oto-Teşhis** | crash-report parse → **suçlu modu belirle**, çözüm öner, stacktrace özetiyle Discord uyarısı | M | crash_events |
| 13 | **Modpack Profil Değiştirici** | Sunucu başına çoklu modpack profili, yedekle + tek-tık geçiş, zamanlı geçiş | M | çoklu-instance altyapısı |
| 14 | **Datapack / Plugin Yöneticisi** | Vanilla datapack, Paper plugin kur/yönet | M | mod yöneticisi deseni |

## 🛡️ Performans & Dünya

| # | Özellik | Açıklama | Efor | Dayandığı altyapı |
|---|---------|----------|------|-------------------|
| 15 | **Zamanlı Lag-Temizlik (entity sweep)** | Uyarılı `/kill @e[type=item]` tarzı temizlik, boyut-bazlı | S | automation, lagGuard |
| 16 | **Dünya Pre-gen + Worldborder Yöneticisi** | Chunky ile chunk ön-üretimi (ilerleme), worldborder ayarı → runtime lag azalır | M | minecraftService komut |
| 17 | **Atıf Trendleri** | Observable atıf taramalarını sakla; "kim/ne sürekli lag yapıyor" gün-bazlı trend, tekrar eden suçluyu işaretle | M | lag_attribution |
| 18 | **Otomatik Lag-Restart** | RAM>X veya TPS<Y sürekli ise uyarılı graceful restart | S | lagGuard + automation |

## 🔐 Güvenlik & Yönetim

| # | Özellik | Açıklama | Efor | Dayandığı altyapı |
|---|---------|----------|------|-------------------|
| 19 | ⭐ **Alert Kural Motoru** | Eşik tanımla (TPS<X N dk, RAM/disk %, crash, oyuncu sayısı) → Discord/webhook/push. Merkezi uyarı | M | notificationService, webhookService, push |
| 20 | **Public Durum Sayfası** | Salt-okunur paylaşılabilir: online/offline, oyuncu sayısı, MOTD, planlı bakım | S–M | health, status-all |
| 21 | **2FA / TOTP** | Panel admin girişine TOTP | S | auth/JWT |
| 22 | **Audit Görüntüleyici + Hassas Eylem Uyarısı** | Aranabilir audit UI, kullanıcı-bazlı aktivite, kritik eylemde uyarı | S | audit tablosu |
| 23 | **RCON Desteği** | screen/log-scraping yerine komut+yanıt için RCON (TPS/atıf komutları kesin yanıt) | M | minecraftService |

## ✨ UX

| # | Özellik | Açıklama | Efor | Dayandığı altyapı |
|---|---------|----------|------|-------------------|
| 24 | **Dosya Editörü: Sözdizimi + Doğrulama + Çoklu-arama** | TOML/JSON/YAML renklendirme + kaydetmeden doğrulama, configler arası ara-değiştir | S–M | CodeMirror (mevcut dep), files |

---

## İlk hamle için önerilen (yüksek değer/maliyet)
**#1** Oyuncu 360 Profili · **#2** Ban Yöneticisi · **#8** Mod Güncelleme Denetleyici · **#11** Akıllı Yedek · **#19** Alert Motoru

## Notlar
- Hiçbiri bir zaman çizelgesine bağlı değil; öncelik birlikte belirlenecek.
- Seçilen özellik: ayrı tasarım dökümanı (spec) → uygulama planı → kod akışından geçecek.
