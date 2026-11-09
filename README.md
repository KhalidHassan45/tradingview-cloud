# tradingview-cloud — TradingView ↔ Composio على السحابة (Coolify)

يشغّل TradingView Desktop على خادمك داخل حاوية واحدة بشاشة افتراضية، ومعه `tradingview-mcp` وبوابة MCP محمية. يتصل Composio بالبوابة على مدار الساعة دون الحاجة إلى جهازك.

```
Composio ──HTTPS──► Coolify (tv-mcp.biggrowth.io → :8787)
                      └─ gateway: رمز + 38 أداة مسموحة
                           └─stdio─► tradingview-mcp ──CDP 127.0.0.1:9222──► TradingView Desktop (Xvfb)
تسجيل الدخول مرة واحدة: noVNC (tv-vnc.biggrowth.io → :6080) ثم يُطفأ
```

## المتطلبات
- خادم Coolify بمعالج **x86_64 (amd64)**، فحزمة TradingView لـ Linux متاحة لهذه المعمارية فقط، وبذاكرة **3 GB** متاحة على الأقل.
- حساب TradingView. **انتبه:** الباقات تحدّ عدد الأجهزة المتصلة في الوقت نفسه، فقد يُخرجك تشغيل الخادم من جلسة أخرى. يُفضّل حساب مخصص للخادم.

## النشر
1. **ارفع المجلد** إلى مستودع GitHub، مثلًا `big-growth/tradingview-cloud`.
2. **أنشئ المورد في Coolify:** New Resource ← Docker Compose ← المستودع.
3. **ضع المتغيرات (Is Literal):**
   ```
   GATEWAY_TOKEN = $(openssl rand -hex 24)
   VNC_PASSWORD  = $(openssl rand -hex 6)
   ENABLE_VNC    = 1
   ```
4. **اضبط الدومينات:**
   - `https://tv-mcp.biggrowth.io` على المنفذ 8787.
   - `https://tv-vnc.biggrowth.io` على المنفذ 6080.
5. **انشر (Deploy).** البناء الأول يستغرق 3 إلى 5 دقائق.

## تسجيل الدخول (مرة واحدة)
1. افتح `https://tv-vnc.biggrowth.io/vnc.html`، ثم اضغط Connect وأدخل `VNC_PASSWORD`.
2. ستظهر نافذة TradingView: سجّل الدخول وفعّل "Remember me".
3. **بعد الدخول مباشرة:** اضبط `ENABLE_VNC=0`، واحذف دومين `tv-vnc`، ثم أعد النشر. تبقى الجلسة محفوظة في الـ volume المسمّى `tv-profile`.

## الربط مع Composio
1. افتح [Custom MCP في Composio](https://dashboard.composio.dev/~/org/connect/apps?add-custom-mcp=true) وأضف خادمًا:
   - **الاسم:** `tradingview-cloud`
   - **النوع:** HTTP (Streamable)
   - **الرابط:** `https://tv-mcp.biggrowth.io/mcp/<GATEWAY_TOKEN>`، أو `https://tv-mcp.biggrowth.io/mcp` مع ترويسة `Authorization: Bearer ***`
2. **تحقق:** يجب أن يعيد `tv_health_check` القيمة `cdp_connected: true`، ثم جرّب `quote_get` مع `BINANCE:BTCUSDT`.

## الأمان
- منفذ CDP 9222 يستمع داخل الحاوية على `127.0.0.1` فقط، ولا يُنشر للخارج.
- أدوات `ui_*` (تنفيذ JavaScript والنقر والكتابة) و`batch_run` و`tv_update` و`tv_launch` **لا تمر أبدًا** عبر البوابة.
- يمكن إضافة أدوات أخرى عند الحاجة عبر `TVGW_ALLOW`، مثل `alert_create` و`watchlist_add` و`pine_set_source`.
- noVNC يتحكم بالشاشة كاملة، لذا أطفئه بعد تسجيل الدخول. إن تسرّب `GATEWAY_TOKEN` فغيّره وأعد النشر.
- `tradingview-mcp` مثبّت على commit محدد (`TV_MCP_COMMIT` في Dockerfile). لا تحدّثه دون مراجعة التغييرات.

## الصيانة
| الحالة | الإجراء |
|---|---|
| `cdp_connected: false` | سجلات Coolify: هل يعمل برنامج `tradingview`؟ يعيد supervisord تشغيله آليًا |
| خرجت الجلسة (logout) | فعّل `ENABLE_VNC=1` مؤقتًا وسجّل الدخول مجددًا |
| تحديث TradingView | Redeploy مع "No cache"، فيسحب آخر نسخة من مستودع apt الرسمي |
| استهلاك الذاكرة | Electron يحتاج 1.5 إلى 2.5 GB، والحد في compose هو 3g |

## تنبيه
- الأداة غير رسمية، وأتمتة تطبيق TradingView على خادم قد تخالف شروط استخدامه، وقد يُقيَّد حسابك. القرار والمسؤولية لك.
- البيانات هي ما تعرضه باقتك في التطبيق. وهي بيانات للعرض، وليست نصيحة استثمارية.
