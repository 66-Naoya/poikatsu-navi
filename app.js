(function(){
  "use strict";

  var STORE_KEY = "poikatsu_navi_v1";
  var KIND_LABELS = { credit:"クレジット", qr:"QRコード決済", emoney:"電子マネー", point:"ポイントカード", debit:"デビット" };
  var KIND_ORDER = ["credit","qr","emoney","point","debit"];

  // Each category can carry an OSM tag ("key=value") used to pull candidate
  // points of interest from the Overpass API within the scan radius, plus
  // a brand[] substring list to route a POI to a specific chain instead of
  // its group's fallback ("その他...") bucket. Categories with neither
  // (e.g. ネットショッピング) are manual-only and never appear in a scan.
  var SEED_CATEGORIES = (function(){
    var defs = [
      ["コンビニ", "shop=convenience", "🏪", [
        ["セブン-イレブン", ["セブン-イレブン","7-eleven","seven-eleven"]],
        ["ローソン", ["ローソン","lawson"]],
        ["ファミリーマート", ["ファミリーマート","familymart","family mart"]],
        ["ミニストップ", ["ミニストップ","ministop"]]
      ]],
      ["スーパー", "shop=supermarket", "🛒", [
        ["イオン", ["イオン","aeon"]],
        ["イトーヨーカドー", ["イトーヨーカドー","ito-yokado","itoyokado"]],
        ["西友", ["西友","seiyu"]],
        ["ライフ", ["ライフ","life corporation"]]
      ]],
      ["ドラッグストア", "shop=chemist", "💊", [
        ["マツモトキヨシ", ["マツモトキヨシ","matsumotokiyoshi","matsukiyo"]],
        ["ウエルシア", ["ウエルシア","welcia"]],
        ["ツルハドラッグ", ["ツルハ","tsuruha"]],
        ["サンドラッグ", ["サンドラッグ","sundrug"]]
      ]],
      ["ファストフード", "amenity=fast_food", "🍔", [
        ["マクドナルド", ["マクドナルド","mcdonald"]],
        ["モスバーガー", ["モスバーガー","mos burger","mosburger"]],
        ["ケンタッキーフライドチキン", ["ケンタッキー","kfc","kentucky"]],
        ["吉野家", ["吉野家","yoshinoya"]],
        ["すき家", ["すき家","sukiya"]]
      ]],
      ["ファミレス", "amenity=restaurant", "🍛", [
        ["サイゼリヤ", ["サイゼリヤ","saizeriya"]],
        ["ガスト", ["ガスト","gusto"]],
        ["バーミヤン", ["バーミヤン","bamiyan"]],
        ["ジョナサン", ["ジョナサン","jonathan"]]
      ]],
      ["回転寿司", "amenity=restaurant", "🍣", [
        ["はま寿司", ["はま寿司","hamazushi","hama-zushi"]],
        ["かっぱ寿司", ["かっぱ寿司","kappa-zushi","kappazushi"]],
        ["スシロー", ["スシロー","sushiro"]],
        ["くら寿司", ["くら寿司","kurazushi","kura sushi"]]
      ]],
      ["カフェ", "amenity=cafe", "☕", [
        ["スターバックス", ["スターバックス","starbucks"]],
        ["ドトール", ["ドトール","doutor"]],
        ["タリーズ", ["タリーズ","tully"]],
        ["エクセルシオール", ["エクセルシオール","excelsior"]]
      ]],
      ["ガソリンスタンド", "amenity=fuel", "⛽", [
        ["ENEOS", ["eneos"]],
        ["出光", ["出光","idemitsu"]],
        ["コスモ石油", ["コスモ","cosmo"]]
      ]],
      ["家電量販店", "shop=electronics", "🔌", [
        ["ビックカメラ", ["ビックカメラ","bic camera","biccamera"]],
        ["ヨドバシカメラ", ["ヨドバシ","yodobashi"]],
        ["ヤマダ電機", ["ヤマダ","yamada"]],
        ["ケーズデンキ", ["ケーズデンキ","ケーズ","k's denki"]]
      ]],
      ["百貨店", "shop=department_store", "🏬", [
        ["三越伊勢丹", ["伊勢丹","三越","isetan","mitsukoshi"]],
        ["高島屋", ["高島屋","takashimaya"]],
        ["大丸松坂屋", ["大丸","松坂屋","daimaru","matsuzakaya"]]
      ]]
    ];
    var out = [];
    var order = 0;
    var slug = function(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); };
    defs.forEach(function(def){
      var group = def[0], osmTag = def[1], icon = def[2], chains = def[3];
      chains.forEach(function(chain){
        out.push({ id: "cat_" + slug(group) + "_" + slug(chain[0]), name: chain[0], icon: icon, order: order++, group: group, osmTag: osmTag, brand: chain[1] });
      });
      out.push({ id: "cat_" + slug(group) + "_other", name: "その他" + group, icon: icon, order: order++, group: group, osmTag: osmTag, fallback: true });
    });
    out.push({ id: "cat_restaurant", name: "飲食店", icon: "🍽️", order: order++, group: "飲食店", osmTag: "amenity=restaurant", fallback: true });
    out.push({ id: "cat_online", name: "ネットショッピング", icon: "📦", order: order++, group: "ネットショッピング" });
    return out;
  })();

  var SEED_CARD_GROUP_RATES = {
    card_rakuten: { "default": 1.0, "ネットショッピング": 3.0 },
    card_paypay: { "default": 0.5, "ドラッグストア": 1.5, "ネットショッピング": 1.0 },
    card_dcard: { "default": 1.0, "コンビニ": 3.0 },
    card_waon: { "default": 0.5, "スーパー": 1.5 }
  };
  var SEED_CARDS = [
    {id:"card_rakuten", name:"楽天カード", kind:"credit", order:0, note:"楽天市場での利用は上乗せ加算がある例"},
    {id:"card_paypay", name:"PayPay", kind:"qr", order:1, note:"PayPayステップ達成時の例"},
    {id:"card_dcard", name:"dカード", kind:"credit", order:2, note:"特約店(コンビニ等)での利用例"},
    {id:"card_waon", name:"WAON", kind:"emoney", order:3, note:"イオン系列店での利用例"}
  ].map(function(c){
    var groupRates = SEED_CARD_GROUP_RATES[c.id];
    var rates = {};
    SEED_CATEGORIES.forEach(function(cat){
      rates[cat.id] = (groupRates[cat.group] != null) ? groupRates[cat.group] : groupRates["default"];
    });
    return Object.assign({}, c, { rates: rates });
  });
  var SEED_PLACES = [
    {id:"place_sample", name:"（例）自宅近くのコンビニ", catId:"cat_conveni_other", lat:35.681236, lng:139.767125, radius:200,
      note:"サンプルです。削除して自分の場所に登録し直してください"}
  ];

  var app = document.getElementById("app");

  var categories = [];
  var cards = [];
  var places = [];

  var view = "home";
  var settingsTab = "cards";
  var expandedId = null;
  var manualCategoryId = null;

  var position = null;
  var geoStatus = "idle";
  var geoDebug = "";

  var deferredInstallPrompt = null;
  var importOpen = false;
  var importResult = null;
  var importCatOpen = false;
  var importCatResult = null;
  var pendingDelete = null; // { kind: "card"|"place"|"category", id }
  var placeDraft = null; // { status, lat, lng, name, address, catId, radius, geocodeError, error, pasteStatus }
  var placeLookupStatus = {}; // placeId -> "loading" | "error"

  var SCAN_RADIUS_M = 500;
  var OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];
  var scanState = { status: "idle", results: [], error: null, scannedAt: null };

  function deleteConfirmHtml(kind, id, label){
    if (pendingDelete && pendingDelete.kind === kind && pendingDelete.id === id){
      return (
        '<div class="row-actions">' +
          '<span style="color:#B23B3B;font-size:0.78rem;font-weight:600">本当に削除しますか？</span>' +
          '<span style="display:flex;gap:6px">' +
            '<button class="btn small" data-action="cancel-delete">キャンセル</button>' +
            '<button class="btn danger small" data-action="confirm-delete" data-kind="'+kind+'" data-id="'+id+'">削除する</button>' +
          '</span>' +
        '</div>'
      );
    }
    return '<div class="row-actions"><button class="btn danger small" data-action="ask-delete" data-kind="'+kind+'" data-id="'+id+'">🗑 '+label+'</button></div>';
  }

  function uid(prefix){
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  }

  function loadStore(){
    try{
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.categories)) return null;
      return data;
    } catch(e){ return null; }
  }
  function saveStore(){
    try{
      localStorage.setItem(STORE_KEY, JSON.stringify({ categories:categories, cards:cards, places:places }));
    } catch(e){ /* storage unavailable — app still works for this session */ }
  }

  function initData(){
    var stored = loadStore();
    if (stored){
      categories = stored.categories || [];
      cards = stored.cards || [];
      places = stored.places || [];
    } else {
      categories = SEED_CATEGORIES.map(function(c){ return Object.assign({}, c); });
      cards = SEED_CARDS.map(function(c){ return Object.assign({}, c, { rates: Object.assign({}, c.rates) }); });
      places = SEED_PLACES.map(function(p){ return Object.assign({}, p); });
      saveStore();
    }
  }

  function byOrder(a,b){ return (a.order||0) - (b.order||0); }

  function toRad(d){ return d * Math.PI / 180; }
  function distMeters(lat1,lng1,lat2,lng2){
    var R=6371000;
    var dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
    var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)*Math.sin(dLng/2);
    return 2*R*Math.asin(Math.sqrt(a));
  }
  function fmtDist(m){
    if (m < 1000) return Math.round(m) + "m";
    return (m/1000).toFixed(1) + "km";
  }
  function mapsLink(lat, lng){
    // "q=" (not "search/?api=1&query=") is the classic Google Maps deep-link
    // format that reliably drops a pin at the exact coordinate instead of
    // sometimes falling back to the device's current location.
    return "https://www.google.com/maps?q=" + lat + "," + lng;
  }
  function parseLatLngPaste(text){
    var m = String(text || "").trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (!m) return null;
    return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  function forwardGeocode(query, onResult){
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=" + encodeURIComponent(query);
    fetch(url, { headers: { "Accept": "application/json" } })
      .then(function(r){ return r.json(); })
      .then(function(results){
        if (results && results[0]){
          onResult({
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
            address: results[0].display_name || query,
            name: shortAddressLabel(results[0])
          });
        } else {
          onResult(null);
        }
      })
      .catch(function(){ onResult(null); });
  }
  function esc(s){
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }
  function catName(id){
    var c = categories.filter(function(x){return x.id===id;})[0];
    return c ? c.icon + " " + c.name : "（削除済みカテゴリ）";
  }

  function requestLocation(){
    if (!navigator.geolocation){ geoStatus = "unsupported"; geoDebug = "navigator.geolocation is undefined"; render(); return; }
    geoStatus = "pending"; render();
    try{
      navigator.geolocation.getCurrentPosition(function(pos){
        position = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        geoStatus = "ok"; render();
      }, function(err){
        geoStatus = err.code === 1 ? "denied" : "error";
        geoDebug = "code=" + err.code + " " + (err.message || "");
        render();
      }, { enableHighAccuracy:true, timeout:8000, maximumAge:60000 });
    } catch(e){
      geoStatus = "error";
      geoDebug = "exception: " + (e && e.message ? e.message : e);
      render();
    }
  }

  function shortAddressLabel(data){
    var a = (data && data.address) || {};
    var parts = [
      a.shop, a.amenity, a.building, a.office,
      a.road, a.neighbourhood, a.suburb, a.city_district, a.town, a.city
    ].filter(Boolean);
    var label = parts.slice(0, 3).join(" ");
    return label || (data && data.display_name) || "";
  }

  function reverseGeocode(lat, lng){
    var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat + "&lon=" + lng + "&zoom=18&addressdetails=1";
    fetch(url, { headers: { "Accept": "application/json" } })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (!placeDraft) return;
        placeDraft.address = (data && data.display_name) || "";
        placeDraft.name = shortAddressLabel(data) || "新しい場所";
        placeDraft.status = "ready";
        render();
      })
      .catch(function(){
        if (!placeDraft) return;
        placeDraft.status = "ready";
        placeDraft.name = "新しい場所";
        placeDraft.geocodeError = true;
        render();
      });
  }

  function startAddPlace(){
    placeDraft = {
      status: "locating",
      lat: null, lng: null,
      name: "", address: "",
      catId: (categories.slice().sort(byOrder)[0] || {}).id || "",
      radius: 200,
      geocodeError: false,
      error: null
    };
    render();

    function onFix(lat, lng, accuracy){
      position = { lat: lat, lng: lng, accuracy: accuracy };
      placeDraft.lat = lat; placeDraft.lng = lng;
      placeDraft.status = "geocoding";
      render();
      reverseGeocode(lat, lng);
    }

    if (position){
      onFix(position.lat, position.lng, position.accuracy);
      return;
    }
    if (!navigator.geolocation){
      placeDraft.status = "error";
      placeDraft.error = "この端末では位置情報を取得できません";
      render();
      return;
    }
    navigator.geolocation.getCurrentPosition(function(pos){
      onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    }, function(err){
      if (!placeDraft) return;
      placeDraft.status = "error";
      placeDraft.error = "位置情報を取得できませんでした(code=" + err.code + " " + (err.message || "") + ")";
      render();
    }, { enableHighAccuracy:true, timeout:8000, maximumAge:60000 });
  }

  function placeDistances(){
    if (!position) return [];
    return places.map(function(p){
      return { place:p, distance: distMeters(position.lat, position.lng, p.lat, p.lng) };
    }).sort(function(a,b){ return a.distance-b.distance; });
  }
  function matchedEntry(){
    var list = placeDistances();
    for (var i=0;i<list.length;i++){
      var r = list[i].place.radius || 300;
      if (list[i].distance <= r) return list[i];
    }
    return null;
  }

  function effectiveCategoryId(){
    if (manualCategoryId) return manualCategoryId;
    var m = matchedEntry();
    return m ? m.place.catId : null;
  }

  var OSM_TAG_ALIASES = { "shop=chemist": ["shop=chemist", "shop=drugstore"] };
  function osmTagVariants(osmTag){ return OSM_TAG_ALIASES[osmTag] || [osmTag]; }

  function classifyElementTags(tags){
    var matching = categories.filter(function(c){
      if (!c.osmTag) return false;
      return osmTagVariants(c.osmTag).some(function(variant){
        var kv = variant.split("=");
        return tags[kv[0]] === kv[1];
      });
    });
    if (matching.length === 0) return null;
    var text = (((tags.brand || "") + " " + (tags.name || "")).toLowerCase());
    var brandMatch = matching.filter(function(c){ return c.brand && c.brand.length; })
      .filter(function(c){ return c.brand.some(function(b){ return text.indexOf(String(b).toLowerCase()) !== -1; }); })[0];
    if (brandMatch) return brandMatch.id;
    var fallback = matching.filter(function(c){ return c.fallback; })[0];
    return fallback ? fallback.id : null;
  }

  function bestCardFor(catId){
    if (cards.length === 0) return null;
    var ranked = cards.map(function(c){
      return { card: c, rate: (c.rates && typeof c.rates[catId] === "number") ? c.rates[catId] : 0 };
    }).sort(function(a, b){ return b.rate - a.rate; });
    return ranked[0];
  }

  function scanNearby(){
    if (!position){
      scanState = { status: "error", results: [], error: "先に現在地を取得してください(ホーム画面上部の更新ボタン)", scannedAt: null };
      render();
      return;
    }
    scanState = { status: "loading", results: [], error: null, scannedAt: null };
    render();

    var tagSet = {};
    categories.forEach(function(c){
      if (!c.osmTag) return;
      osmTagVariants(c.osmTag).forEach(function(t){ tagSet[t] = true; });
    });
    var tagList = Object.keys(tagSet);
    if (tagList.length === 0){
      scanState = { status: "error", results: [], error: "スキャン対象のカテゴリがありません(カテゴリ設定を確認してください)", scannedAt: null };
      render();
      return;
    }
    var clauses = tagList.map(function(t){
      var kv = t.split("=");
      return 'node["' + kv[0] + '"="' + kv[1] + '"](around:' + SCAN_RADIUS_M + ',' + position.lat + ',' + position.lng + ');';
    }).join("");
    var query = "[out:json][timeout:25];(" + clauses + ");out body;";

    function tryEndpoint(i){
      if (i >= OVERPASS_ENDPOINTS.length){
        scanState = { status: "error", results: [], error: "スキャンに失敗しました(通信エラー)。しばらくしてから再度お試しください。", scannedAt: null };
        render();
        return;
      }
      fetch(OVERPASS_ENDPOINTS[i], {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query)
      })
        .then(function(r){ if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function(data){
          var results = [];
          (data.elements || []).forEach(function(el){
            if (el.type !== "node" || el.lat == null || el.lon == null) return;
            var catId = classifyElementTags(el.tags || {});
            if (!catId) return;
            var dist = distMeters(position.lat, position.lng, el.lat, el.lon);
            if (dist > SCAN_RADIUS_M) return;
            results.push({ name: (el.tags && el.tags.name) || "(名称不明)", catId: catId, distance: dist });
          });
          results.sort(function(a, b){ return a.distance - b.distance; });
          scanState = { status: "done", results: results, error: null, scannedAt: Date.now() };
          render();
        })
        .catch(function(){ tryEndpoint(i + 1); });
    }
    tryEndpoint(0);
  }

  function init(){
    initData();
    requestLocation();
    render();

    if ("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js").catch(function(){});
    }
    window.addEventListener("beforeinstallprompt", function(e){
      e.preventDefault();
      deferredInstallPrompt = e;
      render();
    });
  }

  // ---------- render ----------
  function render(){
    app.innerHTML = topbarHtml() + installBannerHtml() + (view === "settings" ? settingsHtml() : homeHtml());
  }

  function topbarHtml(){
    return (
      '<div class="topbar">' +
        '<div class="brand"><span class="mark">🪙</span><div>' +
          '<h1>ポイ活ナビ</h1>' +
          '<div class="tagline">現在地から一番お得な支払い方法を提案</div>' +
        '</div></div>' +
        '<button class="icon-btn" data-action="'+(view==="settings"?"close-settings":"open-settings")+'" title="設定" aria-label="設定">'+(view==="settings"?"✕":"⚙️")+'</button>' +
      '</div>'
    );
  }

  function installBannerHtml(){
    if (!deferredInstallPrompt) return '';
    return (
      '<div class="install-banner show">' +
        '<span>📲 ホーム画面に追加してアプリのように使えます</span>' +
        '<button class="btn small" data-action="install-app">追加する</button>' +
      '</div>'
    );
  }

  function statusHtml(){
    var m = matchedEntry();
    var dists = placeDistances();

    if (geoStatus === "pending" || geoStatus === "idle"){
      return (
        '<div class="status-panel">' +
          '<div class="status-line"><span class="glyph">📡</span><div>' +
            '<div class="status-title">現在地を確認中…</div>' +
            '<div class="status-sub">位置情報の利用を許可すると自動で判定します</div>' +
          '</div></div>' +
        '</div>'
      );
    }
    if (geoStatus === "denied" || geoStatus === "unsupported" || geoStatus === "error"){
      return (
        '<div class="status-panel">' +
          '<div class="status-line"><span class="glyph">🧭</span><div>' +
            '<div class="status-title">位置情報を利用できません</div>' +
            '<div class="status-sub">'+(geoStatus==="denied" ? "位置情報の許可が拒否されています。ブラウザのサイト設定から許可してください。" : "この端末では取得できませんでした。下からカテゴリを選んでください。")+'</div>' +
            (geoDebug ? '<div class="status-meta num">詳細: '+esc(geoDebug)+'</div>' : '') +
          '</div></div>' +
          '<div class="status-actions"><button class="btn" data-action="refresh-location">📍 位置情報を再取得</button></div>' +
        '</div>'
      );
    }

    if (m){
      return (
        '<div class="status-panel matched">' +
          '<div class="status-line"><span class="glyph">📍</span><div>' +
            '<div class="status-title">'+esc(m.place.name)+' の近くです</div>' +
            '<div class="status-sub">'+catName(m.place.catId)+'・約'+fmtDist(m.distance)+'先 として自動判定</div>' +
          '</div></div>' +
          '<div class="status-meta num">現在地 '+position.lat.toFixed(4)+', '+position.lng.toFixed(4)+'（誤差 ±'+Math.round(position.accuracy)+'m）</div>' +
          (manualCategoryId && manualCategoryId !== m.place.catId ?
            '<div class="status-actions"><span class="chip active">'+catName(manualCategoryId)+' を手動選択中</span><button class="btn ghost" data-action="reset-auto">自動判定に戻す</button></div>' : '') +
        '</div>'
      );
    }

    var nearest = dists[0];
    return (
      '<div class="status-panel">' +
        '<div class="status-line"><span class="glyph">🧭</span><div>' +
          '<div class="status-title">近くに登録済みの場所がありません</div>' +
          '<div class="status-sub">下からカテゴリを選ぶか、場所を登録してください</div>' +
        '</div></div>' +
        '<div class="status-meta num">現在地 '+position.lat.toFixed(4)+', '+position.lng.toFixed(4)+'（誤差 ±'+Math.round(position.accuracy)+'m）</div>' +
        (nearest ?
          '<div class="place-suggest"><span>最寄り登録地: <strong>'+esc(nearest.place.name)+'</strong>（'+fmtDist(nearest.distance)+'）</span>' +
          '<button class="btn small" data-action="select-category" data-id="'+nearest.place.catId+'">この場所として選択</button></div>' : '') +
        '<div class="status-actions"><button class="btn" data-action="refresh-location">📍 現在地を更新</button></div>' +
      '</div>'
    );
  }

  function chipGridHtml(){
    var effId = effectiveCategoryId();
    if (categories.length === 0){
      return '<div class="empty-note">カテゴリが登録されていません。設定から追加してください。</div>';
    }
    var groups = {};
    var groupOrder = [];
    categories.slice().sort(byOrder).forEach(function(c){
      var g = c.group || c.name;
      if (!groups[g]){ groups[g] = []; groupOrder.push(g); }
      groups[g].push(c);
    });
    return groupOrder.map(function(g){
      var chips = groups[g].map(function(c){
        var active = c.id === effId;
        return '<button class="chip'+(active?' active':'')+'" data-action="select-category" data-id="'+c.id+'">' +
          '<span class="g">'+esc(c.icon||"")+'</span>'+esc(c.name)+'</button>';
      }).join("");
      return '<div class="chip-group-label">'+esc(g)+'</div><div class="chip-grid">'+chips+'</div>';
    }).join("");
  }

  function rankListHtml(){
    var catId = effectiveCategoryId();
    if (!catId){
      return '<div class="rank-list"><div class="empty-note">カテゴリを選ぶと、最適なカード・決済アプリを表示します</div></div>';
    }
    if (cards.length === 0){
      return '<div class="rank-list"><div class="empty-note">カードが登録されていません。設定から追加してください。<br><button class="btn small" style="margin-top:8px" data-action="open-settings-cards">設定を開く</button></div></div>';
    }
    var ranked = cards.map(function(c){
      var rate = (c.rates && typeof c.rates[catId] === "number") ? c.rates[catId] : 0;
      return { card:c, rate:rate };
    }).sort(function(a,b){ return b.rate - a.rate; });
    var maxRate = ranked[0].rate || 0;

    var rows = ranked.map(function(r, i){
      var isBest = i === 0 && r.rate > 0;
      var pct = maxRate > 0 ? Math.max(4, (r.rate/maxRate)*100) : 0;
      return (
        '<div class="rank-row'+(isBest?' best':'')+'">' +
          '<div class="rank-top">' +
            '<div class="rank-name-wrap">' +
              '<span class="rank-rank num">'+(i+1)+'</span>' +
              '<span class="rank-name">'+esc(r.card.name)+'</span>' +
              (isBest ? '<span class="best-badge">ベスト</span>' : '') +
              '<span class="kind-badge">'+(KIND_LABELS[r.card.kind]||r.card.kind||"")+'</span>' +
            '</div>' +
            '<span class="rank-rate'+(isBest?' best-rate':'')+' num">'+r.rate.toFixed(1)+'%</span>' +
          '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div>' +
          (r.card.note ? '<div class="rank-note">'+esc(r.card.note)+'</div>' : '') +
        '</div>'
      );
    }).join("");

    return (
      '<div class="rank-list">' +
        '<div style="padding:10px 0 4px;font-size:0.78rem;color:var(--ink-muted)">対象カテゴリ: <strong style="color:var(--ink)">'+catName(catId)+'</strong></div>' +
        rows +
      '</div>'
    );
  }

  function scanResultsHtml(){
    if (scanState.status === "idle") return "";
    if (scanState.status === "loading"){
      return '<div class="rank-list"><div class="empty-note">🔎 半径'+SCAN_RADIUS_M+'m以内をスキャンしています…</div></div>';
    }
    if (scanState.status === "error"){
      return '<div class="rank-list"><div class="empty-note">'+esc(scanState.error)+'</div></div>';
    }
    if (scanState.results.length === 0){
      return '<div class="rank-list"><div class="empty-note">半径'+SCAN_RADIUS_M+'m以内に対応する施設が見つかりませんでした(OpenStreetMapにデータが無い場所の可能性があります)</div></div>';
    }
    var byCat = {};
    scanState.results.forEach(function(r){ (byCat[r.catId] = byCat[r.catId] || []).push(r); });
    var catIds = Object.keys(byCat).sort(function(a, b){ return byCat[a][0].distance - byCat[b][0].distance; });
    var html = catIds.map(function(catId){
      var cat = categories.filter(function(c){ return c.id === catId; })[0];
      if (!cat) return "";
      var best = bestCardFor(catId);
      var items = byCat[catId].map(function(r){
        return (
          '<div class="scan-item">' +
            '<div class="scan-item-top"><span class="scan-item-name">'+esc(r.name)+'</span><span class="kind-badge num">'+fmtDist(r.distance)+'</span></div>' +
            (best && best.rate > 0
              ? '<div class="scan-item-best">💳 '+esc(best.card.name)+' <span class="num">'+best.rate.toFixed(1)+'%</span></div>'
              : '<div class="rank-note">この分類のカードが登録されていません</div>') +
          '</div>'
        );
      }).join("");
      return '<div class="scan-group"><div class="scan-group-title">'+esc(cat.icon)+' '+esc(cat.name)+'</div>'+items+'</div>';
    }).join("");
    return '<div class="rank-list scan-results">'+html+'</div>';
  }

  function homeHtml(){
    return (
      statusHtml() +
      '<h2 class="section-title">📡 周辺スキャン(半径'+SCAN_RADIUS_M+'m)</h2>' +
      '<button class="btn primary block" data-action="run-scan"'+(!position?" disabled":"")+'>🔍 '+(scanState.status==="idle"?"スキャンする":"再スキャン")+'</button>' +
      scanResultsHtml() +
      '<h2 class="section-title">🏷️ カテゴリを手動で選ぶ</h2>' +
      '<details class="chip-details"><summary>タップして開く(スキャンで見つからない場合や、ネットショッピングなど)</summary>' +
        chipGridHtml() +
      '</details>' +
      '<h2 class="section-title">🏆 おすすめの支払い方法</h2>' +
      rankListHtml() +
      '<div class="footnote">還元率は登録したカードのデータに基づく参考値です。施設情報はOpenStreetMapのデータを利用しています。</div>'
    );
  }

  // ---------- settings ----------
  function settingsHtml(){
    return (
      '<div class="seg">' +
        ["cards","places","categories"].map(function(t){
          var label = t==="cards"?"カード":(t==="places"?"場所":"カテゴリ");
          return '<button class="'+(settingsTab===t?"active":"")+'" data-action="settings-tab" data-tab="'+t+'">'+label+'</button>';
        }).join("") +
      '</div>' +
      (settingsTab === "cards" ? cardsSettingsHtml() : settingsTab === "places" ? placesSettingsHtml() : categoriesSettingsHtml())
    );
  }

  function importPanelHtml(){
    var toggle = '<button class="btn small" data-action="toggle-import" style="margin-bottom:10px">'+(importOpen?"✕ 閉じる":"📥 まとめて登録(JSON)")+'</button>';
    if (!importOpen) return toggle;
    var resultHtml = importResult ? '<div class="import-result '+(importResult.ok?"ok":"err")+'">'+esc(importResult.text)+'</div>' : '';
    return (
      toggle +
      '<div class="list-panel import-panel"><div class="item-body" style="padding-top:14px">' +
        '<div class="field"><label>カード配列のJSONを貼り付け(name / kind / note / rates{カテゴリ名:%} )</label>' +
        '<textarea id="import-json" rows="6" placeholder=\'[{"name":"楽天ペイ","kind":"qr","note":"","rates":{"コンビニ":1.5}}]\'></textarea></div>' +
        '<div class="row-actions"><button class="btn primary small" data-action="import-cards">読み込む(同名カードは上書き)</button></div>' +
        resultHtml +
      '</div></div>'
    );
  }

  function cardsSettingsHtml(){
    var note = '<div class="sample-note">💡 還元率はサンプル値です。実際のカード規約に合わせて編集してください。</div>';
    var importUi = importPanelHtml();
    if (cards.length === 0){
      return note + importUi + '<div class="list-panel"><div class="empty-note">カードがありません</div><div class="add-bar"><button class="btn primary block" data-action="add-card">＋ カードを追加</button></div></div>';
    }
    var sorted = cards.slice().sort(byOrder);
    var rows = sorted.map(function(c, idx){
      var open = expandedId === ("card:"+c.id);
      var body = "";
      if (open){
        var rateRows = categories.slice().sort(byOrder).map(function(cat){
          var v = (c.rates && typeof c.rates[cat.id]==="number") ? c.rates[cat.id] : 0;
          return '<div class="cat-label">'+esc(cat.icon||"")+' '+esc(cat.name)+'</div>' +
            '<input type="number" step="0.1" min="0" value="'+v+'" data-collection="cards" data-id="'+c.id+'" data-field="rate" data-cat="'+cat.id+'">';
        }).join("");
        body =
          '<div class="item-body">' +
            '<div class="field"><label>名称</label><input type="text" value="'+esc(c.name)+'" data-collection="cards" data-id="'+c.id+'" data-field="name"></div>' +
            '<div class="field"><label>種類</label><select data-collection="cards" data-id="'+c.id+'" data-field="kind">' +
              KIND_ORDER.map(function(k){ return '<option value="'+k+'"'+(c.kind===k?" selected":"")+'>'+KIND_LABELS[k]+'</option>'; }).join("") +
            '</select></div>' +
            '<div class="field"><label>メモ</label><textarea class="prose" rows="3" placeholder="例: 特約店のみ／エントリー必要 など" data-collection="cards" data-id="'+c.id+'" data-field="note">'+esc(c.note||"")+'</textarea></div>' +
            '<div class="field"><label>カテゴリ別 還元率（%）</label><div class="rate-grid">'+rateRows+'</div></div>' +
            deleteConfirmHtml("card", c.id, "このカードを削除") +
          '</div>';
      }
      return (
        '<div class="item-row">' +
          '<div class="item-head" data-action="toggle-card" data-id="'+c.id+'">' +
            '<span class="caret'+(open?" open":"")+'">▶</span>' +
            '<span class="name">'+esc(c.name)+'</span>' +
            '<span class="kind-badge">'+(KIND_LABELS[c.kind]||"")+'</span>' +
            '<span class="order-btns">' +
              '<button data-action="move-card-up" data-id="'+c.id+'" '+(idx===0?"disabled":"")+'>▲</button>' +
              '<button data-action="move-card-down" data-id="'+c.id+'" '+(idx===sorted.length-1?"disabled":"")+'>▼</button>' +
            '</span>' +
          '</div>' +
          body +
        '</div>'
      );
    }).join("");
    return note + importUi + '<div class="list-panel">' + rows + '<div class="add-bar"><button class="btn primary block" data-action="add-card">＋ カードを追加</button></div></div>';
  }

  function placeDraftHtml(){
    if (!placeDraft) return "";
    var body = "";
    if (placeDraft.status === "locating"){
      body = '<div class="empty-note">📍 現在地を取得中…</div>';
    } else if (placeDraft.status === "geocoding"){
      body = '<div class="empty-note">🔎 現在地から住所を調べています…</div>';
    } else if (placeDraft.status === "error"){
      body =
        '<div class="import-result err">'+esc(placeDraft.error)+'</div>' +
        '<div class="row-actions"><span></span><button class="btn small" data-action="cancel-add-place">閉じる</button></div>';
    } else {
      var pasteMsg = "";
      if (placeDraft.pasteStatus === "loading") pasteMsg = '<div class="import-result">🔎 検索しています…</div>';
      else if (placeDraft.pasteStatus === "error") pasteMsg = '<div class="import-result err">見つかりませんでした。番地・号まで含む住所はOpenStreetMapでは検索できないことがあります。「〇〇丁目」までの住所、施設名(例: 東京タワー)、または座標を試してください。</div>';
      body =
        (placeDraft.geocodeError ? '<div class="import-result err">住所の自動取得に失敗しました。名称を手入力してください。</div>' : '') +
        '<div class="field"><label>名称(表示用・編集可)</label><input type="text" id="draft-place-name" value="'+esc(placeDraft.name)+'"></div>' +
        '<div class="field"><label>カテゴリ</label><select id="draft-place-cat">' +
          categories.slice().sort(byOrder).map(function(c){ return '<option value="'+c.id+'"'+(placeDraft.catId===c.id?" selected":"")+'>'+esc(c.icon)+' '+esc(c.name)+'</option>'; }).join("") +
        '</select></div>' +
        '<div class="field"><label>住所(OpenStreetMapから自動取得・編集可)</label><input type="text" id="draft-place-address" value="'+esc(placeDraft.address||"")+'"></div>' +
        '<div class="latlng-row">' +
          '<div class="field"><label>緯度</label><input type="number" step="0.000001" class="num" id="draft-place-lat" value="'+placeDraft.lat+'"></div>' +
          '<div class="field"><label>経度</label><input type="number" step="0.000001" class="num" id="draft-place-lng" value="'+placeDraft.lng+'"></div>' +
        '</div>' +
        '<a class="btn small" href="'+mapsLink(placeDraft.lat, placeDraft.lng)+'" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;text-align:center">🗺️ Googleマップで確認</a>' +
        '<div class="field"><label>ずれていたら: Googleマップの座標(35.7,139.5)または住所をコピーしてここに貼り付け</label><input type="text" id="draft-place-coord-paste" placeholder="座標 or 住所を貼り付け"></div>' +
        pasteMsg +
        '<div class="row-actions"><button class="btn small" data-action="cancel-add-place">キャンセル</button><button class="btn primary small" data-action="confirm-add-place">✅ この場所を登録</button></div>';
    }
    return '<div class="list-panel import-panel"><div class="item-body" style="padding-top:14px">'+body+'</div></div>';
  }

  function placesSettingsHtml(){
    var note = '<div class="sample-note">💡 「＋ 場所を追加」を押すと現在地から住所を自動取得します(OpenStreetMapのデータを利用・多少ずれる場合があります)。既存の場所は「現在地を使用」でも更新できます。</div>';
    var draftUi = placeDraftHtml();
    if (places.length === 0){
      return note + draftUi + '<div class="list-panel"><div class="empty-note">場所がありません</div><div class="add-bar"><button class="btn primary block" data-action="start-add-place">＋ 場所を追加</button></div></div>';
    }
    var rows = places.map(function(p){
      var open = expandedId === ("place:"+p.id);
      var body = "";
      if (open){
        body =
          '<div class="item-body">' +
            '<div class="field"><label>名称</label><input type="text" value="'+esc(p.name)+'" data-collection="places" data-id="'+p.id+'" data-field="name"></div>' +
            '<div class="field"><label>カテゴリ</label><select data-collection="places" data-id="'+p.id+'" data-field="catId">' +
              categories.slice().sort(byOrder).map(function(c){ return '<option value="'+c.id+'"'+(p.catId===c.id?" selected":"")+'>'+esc(c.icon)+' '+esc(c.name)+'</option>'; }).join("") +
            '</select></div>' +
            '<div class="field"><label>住所</label><input type="text" value="'+esc(p.address||"")+'" data-collection="places" data-id="'+p.id+'" data-field="address"></div>' +
            '<div class="latlng-row">' +
              '<div class="field"><label>緯度</label><input type="number" step="0.000001" class="num" value="'+(p.lat!=null?p.lat:"")+'" data-collection="places" data-id="'+p.id+'" data-field="lat"></div>' +
              '<div class="field"><label>経度</label><input type="number" step="0.000001" class="num" value="'+(p.lng!=null?p.lng:"")+'" data-collection="places" data-id="'+p.id+'" data-field="lng"></div>' +
            '</div>' +
            (p.lat!=null && p.lng!=null ? '<a class="btn small" href="'+mapsLink(p.lat,p.lng)+'" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;text-align:center">🗺️ Googleマップで確認</a>' : '') +
            '<div class="field"><label>ずれていたら: Googleマップの座標(35.7,139.5)または住所をコピーしてここに貼り付け</label><input type="text" placeholder="座標 or 住所を貼り付け" data-coord-paste-for="'+p.id+'"></div>' +
            (placeLookupStatus[p.id] === "loading" ? '<div class="import-result">🔎 検索しています…</div>' : '') +
            (placeLookupStatus[p.id] === "error" ? '<div class="import-result err">見つかりませんでした。番地・号まで含む住所はOpenStreetMapでは検索できないことがあります。「〇〇丁目」までの住所、施設名、または座標を試してください。</div>' : '') +
            '<button class="btn small" data-action="use-current-location" data-id="'+p.id+'"'+(position?"":" disabled")+'>📍 現在地を使用'+(position?"":"（位置情報未取得）")+'</button>' +
            '<div class="field"><label>判定半径（m）</label><input type="number" step="10" min="20" value="'+(p.radius!=null?p.radius:300)+'" data-collection="places" data-id="'+p.id+'" data-field="radius"></div>' +
            '<div class="field"><label>メモ</label><input type="text" value="'+esc(p.note||"")+'" data-collection="places" data-id="'+p.id+'" data-field="note"></div>' +
            deleteConfirmHtml("place", p.id, "この場所を削除") +
          '</div>';
      }
      var distTxt = "";
      if (position && p.lat!=null && p.lng!=null){
        distTxt = '<span class="kind-badge num">'+fmtDist(distMeters(position.lat,position.lng,p.lat,p.lng))+'</span>';
      }
      return (
        '<div class="item-row">' +
          '<div class="item-head" data-action="toggle-place" data-id="'+p.id+'">' +
            '<span class="caret'+(open?" open":"")+'">▶</span>' +
            '<span class="name">'+esc(p.name)+'</span>' +
            distTxt +
          '</div>' +
          body +
        '</div>'
      );
    }).join("");
    return note + draftUi + '<div class="list-panel">' + rows + '<div class="add-bar"><button class="btn primary block" data-action="start-add-place">＋ 場所を追加</button></div></div>';
  }

  function categoryImportPanelHtml(){
    var toggle = '<button class="btn small" data-action="toggle-import-categories" style="margin-bottom:10px">'+(importCatOpen?"✕ 閉じる":"📥 まとめて登録(JSON)")+'</button>';
    if (!importCatOpen) return toggle;
    var resultHtml = importCatResult ? '<div class="import-result '+(importCatResult.ok?"ok":"err")+'">'+esc(importCatResult.text)+'</div>' : '';
    return (
      toggle +
      '<div class="list-panel import-panel"><div class="item-body" style="padding-top:14px">' +
        '<div class="field"><label>カテゴリ配列のJSONを貼り付け([{"name":"...","icon":"..."}])</label>' +
        '<textarea id="import-category-json" rows="4" placeholder=\'[{"name":"ファストフード","icon":"🍔"}]\'></textarea></div>' +
        '<div class="row-actions"><button class="btn primary small" data-action="import-categories">読み込む(同名は上書き)</button></div>' +
        resultHtml +
      '</div></div>'
    );
  }

  function categoriesSettingsHtml(){
    var importUi = categoryImportPanelHtml();
    if (categories.length === 0){
      return importUi + '<div class="list-panel"><div class="empty-note">カテゴリがありません</div><div class="add-bar"><button class="btn primary block" data-action="add-category">＋ カテゴリを追加</button></div></div>';
    }
    var sorted = categories.slice().sort(byOrder);
    var rows = sorted.map(function(c){
      return (
        '<div class="item-row">' +
          '<div class="item-body" style="padding-top:12px">' +
            '<div class="latlng-row">' +
              '<div class="field" style="flex:0 0 64px"><label>絵文字</label><input type="text" value="'+esc(c.icon||"")+'" data-collection="categories" data-id="'+c.id+'" data-field="icon" maxlength="4"></div>' +
              '<div class="field"><label>カテゴリ名</label><input type="text" value="'+esc(c.name)+'" data-collection="categories" data-id="'+c.id+'" data-field="name"></div>' +
            '</div>' +
            deleteConfirmHtml("category", c.id, "削除") +
          '</div>' +
        '</div>'
      );
    }).join("");
    return importUi + '<div class="list-panel">' + rows + '<div class="add-bar"><button class="btn primary block" data-action="add-category">＋ カテゴリを追加</button></div></div>';
  }

  // ---------- actions ----------
  function nextOrder(list){
    return list.reduce(function(m,x){ return Math.max(m, x.order||0); }, -1) + 1;
  }
  function findIn(list, id){ return list.filter(function(x){return x.id===id;})[0]; }

  function importCardsFromJson(text){
    var arr;
    try{ arr = JSON.parse(text); }
    catch(e){ return { ok:false, text:"JSONの形式が正しくありません: "+(e && e.message ? e.message : e) }; }
    if (!Array.isArray(arr)) return { ok:false, text:"配列(角カッコ[...])の形式で貼り付けてください" };

    var nameToId = {};
    categories.forEach(function(c){ nameToId[c.name] = c.id; });

    var added = 0, updated = 0, skippedRates = [];
    arr.forEach(function(item){
      if (!item || typeof item.name !== "string" || !item.name) return;
      var rates = {};
      var base = typeof item.base === "number" ? item.base : 0;
      categories.forEach(function(c){ rates[c.id] = base; });
      Object.keys(item.rates || {}).forEach(function(catName){
        var cid = nameToId[catName];
        if (cid) rates[cid] = item.rates[catName];
        else skippedRates.push(catName);
      });

      var existing = cards.filter(function(c){ return c.name === item.name; })[0];
      if (existing){
        existing.kind = item.kind || existing.kind;
        existing.note = typeof item.note === "string" ? item.note : existing.note;
        existing.rates = rates;
        updated++;
      } else {
        cards.push({ id: uid("card"), name: item.name, kind: item.kind || "credit", note: item.note || "", order: nextOrder(cards), rates: rates });
        added++;
      }
    });

    var msg = "追加 " + added + "件・更新 " + updated + "件しました";
    if (skippedRates.length) msg += "(未知のカテゴリ名は無視: " + skippedRates.filter(function(v,i,a){return a.indexOf(v)===i;}).join("、") + ")";
    return { ok:true, text: msg };
  }

  function importCategoriesFromJson(text){
    var arr;
    try{ arr = JSON.parse(text); }
    catch(e){ return { ok:false, text:"JSONの形式が正しくありません: "+(e && e.message ? e.message : e) }; }
    if (!Array.isArray(arr)) return { ok:false, text:"配列(角カッコ[...])の形式で貼り付けてください" };

    var added = 0, updated = 0;
    arr.forEach(function(item){
      if (!item || typeof item.name !== "string" || !item.name) return;
      var existing = categories.filter(function(c){ return c.name === item.name; })[0];
      if (existing){
        existing.icon = typeof item.icon === "string" ? item.icon : existing.icon;
        if (typeof item.group === "string") existing.group = item.group;
        if (typeof item.osmTag === "string") existing.osmTag = item.osmTag;
        if (Array.isArray(item.brand)) existing.brand = item.brand;
        if (typeof item.fallback === "boolean") existing.fallback = item.fallback;
        updated++;
      } else {
        var cat = {
          id: uid("cat"), name: item.name, icon: item.icon || "🏷️", order: nextOrder(categories),
          group: item.group || item.name,
          osmTag: item.osmTag || null,
          brand: Array.isArray(item.brand) ? item.brand : null,
          fallback: !!item.fallback
        };
        categories.push(cat);
        cards.forEach(function(c){ if (!c.rates) c.rates = {}; if (!(cat.id in c.rates)) c.rates[cat.id] = 0; });
        added++;
      }
    });

    return { ok:true, text: "追加 " + added + "件・更新 " + updated + "件しました" };
  }

  app.addEventListener("click", function(e){
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");

    if (action === "open-settings"){ view = "settings"; render(); return; }
    if (action === "close-settings"){ view = "home"; expandedId = null; render(); return; }
    if (action === "open-settings-cards"){ view = "settings"; settingsTab = "cards"; render(); return; }
    if (action === "settings-tab"){ settingsTab = el.getAttribute("data-tab"); expandedId = null; render(); return; }
    if (action === "refresh-location"){ requestLocation(); return; }
    if (action === "run-scan"){ scanNearby(); return; }
    if (action === "select-category"){ manualCategoryId = id; render(); return; }
    if (action === "reset-auto"){ manualCategoryId = null; render(); return; }
    if (action === "install-app"){
      if (deferredInstallPrompt){
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.finally(function(){ deferredInstallPrompt = null; render(); });
      }
      return;
    }

    if (action === "toggle-card"){ var k="card:"+id; expandedId = expandedId===k? null : k; render(); return; }
    if (action === "toggle-place"){ var k2="place:"+id; expandedId = expandedId===k2? null : k2; render(); return; }
    if (action === "toggle-import"){ importOpen = !importOpen; importResult = null; render(); return; }
    if (action === "import-cards"){
      var ta = document.getElementById("import-json");
      var text = ta ? ta.value : "";
      var res = importCardsFromJson(text);
      importResult = res;
      saveStore(); render();
      return;
    }
    if (action === "toggle-import-categories"){ importCatOpen = !importCatOpen; importCatResult = null; render(); return; }
    if (action === "import-categories"){
      var taCat = document.getElementById("import-category-json");
      var textCat = taCat ? taCat.value : "";
      var resCat = importCategoriesFromJson(textCat);
      importCatResult = resCat;
      saveStore(); render();
      return;
    }

    if (action === "add-card"){
      var ratesObj = {}; categories.forEach(function(c){ ratesObj[c.id]=0; });
      var card = { id: uid("card"), name:"新しいカード", kind:"credit", note:"", order: nextOrder(cards), rates: ratesObj };
      cards.push(card); expandedId = "card:"+card.id; saveStore(); render();
      return;
    }
    if (action === "ask-delete"){ pendingDelete = { kind: el.getAttribute("data-kind"), id: id }; render(); return; }
    if (action === "cancel-delete"){ pendingDelete = null; render(); return; }
    if (action === "confirm-delete"){
      var delKind = el.getAttribute("data-kind");
      if (delKind === "card") cards = cards.filter(function(c){ return c.id!==id; });
      else if (delKind === "place") places = places.filter(function(p){ return p.id!==id; });
      else if (delKind === "category") categories = categories.filter(function(c){ return c.id!==id; });
      pendingDelete = null;
      saveStore(); render();
      return;
    }
    if (action === "move-card-up" || action === "move-card-down"){
      var sorted = cards.slice().sort(byOrder);
      var i = sorted.findIndex(function(c){ return c.id===id; });
      var j = action==="move-card-up" ? i-1 : i+1;
      if (j<0 || j>=sorted.length) return;
      var a = sorted[i], b = sorted[j];
      var ao=a.order||0, bo=b.order||0;
      findIn(cards,a.id).order = bo;
      findIn(cards,b.id).order = ao;
      saveStore(); render();
      return;
    }

    if (action === "start-add-place"){ startAddPlace(); return; }
    if (action === "cancel-add-place"){ placeDraft = null; render(); return; }
    if (action === "confirm-add-place"){
      if (!placeDraft || placeDraft.status !== "ready") return;
      var nameEl = document.getElementById("draft-place-name");
      var catEl = document.getElementById("draft-place-cat");
      var addressEl = document.getElementById("draft-place-address");
      var latEl = document.getElementById("draft-place-lat");
      var lngEl = document.getElementById("draft-place-lng");
      var finalLat = latEl ? parseFloat(latEl.value) : placeDraft.lat;
      var finalLng = lngEl ? parseFloat(lngEl.value) : placeDraft.lng;
      var place = {
        id: uid("place"),
        name: (nameEl && nameEl.value.trim()) || "新しい場所",
        catId: catEl ? catEl.value : placeDraft.catId,
        lat: isNaN(finalLat) ? placeDraft.lat : finalLat,
        lng: isNaN(finalLng) ? placeDraft.lng : finalLng,
        radius: placeDraft.radius,
        address: (addressEl && addressEl.value) || placeDraft.address || "",
        note: ""
      };
      places.push(place);
      placeDraft = null;
      saveStore(); render();
      return;
    }
    if (action === "use-current-location"){
      if (!position) return;
      var p = findIn(places, id);
      if (p){ p.lat = position.lat; p.lng = position.lng; saveStore(); render(); }
      return;
    }

    if (action === "add-category"){
      var cat = { id: uid("cat"), name:"新しいカテゴリ", icon:"🏷️", order: nextOrder(categories) };
      categories.push(cat);
      cards.forEach(function(c){ if (!c.rates) c.rates={}; c.rates[cat.id] = 0; });
      saveStore(); render();
      return;
    }
  });

  app.addEventListener("change", function(e){
    if (e.target && e.target.id === "draft-place-coord-paste"){
      var raw = e.target.value;
      e.target.value = "";
      if (!raw.trim() || !placeDraft) return;
      var parsed = parseLatLngPaste(raw);
      if (parsed){
        var latInput = document.getElementById("draft-place-lat");
        var lngInput = document.getElementById("draft-place-lng");
        if (latInput) latInput.value = parsed.lat;
        if (lngInput) lngInput.value = parsed.lng;
        placeDraft.lat = parsed.lat; placeDraft.lng = parsed.lng;
        placeDraft.pasteStatus = null;
        return;
      }
      placeDraft.pasteStatus = "loading"; render();
      forwardGeocode(raw, function(result){
        if (!placeDraft) return;
        if (result){
          placeDraft.lat = result.lat; placeDraft.lng = result.lng;
          placeDraft.address = result.address;
          placeDraft.name = result.name || placeDraft.name;
          placeDraft.pasteStatus = null;
        } else {
          placeDraft.pasteStatus = "error";
        }
        render();
      });
      return;
    }
    var pasteForPlace = e.target && e.target.getAttribute && e.target.getAttribute("data-coord-paste-for");
    if (pasteForPlace){
      var raw2 = e.target.value;
      e.target.value = "";
      var place = findIn(places, pasteForPlace);
      if (!raw2.trim() || !place) return;
      var parsedExisting = parseLatLngPaste(raw2);
      if (parsedExisting){
        place.lat = parsedExisting.lat;
        place.lng = parsedExisting.lng;
        delete placeLookupStatus[pasteForPlace];
        saveStore(); render();
        return;
      }
      placeLookupStatus[pasteForPlace] = "loading"; render();
      forwardGeocode(raw2, function(result){
        if (result){
          place.lat = result.lat; place.lng = result.lng; place.address = result.address;
          delete placeLookupStatus[pasteForPlace];
          saveStore();
        } else {
          placeLookupStatus[pasteForPlace] = "error";
        }
        render();
      });
      return;
    }

    var el = e.target.closest("[data-collection]");
    if (!el) return;
    var collection = el.getAttribute("data-collection");
    var id = el.getAttribute("data-id");
    var field = el.getAttribute("data-field");
    var list = collection === "cards" ? cards : collection === "places" ? places : categories;
    var item = findIn(list, id);
    if (!item) return;

    if (field === "rate"){
      var catId = el.getAttribute("data-cat");
      var v = parseFloat(el.value); if (isNaN(v)) v = 0;
      if (!item.rates) item.rates = {};
      item.rates[catId] = v;
      saveStore(); render();
      return;
    }
    if (el.type === "number"){
      var num = parseFloat(el.value);
      item[field] = isNaN(num) ? null : num;
      saveStore(); render();
      return;
    }
    item[field] = el.value;
    saveStore(); render();
  });

  init();
})();
