(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.JUBEL_SUPABASE || {};
  const BUCKET = "product-images", MAX_IMG = 4, MAX_BYTES = 3 * 1024 * 1024;
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let sb, images = [], rows = [], msgTimer;

  function toast(t) { const m = $("msg"); m.textContent = t; m.style.display = "block"; clearTimeout(msgTimer); msgTimer = setTimeout(() => (m.style.display = "none"), 3500); }

  if (!cfg.url || /GANTI/.test(cfg.url)) { document.body.innerHTML = '<p style="padding:24px">Isi dulu <code>js/supabase-config.js</code>.</p>'; return; }
  sb = window.supabase.createClient(cfg.url, cfg.anonKey);

  async function checkSession() {
    const { data } = await sb.auth.getSession();
    const session = data.session;
    $("loginBox").hidden = !!session; $("app").hidden = !session; $("logout").hidden = !session;
    if (session) loadList();
  }

  $("loginBtn").onclick = async () => {
    const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    if (error) return toast("Gagal masuk: " + error.message);
    $("password").value = ""; checkSession();
  };
  $("logout").onclick = async () => { await sb.auth.signOut(); checkSession(); };

  async function loadList() {
    const { data, error } = await sb.from("products").select("*").order("created_at", { ascending: false });
    if (error) { $("list").textContent = "Gagal memuat (apakah email ini terdaftar di tabel admins?): " + error.message; return; }
    rows = data;
    loadLeads();
    $("list").innerHTML = rows.length ? rows.map((r) =>
      '<div class="item">' + (r.images && r.images[0] ? '<img src="' + esc(r.images[0]) + '" alt="">' : '<div class="thumb"></div>') +
      '<div class="grow"><strong>' + esc(r.title) + '</strong><br><small>' + esc(r.category) + (r.is_published ? "" : " · DRAFT") + (r.featured ? " · UNGGULAN" : "") + '</small></div>' +
      '<div class="actions"><button data-act="edit" data-id="' + esc(r.id) + '">Ubah</button>' +
      '<button class="ghost" data-act="pub" data-id="' + esc(r.id) + '">' + (r.is_published ? "Sembunyikan" : "Tayangkan") + '</button>' +
      '<button class="danger" data-act="del" data-id="' + esc(r.id) + '">Hapus</button></div></div>').join("") : "Belum ada produk.";
  }

  $("list").onclick = async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const r = rows.find((x) => x.id === b.dataset.id); if (!r) return;
    if (b.dataset.act === "edit") return fillForm(r);
    if (b.dataset.act === "pub") {
      const { error } = await sb.from("products").update({ is_published: !r.is_published }).eq("id", r.id);
      return error ? toast(error.message) : loadList();
    }
    if (b.dataset.act === "del") {
      if (!confirm('Hapus "' + r.title + '" beserta fotonya?')) return;
      const paths = (r.images || []).map(pathFromUrl).filter(Boolean);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      const { error } = await sb.from("products").delete().eq("id", r.id);
      if (error) return toast(error.message);
      toast("Produk dihapus."); loadList();
    }
  };

  function pathFromUrl(u) { const i = String(u).indexOf("/" + BUCKET + "/"); return i < 0 ? "" : decodeURIComponent(String(u).slice(i + BUCKET.length + 2).split("?")[0]); }


  /* ---------- Wilayah Indonesia (emsifa) ---------- */
  // Sumber data: Geonesia API (via jsDelivr CDN, mendukung CORS). Kode wilayah berformat BPS bertitik, mis. 11.01.01
  const WIL = "https://cdn.jsdelivr.net/gh/rezzvy/geonesia-api/data/";
  const wilCache = {};
  const S = { prov: $("f_prov"), reg: $("f_reg"), dist: $("f_dist"), vil: $("f_vil") };
  function titleCase(n) {
    n = String(n || "");
    if (n !== n.toUpperCase()) return n; // sudah huruf besar-kecil yang benar
    return n.toLowerCase().replace(/(^|[\s\-(\/])([a-z])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/\b(Dki|Di|Ntb|Ntt)\b/g, (m) => m.toUpperCase());
  }
  async function wil(path) {
    if (wilCache[path]) return wilCache[path];
    const r = await fetch(WIL + path + ".json");
    if (!r.ok) throw new Error("Data wilayah gagal dimuat (" + r.status + ")");
    return (wilCache[path] = await r.json());
  }
  const getProvinces = async () => (await wil("main")).map((x) => ({ id: x.id, name: x.province }));
  const getRegencies = async (pid) => ((await wil("cities/" + pid)).city || []).map((x) => ({ id: x.id, name: String(x.name).replace(/^KAB\./, "KABUPATEN") }));
  const getDistricts = (rid) => wil("districts/" + rid);
  const getVillages = (did) => wil("villages/" + did);
  function fillSelect(sel, items, placeholder, selected) {
    sel.innerHTML = '<option value="">' + esc(placeholder) + "</option>" +
      items.map((i) => '<option value="' + esc(i.id) + '">' + esc(titleCase(i.name)) + "</option>").join("");
    sel.disabled = !items.length;
    if (selected) sel.value = selected;
  }
  function resetSelect(sel, text) { sel.innerHTML = '<option value="">' + esc(text) + "</option>"; sel.disabled = true; }
  const selText = (sel) => (sel.value ? sel.options[sel.selectedIndex].text : "");
  async function guard(fn) { try { await fn(); } catch (e) { toast(e.message || "Gagal memuat wilayah"); } }

  async function loadProvinces(selected) { fillSelect(S.prov, await getProvinces(), "Pilih provinsi", selected); }
  S.prov.onchange = () => guard(async () => {
    resetSelect(S.dist, "Pilih kota/kabupaten dulu"); resetSelect(S.vil, "Pilih kecamatan dulu");
    if (!S.prov.value) return resetSelect(S.reg, "Pilih provinsi dulu");
    fillSelect(S.reg, await getRegencies(S.prov.value), "Pilih kota/kabupaten");
  });
  S.reg.onchange = () => guard(async () => {
    resetSelect(S.vil, "Pilih kecamatan dulu");
    if (!S.reg.value) return resetSelect(S.dist, "Pilih kota/kabupaten dulu");
    fillSelect(S.dist, await getDistricts(S.reg.value), "Pilih kecamatan");
  });
  S.dist.onchange = () => guard(async () => {
    if (!S.dist.value) return resetSelect(S.vil, "Pilih kecamatan dulu");
    fillSelect(S.vil, await getVillages(S.dist.value), "Pilih kelurahan/desa");
  });
  async function restoreWilayah(r) {
    if (!r.province_id) { await loadProvinces(); resetSelect(S.reg, "Pilih provinsi dulu"); resetSelect(S.dist, "Pilih kota/kabupaten dulu"); resetSelect(S.vil, "Pilih kecamatan dulu"); return; }
    await loadProvinces(r.province_id);
    fillSelect(S.reg, await getRegencies(r.province_id), "Pilih kota/kabupaten", r.regency_id);
    fillSelect(S.dist, await getDistricts(r.regency_id), "Pilih kecamatan", r.district_id);
    fillSelect(S.vil, await getVillages(r.district_id), "Pilih kelurahan/desa", r.village_id);
  }
  function syncAddrToggle() {
    const wa = $("f_addr_wa").checked;
    $("f_addr").disabled = wa; if (wa) $("f_addr").value = "";
  }
  $("f_addr_wa").onchange = syncAddrToggle;
  function buildLocation(byWA, detail) {
    const parts = [];
    if (!byWA && detail) parts.push(detail);
    if (S.vil.value) parts.push(selText(S.vil));
    parts.push("Kec. " + selText(S.dist), selText(S.reg), selText(S.prov));
    return parts.join(", ") + (byWA ? " · Alamat detail via WhatsApp" : "");
  }

  /* ---------- Tanah, peta, ketersediaan ---------- */
  function setAvail(v) {
    const s = $("f_availability"); v = v || "Tersedia";
    if (!Array.from(s.options).some((o) => o.value === v)) s.add(new Option(v, v));
    s.value = v;
  }
  function toggleLand() { $("landBox").hidden = $("f_category").value !== "properti"; }
  $("f_category").onchange = toggleLand;

  function parseCoords(input) {
    const s = String(input || "").trim(); if (!s) return null;
    const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
      s.match(/[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/) || s.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return { error: /goo\.gl|maps\.app/.test(s) ? "Link pendek tidak bisa dibaca. Buka link itu, lalu salin koordinat atau link panjang dari address bar." : "Format tidak dikenali. Pakai koordinat seperti -6.200000, 106.816666." };
    const lat = Number(m[1]), lng = Number(m[2]);
    if (lat < -11.5 || lat > 6.5 || lng < 94 || lng > 142) return { error: "Koordinat di luar wilayah Indonesia. Cek urutannya: latitude dulu, lalu longitude." };
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  }
  function updateMapInfo() {
    const info = $("f_map_info"), v = $("f_map").value.trim();
    const base = "Di Google Maps: tekan lama (HP) atau klik kanan (komputer) pada titik tanah, lalu ketuk angka koordinat yang muncul (otomatis tersalin) dan tempel di sini. Bisa juga menempel link Google Maps yang panjang. Link pendek (maps.app.goo.gl) tidak bisa dibaca.";
    if (!v) { info.textContent = base; return; }
    const c = parseCoords(v);
    if (c.error) info.textContent = c.error;
    else info.innerHTML = "Terbaca: " + c.lat + ", " + c.lng + ' · <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + c.lat + "," + c.lng + '">cek di Google Maps</a>';
  }
  $("f_map").oninput = updateMapInfo;

  const waNumber = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.charAt(0) === "0") d = "62" + d.slice(1); return d; };
  const rp = (n) => "Rp " + Number(n).toLocaleString("id-ID");
  const numOrNull = (id) => { const v = $(id).value; if (v === "") return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : NaN; };

  /* ---------- Peminat (leads) ---------- */
  const LEAD_STATUS = { peminat: "Peminat", survei: "Survei", nego: "Nego", deal: "Deal", komisi_dibayar: "Komisi dibayar", batal: "Batal" };
  let leads = [];
  function fillLeadProducts() {
    const cur = $("l_product").value;
    $("l_product").innerHTML = '<option value="">- Pilih produk -</option>' + rows.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.title) + "</option>").join("");
    $("l_product").value = cur;
  }
  async function loadLeads() {
    fillLeadProducts();
    const { data, error } = await sb.from("leads").select("*").order("created_at", { ascending: false });
    if (error) { $("leadList").textContent = "Gagal memuat peminat: " + error.message + " (sudah menjalankan migration-broker-tanah.sql?)"; return; }
    leads = data;
    const sum = (st) => leads.filter((l) => l.status === st).reduce((a, l) => a + (Number(l.commission) || 0), 0);
    $("leadSummary").textContent = "Aktif: " + leads.filter((l) => !["batal", "komisi_dibayar"].includes(l.status)).length +
      " · Komisi menunggu (status Deal): " + rp(sum("deal")) + " · Komisi sudah dibayar: " + rp(sum("komisi_dibayar"));
    $("leadList").innerHTML = leads.length ? leads.map((l) => {
      const p = rows.find((x) => x.id === l.product_id);
      return '<div class="item"><div class="grow"><strong>' + esc(l.buyer_name) + "</strong> · " + esc(LEAD_STATUS[l.status] || l.status) +
        "<br><small>" + esc(p ? p.title : "(produk dihapus)") + (l.survey_date ? " · survei " + esc(l.survey_date) : "") +
        (l.deal_price != null ? " · deal " + rp(l.deal_price) : "") + (l.commission != null ? " · komisi " + rp(l.commission) : "") + "</small>" +
        (l.buyer_phone ? '<br><small><a target="_blank" rel="noopener" href="https://wa.me/' + esc(waNumber(l.buyer_phone)) + '">Chat WhatsApp</a></small>' : "") + "</div>" +
        '<div class="actions"><button data-lact="edit" data-id="' + esc(l.id) + '">Ubah</button><button class="danger" data-lact="del" data-id="' + esc(l.id) + '">Hapus</button></div></div>';
    }).join("") : "Belum ada peminat.";
  }
  function resetLead() {
    $("leadFormTitle").textContent = "Catat peminat";
    ["l_id","l_name","l_phone","l_survey","l_deal","l_comm","l_notes"].forEach((i) => ($(i).value = ""));
    $("l_status").value = "peminat"; $("l_product").value = "";
  }
  $("leadReset").onclick = resetLead;
  $("leadList").onclick = async (e) => {
    const b = e.target.closest("button[data-lact]"); if (!b) return;
    const l = leads.find((x) => x.id === b.dataset.id); if (!l) return;
    if (b.dataset.lact === "edit") {
      $("leadFormTitle").textContent = "Ubah peminat";
      $("l_id").value = l.id; $("l_product").value = l.product_id || ""; $("l_name").value = l.buyer_name || ""; $("l_phone").value = l.buyer_phone || "";
      $("l_status").value = l.status; $("l_survey").value = l.survey_date || ""; $("l_deal").value = l.deal_price == null ? "" : l.deal_price;
      $("l_comm").value = l.commission == null ? "" : l.commission; $("l_notes").value = l.notes || "";
      $("leadFormTitle").scrollIntoView({ behavior: "smooth" });
    } else if (confirm('Hapus catatan peminat "' + l.buyer_name + '"?')) {
      const { error } = await sb.from("leads").delete().eq("id", l.id);
      if (error) return toast(error.message);
      loadLeads();
    }
  };
  $("leadSave").onclick = async () => {
    const name = $("l_name").value.trim(); if (!name) return toast("Nama calon pembeli wajib diisi.");
    const deal = numOrNull("l_deal"), comm = numOrNull("l_comm");
    if (Number.isNaN(deal) || Number.isNaN(comm)) return toast("Harga deal / komisi tidak valid.");
    const payload = { product_id: $("l_product").value || null, buyer_name: name, buyer_phone: $("l_phone").value.replace(/[^\d]/g, "") || null,
      status: $("l_status").value, survey_date: $("l_survey").value || null, deal_price: deal, commission: comm, notes: $("l_notes").value.trim() || null };
    const id = $("l_id").value;
    const { error } = id ? await sb.from("leads").update(payload).eq("id", id) : await sb.from("leads").insert(payload);
    if (error) return toast("Gagal: " + error.message);
    toast("Peminat tersimpan."); resetLead(); loadLeads();
  };

  function renderImgs() {
    $("f_imgs").innerHTML = images.map((u, i) => '<div><img class="thumb" src="' + esc(u) + '" alt=""><button type="button" data-i="' + i + '" aria-label="Hapus foto">×</button></div>').join("");
  }
  $("f_imgs").onclick = (e) => { const b = e.target.closest("button[data-i]"); if (b) { images.splice(Number(b.dataset.i), 1); renderImgs(); } };

  function fillForm(r) {
    $("formTitle").textContent = "Ubah produk";
    $("f_id").value = r.id; $("f_title").value = r.title || ""; $("f_category").value = r.category;
    $("f_price").value = r.price == null ? "" : r.price; $("f_price_label").value = r.price_label || "";
    $("f_short").value = r.short_description || ""; $("f_desc").value = r.description || "";
    $("f_condition").value = r.condition || "";
    $("f_addr_wa").checked = !!r.address_by_whatsapp; $("f_addr").value = r.address_detail || ""; syncAddrToggle();
    guard(() => restoreWilayah(r));
    setAvail(r.availability);
    $("f_land").value = r.land_area == null ? "" : r.land_area; $("f_cert").value = r.certificate_type || "";
    $("f_road").value = r.road_width == null ? "" : r.road_width;
    $("f_map").value = r.map_lat != null && r.map_lng != null ? r.map_lat + ", " + r.map_lng : ""; updateMapInfo();
    ["f_sname","f_sphone","f_smin","f_snote"].forEach((i) => ($(i).value = ""));
    sb.from("product_private").select("*").eq("product_id", r.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      $("f_sname").value = data.seller_name || ""; $("f_sphone").value = data.seller_phone || "";
      $("f_smin").value = data.seller_min_price == null ? "" : data.seller_min_price; $("f_snote").value = data.notes || "";
    });
    $("f_badge").value = r.badge || ""; $("f_featured").checked = !!r.featured; $("f_published").checked = !!r.is_published;
    toggleLand(); images = (r.images || []).slice(); renderImgs(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function resetForm() {
    $("formTitle").textContent = "Tambah produk";
    ["f_id","f_title","f_price","f_price_label","f_short","f_desc","f_condition","f_addr","f_badge","f_land","f_road","f_map","f_sname","f_sphone","f_smin","f_snote"].forEach((i) => ($(i).value = ""));
    $("f_addr_wa").checked = false; syncAddrToggle(); guard(() => restoreWilayah({}));
    $("f_category").value = "properti"; setAvail("Tersedia"); $("f_cert").value = ""; $("f_files").value = ""; updateMapInfo(); toggleLand();
    $("f_featured").checked = false; $("f_published").checked = true; images = []; renderImgs();
  }
  $("resetBtn").onclick = resetForm;

  async function uploadFiles(files) {
    const out = [];
    for (const f of files) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error(f.name + ": format harus JPG/PNG/WEBP");
      if (f.size > MAX_BYTES) throw new Error(f.name + ": maksimal 3 MB");
      const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
      const path = new Date().getFullYear() + "/" + crypto.randomUUID() + "." + ext;
      const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, cacheControl: "31536000" });
      if (error) throw error;
      out.push(sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    }
    return out;
  }

  $("saveBtn").onclick = async () => {
    const btn = $("saveBtn"); const title = $("f_title").value.trim();
    if (!title) return toast("Nama produk wajib diisi.");
    if (!S.prov.value || !S.reg.value || !S.dist.value) return toast("Lengkapi lokasi: provinsi, kota/kabupaten, dan kecamatan.");
    if (S.vil.options.length > 1 && !S.vil.value) return toast("Pilih kelurahan/desa.");
    const byWA = $("f_addr_wa").checked, detail = byWA ? "" : $("f_addr").value.trim();
    const isLand = $("f_category").value === "properti";
    let coords = null;
    if (isLand && $("f_map").value.trim()) { coords = parseCoords($("f_map").value); if (coords.error) return toast(coords.error); }
    const landArea = isLand ? numOrNull("f_land") : null, roadWidth = isLand ? numOrNull("f_road") : null, minPrice = numOrNull("f_smin");
    if ([landArea, roadWidth, minPrice].some(Number.isNaN)) return toast("Luas, lebar jalan, atau harga minimal tidak valid.");
    if (landArea === 0) return toast("Luas tanah harus lebih dari 0.");
    const files = Array.from($("f_files").files || []);
    if (images.length + files.length > MAX_IMG) return toast("Maksimal " + MAX_IMG + " foto.");
    const price = $("f_price").value === "" ? null : Number($("f_price").value);
    if (price != null && (!Number.isFinite(price) || price < 0)) return toast("Harga tidak valid.");
    btn.disabled = true; btn.textContent = "MENYIMPAN...";
    try {
      const uploaded = files.length ? await uploadFiles(files) : [];
      const payload = {
        title, category: $("f_category").value, price, price_label: $("f_price_label").value.trim() || null,
        short_description: $("f_short").value.trim() || null, description: $("f_desc").value.trim() || null,
        condition: $("f_condition").value.trim() || null,
        location: buildLocation(byWA, detail),
        province_id: S.prov.value, province: selText(S.prov), regency_id: S.reg.value, regency: selText(S.reg),
        district_id: S.dist.value, district: selText(S.dist), village_id: S.vil.value || null, village: selText(S.vil) || null,
        address_detail: detail || null, address_by_whatsapp: byWA,
        availability: $("f_availability").value || null,
        land_area: landArea, certificate_type: isLand ? ($("f_cert").value || null) : null, road_width: roadWidth,
        map_lat: coords ? coords.lat : null, map_lng: coords ? coords.lng : null,
        badge: $("f_badge").value.trim() || null, featured: $("f_featured").checked,
        is_published: $("f_published").checked, images: images.concat(uploaded)
      };
      const id = $("f_id").value;
      let productId = id;
      if (id) { const { error } = await sb.from("products").update(payload).eq("id", id); if (error) throw error; }
      else { const { data, error } = await sb.from("products").insert(payload).select("id").single(); if (error) throw error; productId = data.id; }
      const priv = { product_id: productId, seller_name: $("f_sname").value.trim() || null, seller_phone: $("f_sphone").value.replace(/[^\d]/g, "") || null,
        seller_min_price: minPrice, notes: $("f_snote").value.trim() || null };
      if (id || priv.seller_name || priv.seller_phone || priv.seller_min_price != null || priv.notes) {
        const { error: pe } = await sb.from("product_private").upsert(priv, { onConflict: "product_id" });
        if (pe) throw new Error("Produk tersimpan, tapi data privat gagal: " + pe.message);
      }
      toast("Tersimpan."); resetForm(); loadList();
    } catch (err) { toast("Gagal: " + (err.message || err)); }
    finally { btn.disabled = false; btn.textContent = "SIMPAN"; }
  };

  guard(() => loadProvinces());
  toggleLand(); updateMapInfo();
  checkSession();
})();
