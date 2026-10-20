(function () {
  "use strict";

  var KEY = "lifetag.orders.v2";
  var TOKEN_KEY = "lifetag.staff-token";
  var CHIP = 144;
  var PRODUCTS = {
    lite: { name: "LifeTag Lite", short: "Lite", price: 39, kind: "Vinyl NFC sticker", item: "LifeTag Lite × 1", includes: "Vinyl sticker, user guide" },
    pro: { name: "LifeTag Pro", short: "Pro", price: 59, kind: "PVC wallet card", item: "LifeTag Pro × 1", includes: "PVC wallet card, user guide" },
    duo: { name: "Duo Active", short: "Duo", price: 99, kind: "Card + sticker", item: "Duo Active × 1", includes: "PVC card, vinyl sticker, user guide" }
  };

  var DESK = {
    orders: ["Order records", "Chief Operating & Procurement Manager"],
    payload: ["NDEF payload", "Plain text · no app or internet needed"],
    production: ["Substrate prep", "Sanitize, print, laminate, pack"],
    encoding: ["Write to NTAG213", "Web NFC on Android, or the desktop encoder"],
    qc: ["Offline quality control", "Test phone · Airplane Mode"],
    dispatch: ["Order dispatch", "Ship or hand off"],
    support: ["Support", "Re-encoding requests"]
  };

  var orders = [];
  var activeId = "001";
  var product = "duo";
  var wizard = 1;
  var scanId = "001";
  var panel = "orders";
  var booted = false;
  var serverMode = false;
  var encodeAbort = null;
  var toastTimer = null;

  function blankSteps() {
    return {
      sanitize: false, print: false, laminate: false, pack: false, prepDone: false,
      airplane: false, tap: false, text: false, offline: false,
      encoded: false, qc: false, shipped: false, generated: false
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(function (order) {
        order.steps = Object.assign(blankSteps(), order.steps || {});
        return order;
      });
    } catch (err) {
      return [];
    }
  }

  function staffToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (err) { return ""; }
  }

  function api(path, method, body, token) {
    var headers = { "content-type": "application/json" };
    if (token) headers.authorization = "Bearer " + token;
    return fetch(path, { method: method || "GET", headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var err = new Error(data.error || "Request failed (" + res.status + ")");
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
  }

  function normalize(order) {
    order.steps = Object.assign(blankSteps(), order.steps || {});
    order.directives = order.directives || "";
    order.tracking = order.tracking || "";
    return order;
  }

  /* Browser cache holds only this visitor's own orders. In staff/server mode the
     database is the source of truth and nothing is cached locally. */
  function save(order) {
    if (serverMode) {
      if (!order) return;
      api("/api/orders/" + encodeURIComponent(order.id), "PATCH",
        { status: order.status, tracking: order.tracking, steps: order.steps }, staffToken())
        .catch(function (err) { toast("Not saved to server: " + err.message); });
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify(orders)); } catch (err) { /* storage full or blocked */ }
  }

  function pullOrders() {
    var token = staffToken();
    if (!token) return Promise.resolve(false);
    return api("/api/orders", "GET", null, token).then(function (data) {
      serverMode = true;
      orders = (data.orders || []).map(normalize);
      if (!byId(activeId)) activeId = orders[0] ? orders[0].id : "";
      renderConnect("");
      renderDesk();
      return true;
    }).catch(function (err) {
      serverMode = false;
      if (err.status === 401) { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
      orders = load();
      renderConnect(err.message);
      renderDesk();
      return false;
    });
  }

  function renderConnect(error) {
    var form = $("staff-form"), status = $("staff-status"), tools = $("staff-tools");
    if (!form) return;
    form.hidden = serverMode;
    tools.hidden = !serverMode;
    status.textContent = error || (serverMode ? "Connected to server · " + orders.length + " orders" : "");
    status.classList.toggle("is-error", !!error);
  }

  function esc(value) {
    var map = { "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" };
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return String.fromCharCode(38) + map[ch] + ";";
    });
  }

  function peso(n) {
    return "₱" + n;
  }

  function byId(id) {
    return orders.filter(function (order) { return order.id === id; })[0] || null;
  }

  function active() {
    return byId(activeId) || orders[0] || null;
  }

  function payloadOf(order) {
    var lines = [
      "LIFETAG EMERGENCY INFO",
      "| NAME: " + (order.buyer || order.name || ""),
      "| BLOOD: " + (order.blood || ""),
      "| ICE: " + (order.ice || ""),
      "| ALLERGIES: " + (order.allergies || "")
    ];
    if (order.directives && String(order.directives).trim()) {
      lines.push("| NOTE: " + String(order.directives).trim());
    }
    return lines.join("\n");
  }

  function bytes(text) {
    return new TextEncoder().encode(text).length;
  }

  function statusLabel(order) {
    if (order.reencode) return ["Re-encode", "status-reencode"];
    if (order.steps && order.steps.shipped) return ["Shipped", "status-shipped"];
    if (order.status === "new") return ["New", "status-new"];
    if (order.steps && order.steps.qc) return ["QC pass", "status-paid"];
    return ["Paid", "status-paid"];
  }

  function $(id) {
    return document.getElementById(id);
  }

  function toast(message) {
    var el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 2400);
  }

  function show(id) {
    ["view-home", "view-order", "view-scan", "view-support", "view-staff"].forEach(function (view) {
      var el = $(view);
      if (el) el.hidden = view !== id;
    });
    var links = $("nav-links");
    if (links) links.classList.remove("is-open");
    var toggle = document.querySelector("[data-action='nav-toggle']");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    window.scrollTo(0, 0);
  }

  function goHome(hash) {
    show("view-home");
    if (hash) {
      var target = document.querySelector(hash);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function markChoice() {
    document.querySelectorAll("[data-choice]").forEach(function (card) {
      card.classList.toggle("is-selected", card.getAttribute("data-choice") === product);
    });
  }

  function draftFromForm() {
    return {
      buyer: $("f-name").value.trim(),
      blood: $("f-blood").value.trim(),
      ice: $("f-ice").value.trim(),
      allergies: $("f-allergies").value.trim(),
      directives: $("f-directives").value.trim()
    };
  }

  function updateFormBytes() {
    var text = payloadOf(draftFromForm());
    var size = bytes(text);
    var el = $("form-bytes");
    if (!el) return;
    el.textContent = "This profile is " + size + " bytes. NTAG213 user memory is " + CHIP + " bytes, and NDEF headers need room too.";
    el.classList.toggle("is-over", size > 120);
  }

  function setWizard(step) {
    wizard = step;
    $("step-choose").hidden = step !== 1;
    $("step-form").hidden = step !== 2;
    $("step-review").hidden = step !== 3;
    $("step-done").hidden = step !== 4;
    var titles = {
      1: "Choose your LifeTag",
      2: "Free emergency registration",
      3: "Review before submitting",
      4: "Order placed"
    };
    $("wizard-title").textContent = titles[step];
    document.querySelectorAll("#crumbs li").forEach(function (li) {
      li.classList.toggle("is-on", Number(li.getAttribute("data-crumb")) === Math.min(step, 3));
    });
    $("crumbs").hidden = step === 4;
    if (step === 2) {
      var info = PRODUCTS[product];
      $("picked-label").textContent = info.name + " · " + peso(info.price) + " · " + info.kind;
      updateFormBytes();
    }
    markChoice();
  }

  function openOrder(nextProduct, step) {
    product = nextProduct || product;
    show("view-order");
    setWizard(step || 1);
  }

  function fillReview() {
    var draft = draftFromForm();
    var text = payloadOf(draft);
    $("r-name").textContent = draft.buyer;
    $("r-blood").textContent = draft.blood;
    $("r-ice").textContent = draft.ice;
    $("r-allergies").textContent = draft.allergies;
    $("r-note").textContent = draft.directives;
    $("r-note-row").hidden = !draft.directives;
    $("r-payload").textContent = text;
    var size = bytes(text);
    var meta = $("review-bytes");
    meta.textContent = "String length: " + size + " bytes · Chip: NTAG213 · 144 bytes";
    meta.classList.toggle("is-over", size > 120);
    $("confirm-check").checked = false;
    $("btn-confirm").disabled = true;
  }

  function nextId() {
    var max = orders.reduce(function (n, order) {
      return Math.max(n, parseInt(order.id, 10) || 0);
    }, 0);
    var value = String(max + 1);
    while (value.length < 3) value = "0" + value;
    return value;
  }

  function confirmOrder() {
    var draft = draftFromForm();
    if (bytes(payloadOf(draft)) > 120) {
      toast("Shorten the profile so it fits the chip.");
      return;
    }
    var button = $("btn-confirm");
    button.disabled = true;
    var order = {
      id: nextId(),
      product: product,
      status: "paid",
      buyer: draft.buyer,
      blood: draft.blood,
      ice: draft.ice,
      allergies: draft.allergies,
      directives: draft.directives,
      tracking: "",
      reencode: null,
      steps: blankSteps(),
      created: new Date().toISOString().slice(0, 10)
    };
    var body = {
      product: order.product, buyer: order.buyer, blood: order.blood,
      ice: order.ice, allergies: order.allergies, directives: order.directives
    };
    api("/api/orders", "POST", body).then(function (res) {
      order.id = res.id;
      return true;
    }, function (err) {
      if (err.status && err.status < 500 && err.status !== 404) throw err;
      return false;
    }).then(function (stored) {
      finishOrder(order, stored);
    }).catch(function (err) {
      button.disabled = false;
      toast(err.message);
    });
  }

  function finishOrder(order, stored) {
    if (!serverMode) { orders.unshift(order); save(); }
    activeId = order.id;
    scanId = order.id;
    $("done-title").textContent = "Order #" + order.id;
    $("done-copy").textContent = PRODUCTS[order.product].name + " for " + order.buyer + " is marked paid in this demo. No payment was processed. Save this ID — the chip text below is what fulfillment will write." +
      (stored ? "" : " The server could not be reached, so this order is saved on this browser only.");
    $("done-payload").textContent = payloadOf(order);
    setWizard(4);
    renderDesk();
    renderScanOptions();
    toast(stored ? "Order #" + order.id + " sent to fulfillment." : "Order #" + order.id + " saved on this browser.");
  }

  function renderScanOptions() {
    var select = $("scan-select");
    if (!select) return;
    select.innerHTML = orders.map(function (order) {
      return "<option value=\"" + esc(order.id) + "\">#" + esc(order.id) + " · " + esc(order.buyer) + "</option>";
    }).join("");
    if (!orders.length) select.innerHTML = "<option value=\"\">Sample profile</option>";
    if (!byId(scanId)) scanId = orders[0] ? orders[0].id : "";
    select.value = scanId;
    paintPhone(false);
  }

  function paintPhone(live) {
    var order = byId(scanId) || orders[0];
    if (!order) return;
    $("phone-name").textContent = order.buyer;
    $("phone-blood").textContent = order.blood;
    $("phone-ice").textContent = order.ice;
    $("phone-allergies").textContent = order.allergies;
    $("phone").hidden = false;
    $("tap-caption").textContent = live ? "Plain text from the tag. No data was used." : "Works with no data or app";
    $("scan-stage").classList.toggle("is-tapped", !!live);
  }

  function renderOrders() {
    var body = $("order-rows");
    if (!body) return;
    body.innerHTML = orders.map(function (order) {
      var badge = statusLabel(order);
      var paid = order.status === "new"
        ? "<button class=\"btn btn-ghost\" type=\"button\" data-action=\"mark-paid\" data-id=\"" + esc(order.id) + "\">Mark paid</button>"
        : "";
      return "<tr class=\"" + (order.id === activeId ? "is-active" : "") + "\">" +
        "<td>#" + esc(order.id) + "</td>" +
        "<td>" + esc(PRODUCTS[order.product].short) + "</td>" +
        "<td>" + esc(order.buyer) + "</td>" +
        "<td><span class=\"status " + badge[1] + "\">" + badge[0] + "</span></td>" +
        "<td><button class=\"btn\" type=\"button\" data-action=\"open-order\" data-id=\"" + esc(order.id) + "\">Open</button> " + paid + "</td>" +
        "</tr>";
    }).join("");
  }

  function syncChecks(rootId, order) {
    var root = $(rootId);
    if (!root || !order) return;
    root.querySelectorAll("[data-step]").forEach(function (button) {
      var on = !!order.steps[button.getAttribute("data-step")];
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderDesk() {
    var order = active();
    renderOrders();
    var title = DESK[panel] || DESK.orders;
    $("desk-title").textContent = title[0];
    $("desk-sub").textContent = title[1];
    document.querySelectorAll(".side-nav button").forEach(function (button) {
      button.classList.toggle("is-on", button.getAttribute("data-panel") === panel);
    });
    ["orders", "payload", "production", "encoding", "qc", "dispatch", "support"].forEach(function (name) {
      $("panel-" + name).hidden = name !== panel;
    });
    if (!order) {
      $("working").textContent = "No orders yet.";
      return;
    }
    var badge = statusLabel(order);
    $("working").textContent = "Order #" + order.id + " · " + PRODUCTS[order.product].name + " · " + order.buyer + " · " + badge[0];

    var text = payloadOf(order);
    $("payload-kicker").textContent = "Order #" + order.id + " · " + PRODUCTS[order.product].name;
    $("payload-pre").textContent = order.steps.generated ? text : "Generate the plain-text payload for this order.";
    $("payload-meta").textContent = "Plain text · no app or internet needed · String length: " + bytes(text) + " bytes";
    $("prod-kicker").textContent = "Order #" + order.id;
    syncChecks("prod-checks", order);
    syncChecks("qc-checks", order);
    $("pass-pill").hidden = !order.steps.qc;
    $("encode-meta").textContent = "Chip: NTAG213 · 144 bytes · String length: " + bytes(text) + " bytes";
    if (!encodeAbort) {
      $("encode-bar").style.width = order.steps.encoded ? "100%" : "0%";
      $("encode-label").classList.remove("is-error");
      $("encode-label").textContent = order.steps.encoded
        ? "Payload written and verified." + (order.tagUid ? " Tag " + order.tagUid + "." : "")
        : "Ready to write.";
    }
    var support = $("encode-support");
    if (support) {
      support.textContent = nfcSupported()
        ? "This device can write NFC tags."
        : "This device cannot write NFC tags from the browser. Open this page in Chrome on Android, or use the desktop encoder.";
      support.classList.toggle("is-warn", !nfcSupported());
    }
    $("ship-kicker").textContent = "Order #" + order.id;
    $("ship-facts").innerHTML =
      "<div><dt>Item</dt><dd>" + esc(PRODUCTS[order.product].item) + "</dd></div>" +
      "<div><dt>Includes</dt><dd>" + esc(PRODUCTS[order.product].includes) + "</dd></div>" +
      "<div><dt>Buyer</dt><dd>" + esc(order.buyer) + "</dd></div>" +
      "<div><dt>Hand-off</dt><dd>" + esc(order.tracking || "Courier · pending") + "</dd></div>";
    $("ship-note").value = order.tracking || "";

    var queue = $("re-queue");
    var requests = orders.filter(function (item) { return item.reencode; });
    queue.innerHTML = requests.length
      ? requests.map(function (item) {
          return "<article class=\"queue-card\"><strong>#" + esc(item.id) + " · " + esc(item.buyer) + "</strong><p>" +
            esc(item.reencode.option) + " — " + esc(item.reencode.details) + "</p></article>";
        }).join("")
      : "<p class=\"hint\">No re-encoding requests yet.</p>";
  }

  function openStaff(nextPanel) {
    panel = nextPanel || panel || "orders";
    show("view-staff");
    renderDesk();
    renderConnect("");
    if (!serverMode && staffToken()) pullOrders();
  }

  function onToggle(event) {
    var button = event.target.closest("[data-action='nav-toggle']");
    if (!button) return;
    var links = $("nav-links");
    var open = !links.classList.contains("is-open");
    links.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function validDraft(draft) {
    if (!draft.buyer || !draft.blood || !draft.ice || !draft.allergies) return "Complete every required field.";
    var digits = draft.ice.replace(/[\s-]/g, "");
    if (digits.length < 10 || !/\d/.test(digits)) return "Enter an ICE number a responder can call.";
    if (bytes(payloadOf(draft)) > 120) return "That profile is too long for an NTAG213 text record. Shorten a field.";
    return "";
  }

  function handleClick(event) {
    var el = event.target.closest("[data-action]");
    if (!el || !document.getElementById("lifetag").contains(el)) return;
    var action = el.getAttribute("data-action");

    if (action === "nav-toggle") return;
    if (action === "go-home") { event.preventDefault(); goHome("#top"); return; }
    if (action === "go-products") { event.preventDefault(); goHome("#products"); return; }
    if (action === "go-how") { event.preventDefault(); goHome("#how"); return; }
    if (action === "go-support") { event.preventDefault(); show("view-support"); return; }
    if (action === "go-scan") { event.preventDefault(); show("view-scan"); paintPhone(false); return; }
    if (action === "go-staff") { event.preventDefault(); openStaff("orders"); return; }
    if (action === "go-order") { event.preventDefault(); openOrder(product, 1); return; }
    if (action === "pick-product") {
      event.preventDefault();
      openOrder(el.getAttribute("data-product"), 2);
      return;
    }
    if (action === "choose-product") {
      product = el.getAttribute("data-product");
      markChoice();
      setWizard(2);
      return;
    }
    if (action === "back-choose") { setWizard(1); return; }
    if (action === "fill-sample") {
      $("f-name").value = "Juan Dela Cruz";
      $("f-blood").value = "O+";
      $("f-ice").value = "0917XXXXXXX";
      $("f-allergies").value = "Penicillin";
      $("f-directives").value = "";
      updateFormBytes();
      return;
    }
    if (action === "wizard-edit") { setWizard(2); return; }
    if (action === "wizard-confirm") { confirmOrder(); return; }
    if (action === "tap-sim") {
      paintPhone(true);
      return;
    }
    if (action === "staff-panel") {
      panel = el.getAttribute("data-panel");
      renderDesk();
      return;
    }
    if (action === "open-order") {
      activeId = el.getAttribute("data-id");
      panel = "payload";
      renderDesk();
      return;
    }
    if (action === "mark-paid") {
      var paid = byId(el.getAttribute("data-id"));
      if (paid) {
        paid.status = "paid";
        save(paid);
        renderDesk();
        toast("Order #" + paid.id + " marked paid.");
      }
      return;
    }
    if (action === "generate-payload") {
      var current = active();
      if (!current) return;
      current.steps.generated = true;
      save(current);
      renderDesk();
      toast("Payload ready to copy.");
      return;
    }
    if (action === "copy-payload") {
      var copyOrder = active();
      if (!copyOrder) return;
      var text = payloadOf(copyOrder);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("Copied."); }, function () { toast("Copy failed."); });
      } else {
        toast("Clipboard is not available in this preview.");
      }
      return;
    }
    if (action === "toggle-step") {
      var order = active();
      if (!order) return;
      var step = el.getAttribute("data-step");
      order.steps[step] = !order.steps[step];
      if (step === "airplane" || step === "tap" || step === "text" || step === "offline") order.steps.qc = false;
      save(order);
      renderDesk();
      return;
    }
    if (action === "mark-prep") {
      var prep = active();
      if (!prep) return;
      if (!prep.steps.sanitize || !prep.steps.print || !prep.steps.laminate || !prep.steps.pack) {
        toast("Finish every prep step first.");
        return;
      }
      prep.steps.prepDone = true;
      save(prep);
      toast("Substrate prep marked done.");
      panel = "encoding";
      renderDesk();
      return;
    }
    if (action === "write-chip") {
      writeChipNfc();
      return;
    }
    if (action === "cancel-write") {
      if (encodeAbort) encodeAbort.abort();
      return;
    }
    if (action === "staff-refresh") {
      pullOrders().then(function (ok) { if (ok) toast("Orders refreshed."); });
      return;
    }
    if (action === "staff-disconnect") {
      try { sessionStorage.removeItem(TOKEN_KEY); } catch (err) { /* ignore */ }
      serverMode = false;
      orders = load();
      renderConnect("");
      renderDesk();
      return;
    }
    if (action === "approve-qc") {
      var qcOrder = active();
      if (!qcOrder) return;
      if (!qcOrder.steps.airplane || !qcOrder.steps.tap || !qcOrder.steps.text || !qcOrder.steps.offline) {
        toast("Complete the airplane-mode checks first.");
        return;
      }
      qcOrder.steps.qc = true;
      save(qcOrder);
      toast("QC passed.");
      panel = "dispatch";
      renderDesk();
      return;
    }
    if (action === "mark-shipped") {
      var ship = active();
      if (!ship) return;
      if (!ship.steps.qc) {
        toast("Approve QC before shipping.");
        return;
      }
      ship.steps.shipped = true;
      ship.tracking = $("ship-note").value.trim() || "Handed off";
      save(ship);
      toast("Order #" + ship.id + " marked shipped.");
      renderDesk();
    }
  }

  function nfcSupported() {
    return "NDEFReader" in window && window.isSecureContext;
  }

  function setEncode(message, percent, isError) {
    var label = $("encode-label");
    label.textContent = message;
    label.classList.toggle("is-error", !!isError);
    $("encode-bar").style.width = percent + "%";
  }

  function setWriting(on) {
    var go = document.querySelector("[data-action='write-chip']");
    var stop = document.querySelector("[data-action='cancel-write']");
    if (go) go.disabled = on;
    if (stop) stop.hidden = !on;
  }

  /* After a write, wait for the tag to be read back and compare it to what we sent. */
  function verifyTag(ndef, expected, signal) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("verify-timeout")); }, 15000);
      ndef.onreading = function (event) {
        clearTimeout(timer);
        var record = event.message.records.filter(function (r) { return r.recordType === "text"; })[0];
        var got = record ? new TextDecoder(record.encoding || "utf-8").decode(record.data) : "";
        if (got === expected) resolve(event.serialNumber || "");
        else reject(new Error("verify-mismatch"));
      };
      ndef.onreadingerror = function () {
        clearTimeout(timer);
        reject(new Error("verify-read"));
      };
      ndef.scan({ signal: signal }).catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function writeChipNfc() {
    var order = active();
    if (!order) return;
    if (!order.steps.prepDone) { toast("Finish substrate prep first."); return; }
    var text = payloadOf(order);
    if (bytes(text) > 120) { setEncode("Profile is too long for an NTAG213 chip.", 0, true); return; }
    if (!nfcSupported()) {
      setEncode("Web NFC needs Chrome on Android over HTTPS. Use the desktop encoder instead.", 0, true);
      return;
    }

    var lock = $("encode-lock") && $("encode-lock").checked;
    var controller = new AbortController();
    encodeAbort = controller;
    setWriting(true);
    setEncode("Hold a blank tag to the back of this phone…", 25);

    var ndef = new NDEFReader();
    var uid = "";
    ndef.write({ records: [{ recordType: "text", data: text, lang: "en" }] }, { overwrite: true, signal: controller.signal })
      .then(function () {
        setEncode("Written. Verifying — keep the tag there, or tap it again.", 60);
        return verifyTag(ndef, text, controller.signal);
      })
      .then(function (serial) {
        uid = serial;
        if (!lock) return null;
        setEncode("Verified. Locking tag…", 85);
        return ndef.makeReadOnly({ signal: controller.signal });
      })
      .then(function () {
        order.steps.encoded = true;
        order.steps.generated = true;
        order.tagUid = uid;
        if (serverMode) {
          return api("/api/encoder/" + encodeURIComponent(order.id) + "/result", "POST",
            { verified: true, via: "web-nfc", uid: uid || null }, staffToken())
            .catch(function (err) { toast("Tag written, but the server was not updated: " + err.message); });
        }
        save();
        return null;
      })
      .then(function () {
        setEncode("Payload written and verified.", 100);
        toast("Order #" + order.id + " encoded" + (uid ? " · tag " + uid : "") + ".");
        renderDesk();
      })
      .catch(function (err) {
        order.steps.encoded = false;
        var name = err && err.name;
        var message = err && err.message;
        if (name === "AbortError") message = "Write cancelled.";
        else if (name === "NotAllowedError") message = "NFC permission was denied. Allow NFC for this site and try again.";
        else if (name === "NotSupportedError") message = "This phone has NFC off or does not support it.";
        else if (name === "NetworkError") message = "The tag moved away or is not writable. Try again.";
        else if (message === "verify-timeout") message = "Written, but not verified. Tap the tag again, then press Write once more.";
        else if (message === "verify-mismatch") message = "Read-back did not match. Do not ship this tag; write it again.";
        else if (message === "verify-read") message = "Could not read the tag back. Try again.";
        setEncode(message || "Write failed.", 0, true);
        renderDesk();
        $("encode-label").textContent = message || "Write failed.";
        $("encode-label").classList.add("is-error");
      })
      .then(function () {
        controller.abort();
        encodeAbort = null;
        setWriting(false);
      });
  }

  function handleSubmit(event) {
    var form = event.target;
    if (form.id === "step-form") {
      event.preventDefault();
      var draft = draftFromForm();
      var problem = validDraft(draft);
      var error = $("form-error");
      if (problem) {
        error.hidden = false;
        error.textContent = problem;
        return;
      }
      error.hidden = true;
      fillReview();
      setWizard(3);
      return;
    }
    if (form.id === "staff-form") {
      event.preventDefault();
      var entered = $("staff-token").value.trim();
      if (!entered) { renderConnect("Enter the staff token."); return; }
      try { sessionStorage.setItem(TOKEN_KEY, entered); } catch (err) { /* ignore */ }
      $("staff-token").value = "";
      pullOrders();
      return;
    }
    if (form.id === "reencode-form") {
      event.preventDefault();
      var id = $("re-id").value.trim().replace(/^#/, "");
      while (id.length < 3) id = "0" + id;
      var found = byId(id);
      var reError = $("re-error");
      var reOk = $("re-ok");
      var request = { option: $("re-option").value, details: $("re-details").value.trim() };
      api("/api/orders/" + encodeURIComponent(id) + "/reencode", "POST", request).then(function () {
        return true;
      }, function (err) {
        if (err.status === 404 || err.status === 429 || err.status === 400) throw err;
        return false; // server unreachable: fall back to this browser's copy
      }).then(function (sent) {
        if (!sent && !found) throw new Error("No order #" + id + " on this browser.");
        if (found) {
          found.reencode = request;
          found.steps.shipped = false;
          save(found);
        }
        reError.hidden = true;
        reOk.hidden = false;
        reOk.textContent = "Request saved for #" + id + ". Return the tag to 12-B Alcalde Jose. Fee ₱20–₱30.";
        form.reset();
        renderDesk();
      }).catch(function (err) {
        reError.hidden = false;
        reError.textContent = err.status === 404 ? "No order #" + id + " found." : err.message;
        reOk.hidden = true;
      });
    }
  }

  function handleInput(event) {
    if (event.target && event.target.form && event.target.form.id === "step-form") updateFormBytes();
    if (event.target && event.target.id === "confirm-check") {
      $("btn-confirm").disabled = !event.target.checked;
    }
  }

  function handleChange(event) {
    if (event.target && event.target.id === "scan-select") {
      scanId = event.target.value;
      paintPhone(false);
    }
    if (event.target && event.target.id === "ship-note") {
      var order = active();
      if (!order) return;
      order.tracking = event.target.value;
      save(order);
    }
  }

  function init() {
    var root = document.getElementById("lifetag");
    if (!root) return;
    orders = load();
    if (!booted) {
      booted = true;
      root.addEventListener("click", function (event) {
        onToggle(event);
        handleClick(event);
      });
      root.addEventListener("submit", handleSubmit);
      root.addEventListener("input", handleInput);
      root.addEventListener("change", handleChange);
    }
    activeId = orders[0] ? orders[0].id : "";
    scanId = orders[0] ? orders[0].id : "";
    markChoice();
    renderScanOptions();
    renderDesk();
    paintPhone(false);
    renderConnect("");
  }

  window.LifeTag = { init: init };
})();
