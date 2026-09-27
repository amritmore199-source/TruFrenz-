/*
 * Trufrenz Admin — dashboard client.
 *
 * Plain ES module-free script so the console needs no build step: the Express
 * server serves this directory as static files at /admin.
 */

(function () {
  "use strict";

  /* ------------------------------ helpers ------------------------------- */

  const $ = (id) => document.getElementById(id);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  async function api(path, options) {
    const response = await fetch(`/api/admin${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });

    if (response.status === 401) {
      showLogin();
      throw new Error("Session expired. Sign in again.");
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  let toastTimer = null;
  function toast(message, kind) {
    const node = $("toast");
    node.textContent = message;
    node.className = `toast${kind ? ` ${kind}` : ""}`;
    node.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      node.hidden = true;
    }, 4200);
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDay(value) {
    if (!value) return "—";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function relative(value) {
    if (!value) return "—";
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return "—";
    const diff = Date.now() - then;
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  function money(cents) {
    return `$${(Number(cents || 0) / 100).toFixed(2)}`;
  }

  function statusTag(value) {
    const map = {
      active: "ok",
      approved: "ok",
      warned: "warn",
      pending: "warn",
      suspended: "danger",
      rejected: "danger",
      banned: "critical",
      dismissed: "muted",
      open: "info",
      premium: "info",
      free: "muted",
      id_selfie: "ok",
      phone: "info",
      none: "muted",
    };
    return el("span", `tag ${map[value] || "muted"}`, String(value).replace(/_/g, " "));
  }

  /* ------------------------------- dialogs ------------------------------ */

  let dialogResolve = null;

  function askDialog(options) {
    return new Promise((resolve) => {
      dialogResolve = resolve;
      $("dialog-title").textContent = options.title;
      $("dialog-message").textContent = options.message || "";
      $("dialog-confirm").textContent = options.confirmLabel || "Confirm";
      $("dialog-confirm").className = `btn ${options.danger ? "danger" : "primary"}`;
      $("dialog-note-field").hidden = !options.note;
      $("dialog-note-label").textContent = options.noteLabel || "Note";
      $("dialog-note").value = "";
      $("dialog-note").required = Boolean(options.noteRequired);
      $("dialog-backdrop").hidden = false;
      $("dialog-note").focus();
    });
  }

  function closeDialog(result) {
    $("dialog-backdrop").hidden = true;
    if (dialogResolve) {
      dialogResolve(result);
      dialogResolve = null;
    }
  }

  $("dialog-cancel").addEventListener("click", () => closeDialog(null));
  $("dialog-backdrop").addEventListener("click", (event) => {
    if (event.target === $("dialog-backdrop")) closeDialog(null);
  });
  $("dialog").addEventListener("submit", (event) => {
    event.preventDefault();
    closeDialog({ note: $("dialog-note").value.trim() });
  });

  /* -------------------------------- charts ------------------------------ */

  function renderBars(container, metrics, key, options) {
    clear(container);
    const settings = options || {};
    if (!metrics.length) {
      container.appendChild(el("p", "empty", "No metric history yet."));
      return;
    }

    const width = 520;
    const height = 132;
    const padLeft = 34;
    const padBottom = 18;
    const plotW = width - padLeft - 8;
    const plotH = height - padBottom - 8;
    const values = metrics.map((row) => Number(row[key] || 0));
    const max = Math.max(...values, 1);
    const barW = plotW / metrics.length;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");

    // horizontal gridlines with value labels
    for (let i = 0; i <= 2; i++) {
      const y = 8 + (plotH / 2) * i;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", padLeft);
      line.setAttribute("x2", width - 8);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", "#262b36");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", 4);
      label.setAttribute("y", y + 3);
      label.setAttribute("class", "axis-label");
      label.textContent = String(Math.round(max - (max / 2) * i));
      svg.appendChild(label);
    }

    metrics.forEach((row, index) => {
      const value = Number(row[key] || 0);
      const barH = Math.max(1, (value / max) * plotH);
      const x = padLeft + index * barW + barW * 0.18;
      const w = barW * 0.64;
      const y = 8 + plotH - barH;

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", Math.max(2, w));
      rect.setAttribute("height", barH);
      rect.setAttribute("rx", 2);
      rect.setAttribute("class", settings.alt ? "bar alt" : "bar");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${formatDay(row.day)} · ${value}`;
      rect.appendChild(title);
      svg.appendChild(rect);

      if (index % Math.ceil(metrics.length / 7) === 0) {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", x);
        label.setAttribute("y", height - 5);
        label.setAttribute("class", "axis-label");
        label.textContent = formatDay(row.day);
        svg.appendChild(label);
      }
    });

    container.appendChild(svg);
  }

  /** Two stacked series rendered as mirrored bars: primary above, secondary below. */
  function renderSplit(container, metrics, keyA, keyB, labelA, labelB) {
    clear(container);
    if (!metrics.length) {
      container.appendChild(el("p", "empty", "No metric history yet."));
      return;
    }

    const width = 520;
    const height = 148;
    const padLeft = 34;
    const plotH = 104;
    const mid = 8 + plotH / 2;
    const plotW = width - padLeft - 8;
    const max = Math.max(
      ...metrics.map((row) => Math.max(Number(row[keyA] || 0), Number(row[keyB] || 0))),
      1,
    );
    const barW = plotW / metrics.length;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");

    const legend = el("div", "tiny muted");
    legend.style.display = "flex";
    legend.style.gap = "12px";
    legend.style.marginBottom = "4px";
    legend.appendChild(el("span", null, `▲ ${labelA}`));
    legend.appendChild(el("span", null, `▼ ${labelB}`));
    container.appendChild(legend);

    metrics.forEach((row, index) => {
      const a = Number(row[keyA] || 0);
      const b = Number(row[keyB] || 0);
      const x = padLeft + index * barW + barW * 0.18;
      const w = Math.max(2, barW * 0.64);

      const topH = Math.max(1, (a / max) * (plotH / 2));
      const rectA = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rectA.setAttribute("x", x);
      rectA.setAttribute("y", mid - topH);
      rectA.setAttribute("width", w);
      rectA.setAttribute("height", topH);
      rectA.setAttribute("class", "bar");
      const titleA = document.createElementNS("http://www.w3.org/2000/svg", "title");
      titleA.textContent = `${formatDay(row.day)} · ${labelA}: ${a}`;
      rectA.appendChild(titleA);
      svg.appendChild(rectA);

      const bottomH = Math.max(1, (b / max) * (plotH / 2));
      const rectB = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rectB.setAttribute("x", x);
      rectB.setAttribute("y", mid);
      rectB.setAttribute("width", w);
      rectB.setAttribute("height", bottomH);
      rectB.setAttribute("class", "bar alt");
      const titleB = document.createElementNS("http://www.w3.org/2000/svg", "title");
      titleB.textContent = `${formatDay(row.day)} · ${labelB}: ${b}`;
      rectB.appendChild(titleB);
      svg.appendChild(rectB);

      if (index % Math.ceil(metrics.length / 7) === 0) {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", x);
        label.setAttribute("y", height - 5);
        label.setAttribute("class", "axis-label");
        label.textContent = formatDay(row.day);
        svg.appendChild(label);
      }
    });

    const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    axis.setAttribute("x1", padLeft);
    axis.setAttribute("x2", width - 8);
    axis.setAttribute("y1", mid);
    axis.setAttribute("y2", mid);
    axis.setAttribute("stroke", "#333a48");
    svg.appendChild(axis);

    container.appendChild(svg);
  }

  /* -------------------------------- state ------------------------------- */

  const state = {
    admin: null,
    view: "overview",
    overview: null,
    verifications: [],
    reports: [],
    members: { rows: [], total: 0, page: 1, pageSize: 20 },
    memberFilters: { search: "", status: "all", tier: "all" },
    analytics: null,
    safety: null,
    subscriptions: null,
  };

  const VIEW_META = {
    overview: ["Overview", "Product health at a glance, with the queues that need attention."],
    verification: ["Verification queue", "Review ID and selfie submissions before granting the verified badge."],
    moderation: ["Reports & moderation", "Auto-flagged and most-reported content surfaces first."],
    members: ["User management", "Search every member and act on an account."],
    analytics: ["Analytics dashboard", "Trends across signups, verification, tiers, calls, and groups."],
    safety: ["Content & safety controls", "Feature flags, announcements, and the blocked keyword list."],
    subscriptions: ["Subscription management", "Paid members, manual access changes, and the refund log."],
    audit: ["Audit log", "Every dashboard action, recorded for accountability."],
  };

  /* -------------------------------- login ------------------------------- */

  function showLogin() {
    state.admin = null;
    $("dashboard").hidden = true;
    $("login-screen").hidden = false;
  }

  function showDashboard(admin) {
    state.admin = admin;
    $("login-screen").hidden = true;
    $("dashboard").hidden = false;
    $("who-name").textContent = admin.displayName;
    $("who-email").textContent = admin.email;
    $("who-role").textContent = admin.role;
    setView("overview");
  }

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorNode = $("login-error");
    errorNode.hidden = true;
    $("login-submit").disabled = true;

    try {
      const payload = await api("/login", {
        method: "POST",
        body: JSON.stringify({
          email: $("login-email").value,
          password: $("login-password").value,
          code: $("login-code").value,
        }),
      });
      showDashboard(payload.admin);
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    } finally {
      $("login-submit").disabled = false;
    }
  });

  /**
   * Compute the current TOTP for the seeded demo account in the browser so the
   * console can be evaluated without enrolling a real authenticator. This is
   * demo scaffolding only — a real deployment removes this control entirely.
   */
  const DEMO_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  function base32ToBytes(secret) {
    let bits = "";
    for (const char of secret.toUpperCase().replace(/=+$/, "")) {
      const index = B32.indexOf(char);
      if (index === -1) continue;
      bits += index.toString(2).padStart(5, "0");
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return new Uint8Array(bytes);
  }

  async function totpNow(secret) {
    const key = await crypto.subtle.importKey(
      "raw",
      base32ToBytes(secret),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const counter = Math.floor(Date.now() / 1000 / 30);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, Math.floor(counter / 0x100000000));
    view.setUint32(4, counter % 0x100000000);
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(binary % 1000000).padStart(6, "0");
  }

  $("fill-demo-code").addEventListener("click", async () => {
    $("login-email").value = "safety@trufrenz.app";
    $("login-password").value = "Trufrenz#Safety2026";
    $("login-code").value = await totpNow(DEMO_SECRET);
    toast("Demo credentials filled. Sign in to continue.", "ok");
  });

  $("logout").addEventListener("click", async () => {
    await api("/logout", { method: "POST" }).catch(() => undefined);
    showLogin();
  });

  $("refresh").addEventListener("click", () => loadView(state.view, true));

  /* ------------------------------ navigation ---------------------------- */

  $("nav").addEventListener("click", (event) => {
    const button = event.target.closest(".nav-item");
    if (!button) return;
    setView(button.dataset.view);
  });

  function setView(view) {
    state.view = view;
    for (const button of document.querySelectorAll(".nav-item")) {
      button.classList.toggle("active", button.dataset.view === view);
    }
    for (const section of document.querySelectorAll(".view")) {
      section.hidden = section.id !== `view-${view}`;
    }
    const [title, subtitle] = VIEW_META[view];
    $("view-title").textContent = title;
    $("view-sub").textContent = subtitle;
    loadView(view);
  }

  async function loadView(view, force) {
    try {
      switch (view) {
        case "overview":
          await loadOverview();
          break;
        case "verification":
          await loadVerifications();
          break;
        case "moderation":
          await loadReports();
          break;
        case "members":
          await loadMembers();
          break;
        case "analytics":
          await loadAnalytics();
          break;
        case "safety":
          await loadSafety();
          break;
        case "subscriptions":
          await loadSubscriptions();
          break;
        case "audit":
          await loadAudit();
          break;
      }
      if (force) toast("Dashboard refreshed.");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  /* ------------------------------- overview ----------------------------- */

  function tile(label, value, delta) {
    const node = el("div", "tile");
    node.appendChild(el("div", "label", label));
    node.appendChild(el("div", "value", value));
    if (delta) node.appendChild(el("div", `delta ${delta.kind || ""}`, delta.text));
    return node;
  }

  async function loadOverview() {
    const data = await api("/overview");
    state.overview = data;

    $("nav-count-verification").textContent = data.queue.pendingVerifications;
    $("nav-count-verification").classList.toggle("zero", data.queue.pendingVerifications === 0);
    $("nav-count-moderation").textContent = data.queue.openReports;
    $("nav-count-moderation").classList.toggle("zero", data.queue.openReports === 0);

    const metrics = data.metrics || [];
    const latest = metrics[metrics.length - 1] || {};
    const previous = metrics[metrics.length - 2] || {};

    const tiles = $("overview-tiles");
    clear(tiles);

    const dauDelta = Number(latest.activeUsers || 0) - Number(previous.activeUsers || 0);
    tiles.appendChild(
      tile("Total members", data.totals.totalUsers, {
        text: `${data.totals.verified} verified`,
      }),
    );
    tiles.appendChild(
      tile("Daily active", latest.activeUsers || 0, {
        text: `${dauDelta >= 0 ? "+" : ""}${dauDelta} vs yesterday`,
        kind: dauDelta >= 0 ? "up" : "down",
      }),
    );
    tiles.appendChild(
      tile("New signups today", latest.newSignups || 0, {
        text: `${metrics.reduce((sum, row) => sum + Number(row.newSignups || 0), 0)} in 14 days`,
      }),
    );
    tiles.appendChild(
      tile(
        "Verified ratio",
        `${Math.round((data.totals.verified / Math.max(1, data.totals.totalUsers)) * 100)}%`,
        { text: `${data.totals.unverified} unverified` },
      ),
    );
    tiles.appendChild(
      tile("Paid members", data.totals.premium, {
        text: `${data.totals.free} on the free tier`,
      }),
    );
    tiles.appendChild(
      tile("Open reports", data.queue.openReports, {
        text: `${data.queue.autoFlagged} auto-flagged`,
        kind: data.queue.autoFlagged > 0 ? "down" : "",
      }),
    );

    renderBars($("chart-active"), metrics, "activeUsers");
    renderBars($("chart-signups"), metrics, "newSignups");

    const queues = $("overview-queues");
    clear(queues);

    const cards = [
      {
        title: "Verification queue",
        value: data.queue.pendingVerifications,
        body: "ID and selfie submissions waiting for a reviewer.",
        view: "verification",
      },
      {
        title: "Moderation queue",
        value: data.queue.openReports,
        body: "Open reports, most-reported subjects first.",
        view: "moderation",
      },
      {
        title: "Auto-flagged",
        value: data.queue.autoFlagged,
        body: "Reports raised by the keyword list or repeated reports.",
        view: "moderation",
      },
      {
        title: "Suspended or banned",
        value: data.totals.suspended + data.totals.banned,
        body: "Accounts currently restricted.",
        view: "members",
      },
    ];

    for (const card of cards) {
      const node = el("div", "queue-card");
      node.appendChild(el("span", "cell-sub", card.title));
      node.appendChild(el("span", "value", card.value));
      node.appendChild(el("span", "tiny muted", card.body));
      const button = el("button", "btn small", "Open");
      button.addEventListener("click", () => setView(card.view));
      node.appendChild(button);
      queues.appendChild(node);
    }
  }

  /* --------------------------- verification queue ----------------------- */

  async function loadVerifications() {
    const status = $("verification-status").value;
    const data = await api(`/verifications?status=${encodeURIComponent(status)}`);
    state.verifications = data.submissions || [];
    renderVerifications();
  }

  function renderVerifications() {
    const search = $("verification-search").value.trim().toLowerCase();
    const rows = state.verifications.filter((row) => {
      if (!search) return true;
      return [row.memberName, row.submittedName, row.memberArea]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });

    const body = $("verification-table").querySelector("tbody");
    clear(body);
    $("verification-empty").hidden = rows.length > 0;
    $("verification-count").textContent = `${rows.length} submission${rows.length === 1 ? "" : "s"}`;

    for (const row of rows) {
      const tr = el("tr");
      if (row.riskScore >= 70) tr.className = "flagged";

      const memberCell = el("td");
      memberCell.appendChild(el("div", "cell-strong", row.memberName));
      memberCell.appendChild(
        el("div", "cell-sub", `@${row.memberHandle || "unknown"} · ${row.memberArea || "no area"}`),
      );
      tr.appendChild(memberCell);

      tr.appendChild(el("td", null, row.submittedName));
      tr.appendChild(el("td", null, row.submittedDob));

      const riskCell = el("td");
      const risk = el("span", "risk", row.riskScore);
      risk.style.color = row.riskScore >= 70 ? "#fca5a5" : row.riskScore >= 40 ? "#fcd34d" : "#86efac";
      riskCell.appendChild(risk);
      tr.appendChild(riskCell);

      const evidence = el("td");
      evidence.appendChild(el("div", "cell-sub", `selfie: ${row.selfieRef || "missing"}`));
      evidence.appendChild(el("div", "cell-sub", `ID: ${row.idDocumentRef || "missing"}`));
      tr.appendChild(evidence);

      tr.appendChild(el("td", null, relative(row.submittedAt)));

      const statusCell = el("td");
      statusCell.appendChild(statusTag(row.status));
      if (row.rejectionReason) {
        statusCell.appendChild(el("div", "cell-sub", row.rejectionReason));
      }
      tr.appendChild(statusCell);

      const actions = el("td");
      const wrap = el("div", "row-actions");
      if (row.status === "pending") {
        const approve = el("button", "btn small ok", "Approve");
        approve.addEventListener("click", () =>
          decideVerification(row, "approved", "Approve this submission?"),
        );
        const reject = el("button", "btn small danger", "Reject");
        reject.addEventListener("click", () =>
          decideVerification(row, "rejected", "Reject this submission?"),
        );
        wrap.appendChild(approve);
        wrap.appendChild(reject);
      } else {
        wrap.appendChild(el("span", "cell-sub", `by ${row.reviewedBy || "—"}`));
      }
      actions.appendChild(wrap);
      tr.appendChild(actions);

      body.appendChild(tr);
    }
  }

  async function decideVerification(row, decision, title) {
    const isReject = decision === "rejected";
    const result = await askDialog({
      title,
      message: isReject
        ? `The member is told why their verification was rejected. Rejection reason for ${row.memberName}:`
        : `Approve ${row.memberName}'s ID and selfie check and grant the verified badge?`,
      note: isReject,
      noteLabel: "Rejection reason (sent to the member)",
      noteRequired: isReject,
      confirmLabel: isReject ? "Reject submission" : "Approve",
      danger: isReject,
    });
    if (!result) return;

    if (isReject && result.note.length < 8) {
      toast("A rejection reason of at least 8 characters is required.", "error");
      return;
    }

    try {
      await api(`/verifications/${row.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: result.note }),
      });
      toast(
        decision === "approved"
          ? `${row.memberName} is now verified.`
          : `${row.memberName}'s submission was rejected.`,
        "ok",
      );
      await loadVerifications();
      await refreshCounts();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  /* ------------------------------ moderation ---------------------------- */

  async function loadReports() {
    const status = $("reports-status").value;
    const data = await api(`/reports?status=${encodeURIComponent(status)}`);
    state.reports = data.reports || [];

    const body = $("reports-table").querySelector("tbody");
    clear(body);
    $("reports-empty").hidden = state.reports.length > 0;
    $("reports-count").textContent = `${state.reports.length} report${state.reports.length === 1 ? "" : "s"}`;

    for (const row of state.reports) {
      const tr = el("tr");
      if (row.autoFlagged) tr.className = "flagged";

      const subject = el("td");
      subject.appendChild(el("div", "cell-strong", row.subjectLabel));
      subject.appendChild(el("div", "cell-sub", `reported by ${row.reporterName}`));
      tr.appendChild(subject);

      tr.appendChild(el("td", null, row.subjectType));

      const reason = el("td");
      reason.appendChild(el("div", null, row.reason));
      if (row.autoFlagged) reason.appendChild(el("span", "tag danger", "auto-flagged"));
      tr.appendChild(reason);

      const excerpt = el("td");
      excerpt.appendChild(el("div", "excerpt", row.contentExcerpt || "No content captured."));
      tr.appendChild(excerpt);

      const countCell = el("td");
      countCell.appendChild(el("span", "cell-strong", row.reportCount));
      tr.appendChild(countCell);

      const severityCell = el("td");
      severityCell.appendChild(statusTag(row.severity));
      tr.appendChild(severityCell);

      const statusCell = el("td");
      statusCell.appendChild(statusTag(row.status));
      if (row.resolutionNote) statusCell.appendChild(el("div", "cell-sub", row.resolutionNote));
      tr.appendChild(statusCell);

      const actions = el("td");
      const wrap = el("div", "row-actions");
      if (row.status === "open") {
        for (const action of [
          { key: "warned", label: "Warn", cls: "small" },
          { key: "suspended", label: "Suspend", cls: "small" },
          { key: "banned", label: "Ban", cls: "small danger" },
          { key: "dismissed", label: "Dismiss", cls: "small ghost" },
        ]) {
          const button = el("button", `btn ${action.cls}`, action.label);
          button.addEventListener("click", () => resolveReport(row, action.key));
          wrap.appendChild(button);
        }
      } else {
        wrap.appendChild(el("span", "cell-sub", `by ${row.resolvedBy || "—"}`));
      }
      actions.appendChild(wrap);
      tr.appendChild(actions);

      body.appendChild(tr);
    }
  }

  async function resolveReport(row, action) {
    const labels = {
      warned: "Warn the account",
      suspended: "Suspend the account",
      banned: "Ban the account",
      dismissed: "Dismiss this report",
    };
    const needsNote = action === "suspended" || action === "banned";

    const result = await askDialog({
      title: labels[action],
      message: `${row.subjectLabel} — ${row.reason}. ${row.reportCount} report(s) on this subject.`,
      note: action !== "dismissed" || true,
      noteLabel: needsNote ? "Reason (required, recorded in the audit log)" : "Note (optional)",
      noteRequired: needsNote,
      confirmLabel: labels[action],
      danger: action === "banned" || action === "suspended",
    });
    if (!result) return;

    if (needsNote && result.note.length < 8) {
      toast("Add a short note explaining the suspension or ban.", "error");
      return;
    }

    try {
      await api(`/reports/${row.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action, note: result.note }),
      });
      toast(`${labels[action]} recorded.`, "ok");
      await loadReports();
      await refreshCounts();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  /* ---------------------------- user management ------------------------- */

  async function loadMembers() {
    const { search, status, tier } = state.memberFilters;
    const query = new URLSearchParams({
      search,
      status,
      tier,
      page: String(state.members.page),
      pageSize: String(state.members.pageSize),
    });
    const data = await api(`/members?${query.toString()}`);
    state.members = data;

    const body = $("members-table").querySelector("tbody");
    clear(body);
    $("members-empty").hidden = data.rows.length > 0;

    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    $("members-page").textContent = `Page ${data.page} of ${pages} · ${data.total} member${data.total === 1 ? "" : "s"}`;
    $("members-prev").disabled = data.page <= 1;
    $("members-next").disabled = data.page >= pages;

    for (const row of data.rows) {
      const tr = el("tr");

      const name = el("td");
      name.appendChild(el("div", "cell-strong", row.name));
      name.appendChild(el("div", "cell-sub", `@${row.handle}`));
      tr.appendChild(name);

      tr.appendChild(el("td", null, row.age ?? "—"));
      tr.appendChild(el("td", null, row.homeArea || "—"));

      const verified = el("td");
      verified.appendChild(statusTag(row.verificationTier));
      tr.appendChild(verified);

      const status = el("td");
      status.appendChild(statusTag(row.accountStatus));
      tr.appendChild(status);

      const tier = el("td");
      tier.appendChild(statusTag(row.subscriptionTier));
      tr.appendChild(tier);

      const reports = el("td");
      reports.appendChild(el("span", "cell-strong", row.reportCount));
      tr.appendChild(reports);

      tr.appendChild(el("td", null, formatDateTime(row.joinedAt)));

      const actions = el("td");
      const wrap = el("div", "row-actions");
      const menu = [
        { key: "force-verify", label: "Force verify", cls: "small" },
        { key: "warn", label: "Warn", cls: "small" },
        { key: "suspend", label: "Suspend", cls: "small" },
        { key: "ban", label: "Ban", cls: "small danger" },
        { key: "reinstate", label: "Reinstate", cls: "small ghost" },
        { key: "reset-password", label: "Reset password", cls: "small ghost" },
      ];
      for (const item of menu) {
        const button = el("button", `btn ${item.cls}`, item.label);
        button.addEventListener("click", () => memberAction(row, item.key, item.label));
        wrap.appendChild(button);
      }
      actions.appendChild(wrap);
      tr.appendChild(actions);

      body.appendChild(tr);
    }
  }

  async function memberAction(row, action, label) {
    const needsNote = action === "suspend" || action === "ban";
    const result = await askDialog({
      title: `${label} — ${row.name}`,
      message:
        action === "reset-password"
          ? "A one-time reset link would be emailed to the member. Record the reason for the audit log."
          : action === "force-verify"
            ? "Manually grant the verified badge without a new submission. Use for support cases only."
            : `Apply "${label}" to @${row.handle}?`,
      note: true,
      noteLabel: needsNote ? "Reason (required)" : "Note (optional)",
      noteRequired: needsNote,
      confirmLabel: label,
      danger: action === "ban" || action === "suspend",
    });
    if (!result) return;
    if (needsNote && result.note.length < 8) {
      toast("Add a short note explaining this action.", "error");
      return;
    }

    try {
      await api(`/members/${row.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action, note: result.note }),
      });
      toast(`${label} applied to ${row.name}.`, "ok");
      await loadMembers();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  $("members-apply").addEventListener("click", () => {
    state.memberFilters = {
      search: $("members-search").value,
      status: $("members-status").value,
      tier: $("members-tier").value,
    };
    state.members.page = 1;
    loadMembers().catch((error) => toast(error.message, "error"));
  });

  $("members-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("members-apply").click();
    }
  });

  $("members-prev").addEventListener("click", () => {
    state.members.page = Math.max(1, state.members.page - 1);
    loadMembers().catch((error) => toast(error.message, "error"));
  });

  $("members-next").addEventListener("click", () => {
    state.members.page += 1;
    loadMembers().catch((error) => toast(error.message, "error"));
  });

  $("verification-status").addEventListener("change", () => {
    loadVerifications().catch((error) => toast(error.message, "error"));
  });

  $("verification-search").addEventListener("input", renderVerifications);

  $("reports-status").addEventListener("change", () => {
    loadReports().catch((error) => toast(error.message, "error"));
  });

  /* ------------------------------- analytics ---------------------------- */

  async function loadAnalytics() {
    const data = await api("/analytics?days=14");
    state.analytics = data;

    const metrics = data.metrics || [];
    const latest = metrics[metrics.length - 1] || {};
    const first = metrics[0] || {};
    const tiles = $("analytics-tiles");
    clear(tiles);

    tiles.appendChild(
      tile("Total users", data.totals.totalUsers, {
        text: `${data.totals.verified} verified · ${data.totals.unverified} unverified`,
      }),
    );
    tiles.appendChild(
      tile("Daily active users", latest.activeUsers || 0, {
        text: `${latest.activeUsers - first.activeUsers >= 0 ? "+" : ""}${latest.activeUsers - first.activeUsers} over 14 days`,
        kind: latest.activeUsers - first.activeUsers >= 0 ? "up" : "down",
      }),
    );
    tiles.appendChild(
      tile("Signups this week", metrics.slice(-7).reduce((sum, row) => sum + Number(row.newSignups || 0), 0), {
        text: `${metrics.slice(-14, -7).reduce((sum, row) => sum + Number(row.newSignups || 0), 0)} the week before`,
      }),
    );
    tiles.appendChild(
      tile("Verified share", `${Math.round((data.totals.verified / Math.max(1, data.totals.totalUsers)) * 100)}%`, {
        text: "of all members",
      }),
    );
    tiles.appendChild(
      tile("Free vs paid", `${data.totals.free} / ${data.totals.premium}`, {
        text: `${Math.round((data.totals.premium / Math.max(1, data.totals.totalUsers)) * 100)}% on paid`,
      }),
    );
    tiles.appendChild(
      tile("Active groups", latest.activeGroups || 0, {
        text: `${latest.callsMade || 0} calls today`,
      }),
    );
    tiles.appendChild(
      tile("Avg matches per user", (Number(latest.matchesMade || 0) / Math.max(1, Number(latest.activeUsers || 1))).toFixed(2), {
        text: "accepted friendships per active member",
      }),
    );
    tiles.appendChild(
      tile("Avg reports per user", data.totals.avgReportsPerUser, {
        text: `${data.totals.suspended} suspended · ${data.totals.banned} banned`,
      }),
    );

    renderSplit($("chart-verified"), metrics, "verifiedUsers", "unverifiedUsers", "Verified", "Unverified");
    renderSplit($("chart-tier"), metrics, "paidUsers", "freeUsers", "Paid", "Free");
    renderBars($("chart-calls"), metrics, "callsMade");
    renderBars($("chart-groups"), metrics, "activeGroups");
  }

  /* -------------------------------- safety ------------------------------ */

  async function loadSafety() {
    const data = await api("/safety");
    state.safety = data;

    const flags = $("flags-list");
    clear(flags);
    for (const flag of data.flags) {
      const row = el("div", "flag-row");
      const meta = el("div", "meta");
      meta.appendChild(el("strong", null, flag.label));
      meta.appendChild(el("span", "cell-sub", flag.description || ""));
      meta.appendChild(
        el("span", "cell-sub", flag.updatedBy ? `last changed by ${flag.updatedBy}` : "never changed"),
      );
      row.appendChild(meta);

      const toggle = el("div", `switch${flag.enabled ? " on" : ""}${flag.flagKey === "maintenance_mode" ? " danger" : ""}`);
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-checked", String(flag.enabled));
      toggle.setAttribute("aria-label", `${flag.label} feature flag`);
      toggle.addEventListener("click", async () => {
        const next = !toggle.classList.contains("on");
        const confirmed = await askDialog({
          title: `${next ? "Enable" : "Disable"} ${flag.label}?`,
          message: next
            ? "Members regain access to this feature immediately."
            : "Members lose access to this feature immediately. Use for incident response.",
          confirmLabel: next ? "Enable" : "Disable",
          danger: !next,
        });
        if (!confirmed) return;
        try {
          await api(`/safety/flags/${encodeURIComponent(flag.flagKey)}`, {
            method: "POST",
            body: JSON.stringify({ enabled: next }),
          });
          toast(`${flag.label} ${next ? "enabled" : "disabled"}.`, "ok");
          await loadSafety();
        } catch (error) {
          toast(error.message, "error");
        }
      });
      row.appendChild(toggle);
      flags.appendChild(row);
    }

    const keywordBody = $("keyword-table").querySelector("tbody");
    clear(keywordBody);
    for (const keyword of data.keywords) {
      const tr = el("tr");
      tr.appendChild(el("td", "cell-strong", keyword.keyword));
      const sev = el("td");
      sev.appendChild(statusTag(keyword.severity));
      tr.appendChild(sev);
      tr.appendChild(el("td", null, keyword.hits));
      tr.appendChild(el("td", "cell-sub", keyword.addedBy || "—"));

      const remove = el("td", "right");
      const button = el("button", "btn small danger", "Remove");
      button.addEventListener("click", async () => {
        const confirmed = await askDialog({
          title: `Remove "${keyword.keyword}"?`,
          message: "Content matching this keyword will no longer be auto-flagged.",
          confirmLabel: "Remove",
          danger: true,
        });
        if (!confirmed) return;
        try {
          await api(`/safety/keywords/${keyword.id}`, { method: "DELETE" });
          toast("Keyword removed.", "ok");
          await loadSafety();
        } catch (error) {
          toast(error.message, "error");
        }
      });
      remove.appendChild(button);
      tr.appendChild(remove);
      keywordBody.appendChild(tr);
    }

    const feed = $("broadcast-list");
    clear(feed);
    if (!data.broadcasts.length) {
      feed.appendChild(el("li", "cell-sub", "No announcements sent yet."));
    }
    for (const broadcast of data.broadcasts) {
      const item = el("li");
      const head = el("div", "feed-head");
      head.appendChild(el("strong", null, broadcast.title));
      head.appendChild(el("span", "cell-sub", relative(broadcast.createdAt)));
      item.appendChild(head);
      item.appendChild(el("p", null, broadcast.body));
      item.appendChild(
        el("span", "cell-sub", `segment: ${broadcast.segment} · ${broadcast.recipientCount} recipients`),
      );
      feed.appendChild(item);
    }
  }

  $("broadcast-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("broadcast-title").value.trim();
    const body = $("broadcast-body").value.trim();
    const segment = $("broadcast-segment").value;

    const confirmed = await askDialog({
      title: "Send this announcement?",
      message: `"${title}" goes to the ${segment} segment. This cannot be recalled.`,
      confirmLabel: "Send announcement",
    });
    if (!confirmed) return;

    try {
      const result = await api("/safety/broadcast", {
        method: "POST",
        body: JSON.stringify({ title, body, segment }),
      });
      toast(`Announcement queued for ${result.recipientCount} members.`, "ok");
      $("broadcast-form").reset();
      await loadSafety();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("keyword-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/safety/keywords", {
        method: "POST",
        body: JSON.stringify({
          keyword: $("keyword-input").value,
          severity: $("keyword-severity").value,
        }),
      });
      toast("Keyword added to the auto-flag list.", "ok");
      $("keyword-input").value = "";
      await loadSafety();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  /* ----------------------------- subscriptions -------------------------- */

  async function loadSubscriptions() {
    const kind = $("events-kind").value;
    const data = await api(`/subscriptions?kind=${encodeURIComponent(kind)}`);
    state.subscriptions = data;

    const body = $("paid-table").querySelector("tbody");
    clear(body);
    $("paid-empty").hidden = data.paidMembers.length > 0;
    $("paid-count").textContent = `${data.paidMembers.length} on the paid tier`;

    for (const member of data.paidMembers) {
      const tr = el("tr");
      const name = el("td");
      name.appendChild(el("div", "cell-strong", member.name));
      name.appendChild(el("div", "cell-sub", `@${member.handle}`));
      tr.appendChild(name);

      const status = el("td");
      status.appendChild(statusTag(member.accountStatus));
      tr.appendChild(status);

      tr.appendChild(el("td", null, formatDateTime(member.joinedAt)));

      const actions = el("td");
      const wrap = el("div", "row-actions");
      const revoke = el("button", "btn small danger", "Revoke");
      revoke.addEventListener("click", () => subscriptionChange(member, "revoke"));
      const refund = el("button", "btn small", "Refund");
      refund.addEventListener("click", () => subscriptionChange(member, "refund"));
      wrap.appendChild(revoke);
      wrap.appendChild(refund);
      actions.appendChild(wrap);
      tr.appendChild(actions);

      body.appendChild(tr);
    }

    const select = $("subscription-member");
    clear(select);
    const all = await api("/members?pageSize=100");
    for (const member of all.rows) {
      const option = el("option", null, `${member.name} (@${member.handle}) · ${member.subscriptionTier}`);
      option.value = String(member.id);
      select.appendChild(option);
    }

    const eventsBody = $("events-table").querySelector("tbody");
    clear(eventsBody);
    for (const event of data.events) {
      const tr = el("tr");
      tr.appendChild(el("td", null, formatDateTime(event.createdAt)));
      tr.appendChild(el("td", "cell-strong", event.memberName));
      const kindCell = el("td");
      kindCell.appendChild(statusTag(event.kind === "refund" ? "warned" : event.kind === "grant" ? "approved" : "banned"));
      kindCell.lastChild.textContent = event.kind;
      tr.appendChild(kindCell);
      tr.appendChild(el("td", null, event.kind === "refund" ? money(event.amountCents) : "—"));
      tr.appendChild(el("td", "cell-sub", event.reason || "—"));
      tr.appendChild(el("td", "cell-sub", event.actorEmail));
      eventsBody.appendChild(tr);
    }

    /*
     * Store readiness. The wording here matters as much as the data: this panel
     * must never read as "the products exist". It reports what this server can
     * verify, and lists everything a person still has to do in each console.
     */
    const readiness = data.readiness || { channels: [], catalogue: [] };
    $("readiness-mode").textContent =
      `Verification: ${data.verificationMode === "store" ? "live store APIs" : "sandbox"}` +
      (data.sandboxAllowed ? " · sandbox fallback allowed here" : " · sandbox fallback refused");

    const channels = $("readiness-channels");
    clear(channels);
    for (const channel of readiness.channels || []) {
      const card = el("div", "panel");
      const head = el("div", "panel-head");
      head.appendChild(el("h4", null, channel.label));
      const tag = statusTag(channel.state === "ready" ? "approved" : channel.state === "partial" ? "warned" : "suspended");
      tag.textContent =
        channel.state === "ready" ? "credentials ready" : channel.state === "partial" ? "incomplete" : "not configured";
      head.appendChild(tag);
      card.appendChild(head);

      card.appendChild(el("p", "tiny muted", channel.detail));

      const envList = el("ul", "feed");
      for (const name of channel.requiredEnv) {
        const present = channel.presentEnv.includes(name);
        envList.appendChild(el("li", "tiny", `${present ? "✓" : "✗"} ${name}`));
      }
      card.appendChild(el("p", "tiny muted", "Server configuration:"));
      card.appendChild(envList);

      /*
       * Values that are present but unusable. This is the difference between
       * "set" and "works": a truncated .p8 or a pasted file path passes a
       * presence check and fails the first real purchase, so it is called out
       * here rather than being discovered by a member who has already paid.
       */
      if ((channel.problems || []).length > 0) {
        card.appendChild(el("p", "tiny muted", "Present but unusable:"));
        const problemList = el("ul", "feed");
        for (const problem of channel.problems) {
          problemList.appendChild(el("li", "tiny", `${problem.variable} ${problem.problem}`));
        }
        card.appendChild(problemList);
      }

      card.appendChild(el("p", "tiny muted", "Manual console work still required:"));
      const steps = el("ol", "feed");
      for (const step of channel.manualSteps) steps.appendChild(el("li", "tiny", step));
      card.appendChild(steps);
      channels.appendChild(card);
    }

    /*
     * Sign-in code delivery. The wording rule from the store panel applies here
     * too: this reports what is configured, never that a message has been sent,
     * and it never renders a key. The limits are shown because an operator
     * reading "a member cannot get a code" needs to see whether the answer is a
     * provider problem or a rate limit doing its job.
     */
    const otp = data.otpDelivery || {};
    const email = otp.email || {};
    const sms = otp.sms || {};
    $("otp-mode").textContent = otp.demoCodeAllowed
      ? "Prototype mode: codes may be shown on screen instead of sent"
      : "Live mode: codes are never revealed to the client";

    const otpChannels = $("otp-channels");
    clear(otpChannels);
    const describeChannel = (label, configured, detail) => {
      const card = el("div", "panel");
      const head = el("div", "panel-head");
      head.appendChild(el("h4", null, label));
      const tag = statusTag(configured ? "approved" : "suspended");
      tag.textContent = configured ? "configured" : "not configured";
      head.appendChild(tag);
      card.appendChild(head);
      card.appendChild(el("p", "tiny muted", detail));
      return card;
    };

    otpChannels.appendChild(
      describeChannel(
        "Email",
        email.configured,
        email.configured
          ? `Provider: ${email.provider}${email.sendDomain ? ` · sending domain ${email.sendDomain}` : ""}`
          : "Set EMAIL_PROVIDER_KEY and EMAIL_FROM to send real codes. Email needs no registration and no paperwork.",
      ),
    );
    otpChannels.appendChild(
      describeChannel(
        "SMS",
        sms.configured,
        sms.configured
          ? `Provider: ${sms.provider}${sms.senderId ? ` · sender id ${sms.senderId}` : ""}${sms.dltTemplate ? " · DLT template set" : " · no DLT template id"}`
          : "Set SMS_PROVIDER_KEY plus a sender and, for an Indian domestic route, an approved DLT template id. The international route works without DLT but arrives from a random short code.",
      ),
    );

    $("otp-limits").textContent =
      "Sending is rate limited: 3 codes per number per hour and 6 per day, 10 per device per hour, " +
      "with a 60 second cooldown between requests. Ten wrong codes lock that device for 15 minutes. " +
      "A refused request sends nothing, so it costs nothing.";

    const catalogueBody = $("catalogue-table").querySelector("tbody");
    clear(catalogueBody);
    for (const product of readiness.catalogue || []) {
      const tr = el("tr");
      tr.appendChild(el("td", "cell-strong", product.planLabel));
      tr.appendChild(el("td", null, product.productId));
      tr.appendChild(el("td", "cell-sub", product.storeName));
      tr.appendChild(el("td", null, `₹${product.priceInr}`));
      tr.appendChild(el("td", "cell-sub", product.billingPeriod));
      catalogueBody.appendChild(tr);
    }

    /*
     * Complimentary Premium. The distinction that matters here is live-vs-ended:
     * a comp is the only receipt in the system that ends on a date nobody paid
     * for, so an admin scanning this list needs to see which ones are still
     * granting access.
     */
    const comps = data.comps || [];
    const compsBody = $("comps-table").querySelector("tbody");
    clear(compsBody);
    $("comps-empty").hidden = comps.length > 0;
    for (const comp of comps) {
      const tr = el("tr");
      const name = el("td");
      name.appendChild(el("div", "cell-strong", comp.memberName || `Member #${comp.memberId}`));
      name.appendChild(el("div", "cell-sub", `#${comp.memberId}`));
      tr.appendChild(name);
      tr.appendChild(el("td", null, comp.planId));
      const statusCell = el("td");
      const live = comp.status === "active" && new Date(comp.expiresAt).getTime() > Date.now();
      const tag = statusTag(live ? "approved" : "suspended");
      tag.textContent = live ? "active" : comp.status === "revoked" ? "ended early" : "expired";
      statusCell.appendChild(tag);
      tr.appendChild(statusCell);
      tr.appendChild(el("td", null, formatDateTime(comp.expiresAt)));
      tr.appendChild(el("td", "cell-sub", comp.grantedBy || "—"));
      tr.appendChild(el("td", "cell-sub", comp.grantedReason || "—"));
      compsBody.appendChild(tr);
    }
    const reminders = data.reminders || [];
    const remindersBody = $("reminders-table").querySelector("tbody");
    clear(remindersBody);
    $("reminders-empty").hidden = reminders.length > 0;
    for (const reminder of reminders) {
      const tr = el("tr");
      tr.appendChild(el("td", null, formatDateTime(reminder.deliveredAt)));
      tr.appendChild(el("td", "cell-strong", reminder.memberName || `Member #${reminder.memberId}`));
      const windowCell = el("td");
      windowCell.appendChild(
        el("span", "pill", reminder.reminderKind === "expired" ? "expired" : `${reminder.reminderKind} left`),
      );
      tr.appendChild(windowCell);
      tr.appendChild(el("td", "cell-sub", formatDateTime(reminder.periodEndsAt)));
      remindersBody.appendChild(tr);
    }
  }

  async function subscriptionChange(member, kind) {
    const result = await askDialog({
      title: kind === "revoke" ? `Revoke paid access — ${member.name}` : `Log a refund — ${member.name}`,
      message:
        kind === "revoke"
          ? "The member returns to the free tier immediately. Record the reason."
          : "Record a refund against this member. The amount is taken from the form below.",
      note: true,
      noteLabel: "Reason (required)",
      noteRequired: true,
      confirmLabel: kind === "revoke" ? "Revoke access" : "Log refund",
      danger: kind === "revoke",
    });
    if (!result) return;
    if (result.note.length < 8) {
      toast("Add a short reason so the change is auditable.", "error");
      return;
    }

    const amountCents = kind === "refund" ? Number($("subscription-amount").value || 0) : 0;
    if (kind === "refund" && amountCents <= 0) {
      toast("Enter the refund amount in cents.", "error");
      return;
    }

    try {
      await api("/subscriptions/change", {
        method: "POST",
        body: JSON.stringify({ memberId: member.id, kind, reason: result.note, amountCents }),
      });
      toast(kind === "revoke" ? "Paid access revoked." : "Refund logged.", "ok");
      await loadSubscriptions();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  $("subscription-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const memberId = Number($("subscription-member").value);
    const kind = $("subscription-kind").value;
    const reason = $("subscription-reason").value.trim();
    const amountCents = Number($("subscription-amount").value || 0);
    const planId = $("subscription-plan").value;
    const days = Number($("subscription-days").value || 0);

    if (reason.length < 8) {
      toast("Add a short reason so the change is auditable.", "error");
      return;
    }
    if (kind === "refund" && amountCents <= 0) {
      toast("Enter the refund amount in cents.", "error");
      return;
    }
    /*
     * The days are validated here rather than left to the server clamp, because a
     * silently clamped value is worse than a rejected one: the admin would believe
     * they granted a year while the member gets thirty days.
     */
    if (kind === "comp" && (!Number.isFinite(days) || days < 1 || days > 365)) {
      toast("Enter between 1 and 365 days of Premium.", "error");
      return;
    }

    try {
      await api("/subscriptions/change", {
        method: "POST",
        body: JSON.stringify({ memberId, kind, reason, amountCents, planId, days }),
      });
      toast(
        kind === "comp"
          ? `Complimentary ${planId} Premium granted for ${days} days.`
          : kind === "comp-revoke"
            ? "Complimentary Premium ended."
            : "Subscription change applied.",
        "ok",
      );
      $("subscription-reason").value = "";
      await loadSubscriptions();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  /*
   * Show the fields that matter for the action chosen.
   *
   * All three field groups exist in the markup, so without this the form asks for
   * a refund amount while granting a comp, and an admin fills in whatever happens
   * to be on screen. Hiding the irrelevant ones keeps the form honest about what
   * it will actually do.
   */
  $("subscription-kind").addEventListener("change", () => {
    const kind = $("subscription-kind").value;
    $("subscription-comp-fields").hidden = kind !== "comp";
    $("subscription-amount").closest("label").hidden = kind !== "refund";
  });

  $("events-kind").addEventListener("change", () => {
    loadSubscriptions().catch((error) => toast(error.message, "error"));
  });

  /* -------------------------------- audit ------------------------------- */

  async function loadAudit() {
    const data = await api("/audit");
    const body = $("audit-table").querySelector("tbody");
    clear(body);

    for (const action of data.actions) {
      const tr = el("tr");
      tr.appendChild(el("td", null, formatDateTime(action.createdAt)));
      tr.appendChild(el("td", "cell-sub", action.actorEmail));
      tr.appendChild(el("td", null, action.module));
      const actionCell = el("td");
      actionCell.appendChild(el("span", "tag info", action.action));
      tr.appendChild(actionCell);
      const target = el("td");
      target.appendChild(el("div", null, action.targetLabel));
      target.appendChild(el("div", "cell-sub", `${action.targetType} #${action.targetId}`));
      tr.appendChild(target);
      tr.appendChild(el("td", "cell-sub", action.note || "—"));
      body.appendChild(tr);
    }

    if (!data.actions.length) {
      body.appendChild(el("tr", null, ""));
      body.lastChild.appendChild(el("td", "cell-sub", "No dashboard actions recorded yet."));
    }
  }

  async function refreshCounts() {
    try {
      const data = await api("/overview");
      $("nav-count-verification").textContent = data.queue.pendingVerifications;
      $("nav-count-moderation").textContent = data.queue.openReports;
    } catch {
      /* counts are cosmetic; ignore failures here */
    }
  }

  /* -------------------------------- boot -------------------------------- */

  (async function boot() {
    try {
      const payload = await api("/session");
      if (payload.admin) {
        showDashboard(payload.admin);
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  })();
})();
