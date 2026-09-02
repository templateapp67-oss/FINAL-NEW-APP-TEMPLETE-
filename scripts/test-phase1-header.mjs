/**
 * PHASE 1 — Header Navigation & Action Fixes for /arts-by-uma.
 * Consolidated acceptance of the 9 required nav actions.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

process.env.VITE_SUPABASE_URL = 'https://nexora-header-test.example.com';
process.env.VITE_SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test-anon-key-for-header-test';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/arts-by-uma' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node; globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent; globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const scrollSpy = [];
dom.window.HTMLElement.prototype.scrollIntoView = function(o){ scrollSpy.push((o&&typeof o==='object'?o.behavior:'(d)')+':'+this.id); };
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;
dom.window.HTMLElement.prototype.scrollTo = function(o){ this.scrollTop = o&&typeof o==='object'&&typeof o.top==='number'?o.top:0; };
globalThis.HTMLElement.prototype.scrollTo = dom.window.HTMLElement.prototype.scrollTo;

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');
const { AuthModalProvider } = await import('../src/components/AuthModalProvider.tsx');
const { supabase } = await import('../src/lib/supabaseClient.ts');
const { initialData } = await import('../src/types.ts');
const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const renderBarber = (mode) => render(
  React.createElement(AuthModalProvider, null, React.createElement(Barber, { data, mode })),
);

const fakeUser = { id:'cust-1', email:'c@t.test', app_metadata:{}, user_metadata:{} };
const fakeSession = { access_token:'t', refresh_token:'r', expires_at:1e12, user:fakeUser };
let authCb=null; let signOutCalls=0;
supabase.auth.onAuthStateChange=(cb)=>{authCb=cb;return{data:{subscription:{unsubscribe(){}}}};};
supabase.auth.getSession=async()=>({data:{session:fakeSession},error:null});
supabase.auth.getUser=async()=>({data:{user:fakeUser},error:null});
supabase.auth.signOut=async()=>{signOutCalls+=1; if(authCb)authCb('SIGNED_OUT',null); return{error:null};};

let passed=0,failed=0; const failures=[];
const origError=console.error;
async function test(n,fn){ try{await fn();passed++;console.log(`  ✓ ${n}`);}catch(e){failed++;failures.push({n,e});origError(`  ✗ ${n}\n    ${String(e.message).split('\n').join('\n    ')}`);} }
function section(t){ console.log(`\n■ ${t}`); }

const data={...initialData, templateId:'barber_mens_grooming', salonName:'Arts By Uma', ownerName:'Uma',
  phone:'+91 9000000000', whatsappPhone:'+91 9000000000', about:'Salon',
  services:[{id:'s1',name:'Cut',category:'Cut',description:'',price:400,duration:30,status:'active'}],
  packages:[{id:'p1',name:'Combo',description:'',price:999,duration:60,status:'active'}],
  gallery:[{id:'g1',url:'https://x/g.jpg',alt:'Work'}],
  socialVideos:[{id:'v1',title:'Reel',platform:'instagram',url:'#section-social',thumbnailUrl:'https://x/t.jpg'}],
  team:[{id:'t1',name:'Riya',role:'Stylist',imageUrl:'https://x/r.jpg'}]};

const waitHeader=async()=>{let el;for(let i=0;i<40&&!el;i++){await act(async()=>{await Promise.resolve();});el=document.querySelector('[data-testid="site-header"]');}return el;};
const click=async(id)=>{await act(async()=>{fireEvent.click(document.querySelector(`[data-testid="${id}"]`));});};

section('Phase 1 — /arts-by-uma Header Navigation & Actions');
{
  window.localStorage.clear();
  renderBarber('desktop');
  await waitHeader();

  // HOME -> scroll to top + #home hash
  await test('HOME scrolls to top (behavior smooth) and sets #home', async()=>{
    const sc=document.querySelector('.site-scroll'); if(sc)sc.scrollTop=400;
    scrollSpy.length=0;
    await click('nav-home');
    if(sc)assert.equal(sc.scrollTop,0,'HOME did not scroll to top');
    assert.equal(window.location.hash,'#home');
  });

  // SERVICES / OFFERS / ABOUT / CONTACT smooth-scroll to their sections + hash
  const map=[['nav-services','section-services','#services'],['nav-offers','section-offers','#offers'],
             ['nav-about','section-about','#about'],['nav-contact','section-contact','#contact']];
  for(const [id,section,hsh] of map){
    await test(`${id} smooth-scrolls to ${section} and sets ${hsh}`, async()=>{
      scrollSpy.length=0;
      await click(id);
      assert.ok(scrollSpy.some(s=>s.endsWith(':'+section)),`no smooth scroll to ${section}: ${scrollSpy.join(',')}`);
      assert.equal(window.location.hash,hsh);
    });
  }

  // LOGIN / SIGN UP -> opens auth modal (signed out). Re-seed signed-out.
  await test('LOGIN / SIGN UP open the auth modal', async()=>{
    // force signed-out
    await act(async()=>{ if(authCb)authCb('SIGNED_OUT',null); });
    await act(async()=>{ await Promise.resolve(); });
    // LOGIN opens the modal on the login tab.
    await click('site-header-login');
    assert.ok(document.querySelector('[data-testid="auth-modal"]'),'login modal did not open');
    assert.equal(document.querySelector('[data-testid="auth-login-tab"]').getAttribute('aria-pressed'),'true');
    await act(async()=>{ const c=document.querySelector('[data-testid="auth-close-btn"]'); if(c)fireEvent.click(c); });
    assert.equal(document.querySelector('[data-testid="auth-modal"]'),null,'modal did not close');
    // SIGN UP opens the modal on the sign-up tab.
    await click('site-header-signup');
    assert.ok(document.querySelector('[data-testid="auth-modal"]'),'signup modal did not open');
    assert.equal(document.querySelector('[data-testid="auth-signup-tab"]').getAttribute('aria-pressed'),'true');
    await act(async()=>{ const c=document.querySelector('[data-testid="auth-close-btn"]'); if(c)fireEvent.click(c); });
    assert.equal(document.querySelector('[data-testid="auth-modal"]'),null,'modal did not close');
  });

  // MY BOOKINGS / LOGOUT conditional — sign back in
  await test('MY BOOKINGS + LOGOUT appear when signed in; Login/Sign Up hidden', async()=>{
    await act(async()=>{ if(authCb)authCb('SIGNED_IN',fakeSession); });
    await act(async()=>{ await Promise.resolve(); });
    assert.ok(document.querySelector('[data-testid="site-header-my-bookings"]'),'My Bookings missing');
    assert.ok(document.querySelector('[data-testid="site-header-logout"]'),'Logout missing');
    assert.equal(document.querySelector('[data-testid="site-header-login"]'),null,'Login should be hidden');
  });

  await test('LOGOUT runs auth sign-out and flips to Login / Sign Up', async()=>{
    signOutCalls=0;
    await click('site-header-logout');
    assert.ok(signOutCalls>=1,'signOut not called');
    await act(async()=>{ await Promise.resolve(); });
    assert.ok(document.querySelector('[data-testid="site-header-login"]'),'Login did not reappear');
  });

  // EN / HI language toggle
  await test('EN / हिन्दी toggle repaints nav labels + persists', async()=>{
    await click('site-header-lang-hi');
    assert.equal(window.localStorage.getItem('nexora_locale'),'hi');
    assert.equal(document.querySelector('[data-testid="nav-home"]').textContent,'होम');
    await click('site-header-lang-en');
    assert.equal(document.querySelector('[data-testid="nav-home"]').textContent,'Home');
  });

  // BOOK APPOINTMENT opens booking modal + #booking
  await test('BOOK APPOINTMENT opens the booking flow and sets #booking', async()=>{
    assert.equal(document.querySelector('[data-testid="site-booking-flow"]'),null);
    await click('site-book-cta');
    assert.ok(document.querySelector('[data-testid="site-booking-flow"]'),'booking flow did not open');
    assert.equal(window.location.hash,'#booking');
  });

  cleanup();
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 1 header & actions: ${passed} passed, ${failed} failed`);
if(failures.length>0){console.log('\nFailures:');for(const f of failures)console.log(`  - ${f.n}`);}
process.exit(failures.length>0?1:0);
