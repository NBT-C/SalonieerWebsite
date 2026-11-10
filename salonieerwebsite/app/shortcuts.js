/* Salon-scoped launch shortcuts. Never carries customer/admin credentials. */
(function () {
  "use strict";
  let manifestURL = null, revision = 0;
  const current = () => window.Platform?.current();
  const nativeIOS = () => NativeBridge.available() && document.documentElement.dataset.native === "ios";
  const info = () => {
    const salon = current();
    if (!salon) return null;
    return { slug: String(salon.slug || ""), launch_code: String(salon.access_code || salon.slug || ""),
      name: String(App.settings?.app_name || salon.name).slice(0,80),
      logo: App.settings?.logo_url || salon.logo_url || window.UI?.logoSrc() || "", color: SalonTheme.normalize(App.settings || {}).primary_color };
  };
  async function icon(data, size = 192) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const reset = () => {
      canvas.width = canvas.height = size;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(size/192,size/192);
    };
    reset();
    ctx.fillStyle = data.color; ctx.fillRect(0,0,192,192);
    ctx.fillStyle = SalonTheme.ink(data.color); ctx.font = "600 96px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(data.name[0] || "S",96,101);
    if (data.logo) {
      try {
        const image = new Image(); image.crossOrigin = "anonymous"; image.referrerPolicy = "no-referrer";
        await new Promise((resolve,reject) => {
          const timer=setTimeout(()=>reject(new Error("logo timeout")),3500);
          image.onload=()=>{clearTimeout(timer);resolve();};
          image.onerror=()=>{clearTimeout(timer);reject(new Error("logo unavailable"));};
          image.src=data.logo;
        });
        reset();
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,192,192);
        const scale = Math.min(160 / Math.max(1,image.width), 160 / Math.max(1,image.height));
        const width = image.width * scale, height = image.height * scale;
        ctx.drawImage(image,(192-width)/2,(192-height)/2,width,height);
        return canvas.toDataURL("image/png");
      } catch { /* A generated salon initial is the offline/CORS fallback. */ }
    }
    reset(); ctx.fillStyle=data.color;ctx.fillRect(0,0,192,192);ctx.fillStyle=SalonTheme.ink(data.color);
    ctx.font="600 96px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(data.name[0]||"S",96,101);
    return canvas.toDataURL("image/png");
  }

  function iosShortcutList(data) {
    if (!window.Platform?.saved) return [{slug:data.slug,launch_code:data.launch_code||data.slug,name:data.name}];
    const all = Platform.saved();
    const out = [{slug:data.slug,launch_code:data.launch_code||data.slug,name:data.name}];
    for (const salon of all) {
      if (!salon?.slug || salon.slug === data.slug) continue;
      out.push({slug:String(salon.slug),launch_code:String(salon.access_code||salon.slug),name:String(salon.name || salon.slug).slice(0,80)});
      if (out.length >= 4) break;
    }
    return out;
  }

  async function syncNative() {
    const data=info();
    if (!data || !nativeIOS()) return false;
    try {
      await NativeBridge.request("shortcutSync", {salons:iosShortcutList(data)});
      return true;
    } catch { return false; }
  }

  async function configure() {
    const data=info(); if(!data)return;
    if (NativeBridge.available()) {
      // iOS Home Screen Quick Actions can be registered without making the user
      // build anything in the Shortcuts app. Keep up to four saved salons ready.
      if (nativeIOS()) await syncNative();
      return;
    }
    const version=++revision;
    const [image,image512]=await Promise.all([icon(data),icon(data,512)]); if(version!==revision)return;
    const base=new URL("./",location.href), start=new URL("index.html",base);start.searchParams.set("salon",data.slug);
    const manifest={id:start.href,name:data.name,short_name:data.name.slice(0,24),lang:"ar",dir:"rtl",start_url:start.href,scope:base.href,display:"standalone",background_color:getComputedStyle(document.documentElement).getPropertyValue("--surface-chrome").trim()||"#faf8f3",theme_color:data.color,
      icons:[{src:image,sizes:"192x192",type:"image/png",purpose:"any"},{src:image512,sizes:"512x512",type:"image/png",purpose:"any"}]};
    const link=document.querySelector('link[rel="manifest"]');if(!link)return;
    if(manifestURL)URL.revokeObjectURL(manifestURL);
    manifestURL=URL.createObjectURL(new Blob([JSON.stringify(manifest)],{type:"application/manifest+json"}));link.href=manifestURL;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content",data.name);
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute("href",data.logo || image);
  }

  function iosSeparateIcon(data) {
    const link="salonieer://salon/"+data.slug;
    UI.modal(`<div class="mhead"><h2>أيقونة مستقلة لـ ${UI.esc(data.name)}</h2><button class="iconbtn" id="shortcut-close" aria-label="إغلاق">×</button></div><div class="mform"><p>هذه الطريقة اختيارية فقط إذا أردت أيقونة مستقلة للعمل. سيقوم METON بنسخ الرابط وفتح محرر اختصار جديد مباشرة.</p><ol class="shortcut-steps"><li>اضغط الزر أدناه.</li><li>في تطبيق «الاختصارات» أضف إجراء «فتح عناوين URL» والصق الرابط.</li><li>من تفاصيل الاختصار اختر «إضافة إلى الشاشة الرئيسية».</li></ol><button class="btn" id="shortcut-create">نسخ الرابط وفتح اختصار جديد</button><button class="btn line" id="shortcut-logo">مشاركة شعار العمل</button></div>`);
    document.getElementById("shortcut-close").onclick=UI.closeModal;
    const run=async(method,payload)=>{try{await NativeBridge.request(method,payload);return true;}catch(error){UI.toast(error.message,"err");return false;}};
    document.getElementById("shortcut-create").onclick=async()=>{
      if(!await run("copy",link))return;
      UI.toast("تم نسخ رابط العمل","ok");
      await run("openShortcuts","");
    };
    document.getElementById("shortcut-logo").onclick=async()=>run("shareSalonLogo",{logo:data.logo||"",name:data.name});
  }

  async function install() {
    const data=info();if(!data)return;
    if(NativeBridge.available() && document.documentElement.dataset.native === "android") {
      const button=document.getElementById("install-app");
      if(button)button.disabled=true;
      UI.toast("جاري إضافة اختصار العمل…", "ok");
      try {
        // A compact PNG is always included. Android first tries the original
        // logo URL, then this browser-rendered copy, then its per-salon cache.
        const generated=await icon(data,192);
        const response=await NativeBridge.request("shortcut",{
          slug:data.slug,
          launch_code:data.launch_code || data.slug,
          name:data.name,
          color:data.color,
          logo:/^data:/i.test(data.logo||"")&&(data.logo||"").length>400000?"":(data.logo||""),
          icon:generated
        });
        if(response === "requested") UI.toast("أكّد إضافة الاختصار من نافذة الشاشة الرئيسية.", "ok");
        else if(response === "quick_action") UI.toast("تمت إضافته للوصول السريع. اضغط مطولاً على أيقونة METON للوصول إليه.", "ok");
        else UI.toast("تم تحديث اختصار العمل", "ok");
      } catch(error){
        UI.toast(error?.message || "تعذّر إضافة اختصار العمل", "err");
      } finally {
        if(button)button.disabled=false;
      }
      return;
    }
    if(nativeIOS()) {
      try {
        await NativeBridge.request("shortcut",{slug:data.slug,launch_code:data.launch_code||data.slug,name:data.name});
        await syncNative();
        UI.modal(`<div class="mhead"><h2>تم إنشاء الاختصار</h2><button class="iconbtn" id="shortcut-close" aria-label="إغلاق">×</button></div><div class="mform"><div class="shortcut-success">${UI.icon("check",22)}<div><b>${UI.esc(data.name)} جاهز الآن.</b><p>تم حفظه تلقائياً في وصول Apple السريع وShortcuts وSiri وSpotlight. الضغط المطوّل على أيقونة <b>METON</b> يفتح العمل مباشرة.</p></div></div><button class="btn" id="shortcut-done">تم</button><button class="btn line" id="shortcut-separate">أريد أيقونة مستقلة للعمل</button></div>`);
        document.getElementById("shortcut-close").onclick=UI.closeModal;
        document.getElementById("shortcut-done").onclick=UI.closeModal;
        document.getElementById("shortcut-separate").onclick=()=>iosSeparateIcon(data);
      } catch(error){UI.toast(error.message,"err");}
      return;
    }
    // Keep the salon in the Safari bookmark URL as well as the PWA start URL.
    const address=new URL(location.href);address.searchParams.set("salon",data.slug);
    history.replaceState(null,"",address.pathname+address.search+address.hash);
    if(window.Enhance)await Enhance.install();
  }
  window.SalonShortcut={configure,install,info,syncNative};
})();
