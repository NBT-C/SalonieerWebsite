/* Local photo preview/crop. Large phone photos are resized on-device before storage. */

// WKWebView on iOS can occasionally report a transient image error while the
// network process is waking up, after foregrounding, or while a large image is
// being decoded. Treating that first error as permanent made salon logos and
// photos randomly disappear even though the URL/data in Supabase was correct.
// This small reliability layer retries only remote HTTP(S) images on the native
// iOS host, then lets the app's existing fallback run if the source is truly bad.
window.ImageReliability = (() => {
  const states = new WeakMap();
  const retryDelays = [220, 700, 1600];
  const isIOS = () => document.documentElement.dataset.native === 'ios' || window.SALONIEER_NATIVE_PLATFORM === 'ios';
  const isRemote = src => /^https?:\/\//i.test(String(src || '').trim());

  function state(img) {
    let s = states.get(img);
    if (!s) {
      const src = String(img.getAttribute('src') || img.currentSrc || img.src || '').trim();
      s = { original: isRemote(src) ? src : '', attempt: 0, pending: false, disabled: false, objectURL: '' };
      states.set(img, s);
    }
    if (!s.original) {
      const src = String(img.getAttribute('src') || img.currentSrc || img.src || '').trim();
      if (isRemote(src)) s.original = src;
    }
    return s;
  }

  function prepare(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const s = state(img);
    if (!isIOS()) return;
    // WebKit's asynchronous image decoder is the part most often left blank
    // after a fast DOM repaint. `auto` lets WebKit choose a synchronous decode
    // for small logos while still decoding large gallery photos efficiently.
    try { img.decoding = 'auto'; } catch {}
    if (img.classList.contains('brand-logo') || img.classList.contains('platform-salon-logo')) {
      try { img.loading = 'eager'; } catch {}
      try { img.fetchPriority = 'high'; } catch {}
    }
    if (s.original && !img.dataset.reliableSrc) img.dataset.reliableSrc = s.original;
  }

  function assignOriginal(img, s) {
    if (!img.isConnected || s.disabled) { s.pending = false; return; }
    // Clearing src first forces WKWebView to schedule a new image load instead
    // of keeping the failed decoder state attached to the element.
    try { img.removeAttribute('src'); } catch {}
    const apply = () => {
      if (!img.isConnected || s.disabled) { s.pending = false; return; }
      img.src = s.original;
      s.pending = false;
    };
    if (window.requestAnimationFrame) requestAnimationFrame(apply); else setTimeout(apply, 0);
  }

  async function reloadThroughFetch(img, s) {
    if (!window.fetch || !window.URL || !URL.createObjectURL) return false;
    try {
      const response = await fetch(s.original, { cache: 'reload', mode: 'cors', credentials: 'same-origin' });
      if (!response.ok) return false;
      const blob = await response.blob();
      if (!blob || !blob.size || !/^image\//i.test(blob.type || 'image/unknown')) return false;
      if (!img.isConnected || s.disabled) return false;
      if (s.objectURL) { try { URL.revokeObjectURL(s.objectURL); } catch {} }
      s.objectURL = URL.createObjectURL(blob);
      img.src = s.objectURL;
      s.pending = false;
      return true;
    } catch { return false; }
  }

  function retry(img, event) {
    if (!(img instanceof HTMLImageElement) || !isIOS()) return false;
    prepare(img);
    const s = state(img);
    if (s.disabled || !s.original || s.pending || s.attempt >= retryDelays.length) return false;

    // Stop target-level onerror handlers from swapping in their fallback until
    // all iOS recovery attempts have genuinely failed.
    if (event) {
      try { event.preventDefault(); } catch {}
      try { event.stopImmediatePropagation(); } catch {}
    }

    const attempt = ++s.attempt;
    s.pending = true;
    img.dataset.imageRetry = String(attempt);
    setTimeout(async () => {
      if (!img.isConnected || s.disabled) { s.pending = false; return; }
      // The second/third attempt asks the network stack to reload the bytes and
      // gives WebKit a fresh blob to decode. If CORS is not allowed we simply
      // retry the original URL, so third-party image URLs still keep working.
      if (attempt >= 2 && await reloadThroughFetch(img, s)) return;
      assignOriginal(img, s);
    }, retryDelays[attempt - 1]);
    return true;
  }

  function loaded(img) {
    const s = states.get(img);
    if (!s) return;
    s.attempt = 0;
    s.pending = false;
    delete img.dataset.imageRetry;
    // Keep a recovered blob URL alive while the element is mounted. iOS can
    // evict a decoded bitmap while the app is backgrounded; if the blob had
    // already been revoked, WebKit could come back to a blank image again.
  }

  function dispose(img) {
    const s = states.get(img);
    if (!s) return;
    if (s.objectURL) { try { URL.revokeObjectURL(s.objectURL); } catch {}; s.objectURL = ''; }
    states.delete(img);
  }

  function abandon(img) {
    const s = state(img);
    s.disabled = true;
    s.pending = false;
    if (s.objectURL) { try { URL.revokeObjectURL(s.objectURL); } catch {}; s.objectURL = ''; }
  }

  function revive() {
    if (!isIOS()) return;
    document.querySelectorAll('img').forEach(img => {
      prepare(img);
      const s = state(img);
      if (!s.original || s.disabled || s.pending) return;
      const rect = img.getBoundingClientRect?.();
      const important = img.classList.contains('brand-logo') || img.classList.contains('platform-salon-logo');
      const visible = !rect || (rect.bottom >= -120 && rect.top <= (innerHeight || 900) + 120);
      if ((important || visible) && (!img.complete || img.naturalWidth === 0)) retry(img);
    });
  }

  document.addEventListener('load', event => {
    const img = event.target;
    if (img instanceof HTMLImageElement) loaded(img);
  }, true);

  if (window.MutationObserver) {
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes || []) {
          if (!(node instanceof Element)) continue;
          if (node instanceof HTMLImageElement) prepare(node);
          node.querySelectorAll?.('img').forEach(prepare);
        }
        for (const node of record.removedNodes || []) {
          if (!(node instanceof Element)) continue;
          if (node instanceof HTMLImageElement) dispose(node);
          node.querySelectorAll?.('img').forEach(dispose);
        }
      }
    });
    const start = () => observer.observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  }

  window.addEventListener('online', () => setTimeout(revive, 80));
  window.addEventListener('pageshow', () => setTimeout(revive, 80));
  window.addEventListener('salonieer:native-resume', () => setTimeout(revive, 120));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(revive, 120); });

  return { retry, prepare, revive, abandon, isIOS };
})();

window.PhotoPicker = (() => {
  const placeholder='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="28" fill="#172c33"/><circle cx="120" cy="86" r="30" fill="#7dabb6"/><path d="M57 186c0-39 28-60 63-60s63 21 63 60" fill="#7dabb6"/></svg>');
  // Retry transient native-iOS failures before deciding an image is broken.
  // Logos keep their own branded/initial fallback after all retries are used.
  document.addEventListener('error',event=>{
    const img=event.target;
    if(!(img instanceof HTMLImageElement))return;
    if(window.ImageReliability?.retry(img,event))return;
    if(img.dataset.fallback)return;
    if(img.classList.contains('brand-logo')||img.hasAttribute('data-logo-key')||img.classList.contains('platform-salon-logo'))return;
    // 2.34: a person's photo that cannot be shown becomes their initial (same size and shape).
    if(img.hasAttribute('data-initial')){window.ImageReliability?.abandon(img);const s=document.createElement('span');s.className=img.className+' avatar-initial';s.textContent=img.dataset.initial||'؟';s.setAttribute('aria-hidden','true');img.replaceWith(s);return;}
    window.ImageReliability?.abandon(img);
    img.dataset.fallback='1';img.src=placeholder;img.classList.add('image-fallback');
    img.alt=img.alt||'الصورة غير متاحة';
  },true);

  function modeDefaults(options={}) {
    const mode=options.mode||'photo';
    // A logo is never drawn larger than ~110 CSS px (the splash mark), so 512
    // covers a 3x screen with room to spare. It used to be stored at 1800px
    // and up to ~1.4 MB of base64 inside the settings row, which every screen
    // and every salon card then had to download before it could paint — the
    // real reason the logo arrived late, half-drawn, or not at all.
    // 2.34: a profile picture (specialists) is square and ~640 px — sharp on a
    // 3x screen at the largest size it is drawn (about 160 px), and small enough
    // to travel with every list of specialists (the server accepts up to 900 KB).
    const maxDim=Number(options.maxDim)||({logo:512,avatar:640,portrait:2200,gallery:3000,product:2400}[mode]||2400);
    // This is an output budget, not an upload limit. A 10–30 MB phone photo
    // is accepted and resized locally until its encoded result fits safely.
    const maxDataChars=Number(options.maxDataChars)||({logo:140000,avatar:240000,gallery:3600000}[mode]||3000000);
    return {...options,mode,maxDim,maxDataChars,ratio:options.ratio||(mode==='avatar'?'1':'original')};
  }

  function choose(callback, options={}) {
    if(typeof options==='number') options={maxDim:options};
    options=modeDefaults(options);
    const input=document.createElement('input');input.type='file';input.accept='image/*';input.hidden=true;document.body.append(input);
    input.addEventListener('cancel',()=>input.remove(),{once:true});
    input.onchange=async()=>{
      const file=input.files?.[0];input.remove();if(!file)return;
      if(file.type && !file.type.startsWith('image/')){UI.toast('اختر ملف صورة فقط.','err');return;}
      const url=URL.createObjectURL(file);
      // ImageBitmap applies the phone's EXIF orientation before canvas work
      // and avoids the partial/half-image decode seen with very large iOS
      // camera files. Fall back to Image where the API/format is unavailable.
      if(window.createImageBitmap){
        try{
          const bitmap=await window.createImageBitmap(file,{imageOrientation:'from-image'});
          editor(bitmap,file,options,callback,()=>{try{bitmap.close();}catch{}URL.revokeObjectURL(url);});
          return;
        }catch{}
      }
      const img=new Image();img.decoding='async';
      img.onerror=()=>{URL.revokeObjectURL(url);UI.toast('تعذّر فتح هذه الصورة على الجهاز. جرّب JPG أو PNG أو WebP.','err');};
      img.onload=()=>editor(img,file,options,callback,()=>URL.revokeObjectURL(url));img.src=url;
    };input.click();
  }

  function editor(img,file,options,callback,release){
    const focused=document.activeElement,overlay=document.createElement('div');overlay.className='modal-bg photo-editor';
    overlay.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="photo-title" tabindex="-1"><div class="mhead"><h3 id="photo-title">ضبط الصورة</h3><button type="button" class="iconbtn" data-close aria-label="إغلاق">×</button></div><div class="mform"><div class="crop-preview"><canvas aria-label="معاينة الصورة"></canvas></div><label>نسبة الصورة<select class="select" data-ratio><option value="original">كاملة — بدون قص</option><option value="1">مربعة</option><option value="0.8">صورة شخصية 4:5</option><option value="1.333333">أفقية 4:3</option></select></label><div data-crop-controls><label>تكبير<input type="range" min="1" max="3" value="1" step="0.01" data-zoom></label><label>الموضع الأفقي<input type="range" min="-100" max="100" value="0" data-x></label><label>الموضع العمودي<input type="range" min="-100" max="100" value="0" data-y></label></div><p class="tiny">الصورة الكاملة هي الافتراضية حتى لا يُقص أي جزء. الصور الكبيرة من الهاتف تُصغّر تلقائياً عند الحفظ بدون رفضها بسبب حجم الملف.</p><button class="btn" data-use>استخدام الصورة</button><button class="btn line" data-close>إلغاء</button></div></section>`;
    document.body.append(overlay);const dialog=overlay.firstElementChild;dialog.focus();
    const q=s=>overlay.querySelector(s),ratio=q('[data-ratio]'),zoom=q('[data-zoom]');ratio.value=options.ratio||'original';
    if(options.mode==='avatar')overlay.querySelector('.crop-preview').classList.add('round');
    let closed=false;const close=()=>{if(closed)return;closed=true;overlay.remove();release();focused?.focus?.();};
    overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button,input,select')].filter(n=>!n.closest('[hidden]'));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
    const sourceWidth=Number(img.naturalWidth||img.width),sourceHeight=Number(img.naturalHeight||img.height);
    function crop(){const full=ratio.value==='original',r=full?sourceWidth/sourceHeight:Number(ratio.value);let w=sourceWidth,h=sourceHeight;if(!full){if(w/h>r)w=h*r;else h=w/r;w/=Number(zoom.value);h/=Number(zoom.value);}return {x:(sourceWidth-w)*(Number(q('[data-x]').value)+100)/200,y:(sourceHeight-h)*(Number(q('[data-y]').value)+100)/200,w,h,full};}
    function paint(canvas,max){const c=crop(),scale=Math.min(1,max/Math.max(c.w,c.h));canvas.width=Math.max(1,Math.round(c.w*scale));canvas.height=Math.max(1,Math.round(c.h*scale));const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,c.x,c.y,c.w,c.h,0,0,canvas.width,canvas.height);q('[data-crop-controls]').hidden=c.full;}
    function encoded(canvas){
      const limit=options.maxDataChars;let work=canvas,best='';
      // A transparent source must stay transparent, so it is only ever
      // encoded as PNG or WebP — never flattened onto JPEG's opaque black.
      // WebP is tried first because it carries the same alpha at a fraction
      // of PNG's size; browsers without WebP fall back to the PNG attempt.
      const sourcePng=/^image\/(png|webp|gif|svg\+xml)$/.test(file.type||'');
      const attempts=sourcePng?[["image/webp",.94],["image/png",1],["image/webp",.85]]:[["image/jpeg",.88],["image/webp",.86],["image/jpeg",.78]];
      for(let shrink=0;shrink<9;shrink++){
        for(const [type,quality] of attempts){
          const value=work.toDataURL(type,quality);
          if(!best||value.length<best.length)best=value;
          if(value.length<=limit)return value;
        }
        if(Math.max(work.width,work.height)<=360)break;
        const next=document.createElement('canvas');next.width=Math.max(1,Math.round(work.width*.82));next.height=Math.max(1,Math.round(work.height*.82));next.getContext('2d').drawImage(work,0,0,next.width,next.height);work=next;
      }
      // Even an unusually noisy image is still accepted. Continue with the
      // smallest valid browser encoding instead of rejecting the source file.
      return best;
    }
    overlay.querySelectorAll('input,select').forEach(n=>n.oninput=()=>paint(q('canvas'),500));paint(q('canvas'),500);
    q('[data-use]').onclick=()=>{
      const canvas=document.createElement('canvas');paint(canvas,options.maxDim);
      const result=encoded(canvas);
      close();
      callback(result);
    };
  }
  return {choose,placeholder};
})();
