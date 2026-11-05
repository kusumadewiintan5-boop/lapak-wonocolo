/* Lapak Wonocolo Fiesta — aplikasi web mandiri (Supabase) */
(() => {
"use strict";

const KEL = ["Bendul Merisi","Jemur Wonosari","Margorejo","Sidosermo","Siwalankerto"];
const KAT = ["Makanan","Minuman","Kue & Camilan","Kerajinan","Fashion","Jasa","Lainnya"];
const HUES = ["#1E6A4E","#C8412B","#2D7FB8","#B7791F","#7A4FA0","#2F7D7A","#9C4A6B"];
const MAX_PRODUK = 60;
const BUCKET = "produk";

// Produk contoh: hanya tampil selama belum ada lapak sungguhan.
const EXAMPLES = [
  {id:"ex1",nama:"Lapak Contoh A",pemilik:"Contoh",kelurahan:"Siwalankerto",wa:"",alamat:"",tampil:true,produk:[
    {id:"e1",nama:"Sambal Bawang Botol 150 g",harga:25000,kategori:"Makanan",deskripsi:"Contoh produk. Sambal bawang pedas gurih, tahan 2 minggu."},
    {id:"e2",nama:"Kue Lumpur Kentang isi 10",harga:30000,kategori:"Kue & Camilan",deskripsi:"Contoh produk. Pesan sehari sebelumnya."}]},
  {id:"ex2",nama:"Lapak Contoh B",pemilik:"Contoh",kelurahan:"Jemur Wonosari",wa:"",alamat:"",tampil:true,produk:[
    {id:"e3",nama:"Tas Anyaman Eceng Gondok",harga:85000,kategori:"Kerajinan",deskripsi:"Contoh produk. Dibuat tangan, ukuran 30×25 cm."},
    {id:"e4",nama:"Es Dawet Ayu 1 liter",harga:20000,kategori:"Minuman",deskripsi:"Contoh produk. Gula aren asli."}]},
  {id:"ex3",nama:"Lapak Contoh C",pemilik:"Contoh",kelurahan:"Margorejo",wa:"",alamat:"",tampil:true,produk:[
    {id:"e5",nama:"Kemeja Batik Motif Suroboyoan",harga:150000,kategori:"Fashion",deskripsi:"Contoh produk. Ukuran M–XL."},
    {id:"e6",nama:"Jasa Jahit & Permak",harga:15000,kategori:"Jasa",deskripsi:"Contoh produk. Harga mulai dari."}]}
];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const rupiah = n => "Rp " + Number(n||0).toLocaleString("id-ID");
const hueOf = s => { let h=0; for (const c of String(s)) h=(h*31+c.charCodeAt(0))>>>0; return HUES[h%HUES.length]; };
const initial = s => (String(s).trim()[0]||"?").toUpperCase();
const waIntl = n => { let d = String(n||"").replace(/\D/g,""); if (d.startsWith("0")) d = "62"+d.slice(1); else if (d.startsWith("8")) d = "62"+d; return d; };
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2800); }

/* ---------- link toko & produk ---------- */
const BASE = location.origin + location.pathname;
const shopLink = s => BASE + "#toko/" + s.id;
const prodLink = p => BASE + "#produk/" + p.id;
const setHash = h => { if (location.hash !== h) history.replaceState(null, "", h); };
const copyText = txt => navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject();
async function shareLink(url, title, text){
  if (navigator.share){
    try { await navigator.share({ title, text, url }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  copyText(url).then(() => toast("Link disalin. Tempel di WhatsApp atau media sosial."),
                     () => window.prompt("Salin link ini:", url));
}

/* ---------- Supabase ---------- */
const CFG = window.LAPAK_CONFIG || {};
const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY && window.supabase);
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY) : null;
const fotoUrl = path => sb ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "";

/* ---------- state ---------- */
let shops = [];
let usingExamples = true;
let filter = { q:"", cat:"", kel:"", shop:"" };
let session = null, isAdmin = false, myShop = null, busy = false;
let shopsLoaded = false, pendingProduct = "", scrollPending = false;

function photo(container, p){
  container.style.background = hueOf((p.kategori||"") + (p.nama||""));
  if (p.foto_path){
    const img = new Image(); img.alt = p.nama; img.loading = "lazy"; img.src = fotoUrl(p.foto_path);
    img.onerror = () => { img.remove(); container.appendChild(el("span","ini",initial(p.nama))); };
    container.appendChild(img);
  } else container.appendChild(el("span","ini",initial(p.nama)));
}

/* ---------- data ---------- */
async function loadShops(){
  if (!sb){ usingExamples = true; render(); return; }
  const note = $("#load-note");
  const { data, error } = await sb.from("lapak").select("*, produk(*)").order("updated_at",{ascending:false});
  if (error){ note.hidden=false; note.textContent="Data lapak belum bisa dimuat. Periksa koneksi internet lalu muat ulang halaman."; console.error(error); return; }
  note.hidden = true;
  shops = (data||[]).map(s => ({...s, produk:(s.produk||[]).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))}));
  const uid = session && session.user.id;
  myShop = uid ? shops.find(s=>s.owner===uid) || null : null;
  usingExamples = shops.filter(s=>s.tampil).length===0 && !isAdmin;
  shopsLoaded = true;
  checkShop();
  render(); renderDesk(); tryOpenPending(); maybeScroll();
}
function source(){ return usingExamples ? EXAMPLES : shops; }

/* ---------- Belanja ---------- */
function fillFilters(){
  const cat=$("#cat"); cat.appendChild(new Option("Semua kategori","")); KAT.forEach(k=>cat.appendChild(new Option(k,k)));
  const chips=$("#kel-chips");
  ["",...KEL].forEach(k=>{
    const b=el("button","chip",k||"Semua"); b.type="button"; b.dataset.k=k;
    b.onclick=()=>{ filter.kel=k; filter.shop=""; setHash("#belanja"); render(); };
    chips.appendChild(b);
  });
  const sk=$("#s-kel"); sk.appendChild(new Option("Pilih kelurahan","")); KEL.forEach(k=>sk.appendChild(new Option(k,k)));
  $("#q").addEventListener("input",e=>{filter.q=e.target.value.trim().toLowerCase(); renderGrid();});
  $("#cat").addEventListener("change",e=>{filter.cat=e.target.value; renderGrid();});
}

function render(){
  const src = source();
  $("#cfg-note").hidden = configured;
  $("#ex-note").hidden = !configured || !usingExamples;
  const visible = usingExamples ? [] : shops.filter(s=>s.tampil);
  $("#st-lapak").textContent = visible.length;
  $("#st-produk").textContent = visible.reduce((a,s)=>a+s.produk.length,0);
  document.querySelectorAll("#kel-chips .chip").forEach(c=>c.setAttribute("aria-pressed",String(c.dataset.k===filter.kel)));
  const box=$("#shops"); box.innerHTML="";
  const list = src.filter(s=>!filter.kel || s.kelurahan===filter.kel);
  $("#shops-sec").hidden = list.length===0;
  list.forEach(s=>{
    const b=el("button","shop"+(s.tampil?"":" hid")); b.type="button"; b.setAttribute("aria-pressed",String(filter.shop===s.id));
    const m=el("span","mono",initial(s.nama)); m.style.background=hueOf(s.nama);
    const t=el("span","t"); t.appendChild(el("b",null,s.nama));
    t.appendChild(el("span",null,`${s.kelurahan} · ${s.produk.length} produk${s.tampil?"":" · disembunyikan"}`));
    b.append(m,t); b.onclick=()=>{ filter.shop = filter.shop===s.id ? "" : s.id;
      if (!usingExamples) setHash(filter.shop ? "#toko/"+filter.shop : "#belanja"); render(); };
    box.appendChild(b);
  });
  renderGrid();
}

function renderGrid(){
  const src = source(), g=$("#grid"); g.innerHTML="";
  const items=[]; src.forEach(s=>s.produk.forEach(p=>items.push({p,s})));
  const f = items.filter(({p,s})=>
    (!filter.kel || s.kelurahan===filter.kel) && (!filter.cat || p.kategori===filter.cat) && (!filter.shop || s.id===filter.shop) &&
    (!filter.q || (p.nama+" "+(p.deskripsi||"")+" "+s.nama).toLowerCase().includes(filter.q)));
  const shopSel = src.find(s=>s.id===filter.shop);
  const waiting = filter.shop && !shopSel && !shopsLoaded;
  $("#grid-title").textContent = shopSel ? shopSel.nama : waiting ? "Memuat lapak…" : "Semua produk";
  $("#grid-count").textContent = waiting ? "" : f.length + " produk";
  const sh=$("#shop-share"), sa=$("#shop-all");
  sh.hidden = !shopSel || usingExamples; sa.hidden = !shopSel;
  if (shopSel){
    sh.onclick=()=>shareLink(shopLink(shopSel), shopSel.nama, `Yuk lihat produk ${shopSel.nama} di Lapak Wonocolo Fiesta:`);
    sa.onclick=()=>{ filter.shop=""; setHash("#belanja"); render(); };
  }
  if (waiting) return;
  if (!f.length){
    const e=el("div","empty"); e.appendChild(el("b",null, items.length ? "Tidak ada produk yang cocok" : "Belum ada produk"));
    e.appendChild(document.createTextNode(items.length ? "Coba kata kunci lain, atau pilih kelurahan dan kategori yang berbeda." : "Produk akan muncul di sini setelah penjual menambahkannya dari menu Lapak Saya."));
    g.appendChild(e); return;
  }
  f.forEach(({p,s})=>{
    const c=el("button","card"); c.type="button";
    const ph=el("div","ph"); photo(ph,p); ph.appendChild(el("span","tag",p.kategori));
    if (usingExamples) ph.appendChild(el("span","tag ex","CONTOH"));
    const b=el("div","b"); b.appendChild(el("h3",null,p.nama)); b.appendChild(el("span","price",rupiah(p.harga)));
    b.appendChild(el("span","by",`${s.nama} · ${s.kelurahan}`));
    c.append(ph,b); c.onclick=()=>openProduct(p,s);
    g.appendChild(c);
  });
}

/* ---------- modal ---------- */
function closeModal(){ $("#modal-root").innerHTML=""; document.removeEventListener("keydown",escClose);
  if (location.hash.startsWith("#produk/")) setHash(filter.shop ? "#toko/"+filter.shop : "#belanja"); }
function escClose(e){ if (e.key==="Escape") closeModal(); }
function modal(build){
  const root=$("#modal-root"); root.innerHTML="";
  const sc=el("div","scrim"); sc.onclick=e=>{ if(e.target===sc) closeModal(); };
  const m=el("div","modal"); m.setAttribute("role","dialog"); m.setAttribute("aria-modal","true");
  build(m); sc.appendChild(m); root.appendChild(sc);
  document.addEventListener("keydown",escClose);
  const f=m.querySelector("button,input,select,textarea"); if(f) f.focus();
}

function openProduct(p,s){
  if (!usingExamples) setHash("#produk/"+p.id);
  modal(m=>{
    const ph=el("div","ph"); photo(ph,p); ph.appendChild(el("span","tag",p.kategori)); m.appendChild(ph);
    const inn=el("div","in");
    inn.appendChild(el("h3",null,p.nama)); inn.appendChild(el("span","price",rupiah(p.harga)));
    if (p.deskripsi) inn.appendChild(el("p",null,p.deskripsi));
    const sl=el("div","seller"); const mo=el("span","mono",initial(s.nama)); mo.style.background=hueOf(s.nama);
    const t=el("div","t"); t.appendChild(el("b",null,s.nama)); t.appendChild(el("span",null,`${s.pemilik} · ${s.kelurahan}${s.alamat?" · "+s.alamat:""}`));
    sl.append(mo,t); inn.appendChild(sl);
    if (s.deskripsi && !usingExamples) inn.appendChild(el("p","small",s.deskripsi));

    let qty=1;
    const qr=el("div","qty"); const minus=el("button",null,"−"); const out=el("output",null,"1"); const plus=el("button",null,"+");
    minus.type=plus.type="button"; minus.setAttribute("aria-label","Kurangi"); plus.setAttribute("aria-label","Tambah");
    const tot=el("span","price"); tot.style.marginLeft="auto";
    qr.append(el("span","lbl","Jumlah"),minus,out,plus,tot); inn.appendChild(qr);
    const note=el("textarea"); note.id="order-note"; note.placeholder="Catatan untuk penjual (opsional), mis. level pedas, waktu ambil"; note.style.minHeight="64px";
    inn.appendChild(note);
    const row=el("div","row");
    const close=el("button","btn btn-g","Tutup"); close.type="button"; close.onclick=closeModal;
    let go=null;
    const num=waIntl(s.wa);
    const upd=()=>{
      out.textContent=qty; tot.textContent="Total "+rupiah(qty*p.harga);
      if (go){ const msg=`Halo ${s.nama}, saya lihat di Lapak Wonocolo Fiesta. Saya mau pesan:\n${p.nama} × ${qty} = ${rupiah(qty*p.harga)}${note.value.trim()?"\nCatatan: "+note.value.trim():""}`;
        go.href="https://wa.me/"+num+"?text="+encodeURIComponent(msg); }
    };
    minus.onclick=()=>{ if(qty>1){qty--;upd();} }; plus.onclick=()=>{ if(qty<99){qty++;upd();} }; note.oninput=upd;

    if (usingExamples || !num){
      inn.appendChild(el("p","small", usingExamples ? "Ini produk contoh, jadi belum bisa dipesan." : "Penjual belum mencantumkan nomor WhatsApp."));
      row.append(close);
    } else {
      const wl=el("div","waline"); wl.appendChild(el("span","small","WhatsApp penjual:")); const code=el("code",null,"+"+num); wl.appendChild(code);
      const cp=el("button","btn btn-g btn-sm","Salin nomor"); cp.type="button";
      cp.onclick=()=>{ (navigator.clipboard?navigator.clipboard.writeText("+"+num):Promise.reject()).then(()=>toast("Nomor disalin"),()=>{ const r=document.createRange(); r.selectNodeContents(code); const sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Nomor sudah dipilih, salin manual"); }); };
      wl.appendChild(cp); inn.appendChild(wl);
      go=el("a","btn btn-p","Pesan via WhatsApp"); go.target="_blank"; go.rel="noopener";
      row.append(close,go);
    }
    if (!usingExamples){
      const shb=el("button","btn btn-g","Bagikan produk"); shb.type="button";
      shb.onclick=()=>shareLink(prodLink(p), p.nama, `${p.nama} – ${rupiah(p.harga)} dari ${s.nama} di Lapak Wonocolo Fiesta:`);
      row.insertBefore(shb, close.nextSibling);
    }
    upd();
    if (isAdmin && !usingExamples){
      const tg=el("button","btn btn-d", s.tampil ? "Sembunyikan lapak ini" : "Tampilkan lapak ini"); tg.type="button";
      tg.onclick=async()=>{ tg.disabled=true; const {error}=await sb.from("lapak").update({tampil:!s.tampil}).eq("id",s.id);
        if(error){ toast("Gagal mengubah status lapak"); tg.disabled=false; return; }
        closeModal(); toast(s.tampil?"Lapak disembunyikan":"Lapak ditampilkan"); loadShops(); };
      row.prepend(tg);
    }
    inn.appendChild(row); m.appendChild(inn);
  });
}

/* ---------- Auth ---------- */
let authMode = "login";
function setAuthMode(mode){
  authMode = mode;
  $("#m-login").setAttribute("aria-pressed",String(mode==="login"));
  $("#m-daftar").setAttribute("aria-pressed",String(mode==="daftar"));
  $("#auth-title").textContent = mode==="login" ? "Masuk sebagai penjual" : "Daftar sebagai penjual";
  $("#a-go").textContent = mode==="login" ? "Masuk" : "Daftar";
  $("#a-pass").autocomplete = mode==="login" ? "current-password" : "new-password";
  $("#a-err").textContent="";
}
$("#m-login").onclick=()=>setAuthMode("login");
$("#m-daftar").onclick=()=>setAuthMode("daftar");

$("#f-auth").addEventListener("submit", async e=>{
  e.preventDefault();
  const email=$("#a-email").value.trim(), password=$("#a-pass").value;
  const err=$("#a-err"); err.textContent="";
  if (!/^\S+@\S+\.\S+$/.test(email)){ err.textContent="Masukkan alamat email yang benar."; return; }
  if (password.length<6){ err.textContent="Kata sandi minimal 6 karakter."; return; }
  const btn=$("#a-go"); btn.disabled=true;
  try{
    if (authMode==="login"){
      const {error}=await sb.auth.signInWithPassword({email,password});
      if (error) err.textContent = /invalid/i.test(error.message) ? "Email atau kata sandi salah." : /confirm/i.test(error.message) ? "Email belum dikonfirmasi. Cek kotak masuk email Anda." : "Gagal masuk: "+error.message;
    } else {
      const {data,error}=await sb.auth.signUp({email,password});
      if (error) err.textContent = /registered|exists/i.test(error.message) ? "Email ini sudah terdaftar. Silakan pilih Masuk." : "Gagal mendaftar: "+error.message;
      else if (!data.session){ toast("Pendaftaran berhasil. Cek email untuk konfirmasi, lalu masuk."); setAuthMode("login"); }
      else toast("Akun dibuat. Silakan lengkapi profil lapak.");
    }
  } finally { btn.disabled=false; }
});
$("#logout").onclick=async()=>{ await sb.auth.signOut(); toast("Anda sudah keluar"); };

/* ---------- Lapak Saya ---------- */
function deskOff(msg){ $("#desk-off").hidden=false; $("#desk-off-msg").textContent=msg; $("#f-auth").hidden=true; $("#desk-wrap").hidden=true; }

function renderDesk(){
  if (!configured){ deskOff("Situs belum tersambung ke database, jadi lapak belum bisa dibuka. Pengelola perlu mengisi config.js sesuai PANDUAN."); return; }
  $("#desk-off").hidden=true;
  if (!session){ $("#f-auth").hidden=false; $("#desk-wrap").hidden=true; return; }
  $("#f-auth").hidden=true; $("#desk-wrap").hidden=false;
  $("#who-email").textContent = session.user.email + (isAdmin ? " (pengelola)" : "");
  $("#hidden-note").hidden = !(myShop && !myShop.tampil);
  $("#my-link").hidden = !myShop;
  if (myShop){
    const url=shopLink(myShop), nama=myShop.nama;
    $("#my-link-url").textContent=url;
    $("#my-link-copy").onclick=()=>copyText(url).then(()=>toast("Link toko disalin"),()=>window.prompt("Salin link ini:",url));
    $("#my-link-share").onclick=()=>shareLink(url, nama, `Yuk lihat produk ${nama} di Lapak Wonocolo Fiesta:`);
  }
  const s=myShop||{};
  const set=(id,v)=>{ const e=$(id); if (document.activeElement!==e) e.value=v||""; };
  set("#s-nama",s.nama); set("#s-pemilik",s.pemilik); set("#s-kel",s.kelurahan); set("#s-wa",s.wa); set("#s-alamat",s.alamat); set("#s-desk",s.deskripsi);
  $("#s-save").textContent = myShop ? "Simpan perubahan" : "Buka lapak";
  $("#p-add").disabled=!myShop;
  $("#p-hint").textContent = myShop ? `${myShop.produk.length} dari ${MAX_PRODUK} produk` : "Simpan profil lapak dulu, lalu tambahkan produk.";
  const pl=$("#plist"); pl.innerHTML="";
  const prods = myShop ? myShop.produk : [];
  if (myShop && !prods.length){ const e=el("div","empty"); e.appendChild(el("b",null,"Belum ada produk")); e.appendChild(document.createTextNode("Ketuk “Tambah produk” untuk memajang dagangan pertama Anda.")); pl.appendChild(e); }
  prods.forEach(p=>{
    const it=el("div","pitem"); const ph=el("div","ph"); photo(ph,p);
    const t=el("div"); t.style.minWidth="0"; t.appendChild(el("b",null,p.nama)); t.appendChild(el("span","price",rupiah(p.harga))); t.appendChild(el("span","small"," · "+p.kategori));
    const a=el("div","acts");
    const e=el("button","btn btn-g btn-sm","Ubah"); e.type="button"; e.onclick=()=>editProduct(p);
    const d=el("button","btn btn-d btn-sm","Hapus"); d.type="button";
    d.onclick=async()=>{
      if(!d.dataset.c){ d.dataset.c="1"; d.textContent="Yakin?"; setTimeout(()=>{d.textContent="Hapus";delete d.dataset.c;},3000); return; }
      d.disabled=true;
      const {error}=await sb.from("produk").delete().eq("id",p.id);
      if (error){ toast("Gagal menghapus produk"); d.disabled=false; return; }
      if (p.foto_path) sb.storage.from(BUCKET).remove([p.foto_path]);
      toast("Produk dihapus"); loadShops();
    };
    const sh=el("button","btn btn-g btn-sm","Bagikan"); sh.type="button";
    sh.onclick=()=>shareLink(prodLink(p), p.nama, `${p.nama} – ${rupiah(p.harga)} dari ${myShop.nama} di Lapak Wonocolo Fiesta:`);
    a.append(sh,e,d); it.append(ph,t,a); pl.appendChild(it);
  });
}

$("#f-shop").addEventListener("submit", async e=>{
  e.preventDefault(); if (busy) return;
  const v={ nama:$("#s-nama").value.trim(), pemilik:$("#s-pemilik").value.trim(), kelurahan:$("#s-kel").value, wa:$("#s-wa").value.trim(), alamat:$("#s-alamat").value.trim(), deskripsi:$("#s-desk").value.trim() };
  const errs=[]; if(!v.nama) errs.push("nama usaha"); if(!v.pemilik) errs.push("nama pemilik"); if(!v.kelurahan) errs.push("kelurahan");
  if(waIntl(v.wa).length<10) errs.push("nomor WhatsApp yang valid");
  $("#s-err").textContent = errs.length ? "Lengkapi dulu: "+errs.join(", ")+"." : "";
  if (errs.length) return;
  busy=true; $("#s-save").disabled=true;
  const q = myShop ? sb.from("lapak").update(v).eq("id",myShop.id) : sb.from("lapak").insert(v);
  const {error}=await q;
  busy=false; $("#s-save").disabled=false;
  if (error){ $("#s-err").textContent="Gagal menyimpan: "+error.message; return; }
  toast(myShop?"Profil tersimpan":"Lapak Anda sudah buka!"); loadShops();
});

$("#p-add").addEventListener("click",()=>{
  if (myShop && myShop.produk.length>=MAX_PRODUK){ toast(`Maksimal ${MAX_PRODUK} produk per lapak`); return; }
  editProduct(null);
});

// Kecilkan foto sebelum diunggah agar hemat kuota dan cepat dibuka di HP.
function shrinkImage(file, max=1200){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file); const img=new Image();
    img.onload=()=>{
      const r=Math.min(1,max/Math.max(img.width,img.height));
      const c=document.createElement("canvas"); c.width=Math.round(img.width*r); c.height=Math.round(img.height*r);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
      c.toBlob(b=>b?resolve(b):reject(new Error("gagal")),"image/jpeg",0.82);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error("bukan gambar")); };
    img.src=url;
  });
}

function editProduct(orig){
  const isNew=!orig;
  const p = orig ? {...orig} : {nama:"", harga:"", kategori:"Makanan", deskripsi:"", foto_path:null};
  let newFile=null;
  modal(m=>{
    const f=el("form","in"); f.noValidate=true;
    f.appendChild(el("h3",null,isNew?"Tambah produk":"Ubah produk"));
    const fld=(lab,node)=>{ const d=el("div","field"); const l=el("label",null,lab); l.htmlFor=node.id; d.append(l,node); return d; };
    const nm=el("input"); nm.type="text"; nm.id="p-nama"; nm.maxLength=70; nm.value=p.nama;
    const hr=el("input"); hr.type="number"; hr.id="p-harga"; hr.min="0"; hr.step="500"; hr.inputMode="numeric"; hr.value=p.harga;
    const kt=el("select"); kt.id="p-kat"; KAT.forEach(k=>kt.appendChild(new Option(k,k))); kt.value=p.kategori;
    const ds=el("textarea"); ds.id="p-desk"; ds.maxLength=300; ds.value=p.deskripsi||""; ds.placeholder="Ukuran, isi, rasa, cara pesan";
    f.appendChild(fld("Nama produk",nm));
    const two=el("div","two"); two.append(fld("Harga (Rp)",hr),fld("Kategori",kt)); f.appendChild(two);
    f.appendChild(fld("Deskripsi",ds));

    const pw=el("div","field"); pw.appendChild(el("span","lbl","Foto produk"));
    const prev=el("div","ph"); prev.style.borderRadius="12px"; prev.style.aspectRatio="16/10";
    const drawPrev=()=>{ prev.innerHTML=""; if(newFile){ prev.style.background="#000"; const i=new Image(); i.src=URL.createObjectURL(newFile); i.alt=""; prev.appendChild(i);} else photo(prev,{...p,nama:nm.value||"?"}); };
    drawPrev(); pw.appendChild(prev);
    const fi=el("input"); fi.type="file"; fi.id="p-foto"; fi.accept="image/*";
    const st=el("span","small","Foto akan diperkecil otomatis.");
    fi.onchange=async()=>{ const file=fi.files[0]; if(!file) return;
      st.textContent="Menyiapkan foto…";
      try{ newFile=await shrinkImage(file); drawPrev(); st.textContent="Foto siap. Akan diunggah saat disimpan."; }
      catch{ newFile=null; st.textContent="File ini tidak bisa dibaca sebagai foto. Pakai JPG atau PNG."; } };
    pw.append(fi,st); f.appendChild(pw);

    const err=el("p","err"); err.setAttribute("role","alert"); f.appendChild(err);
    const row=el("div","row"); const cancel=el("button","btn btn-g","Batal"); cancel.type="button"; cancel.onclick=closeModal;
    const save=el("button","btn btn-p",isNew?"Tambahkan":"Simpan"); save.type="submit";
    row.append(cancel,save); f.appendChild(row);

    f.onsubmit=async e=>{ e.preventDefault();
      const nama=nm.value.trim(); const harga=Math.max(0,Math.round(Number(hr.value)||0));
      if(!nama || hr.value===""){ err.textContent="Isi nama produk dan harganya."; return; }
      save.disabled=true; err.textContent="";
      let foto_path=p.foto_path||null, oldPath=null;
      if (newFile){
        const path=`${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
        const up=await sb.storage.from(BUCKET).upload(path,newFile,{contentType:"image/jpeg",cacheControl:"31536000"});
        if (up.error){ err.textContent="Foto gagal diunggah: "+up.error.message; save.disabled=false; return; }
        oldPath=foto_path; foto_path=path;
      }
      const row={nama,harga,kategori:kt.value,deskripsi:ds.value.trim(),foto_path};
      const res = isNew ? await sb.from("produk").insert({...row, lapak_id:myShop.id}) : await sb.from("produk").update(row).eq("id",orig.id);
      if (res.error){ err.textContent="Gagal menyimpan: "+res.error.message; save.disabled=false; return; }
      if (oldPath) sb.storage.from(BUCKET).remove([oldPath]);
      closeModal(); toast(isNew?"Produk ditambahkan":"Produk diperbarui"); loadShops();
    };
    m.appendChild(f);
  });
}

/* ---------- routing ---------- */
// Link khusus: #toko/<id> membuka satu lapak, #produk/<id> membuka satu produk.
function applyHash(){
  let h=location.hash; try { h=decodeURIComponent(h); } catch {}
  let m;
  if ((m=h.match(/^#toko\/(.+)$/))){
    filter.shop=m[1]; filter.kel=""; filter.cat=""; filter.q="";
    $("#q").value=""; $("#cat").value=""; scrollPending=true;
  } else if ((m=h.match(/^#produk\/(.+)$/))){
    pendingProduct=m[1]; scrollPending=true;
  }
}
function checkShop(){
  if (!shopsLoaded || !filter.shop || source().some(s=>s.id===filter.shop)) return;
  if (location.hash.startsWith("#toko/")){ toast("Lapak tidak ditemukan atau sedang disembunyikan"); setHash("#belanja"); scrollPending=false; }
  filter.shop="";
}
function tryOpenPending(){
  if (!pendingProduct || !shopsLoaded) return;
  const id=pendingProduct; pendingProduct="";
  for (const s of source()){
    const p=s.produk.find(x=>String(x.id)===id);
    if (p){ filter.shop=s.id; render(); openProduct(p,s); return; }
  }
  toast("Produk tidak ditemukan atau sudah dihapus"); setHash("#belanja");
}
function maybeScroll(){
  if (!scrollPending || !shopsLoaded) return;
  scrollPending=false; $("#grid-head").scrollIntoView({block:"start"});
}
function route(){
  const lapak = location.hash==="#lapak-saya";
  $("#view-belanja").hidden=lapak; $("#view-lapak").hidden=!lapak;
  $("#tab-belanja").setAttribute("aria-current",lapak?"false":"page");
  $("#tab-lapak").setAttribute("aria-current",lapak?"page":"false");
  if (lapak) renderDesk();
  else { applyHash(); checkShop(); render(); tryOpenPending(); maybeScroll(); }
}
addEventListener("hashchange",()=>{ const deep=/^#(toko|produk)\//.test(location.hash); route(); if(!deep) scrollTo(0,0); });

/* ---------- start ---------- */
fillFilters(); render(); route(); renderDesk();
if (sb){
  // Panggilan Supabase lain ditunda keluar dari callback agar tidak saling menunggu.
  sb.auth.onAuthStateChange((_ev, s)=>{
    session = s;
    setTimeout(async ()=>{
      isAdmin = false;
      if (s){ const {data}=await sb.rpc("is_admin"); isAdmin = data===true; }
      loadShops();
    },0);
  });
}
if ("serviceWorker" in navigator && location.protocol==="https:") navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
