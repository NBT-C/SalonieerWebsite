/* A notification must open the reservation it describes, never a dashboard. */
window.ReservationPage = (() => {
  const E = value => UI.esc(value);
  const statusText = {pending:'بانتظار التأكيد',confirmed:'موعد مؤكد',completed:'زيارة مكتملة',cancelled:'ملغي',no_show:'لم يحضر',expired:'منتهي'};
  const statusIntro = {
    pending:'بانتظار تأكيد العمل. سيصلك إشعار عند التحديث.',
    confirmed:'الموعد مؤكد.',
    completed:'تمت الزيارة.',
    cancelled:'تم إلغاء هذا الموعد.',
    no_show:'سُجّل عدم الحضور لهذا الموعد.',
    expired:'انتهى وقت هذا الموعد ولم يحدّث العمل حالته، فأصبح منتهياً. إذا زرت العمل فعلاً تواصل معه لتصحيحه.'
  };
  const toneClass = {confirm:'ok',danger:'danger',warn:'warn',neutral:'line'};
  const dateLabel = value => value ? `${UI.dayName(value)}${Lang.get()==='ar'?'،':','} ${UI.dateAr(value)}` : '—';
  const priceLabel = value => value === null || value === undefined || value === '' ? '' : (window.Money ? Money.fmt(value) : `${Lang.number(value)} ${Lang.t('شيكل')}`);

  function row(icon,label,value,extra='') {
    if (value === null || value === undefined || value === '') return '';
    return `<div class="reservation-row"><span class="reservation-row-icon">${UI.icon(icon,18)}</span><div><small>${E(label)}</small><b ${extra}>${E(value)}</b></div></div>`;
  }

  async function open(params) {
    const slug = Shop.slug();
    const token = App.token;
    // Back returns to wherever this was opened from — bookings, notifications
    // or the specialist's day — and falls back to the list this belongs to.
    const back = '#/bookings';
    let booking;
    try {
      booking = await Push.call('notification_booking',{p_slug:slug,p_token:token,p_booking:params.id});
      if (!booking || !booking.id) throw new Error('العنصر المطلوب غير موجود');
    } catch (error) {
      // A notification (or an old link) can point at a booking that was
      // deleted, moved to another account or is no longer visible. Land on a
      // useful screen instead of an error page.
      UI.render(`${UI.header({title:'تفاصيل الحجز',back})}<div class="content"><div class="center-col">
        ${UI.empty('تعذّر فتح هذا الحجز','ربما أُلغي أو لم يعد متاحاً لحسابك. يمكنك مراجعة حجوزاتك أو إشعاراتك.')}
        <div class="btn-row smart-fallback"><button class="btn" data-nav="#/bookings">حجوزاتي</button>
        <button class="btn line" data-nav="#/notifications">الإشعارات</button></div></div></div>`);
      return;
    }

    const paint = () => {
      const active = ['pending','confirmed'].includes(booking.status);
      const end = UI.endTime(String(booking.booking_time).slice(0,5),booking.duration);
      const phone = booking.user_phone || '';
      const whatsapp = String(phone).replace(/[^0-9]/g,'');
      // What may happen next comes from the shared rules, so this screen, the
      // specialist's action sheet and the admin dashboard cannot disagree
      // about a booking's own state.
      const managerActions = booking.can_manage ? BookingRules.actions(booking) : [];
      const managerNote = booking.can_manage ? BookingRules.note(booking) : '';
      UI.render(`${UI.header({title:'تفاصيل الحجز',back})}
        <main class="content reservation-page"><div class="reservation-shell" data-booking-id="${E(booking.id)}">
          <section class="reservation-hero status-${E(booking.status)}">
            <div class="reservation-hero-main"><div><span class="reservation-status">${E(statusText[booking.status]||booking.status)}</span>
              <h2>${E(booking.service_name||'موعد')}</h2>${['expired','finished'].includes(Smart.phase(booking))?'':`<p>${E(statusIntro[booking.status]||'')}</p>`}${Smart.phaseChip(booking)}</div>
              <div class="reservation-date-tile"><small>${E(UI.dayName(booking.booking_date))}</small><strong>${E(Lang.number(new Date(booking.booking_date+'T00:00:00').getDate()))}</strong><span>${E(Lang.date(booking.booking_date,{month:'short'}))}</span></div>
            </div>
            <div class="reservation-code">رقم الحجز <b dir="ltr">${E(String(booking.id).slice(0,8).toUpperCase())}</b></div>
          </section>

          ${booking.can_manage?`<section class="reservation-customer"><span class="reservation-avatar">${E((booking.user_name||'ع')[0])}</span><div><small>صاحب الحجز</small><h3>${E(booking.user_name||'العميل')}</h3>${phone?`<a href="tel:${E(phone)}" dir="ltr">${E(phone)}</a>`:''}</div><div class="reservation-contact-actions">${phone?`<a class="iconbtn" href="tel:${E(phone)}" aria-label="اتصال">${UI.icon('phone',18)}</a>`:''}${whatsapp?`<a class="iconbtn" href="https://wa.me/${E(whatsapp)}" target="_blank" rel="noopener" aria-label="واتساب">${UI.icon('whatsapp',18)}</a>`:''}</div></section>`:''}

          <section class="reservation-card"><div class="reservation-section-title"><span>تفاصيل الموعد</span></div>
            <div class="reservation-grid">
              ${row('calendar','التاريخ',dateLabel(booking.booking_date))}
              ${row('clock','الوقت',`${UI.timeAr(booking.booking_time)} – ${UI.timeAr(end)}`)}
              ${row('scissors','المختص',booking.barber_name||'سيتم تحديده')}
              ${row('clock','المدة',Lang.duration(booking.duration))}
              ${Number(booking.price)>0?row('money','السعر',priceLabel(booking.price)):''}
              ${row('pin','المكان',booking.address)}
            </div>
            ${booking.note?`<div class="reservation-note"><span>${UI.icon('chat',17)}</span><div><small>ملاحظة الحجز</small><p>${E(booking.note)}</p></div></div>`:''}
          </section>

          <div id="reservation-business"></div>
          ${active||booking.status==='completed'?`<section class="reservation-timeline" aria-label="حالة الحجز"><div class="done"><i>${UI.icon('check',12)}</i><span>تم الإرسال</span></div><b class="${booking.status!=='pending'?'done':''}"></b><div class="${booking.status==='pending'?'current':'done'}"><i>${booking.status==='pending'?'2':UI.icon('check',12)}</i><span>التأكيد</span></div><b class="${booking.status==='completed'?'done':''}"></b><div class="${booking.status==='completed'?'done':Smart.phase(booking)==='now'?'current':''}"><i>${booking.status==='completed'?UI.icon('check',12):'3'}</i><span>الزيارة</span></div></section>`:''}

          ${booking.can_manage?`<section class="reservation-card reservation-actions"><div class="reservation-section-title"><span>إدارة الحجز</span></div>${managerActions.length?`<div class="reservation-action-grid">${managerActions.map(a=>`<button class="btn ${toneClass[a.tone]||'line'}" data-reservation-status="${E(a.to)}" data-reservation-label="${E(a.label)}">${E(a.label)}</button>`).join('')}</div>`:''}${managerNote?`<p class="tiny reservation-help">${E(managerNote)}</p>`:''}<p class="form-error" id="reservation-error" role="status"></p></section>`:''}

          ${!booking.can_manage&&active?`<div class="reservation-user-actions"><button class="btn line" id="reservation-calendar">${UI.icon('calendar',17)} أضف إلى التقويم</button>${booking.can_cancel?'<button class="btn danger" id="reservation-cancel">إلغاء الحجز</button>':''}</div>`:''}
          ${!booking.can_manage&&active&&!booking.can_cancel?'<p class="reservation-help">الإلغاء غير متاح من التطبيق — تواصل مع العمل.</p>':''}
          ${!booking.can_manage&&!active&&booking.barber_id?`<button class="btn" data-nav="#/book/${E(booking.barber_id)}${booking.service_id?`?service=${E(booking.service_id)}`:''}">${UI.icon('refresh',17)} احجز موعداً مماثلاً</button>`:''}
        </div></main>`);

      document.querySelectorAll('[data-reservation-status]').forEach(button => button.onclick = () => {
        const next=button.dataset.reservationStatus;
        UI.confirm(`${button.dataset.reservationLabel}؟`,async()=>{
          const error=document.getElementById('reservation-error');if(error)error.textContent='';
          try { booking=await Push.call('notification_booking_status',{p_slug:slug,p_token:token,p_booking:booking.id,p_status:next});window.rpcCacheBust?.();paint();UI.toast('تم تحديث الحجز وإبلاغ العميل','ok'); }
          catch(e){const box=document.getElementById('reservation-error');if(box)box.textContent=e.message;else UI.toast(e.message,'err');}
        },next==='cancelled');
      });
      // 2.25: deposit and receipt for this booking (customer: pay the deposit;
      // staff: complete & checkout, record the deposit). Tenant view only.
      if(window.Business){const host=document.getElementById('reservation-business');
        if(booking.can_manage)Business.bookingPanel(host,booking,{staff:true,onDone:async()=>{booking=await Push.call('notification_booking',{p_slug:slug,p_token:token,p_booking:booking.id});paint();}});
        else Business.customerBookingPanel(host,booking);}
      const calendar=document.getElementById('reservation-calendar');
      if(calendar)calendar.onclick=()=>window.Enhance?.downloadICS({title:`${booking.salon_name||'العمل'} — ${booking.service_name||'حجز'}`,date:booking.booking_date,time:String(booking.booking_time).slice(0,5),duration:booking.duration,location:booking.address||'',description:`المختص: ${booking.barber_name||''}`});
      const cancel=document.getElementById('reservation-cancel');
      if(cancel)cancel.onclick=()=>UI.confirm('هل تريد إلغاء هذا الحجز؟',async()=>{try{await rpc('cancel_my_booking',{p_token:App.token,p_booking:booking.id});booking=await Push.call('notification_booking',{p_slug:slug,p_token:token,p_booking:booking.id});paint();UI.toast('تم إلغاء الحجز','ok');}catch(e){UI.toast(e.message,'err');}},true);
    };
    paint();
  }
  return {open};
})();
