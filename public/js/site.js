(function () {
  "use strict";

  var TOKEN_KEY = "lifetag.staff-token";
  var CHIP = 144;
  var MAX_PROFILE_BYTES = 120;
  var buildPayload = null;
  var validateProfile = null;
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
  var scanId = "001";
  var panel = "orders";
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

  function staffToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
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
  function save(order, patch, successMessage) {
    if (!serverMode || !order) return Promise.resolve(false);
    return api("/api/orders/" + encodeURIComponent(order.id), "PATCH", patch, staffToken())
      .then(function (updated) {
        var index = orders.findIndex(function (item) { return item.id === updated.id; });
        if (index !== -1) orders[index] = normalize(updated);
        renderDesk();
        if (successMessage) toast(successMessage);
        return true;
      })
      .catch(function (err) {
        toast("Not saved to server: " + err.message);
        return false;
      });
  }

  function pullOrders() {
    var token = staffToken();
    if (!token) {
      serverMode = false;
      orders = [];
      renderConnect("");
      return Promise.resolve(false);
    }
    serverMode = false;
    orders = [];
    renderConnect("");
    return api("/api/orders", "GET", null, token).then(function (data) {
      serverMode = true;
      orders = (data.orders || []).map(normalize);
      if (!byId(activeId)) activeId = orders[0] ? orders[0].id : "";
      renderConnect("");
      renderDesk();
      return true;
    }).catch(function (err) {
      serverMode = false;
      orders = [];
      activeId = "";
      renderConnect(err.message);
      return false;
    });
  }

  function renderConnect(error) {
    var form = $("staff-form"), status = $("staff-status"), content = $("staff-content");
    if (!form) return;
    form.hidden = serverMode;
    if (content) content.hidden = !serverMode;
    status.textContent = error || "";
    status.classList.toggle("is-error", !!error);
    if (serverMode) {
      $("staff-connected").textContent = "Connected to server · " + orders.length + " orders";
    }
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

  function payload(fields) {
    return buildPayload({
      buyer: fields.buyer || fields.name || "",
      blood: fields.blood || "",
      ice: fields.ice || "",
      allergies: fields.allergies || "",
      directives: fields.directives || ""
    });
  }

  function bytes(text) {
    return new TextEncoder().encode(text).length;
  }

  function statusLabel(order) {
    if (order.status === "awaiting_payment") return ["Awaiting payment", "status-new"];
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
    ["view-home", "view-order", "view-scan", "view-support", "view-track"].forEach(function (view) {
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
    window.location.assign("/" + (hash || ""));
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

  function updateFormBytes(limitReached) {
    var text = payload(draftFromForm());
    var size = bytes(text);
    var el = $("form-bytes");
    if (!el) return;
    el.textContent = (limitReached || size > MAX_PROFILE_BYTES ? "Limit reached; extra characters are not accepted. " : "") +
      "Profile: " + size + " / " + MAX_PROFILE_BYTES + " bytes. NTAG213 capacity: " + CHIP +
      " bytes; 24 bytes are reserved for NDEF framing.";
    el.classList.toggle("is-over", !!limitReached || size > MAX_PROFILE_BYTES);
  }

  function setWizard(step) {
    $("step-choose").hidden = step !== 1;
    $("step-terms").hidden = step !== 2;
    $("step-form").hidden = step !== 3;
    $("step-review").hidden = step !== 4;
    $("step-done").hidden = step !== 5;
    var titles = {
      1: "Choose your LifeTag",
      2: "Privacy, data protection & terms",
      3: "Free emergency registration",
      4: "Review before submitting",
      5: "Order placed"
    };
    $("wizard-title").textContent = titles[step];
    document.querySelectorAll("#crumbs li").forEach(function (li) {
      li.classList.toggle("is-on", Number(li.getAttribute("data-crumb")) === Math.min(step, 4));
    });
    $("crumbs").hidden = step === 5;
    if (step === 3) {
      var info = PRODUCTS[product];
      $("picked-label").textContent = info.name + " · " + peso(info.price) + " · " + info.kind;
      updateFormBytes();
    }
    markChoice();
  }

  function fillReview() {
    var draft = draftFromForm();
    var text = payload(draft);
    $("r-name").textContent = draft.buyer;
    $("r-blood").textContent = draft.blood;
    $("r-ice").textContent = draft.ice;
    $("r-allergies").textContent = draft.allergies;
    $("r-note").textContent = draft.directives;
    $("r-note-row").hidden = !draft.directives;
    $("r-payload").textContent = text;
    var size = bytes(text);
    var meta = $("review-bytes");
    meta.textContent = "Profile: " + size + " / " + MAX_PROFILE_BYTES + " bytes · NTAG213 capacity: " + CHIP + " bytes";
    meta.classList.toggle("is-over", size > MAX_PROFILE_BYTES);
    $("confirm-check").checked = false;
    $("btn-confirm").disabled = true;
  }

  function confirmOrder() {
    var draft = draftFromForm();
    var validation = validateProfile(draft);
    if (!validation.success) {
      $("confirm-error").hidden = false;
      $("confirm-error").textContent = validation.message;
      return;
    }
    $("confirm-error").hidden = true;
    var button = $("btn-confirm");
    button.disabled = true;
    var order = {
      id: "",
      product: product,
      status: "awaiting_payment",
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
      if (typeof res.id !== "string" || typeof res.receipt !== "string" || res.receipt.length < 32) {
        var invalidResponse = new Error("The server returned an invalid order receipt. Contact support before paying.");
        invalidResponse.status = 400;
        throw invalidResponse;
      }
      order.id = res.id;
      finishOrder(order, res.receipt, true);
    }).catch(function (err) {
      if (err.status && err.status < 500) {
        button.disabled = false;
        $("confirm-error").hidden = false;
        $("confirm-error").textContent = err.message;
        return;
      }
      try {
        order.id = "LOCAL-" + Array.from(randomReceiptBytes().slice(0, 5))
          .map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("").toUpperCase();
        finishOrder(order, receiptFromBytes(randomReceiptBytes()), false);
      } catch (storageError) {
        button.disabled = false;
        $("confirm-error").hidden = false;
        $("confirm-error").textContent = storageError.message;
      }
    });
  }

  function randomReceiptBytes() {
    if (!window.crypto || !window.crypto.getRandomValues) {
      throw new Error("Secure receipt generation is unavailable. Try again on a secure connection.");
    }
    return window.crypto.getRandomValues(new Uint8Array(32));
  }

  function receiptFromBytes(bytesValue) {
    return Array.from(bytesValue).map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  function storeReceipt(id, receipt) {
    try {
      localStorage.setItem("lifetag.receipt." + id, receipt);
      return true;
    } catch {
      return false;
    }
  }

  function storeLocalOrder(order, receipt, paymentReference, savedOnServer) {
    try {
      localStorage.setItem("lifetag.order." + order.id, JSON.stringify({
        order: order,
        receipt: receipt,
        paymentReference: paymentReference || "",
        savedOnServer: !!savedOnServer
      }));
      return true;
    } catch {
      return false;
    }
  }

  function finishOrder(order, receipt, savedOnServer) {
    orders = [order];
    activeId = order.id;
    scanId = order.id;
    $("done-title").textContent = "Order #" + order.id;
    $("done-status").textContent = savedOnServer
      ? "Order received · awaiting payment"
      : "Order copy · not saved on the server";
    $("done-copy").textContent = PRODUCTS[order.product].name + " for " + order.buyer +
      " · awaiting payment verification. Staff must check the payment reference and mark this order paid before production.";
    $("done-amount").textContent = "Amount due: " + peso(PRODUCTS[order.product].price);
    $("done-local-status").hidden = savedOnServer;
    $("done-local-status").textContent = savedOnServer
      ? ""
      : "Not saved on the server. This local copy cannot be seen by staff or used for production until you submit a new order when service is available.";
    $("done-receipt").textContent = receipt;
    $("done-payload").textContent = payload(order);
    $("payment-reference-form").hidden = false;
    $("payment-reference-ok").hidden = true;
    $("payment-reference-error").hidden = true;
    $("payment-reference").value = "";
    $("payment-reference").disabled = false;
    $("payment-reference-form").querySelector("button[type='submit']").disabled = false;
    $("payment-reference-help").textContent = savedOnServer
      ? "Staff will check the reference and mark the order paid. No payment gateway is connected."
      : "This order and reference are only in this browser. They are not submitted to staff or the server.";
    var receiptSaved = savedOnServer ? storeReceipt(order.id, receipt) : storeLocalOrder(order, receipt);
    if (!receiptSaved) {
      $("done-local-status").hidden = false;
      $("done-local-status").textContent = "Not saved in this browser. Keep the receipt code shown above; do not close this page until you have copied it.";
    }
    setWizard(5);
    api("/api/payment-instructions", "GET").then(function (instructions) {
      $("payment-instructions").textContent =
        "Send " + peso(PRODUCTS[order.product].price) + " to GCash / Maya account " +
        instructions.name + " · " + instructions.number + ". No payment is processed by this website.";
    }).catch(function (err) {
      $("payment-instructions").textContent = err.message +
        " Do not send payment until the account details are available.";
    });
    toast(savedOnServer ? "Order #" + order.id + " created; awaiting payment." : "Order copy is not saved on the server.");
  }

  function renderScanOptions() {
    paintPhone(false);
  }

  function paintPhone(live) {
    var order = byId(scanId) || {
      buyer: "Juan Dela Cruz",
      blood: "O+",
      ice: "0917 123 4567",
      allergies: "Penicillin"
    };
    if (!$("phone")) return;
    $("phone-name").textContent = order.buyer;
    $("phone-blood").textContent = order.blood;
    $("phone-ice").textContent = order.ice;
    $("phone-allergies").textContent = order.allergies;
    $("phone").hidden = false;
    $("tap-caption").textContent = live ? "Preview only · no chip was read." : "Preview only · sample profile";
    $("scan-stage").classList.toggle("is-tapped", !!live);
  }

  function renderOrders() {
    var body = $("order-rows");
    if (!body) return;
    body.innerHTML = orders.map(function (order) {
      var badge = statusLabel(order);
      var paid = order.status === "awaiting_payment" && order.paymentReference
        ? "<button class=\"btn btn-ghost\" type=\"button\" data-action=\"mark-paid\" data-id=\"" + esc(order.id) + "\">Mark paid</button>"
        : "";
      return "<tr class=\"" + (order.id === activeId ? "is-active" : "") + "\">" +
        "<td>#" + esc(order.id) + "</td>" +
        "<td>" + esc(PRODUCTS[order.product].short) + "</td>" +
        "<td>" + esc(order.buyer) + "</td>" +
        "<td>" + esc(order.paymentReference || "—") + "</td>" +
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
      $("staff-empty-state").hidden = false;
      document.querySelectorAll("#panel-payload [data-action], #panel-production [data-action], #prod-checks [data-step], " +
        "#panel-encoding [data-action], #qc-checks [data-step], #panel-qc [data-action], " +
        "#panel-dispatch [data-action], #ship-note")
        .forEach(function (control) { control.disabled = true; });
      var emptyGate = $("payment-gate");
      if (emptyGate) {
        emptyGate.hidden = false;
        emptyGate.textContent = "No order is selected. Create an order first; it must be marked paid before fulfillment can start.";
      }
      return;
    }
    $("staff-empty-state").hidden = true;
    var paid = order.status === "paid";
    var gate = $("payment-gate");
    if (gate) gate.hidden = paid;
    document.querySelectorAll("#panel-payload [data-action], #panel-production [data-action], " +
      "#prod-checks [data-step], " +
      "#panel-encoding [data-action='write-chip'], #qc-checks [data-step], " +
      "#panel-qc [data-action='approve-qc'], #panel-dispatch [data-action='mark-shipped']")
      .forEach(function (control) {
        control.disabled = control.closest("#panel-payload") ? false : !paid;
      });
    $("ship-note").disabled = !paid;
    var badge = statusLabel(order);
    $("working").textContent = "Order #" + order.id + " · " + PRODUCTS[order.product].name + " · " + order.buyer + " · " + badge[0];

    var text = payload(order);
    $("payload-kicker").textContent = "Order #" + order.id + " · " + PRODUCTS[order.product].name;
    $("payload-pre").textContent = order.steps.generated ? text : "Generate the plain-text payload for this order.";
    $("payload-meta").textContent = "Plain text · Profile: " + bytes(text) + " / " + MAX_PROFILE_BYTES + " bytes · NTAG213: " + CHIP + " bytes";
    $("prod-kicker").textContent = "Order #" + order.id;
    syncChecks("prod-checks", order);
    syncChecks("qc-checks", order);
    $("pass-pill").hidden = !order.steps.qc;
    $("encode-meta").textContent = "Profile: " + bytes(text) + " / " + MAX_PROFILE_BYTES + " bytes · NTAG213 capacity: " + CHIP + " bytes";
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
      "<div><dt>Payment reference</dt><dd>" + esc(order.paymentReference || "Not submitted") + "</dd></div>" +
      "<div><dt>Hand-off</dt><dd>" + esc(order.tracking || "Courier · pending") + "</dd></div>";
    $("ship-note").value = order.tracking || "";

    var queue = $("re-queue");
    var requests = orders.filter(function (item) { return item.reencode; });
    queue.innerHTML = requests.length
      ? requests.map(function (item) {
          return "<article class=\"queue-card\"><strong>#" + esc(item.id) + " · " + esc(item.buyer) + "</strong><p>" +
            esc(item.reencode.option) + "</p><p>Bring the physical tag to 12-B Alcalde Jose, Pasig.</p></article>";
        }).join("")
      : "<p class=\"hint\">No re-encoding requests yet.</p>";
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
    var result = validateProfile(draft);
    return result.success ? "" : result.message;
  }

  function handleClick(event) {
    var el = event.target.closest("[data-action]");
    if (!el || !document.getElementById("lifetag").contains(el)) return;
    var action = el.getAttribute("data-action");

    if (action === "nav-toggle") return;
    if (action === "go-home") { event.preventDefault(); goHome("#top"); return; }
    if (action === "go-products") { event.preventDefault(); goHome("#products"); return; }
    if (action === "go-how") { event.preventDefault(); goHome("#how"); return; }
    if (action === "go-support") { event.preventDefault(); window.location.assign("/support"); return; }
    if (action === "go-scan") { event.preventDefault(); window.location.assign("/scan"); return; }
    if (action === "go-track") { event.preventDefault(); window.location.assign("/track"); return; }
    if (action === "go-staff") { event.preventDefault(); window.location.assign("/staff"); return; }
    if (action === "go-order") { event.preventDefault(); window.location.assign("/order"); return; }
    if (action === "pick-product") {
      event.preventDefault();
      window.location.assign("/order?product=" + encodeURIComponent(el.getAttribute("data-product")));
      return;
    }
    if (action === "choose-product") {
      product = el.getAttribute("data-product");
      markChoice();
      setWizard(2);
      return;
    }
    if (action === "back-choose") { setWizard(1); return; }
    if (action === "terms-continue") {
      if (!$("terms-check").checked) return;
      setWizard(3);
      return;
    }
    if (action === "back-terms") { setWizard(2); return; }
    if (action === "fill-sample") {
      $("f-name").value = "Dela Cruz, Juan";
      $("f-blood").value = "O+";
      $("f-ice").value = "09171234567";
      $("f-allergies").value = "Penicillin";
      $("f-directives").value = "";
      updateFormBytes();
      return;
    }
    if (action === "wizard-edit") { setWizard(3); return; }
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
      if (!paid || paid.status !== "awaiting_payment" || !paid.paymentReference) {
        toast("A payment reference is required before marking this order paid.");
        return;
      }
      api("/api/orders/" + encodeURIComponent(paid.id), "PATCH", { status: "paid" }, staffToken())
        .then(function (updated) {
          var index = orders.findIndex(function (item) { return item.id === updated.id; });
          if (index !== -1) orders[index] = normalize(updated);
          renderDesk();
          toast("Order #" + updated.id + " marked paid. Production may now start.");
        })
        .catch(function (err) { toast("Could not mark order paid: " + err.message); });
      return;
    }
    if (action === "generate-payload") {
      var current = active();
      if (!current) return;
      save(current, { steps: { generated: true } }, "Payload ready to copy.");
      return;
    }
    if (action === "copy-payload") {
      var copyOrder = active();
      if (!copyOrder) return;
      var text = payload(copyOrder);
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
      if (order.status !== "paid" &&
          ["sanitize", "print", "laminate", "pack", "airplane", "tap", "text", "offline"].indexOf(step) !== -1) {
        toast("Mark the order paid before starting production.");
        return;
      }
      var next = !order.steps[step];
      var stepPatch = { steps: {} };
      stepPatch.steps[step] = next;
      if (step === "airplane" || step === "tap" || step === "text" || step === "offline") {
        stepPatch.steps.qc = false;
      }
      save(order, stepPatch);
      return;
    }
    if (action === "mark-prep") {
      var prep = active();
      if (!prep) return;
      if (prep.status !== "paid") { toast("Mark the order paid before starting production."); return; }
      if (!prep.steps.sanitize || !prep.steps.print || !prep.steps.laminate || !prep.steps.pack) {
        toast("Finish every prep step first.");
        return;
      }
      save(prep, { steps: { prepDone: true } }, "Substrate prep marked done.").then(function (saved) {
        if (!saved) return;
        panel = "encoding";
        renderDesk();
      });
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
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        toast("Could not clear the staff token from this tab.");
        return;
      }
      serverMode = false;
      orders = [];
      activeId = "";
      renderConnect("");
      return;
    }
    if (action === "approve-qc") {
      var qcOrder = active();
      if (!qcOrder) return;
      if (qcOrder.status !== "paid") { toast("Mark the order paid before starting QC."); return; }
      if (!qcOrder.steps.airplane || !qcOrder.steps.tap || !qcOrder.steps.text || !qcOrder.steps.offline) {
        toast("Complete the airplane-mode checks first.");
        return;
      }
      save(qcOrder, { steps: { qc: true } }, "QC passed.").then(function (saved) {
        if (!saved) return;
        panel = "dispatch";
        renderDesk();
      });
      return;
    }
    if (action === "mark-shipped") {
      var ship = active();
      if (!ship) return;
      if (ship.status !== "paid") { toast("Mark the order paid before dispatch."); return; }
      if (!ship.steps.qc) {
        toast("Approve QC before shipping.");
        return;
      }
      var tracking = $("ship-note").value.trim() || "Handed off";
      save(ship, { steps: { shipped: true }, tracking: tracking },
        "Order #" + ship.id + " marked shipped.");
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
    if (order.status !== "paid") { toast("Mark the order paid before encoding."); return; }
    if (!order.steps.prepDone) { toast("Finish substrate prep first."); return; }
    var text = payload(order);
    if (bytes(text) > MAX_PROFILE_BYTES) { setEncode("Profile exceeds the safe 120-byte NTAG213 limit.", 0, true); return; }
    if (!nfcSupported()) {
      setEncode("Web NFC needs Chrome on Android over HTTPS. Use the desktop encoder instead.", 0, true);
      return;
    }

    var lock = $("encode-lock") && $("encode-lock").checked;
    var controller = new AbortController();
    encodeAbort = controller;
    setWriting(true);
    setEncode("Hold a blank tag to the back of this phone…", 25);

    var ndef = new window.NDEFReader();
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
        if (serverMode) {
          return api("/api/encoder/" + encodeURIComponent(order.id) + "/result", "POST",
            { verified: true, via: "web-nfc", uid: uid || null }, staffToken())
            .then(function () {
              order.steps.encoded = true;
              order.steps.generated = true;
              order.tagUid = uid;
              return null;
            });
        }
        order.steps.encoded = true;
        order.steps.generated = true;
        order.tagUid = uid;
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
      setWizard(4);
      return;
    }
    if (form.id === "staff-form") {
      event.preventDefault();
      var entered = $("staff-token").value.trim();
      if (!entered) { renderConnect("Enter the staff token."); return; }
      try {
        sessionStorage.setItem(TOKEN_KEY, entered);
      } catch {
        renderConnect("Session storage is unavailable; the staff token cannot be kept for this tab.");
        return;
      }
      pullOrders().then(function (ok) {
        if (ok) $("staff-token").value = "";
      });
      return;
    }
    if (form.id === "reencode-form") {
      event.preventDefault();
      var id = $("re-id").value.trim().replace(/^#/, "");
      while (id.length < 3 && /^\d+$/.test(id)) id = "0" + id;
      var reError = $("re-error");
      var reOk = $("re-ok");
      var request = {
        receipt: $("re-receipt").value.trim(),
        option: $("re-option").value
      };
      api("/api/orders/" + encodeURIComponent(id) + "/reencode", "POST", request).then(function () {
        reError.hidden = true;
        reOk.hidden = false;
        reOk.textContent = "Request saved for #" + id + ". Bring the physical tag to 12-B Alcalde Jose, Pasig. Fee ₱20–₱30.";
        form.reset();
      }).catch(function (err) {
        reError.hidden = false;
        reError.textContent = err.status === 404 ? "No order #" + id + " found." : err.message;
        reOk.hidden = true;
      });
      return;
    }
    if (form.id === "track-form") {
      event.preventDefault();
      var trackId = $("track-id").value.trim().replace(/^#/, "");
      while (trackId.length < 3 && /^\d+$/.test(trackId)) trackId = "0" + trackId;
      var trackError = $("track-error");
      var trackResult = $("track-result");
      var trackStatus = $("track-status");
      trackStatus.hidden = true;
      if (trackId.indexOf("LOCAL-") === 0) {
        try {
          var savedCopy = JSON.parse(localStorage.getItem("lifetag.order." + trackId) || "null");
          if (savedCopy && savedCopy.receipt === $("track-receipt").value.trim()) {
            trackError.hidden = true;
            trackResult.hidden = false;
            trackResult.textContent = "Order " + trackId + " · local copy only · not saved on the server" +
              (savedCopy.paymentReference ? " · payment reference kept in this browser only, not sent to staff" : "");
            return;
          }
        } catch {
          trackError.hidden = false;
          trackError.textContent = "Could not read the saved order copy from this browser.";
          trackResult.hidden = true;
          return;
        }
      }
      var lookup = new URLSearchParams({
        id: trackId,
        receipt: $("track-receipt").value.trim()
      });
      api("/api/orders/lookup?" + lookup.toString()).then(function (result) {
        trackError.hidden = true;
        trackResult.hidden = false;
        trackResult.textContent = "Order #" + result.id + " · " + result.status;
        var steps = [
          ["generated", "Payload generated"],
          ["prepDone", "Production prepared"],
          ["encoded", "Tag encoded"],
          ["qc", "Quality checked"],
          ["shipped", "Shipped"],
          ["reencodeRequested", "Re-encoding requested"]
        ];
        trackStatus.innerHTML =
          "<div><dt>Product</dt><dd>" + esc(PRODUCTS[result.product] ? PRODUCTS[result.product].name : result.product) + "</dd></div>" +
          "<div><dt>Tracking note</dt><dd>" + esc(result.tracking || "Not available") + "</dd></div>" +
          steps.map(function (step) {
            return "<div><dt>" + esc(step[1]) + "</dt><dd>" + (result[step[0]] ? "Yes" : "No") + "</dd></div>";
          }).join("");
        trackStatus.hidden = false;
      }).catch(function (err) {
        trackError.hidden = false;
        trackError.textContent = err.status === 404
          ? "No matching order was found. Check the ID and receipt code."
          : err.message;
        trackResult.hidden = true;
        trackStatus.hidden = true;
      });
      return;
    }
    if (form.id === "payment-reference-form") {
      event.preventDefault();
      var order = active();
      if (!order) return;
      var reference = $("payment-reference").value.trim();
      var errorEl = $("payment-reference-error");
      var okEl = $("payment-reference-ok");
      if (!reference || reference.length > 80) {
        errorEl.hidden = false;
        errorEl.textContent = "Payment reference must be 1–80 characters.";
        okEl.hidden = true;
        return;
      }
      var receipt = $("done-receipt").textContent;
      if (order.id.indexOf("LOCAL-") === 0) {
        var saved = storeLocalOrder(order, receipt, reference);
        errorEl.hidden = true;
        okEl.hidden = false;
        okEl.textContent = saved
          ? "Payment reference kept in this browser only. This order is not saved on the server and staff cannot see it."
          : "Could not save the payment reference in this browser. Keep this page open and contact support.";
        return;
      }
      api("/api/orders/" + encodeURIComponent(order.id) + "/payment-reference", "POST", {
        receipt: receipt,
        reference: reference
      }).then(function () {
        order.paymentReference = reference;
        errorEl.hidden = true;
        okEl.hidden = false;
        okEl.textContent = "Reference submitted. The order is still awaiting staff verification; it is not marked paid.";
        $("payment-reference").disabled = true;
        form.querySelector("button[type='submit']").disabled = true;
      }).catch(function (err) {
        errorEl.hidden = false;
        okEl.hidden = true;
        if (!err.status || err.status >= 500) {
          var stored = storeLocalOrder(order, receipt, reference, true);
          errorEl.textContent = stored
            ? "The server is unavailable. The reference is saved only in this browser and has not been sent to staff."
            : "The server is unavailable and the reference could not be saved in this browser.";
        } else {
          errorEl.textContent = err.message;
        }
      });
    }
  }

  function handleInput(event) {
    if (event.target && event.target.form && event.target.form.id === "step-form") {
      updateFormBytes();
    }
    if (event.target && event.target.id === "confirm-check") {
      $("btn-confirm").disabled = !event.target.checked;
    }
    if (event.target && event.target.id === "terms-check") {
      $("terms-continue").disabled = !event.target.checked;
    }
    if (event.target && (event.target.id === "track-id" || event.target.id === "re-id")) {
      try {
        var isTrackField = event.target.id === "track-id";
        var receiptId = event.target.value.trim().replace(/^#/, "");
        while (receiptId.length < 3 && /^\d+$/.test(receiptId)) receiptId = "0" + receiptId;
        var receiptField = $(isTrackField ? "track-receipt" : "re-receipt");
        receiptField.value = localStorage.getItem("lifetag.receipt." + receiptId) || "";
        if (isTrackField && !receiptField.value && receiptId.indexOf("LOCAL-") === 0) {
          var localCopy = JSON.parse(localStorage.getItem("lifetag.order." + receiptId) || "null");
          if (localCopy) receiptField.value = localCopy.receipt || "";
        }
      } catch {
        $("track-error").hidden = false;
        $("track-error").textContent = "Could not read the saved receipt from this browser.";
      }
    }
  }

  function handleChange(event) {
    if (event.target && event.target.id === "ship-note") {
      var order = active();
      if (!order) return;
      save(order, { tracking: event.target.value });
    }
  }

  function init(payloadBuilder, profileValidator) {
    var root = document.getElementById("lifetag");
    if (!root || typeof payloadBuilder !== "function") return;
    buildPayload = payloadBuilder;
    validateProfile = profileValidator;
    if (root.dataset.lifetagInitialized !== "true") {
      root.dataset.lifetagInitialized = "true";
      root.addEventListener("click", function (event) {
        onToggle(event);
        handleClick(event);
      });
      root.addEventListener("submit", handleSubmit);
      root.addEventListener("input", handleInput);
      root.addEventListener("change", handleChange);
    }
    if (window.location.pathname === "/staff") {
      serverMode = false;
      orders = [];
      activeId = "";
      panel = "orders";
      renderConnect("");
      if (staffToken()) pullOrders();
      return;
    }

    serverMode = false;
    orders = [];
    var pathViews = {
      "/": "view-home",
      "/order": "view-order",
      "/scan": "view-scan",
      "/support": "view-support",
      "/track": "view-track"
    };
    var currentView = pathViews[window.location.pathname] || "view-home";
    show(currentView);
    if (currentView === "view-order") {
      var requestedProduct = new URLSearchParams(window.location.search).get("product");
      if (requestedProduct && Object.prototype.hasOwnProperty.call(PRODUCTS, requestedProduct)) {
        product = requestedProduct;
      }
      $("terms-check").checked = false;
      $("terms-continue").disabled = true;
      setWizard(1);
    }
    markChoice();
    renderScanOptions();
    if (currentView === "view-scan") paintPhone(false);
  }

  window.LifeTag = { init: init };
})();
