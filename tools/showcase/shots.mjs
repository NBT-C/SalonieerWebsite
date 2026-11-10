// The screens the home page shows, in each language (called by capture.mjs final).
// Phone: 390×797 CSS px at 3× (build.mjs adds the 47 px status bar → 390×844). iPad landscape: 1180×796 at 2×
// (+ 24 px status bar → 1180×820). Every screen is checked for words in another language and for money.
import fs from 'node:fs';
import path from 'node:path';

export async function finalShots({ salons, page, signIn, go, settle, setDark, foreign, moneyBoxes, log, db, HERE }) {
  const problems = [];
  for (const [lang, s] of Object.entries(salons)) {
    const OUT = path.join(HERE, 'raw', lang);
    fs.mkdirSync(OUT, { recursive: true });
    await setDark(lang, false);
    const snap = async (pg, id, extra = {}) => {
      await pg.addStyleTag({ content: '*{caret-color:transparent!important;scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}.toast,#toast,.toasts{display:none!important}' }).catch(() => {});
      await pg.waitForTimeout(400);
      await pg.screenshot({ path: path.join(OUT, `${id}.png`) });
      const f = await foreign(pg, lang, { y: 0, h: pg.viewportSize().height }), m = (await moneyBoxes(pg)).filter(x => x.y < pg.viewportSize().height);
      const v = pg.viewportSize();
      fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ id, lang, width: v.width, height: v.height, ...extra }, null, 1));
      if (f.length) problems.push(`${lang}/${id} other language: ${f.join(' | ')}`);
      if (m.length) problems.push(`${lang}/${id} money: ${m.map(x => x.t).join(' | ')}`);
      log(lang, id, f.length ? 'FOREIGN ' + f.join(' | ') : 'ok', m.length ? 'MONEY ' + m.map(x => x.t).join(' | ') : '');
    };
    // Scroll whatever holds an element so its top sits at y (the app scrolls inner panes, not the page).
    const placeAt = (pg, sel, y) => pg.evaluate(({ sel, y }) => {
      const el = typeof sel === 'string' ? document.querySelector(sel) : null; if (!el) return false;
      let sc = el.parentElement;
      while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (!sc || sc === document.body) sc = document.scrollingElement;
      sc.scrollTop += el.getBoundingClientRect().top - y; return true;
    }, { sel, y });
    // The team grid starts at the first working hour (10:00 for these salons); one hour = the gap between two marks.
    const gridAt = (pg, minutes) => pg.evaluate(min => {
      const w = document.querySelector('#sch .tg-wrap'); if (!w) return false;
      const marks = [...w.querySelectorAll('.tg-times span')];
      const hour = marks.length > 1 ? parseFloat(marks[1].style.top) - parseFloat(marks[0].style.top) : 60;
      w.scrollTop = Math.max(0, (min - 600) / 60 * hour);
      return hour;
    }, minutes);

    // ── 1. The customer books: service → tomorrow → 16:30 → send the request ──
    const team0 = s.team[0], cut = team0.services[0];
    {
      const pg = await page(lang, { label: lang + ' customer' });
      await signIn(pg, lang, s.bookerPhone);
      await go(pg, '#/book/' + team0.id, 1600);
      await pg.waitForSelector('#svc .svc', { timeout: 15000 });
      await pg.click(`#svc .svc[data-s="${cut.id}"]`); await settle(pg, 900);
      await pg.click(`#days .day[data-d="${s.tomorrow}"]`);
      await pg.waitForSelector('#slots .slot[data-t="16:30"]', { timeout: 15000 }); await settle(pg, 800);
      await pg.locator('#slots .slot[data-t="16:30"]').evaluate(el => el.click()); await pg.waitForTimeout(700);
      if (process.env.TALL) { await pg.setViewportSize({ width: 390, height: 2400 }); await settle(pg, 700); await pg.screenshot({ path: path.join(OUT, 'debug-book-tall.png') }); await pg.setViewportSize({ width: 390, height: 797 }); await settle(pg, 500); }
      // Steps 2 and 3 on screen: the day chosen, the times, 16:30 picked.
      await placeAt(pg, process.env.BOOK_AT || '#slots', Number(process.env.BOOK_Y || 165)); await pg.waitForTimeout(500);
      await snap(pg, 'book');
      await pg.click('#confirm');
      await pg.waitForSelector('.success-ring', { timeout: 15000 }); await settle(pg, 1000);
      await snap(pg, 'requested');
      await pg.context().close();
    }
    const made = (await db.query(`select id, status from shop_${s.S}.bookings where user_id = $1 and booking_date = $2`, [s.booker.user_id, s.tomorrow])).rows[0];
    if (made?.status !== 'pending') problems.push(`${lang}: the request is ${made?.status}`);

    // ── 2. The owner: the dashboard, the request in the specialist's day, the team, the numbers ──
    {
      const pg = await page(lang, { label: lang + ' owner' });
      await signIn(pg, lang, s.ownerPhone);
      await go(pg, '#/admin/home', 1800);
      await snap(pg, 'dashboard');
      // The day of one specialist tomorrow: the new request with its Confirm button.
      await go(pg, `#/admin/schedule?d=${s.tomorrow}`, 1800);
      await pg.waitForSelector('#sch [data-sch-open]', { timeout: 15000 });
      await pg.click(`.sch-person[data-sch-barber="${team0.id}"]`); await settle(pg, 1300);
      await pg.waitForSelector('#sch .sch-card.st-pending', { timeout: 15000 });
      await pg.evaluate(name => { const el = [...document.querySelectorAll('#sch .sch-card.st-pending')].find(e => e.innerText.includes(name)); if (el) el.id = 'the-request'; }, s.L.booker);
      if (process.env.TALL) { await pg.setViewportSize({ width: 390, height: 2400 }); await settle(pg, 700); await pg.screenshot({ path: path.join(OUT, 'debug-agenda-tall.png') }); await pg.setViewportSize({ width: 390, height: 797 }); await settle(pg, 500); }
      // Both requests of the day (another customer's and the new one) just under the sticky bars.
      await placeAt(pg, '#sch .tl-row:has(.sch-card.st-pending)', 176); await pg.waitForTimeout(500);
      await snap(pg, 'confirm');
      await pg.click('#the-request [data-bk-act="confirmed"]');
      await pg.waitForFunction(() => !document.querySelector('#the-request') || !document.querySelector('#the-request').classList.contains('st-pending'), null, { timeout: 15000 }).catch(() => {});
      await settle(pg, 900);
      // Today: every specialist side by side.
      await go(pg, '#/admin/schedule', 1800);
      await pg.waitForSelector('#sch .tg-wrap', { timeout: 15000 });
      await placeAt(pg, '#sch .sch-person, #sch .sch-chips', 118); await pg.waitForTimeout(300);
      // The red "now" line about two fifths down, done visits above it, booked ones below.
      await gridAt(pg, s.nowMin - 95); await pg.waitForTimeout(500);
      await snap(pg, 'schedule');
      // Customers.
      await go(pg, '#/admin/users', 1600);
      await pg.click('#u-roles .chip[data-role="user"]').catch(() => {}); await settle(pg, 1100);
      await placeAt(pg, '.u-tools', 118); await pg.waitForTimeout(400);
      await snap(pg, 'clients');
      // One customer's card (what the salon can do for her).
      await pg.locator('#user-list [data-act="user"]').nth(2).click().catch(() => {}); await settle(pg, 1200);
      await snap(pg, 'client');
      await pg.keyboard.press('Escape').catch(() => {}); await pg.evaluate(() => window.UI?.closeModal?.()).catch(() => {}); await settle(pg, 500);
      // The team.
      await go(pg, '#/admin/barbers', 1800);
      await placeAt(pg, '.tm-head', 118); await pg.waitForTimeout(400);
      await snap(pg, 'team-head');
      await placeAt(pg, '.tm-section', 118); await pg.waitForTimeout(400);
      await snap(pg, 'team');
      await pg.locator('.tm-section .tm-card, .tm-section [data-member]').first().click().catch(() => {}); await settle(pg, 1200);
      await snap(pg, 'member');
      await pg.keyboard.press('Escape').catch(() => {}); await pg.evaluate(() => window.UI?.closeModal?.()).catch(() => {}); await settle(pg, 500);
      // The numbers (from the chart down: no money on screen).
      await go(pg, '#/admin/insights', 2000);
      await placeAt(pg, '.analytics-trend', 118); await pg.waitForTimeout(500);
      await snap(pg, 'stats');
      await pg.context().close();
    }
    // ── 3. The customer: the visit is confirmed ──
    {
      const pg = await page(lang, { label: lang + ' customer 2' });
      await signIn(pg, lang, s.bookerPhone);
      await go(pg, '#/bookings', 1800);
      await snap(pg, 'confirmed');
      await pg.context().close();
    }
    // ── 4. A specialist's own day ──
    {
      const pg = await page(lang, { label: lang + ' specialist' });
      await signIn(pg, lang, s.specPhone);
      await go(pg, '#/barber-dash', 1800);
      // From the current visit on: what is happening now and what is next.
      await placeAt(pg, '.tl-row.is-now, .tl-row:has(.tl-now)', 128); await pg.waitForTimeout(500);
      await snap(pg, 'specialist');
      await pg.context().close();
    }
    // ── 5. iPad (landscape): the dashboard and the team's day ──
    {
      const pg = await page(lang, { width: 1180, height: 796, dpr: 2, label: lang + ' tablet' });
      await signIn(pg, lang, s.ownerPhone);
      await go(pg, '#/admin/home', 1800);
      await snap(pg, 'tablet-dashboard');
      await go(pg, '#/admin/schedule', 1800);
      await pg.waitForSelector('#sch .tg-wrap', { timeout: 15000 });
      await gridAt(pg, s.nowMin - 75); await pg.waitForTimeout(500);
      await snap(pg, 'tablet-schedule');
      await pg.context().close();
    }
  }
  if (problems.length) log('PROBLEMS:\n  ' + problems.join('\n  '));
  else log('every screen: one language, no money');
}
