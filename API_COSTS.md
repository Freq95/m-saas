# Costuri API-uri pentru Integrare

## 1. Gmail API (Google)

### Costuri:
- ✅ **GRATUIT** pentru utilizare personală și business
- ✅ **1 miliard de request-uri/zi** - quota gratuit
- ✅ **250 quota units per user per second** - rate limit gratuit

### Limitări:
- Necesită autentificare OAuth 2.0
- Rate limits pentru requests prea multe
- Necesită Google Cloud Project (gratuit)

### Ce include:
- Citire mesaje inbox
- Trimitere mesaje
- Push notifications pentru mesaje noi
- Gestionare labels/folders

**Concluzie: Complet gratuit pentru utilizare normală**

---

## 2. Yahoo Mail API

### Costuri:
- ⚠️ **Nu există API oficial public** pentru Yahoo Mail
- Alternativa: **IMAP** (gratuit, dar mai complex)
- Sau servicii terțe (costuri variabile)

### Opțiuni:
1. **IMAP** - Gratuit, dar necesită configurare manuală
2. **Servicii terțe** (Zapier, Make.com) - ~$20-50/lună
3. **Email forwarding** - Gratuit, dar limitat

**Concluzie: Yahoo nu oferă API direct, dar IMAP e gratuit**

---

## 3. Meta (Facebook) Messenger API

### Costuri:
- ✅ **GRATUIT** pentru mesaje standard
- ✅ **Fără limită** pentru mesaje normale
- ⚠️ **Costuri doar pentru mesaje promovate/announcements**

### Limitări:
- Rate limits: **200 requests/second** per app
- Necesită verificare aplicație (gratuit)
- Necesită Facebook Page (gratuit)

### Ce include:
- Recepționare mesaje de la utilizatori
- Trimitere mesaje către utilizatori
- Webhooks pentru evenimente
- Gestionare conversații

### Costuri suplimentare:
- **Mesaje promovate**: ~$0.01-0.10 per mesaj (doar dacă vrei să promovezi)
- **Announcements**: ~$0.01-0.05 per mesaj (doar pentru broadcast)

**Concluzie: Complet gratuit pentru mesaje normale cu clienții**

---

## 4. Instagram Messages (Meta)

### Costuri:
- ✅ **GRATUIT** - același API ca Facebook Messenger
- ✅ **Fără costuri** pentru mesaje normale
- ⚠️ **Doar pentru Business/Creator accounts**

**Concluzie: Gratuit, dar necesită cont business**

---

## Rezumat Costuri

| Serviciu | Cost | Limitări |
|----------|------|----------|
| **Gmail API** | ✅ GRATUIT | Rate limits (foarte mari) |
| **Yahoo Mail** | ⚠️ Fără API direct | IMAP gratuit (alternativă) |
| **Facebook Messenger** | ✅ GRATUIT | Rate limits (200 req/sec) |
| **Instagram Messages** | ✅ GRATUIT | Doar conturi business |

## Recomandare

**Pentru MVP:**
- ✅ Gmail API - complet gratuit
- ✅ Facebook Messenger - complet gratuit
- ⚠️ Yahoo - folosește IMAP (gratuit) sau skip pentru MVP

**Cost total estimat: $0/lună** pentru utilizare normală

**Notă:** Costurile apar doar dacă:
- Vrei să trimiți mesaje promovate (Facebook)
- Folosești servicii terțe (Zapier, etc.)
- Ai nevoie de volume foarte mari (peste 1 miliard requests/zi pentru Gmail)

