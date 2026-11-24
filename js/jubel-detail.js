document.addEventListener("DOMContentLoaded", async function () {
  await window.JUBEL_READY;
  const params = new URLSearchParams(window.location.search);
  const productId = params.get("id");
  const product = (window.JUBEL_PRODUCTS || []).find(item => String(item.id) === productId);
  const main = document.querySelector("main.product-detail-page");
  const layout = document.querySelector(".product-detail-layout");
  const descriptionSection = document.querySelector(".product-description-section");
  const whatsappButton = document.getElementById("productWhatsapp");

  if (!product) {
    if (layout) layout.hidden = true;
    if (descriptionSection) descriptionSection.hidden = true;
    if (main) {
      const notice = document.createElement("section");
      notice.className = "catalog-empty product-not-found";
      notice.innerHTML = '<h2>Produk tidak ditemukan.</h2><p>Produk mungkin belum dipasang atau listing sudah tidak tersedia.</p><a class="btn-primary" href="jual-beli.html">KEMBALI KE ETALASE</a>';
      main.appendChild(notice);
    }
    return;
  }


  const setText = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = value == null || value === "" ? "—" : String(value); };
  const categoryLabel = window.JUBEL_CATEGORY_LABELS[product.category] || "LAINNYA";
  const utils = window.JUBEL_PRODUCT_UTILS;
  document.title = product.title + " | JUBEL";
  setText(".product-detail-category", categoryLabel);
  setText(".product-detail-info h1", product.title);
  setText(".product-detail-subtitle", product.shortDescription || "");
  setText(".product-detail-price", utils.formatPrice(product));
  setText(".product-highlight:nth-child(1) p", product.condition || "Belum dicantumkan");
  setText(".product-highlight:nth-child(2) p", product.location || "Belum dicantumkan");
  setText(".product-highlight:nth-child(3) p", product.availability || "Konfirmasi kepada penjual");
  setText(".product-description-content p:first-of-type", product.description || product.shortDescription || "Informasi lengkap belum dicantumkan.");

  const mainPlaceholder = document.querySelector(".product-main-placeholder");
  const thumbnails = document.querySelector(".product-thumbnail-placeholder");
  const images = Array.isArray(product.images) ? product.images.filter(Boolean).slice(0, 4) : [];
  if (mainPlaceholder && images.length) mainPlaceholder.innerHTML = '<img src="' + utils.escapeHTML(images[0]) + '" alt="' + utils.escapeHTML(product.title) + '" class="product-detail-main-image">';
  if (thumbnails) {
    if (images.length > 1) thumbnails.innerHTML = images.slice(1, 4).map(src => '<div class="product-thumbnail-image"><img src="' + utils.escapeHTML(src) + '" alt="Foto tambahan produk" loading="lazy"></div>').join("");
    else thumbnails.innerHTML = '<div>FOTO 02</div><div>FOTO 03</div><div>FOTO 04</div>';
  }
  /* Detail tanah & peta */
  const landSection = document.getElementById("landSection");
  if (landSection) {
    const E = utils.escapeHTML, n = (v) => Number(v).toLocaleString("id-ID");
    const specs = [];
    if (product.landArea) specs.push(["LUAS TANAH", n(product.landArea) + " m²"]);
    const perM2 = utils.pricePerM2(product);
    if (perM2) specs.push(["HARGA PER M²", "Rp " + n(perM2)]);
    if (product.certificateType) specs.push(["SERTIFIKAT", product.certificateType]);
    if (product.roadWidth) specs.push(["LEBAR AKSES JALAN", n(product.roadWidth) + " m"]);
    if (product.availability) specs.push(["STATUS", product.availability]);
    const hasMap = product.mapLat != null && product.mapLng != null;
    if (specs.length || hasMap) {
      landSection.hidden = false;
      document.getElementById("landSpecs").innerHTML = specs.map(function (x) {
        return '<div class="land-spec"><span>' + E(x[0]) + '</span><strong>' + E(x[1]) + '</strong></div>';
      }).join("");
    }
    if (hasMap) {
      const lat = Number(product.mapLat), lng = Number(product.mapLng);
      const box = document.getElementById("landMap");
      box.hidden = false;
      box.innerHTML = '<iframe title="Peta lokasi" loading="lazy" referrerpolicy="no-referrer-when-downgrade" ' +
        'src="https://maps.google.com/maps?q=' + lat + ',' + lng + '&z=16&output=embed"></iframe>' +
        '<a class="land-map-link" href="https://www.google.com/maps?q=' + lat + ',' + lng + '" target="_blank" rel="noopener noreferrer">BUKA DI GOOGLE MAPS &rarr;</a>';
    }
  }

  const badge = document.querySelector(".product-detail-badge");
  if (badge) { if (product.badge) badge.textContent = product.badge; else badge.hidden = true; }
  const waURL = utils.whatsappURL(product);
  if (whatsappButton) {
    if (waURL) {
      whatsappButton.href = waURL;
      whatsappButton.target = "_blank";
      whatsappButton.rel = "noopener noreferrer";
    } else {
      whatsappButton.removeAttribute("href");
      whatsappButton.setAttribute("aria-disabled", "true");
      whatsappButton.classList.add("is-disabled");
    }
  }
});
