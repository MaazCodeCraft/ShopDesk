"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "dashboard" | "payment" | "domicile" | "history" | "contacts" | "data" | "settings";
type Payment = { id: number; amount: number; receiver: string; note: string; createdAt: string };

type AppSettings = { shopName: string; dailyRate: number; receiverNames: string[]; paymentSms: string; domicileSms: string };
const defaultSettings: AppSettings = {
  shopName: "Photostat & Printing Shop",
  dailyRate: 400,
  receiverNames: ["Shop Owner", "Son 1", "Son 2", "Son 3"],
  paymentSms: "ادائیگی کی تصدیق\n\nالسلام علیکم،\n\nآج بجلی کی مد میں {amount} روپے ادا کر دیے گئے ہیں۔\n\nوصول کنندہ: {receiver}\n\nتاریخ: {date}\n\nوقت: {time}\n\n{note}\n\nشکریہ۔",
  domicileSms: "السلام علیکم،\n\nآپ کا ڈومیسائل تیار ہو چکا ہے۔\n\nبراہِ کرم ہماری دکان پر تشریف لا کر اپنا ڈومیسائل وصول کریں۔\n\nشکریہ۔",
};

function Icon({ children }: { children: string }) { return <span className="icon" aria-hidden="true">{children}</span>; }

function formatDate(value: string, urdu = false) {
  return new Intl.DateTimeFormat(urdu ? "ur-PK" : "en-PK", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}

function validPhone(value: string) { return /^(?:\+92|0092|0)?3\d{9}$/.test(value.replace(/[\s-]/g, "")); }
function smsLink(phone: string, body: string) { return `sms:${phone.replace(/[\s-]/g, "")}?body=${encodeURIComponent(body)}`; }
function fillTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template).replace(/\n{3,}/g, "\n\n").trim();
}
const LOGIN_EMAIL_HASH = "8e805a8d8310fb35206ef83a6681ffff30f36f4d19f8990aa180fb74feb7245b";
const LOGIN_PASSWORD_HASH = "2c1f0b6ab194b4c93d8885461394d461bdb81bb736d1af9412d2f66ce69ccea3";
const LOGIN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

async function hashCredential(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

type ShopData = { version: number; updatedAt: string; payments: Payment[]; contacts: Record<string, string>; settings?: AppSettings };

function handleDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("shopdesk-file-storage", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rememberFolder(handle: unknown) {
  const db = await handleDatabase();
  const transaction = db.transaction("handles", "readwrite");
  transaction.objectStore("handles").put(handle, "dataFolder");
}

async function rememberedFolder() {
  const db = await handleDatabase();
  return new Promise<any>((resolve) => {
    const request = db.transaction("handles").objectStore("handles").get("dataFolder");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function writeDataFile(folder: any, payments: Payment[], contacts: Record<string, string>, settings: AppSettings) {
  const fileHandle = await folder.getFileHandle("shopdesk-data.json", { create: true });
  const writable = await fileHandle.createWritable();
  const data: ShopData = { version: 2, updatedAt: new Date().toISOString(), payments, contacts, settings };
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function readDataFile(folder: any): Promise<ShopData | null> {
  try {
    const fileHandle = await folder.getFileHandle("shopdesk-data.json");
    return JSON.parse(await (await fileHandle.getFile()).text()) as ShopData;
  } catch { return null; }
}

export default function ShopApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiver, setReceiver] = useState("Shop Owner");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [contactPrompt, setContactPrompt] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [domicilePhone, setDomicilePhone] = useState("");
  const [domicileError, setDomicileError] = useState("");
  const [search, setSearch] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const [dataFolder, setDataFolder] = useState<any>(null);
  const [folderStatus, setFolderStatus] = useState("Not connected");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const now = new Date();

  useEffect(() => {
    let loginIsValid = false;
    try {
      const savedLogin = JSON.parse(localStorage.getItem("shopdesk-login") ?? "null") as { expiresAt?: number } | null;
      if (savedLogin?.expiresAt && savedLogin.expiresAt > Date.now()) loginIsValid = true;
      else localStorage.removeItem("shopdesk-login");
    } catch { localStorage.removeItem("shopdesk-login"); }
    setAuthenticated(loginIsValid);
    void (async () => {
      let cachedPayments: Payment[] = [];
      let cachedContacts: Record<string, string> = {};
      try {
      const savedContacts = localStorage.getItem("receiverContacts");
      const savedPayments = localStorage.getItem("shopdeskPayments");
      const savedSettings = localStorage.getItem("shopdeskSettings");
        if (savedContacts) cachedContacts = JSON.parse(savedContacts);
        if (savedPayments) cachedPayments = JSON.parse(savedPayments);
        if (savedSettings) { const parsed = { ...defaultSettings, ...JSON.parse(savedSettings) }; setSettings(parsed); setReceiver(parsed.receiverNames[0]); }
        setContacts(cachedContacts); setPayments(cachedPayments);
      } catch { /* Ignore damaged browser data and start safely with empty records. */ }
      try {
        const folder = await rememberedFolder();
        if (folder && await folder.queryPermission({ mode: "readwrite" }) === "granted") {
          setDataFolder(folder); setFolderStatus("Connected — automatic file saving is on");
          const saved = await readDataFile(folder);
          if (saved) {
            setPayments(saved.payments); setContacts(saved.contacts);
            if (saved.settings) { const parsed = { ...defaultSettings, ...saved.settings }; setSettings(parsed); setReceiver(parsed.receiverNames[0]); localStorage.setItem("shopdeskSettings", JSON.stringify(saved.settings)); }
            localStorage.setItem("shopdeskPayments", JSON.stringify(saved.payments));
            localStorage.setItem("receiverContacts", JSON.stringify(saved.contacts));
          }
        }
      } catch { /* The local file remains safe even if browser permission needs renewal. */ }
      setLoading(false);
    })();
  }, []);

  async function login(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    const [emailHash, passwordHash] = await Promise.all([
      hashCredential(loginEmail.trim().toLowerCase()),
      hashCredential(loginPassword),
    ]);
    if (emailHash !== LOGIN_EMAIL_HASH || passwordHash !== LOGIN_PASSWORD_HASH) {
      setLoginError("Email or password is incorrect.");
      return;
    }
    localStorage.setItem("shopdesk-login", JSON.stringify({ expiresAt: Date.now() + LOGIN_DURATION_MS }));
    setLoginPassword(""); setAuthenticated(true);
  }

  function logout() {
    localStorage.removeItem("shopdesk-login");
    setAuthenticated(false); setLoginEmail(""); setLoginPassword("");
  }

  const totalToday = payments.filter(p => new Date(p.createdAt).toDateString() === now.toDateString()).reduce((s, p) => s + p.amount, 0);
  const totalMonth = payments.filter(p => { const d = new Date(p.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, p) => s + p.amount, 0);
  const filtered = useMemo(() => payments.filter(p => `${p.receiver} ${p.note} ${p.amount}`.toLowerCase().includes(search.toLowerCase())), [payments, search]);
  const receivers = settings.receiverNames;
  const ownerPhone = contacts.__owner ?? contacts[receivers[0]] ?? "";
  const lastPayment = payments[0];

  function savePayments(next: Payment[]) {
    setPayments(next);
    localStorage.setItem("shopdeskPayments", JSON.stringify(next));
    if (dataFolder) void writeDataFile(dataFolder, next, contacts, settings).catch(() => setFolderStatus("Folder permission required — reconnect it in Settings"));
  }

  function saveContacts(next: Record<string, string>) {
    setContacts(next);
    localStorage.setItem("receiverContacts", JSON.stringify(next));
    if (dataFolder) void writeDataFile(dataFolder, payments, next, settings).catch(() => setFolderStatus("Folder permission required — reconnect it in Settings"));
  }

  function saveSettings(next: AppSettings) {
    const nextContacts = { ...contacts };
    settings.receiverNames.forEach((oldName, index) => {
      const newName = next.receiverNames[index];
      if (oldName !== newName && nextContacts[oldName]) { nextContacts[newName] = nextContacts[oldName]; delete nextContacts[oldName]; }
      if (receiver === oldName && oldName !== newName) setReceiver(newName);
    });
    setSettings(next); setContacts(nextContacts);
    localStorage.setItem("shopdeskSettings", JSON.stringify(next));
    localStorage.setItem("receiverContacts", JSON.stringify(nextContacts));
    if (dataFolder) void writeDataFile(dataFolder, payments, nextContacts, next).catch(() => setFolderStatus("Folder permission required — reconnect it in Settings"));
  }

  function recordAndSend(number: string) {
    const createdAt = new Date().toISOString();
    const payload = { amount: Number(amount), receiver, note: note.trim(), createdAt };
    savePayments([{ id: Date.now(), ...payload }, ...payments]);
    const message = fillTemplate(settings.paymentSms, { amount: Number(amount).toLocaleString("en-PK"), receiver, date: formatDate(createdAt, true), time: formatTime(createdAt), note: note.trim() ? `نوٹ: ${note.trim()}` : "", shop: settings.shopName });
    setContactPrompt(false); setAmount(""); setNote("");
    window.location.href = smsLink(number, message);
  }

  function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    if (ownerPhone) recordAndSend(ownerPhone);
    else { setPhone(""); setPhoneError(""); setContactPrompt(true); }
  }

  function confirmPhone(e: FormEvent) {
    e.preventDefault();
    if (!validPhone(phone)) { setPhoneError("Enter a valid Pakistani mobile number"); return; }
    const next = { __owner: phone };
    saveContacts(next); recordAndSend(phone);
  }

  function sendDomicile(e: FormEvent) {
    e.preventDefault();
    if (!validPhone(domicilePhone)) { setDomicileError("Enter a valid Pakistani mobile number"); return; }
    const message = fillTemplate(settings.domicileSms, { shop: settings.shopName });
    window.location.href = smsLink(domicilePhone, message);
  }

  function downloadBackup() {
    const backup = { version: 2, exportedAt: new Date().toISOString(), payments, contacts, settings };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `shopdesk-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupStatus("Backup downloaded successfully.");
  }

  function restoreBackup(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as { payments?: Payment[]; contacts?: Record<string, string>; settings?: AppSettings };
        if (!Array.isArray(data.payments) || !data.contacts) throw new Error();
        setPayments(data.payments);
        setContacts(data.contacts);
        localStorage.setItem("shopdeskPayments", JSON.stringify(data.payments));
        localStorage.setItem("receiverContacts", JSON.stringify(data.contacts));
        const restoredSettings = data.settings ? { ...defaultSettings, ...data.settings } : settings;
        setSettings(restoredSettings); localStorage.setItem("shopdeskSettings", JSON.stringify(restoredSettings));
        if (dataFolder) void writeDataFile(dataFolder, data.payments, data.contacts, restoredSettings);
        setBackupStatus("Backup restored successfully.");
      } catch { setBackupStatus("That backup file is not valid."); }
    };
    reader.readAsText(file);
  }

  async function connectLocalFolder() {
    const fileWindow = window as unknown as { showDirectoryPicker?: (options?: object) => Promise<any> };
    if (!fileWindow.showDirectoryPicker) { setFolderStatus("Use Microsoft Edge or Google Chrome to save directly to a folder"); return; }
    try {
      const chosen = await fileWindow.showDirectoryPicker({ mode: "readwrite" });
      const folder = await chosen.getDirectoryHandle("ShopDesk Data", { create: true });
      const existing = await readDataFile(folder);
      if (existing?.payments && existing.contacts) {
        setPayments(existing.payments); setContacts(existing.contacts);
        if (existing.settings) { const parsed = { ...defaultSettings, ...existing.settings }; setSettings(parsed); setReceiver(parsed.receiverNames[0]); localStorage.setItem("shopdeskSettings", JSON.stringify(existing.settings)); }
        localStorage.setItem("shopdeskPayments", JSON.stringify(existing.payments));
        localStorage.setItem("receiverContacts", JSON.stringify(existing.contacts));
      } else await writeDataFile(folder, payments, contacts, settings);
      const verified = await readDataFile(folder);
      if (!verified) throw new Error("File verification failed");
      await rememberFolder(folder);
      setDataFolder(folder); setFolderStatus("Saved successfully: ShopDesk Data/shopdesk-data.json");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFolderStatus("Could not access that folder. Please try again.");
    }
  }

  async function saveFileNow() {
    if (!dataFolder) { await connectLocalFolder(); return; }
    try {
      await writeDataFile(dataFolder, payments, contacts, settings);
      const verified = await readDataFile(dataFolder);
      if (!verified) throw new Error("File verification failed");
      setFolderStatus(`Saved to shopdesk-data.json at ${formatTime(new Date().toISOString())}`);
    } catch { setFolderStatus("Could not write the file. Reconnect the folder and allow access."); }
  }

  const nav = [
    ["dashboard", "⌂", "Dashboard"], ["payment", "ϟ", "Electricity Payment"], ["domicile", "▤", "Domicile Notification"],
    ["history", "▧", "Payment History"], ["contacts", "♙", "Contacts"], ["data", "⇩", "Data Management"], ["settings", "⚙", "Settings"]
  ] as const;

  if (authenticated === null) return <main className="auth-loading" aria-label="Checking login"><div className="auth-loading-mark">⌁</div><b>ShopDesk</b><span className="auth-spinner" aria-hidden="true"/></main>;
  if (!authenticated) return <main className="login-page"><section className="login-visual"><div className="login-brand"><span className="brand-mark">⌁</span><span>{settings.shopName}</span></div><div><p className="eyebrow">SHOP MANAGEMENT</p><h1>Simple records.<br/><em>Safer access.</em></h1><p>Electricity payments, customer notifications, and your local shop data—all in one place.</p></div><small>ShopDesk · Local-first management</small></section><section className="login-side"><form className="login-card" onSubmit={login}><span className="login-lock">⌾</span><p className="eyebrow blue">WELCOME BACK</p><h2>Sign in to ShopDesk</h2><p>Enter your account details to continue.</p><label>Email address<input type="email" autoComplete="username" required placeholder="you@example.com" value={loginEmail} onChange={e => { setLoginEmail(e.target.value); setLoginError(""); }}/></label><label>Password<div className="password-input"><input type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Enter your password" value={loginPassword} onChange={e => { setLoginPassword(e.target.value); setLoginError(""); }}/><button type="button" onClick={() => setShowPassword(v => !v)}>{showPassword ? "Hide" : "Show"}</button></div></label>{loginError && <div className="login-error" role="alert">{loginError}</div>}<button className="primary" type="submit">Sign in <span>→</span></button><small className="secure-note">Login stays active for 7 days on this browser. Credentials are never sent online.</small></form></section></main>;

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView("dashboard")}><span className="brand-printer">▤</span><span>{settings.shopName}</span></button>
      <nav>{nav.map(([id, ico, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon>{ico}</Icon>{label}</button>)}</nav>
      <div className="summary"><div className="summary-title"><b>Today&apos;s Summary</b><span>▣</span></div><small>Total Payments</small><strong>Rs. {totalToday.toLocaleString()}</strong><hr/><small>Transactions</small><strong>{payments.filter(p => new Date(p.createdAt).toDateString() === now.toDateString()).length}</strong><hr/><small>Last Payment</small><strong>{lastPayment ? `Rs. ${lastPayment.amount.toLocaleString()} to ${lastPayment.receiver}` : "No payments yet"}</strong>{lastPayment && <small>{formatDate(lastPayment.createdAt)} - {formatTime(lastPayment.createdAt)}</small>}</div>
      <button className="sidebar-logout" onClick={logout}><Icon>⇥</Icon>Logout</button>
    </aside>

    <main>
      <header><button className="menu" aria-label="Menu">☰</button><div className="header-heading"><h1>{nav.find(n => n[0] === view)?.[2]}</h1><p>{view === "dashboard" ? "Welcome! Manage payments and notifications easily." : "Manage your shop records easily."}</p></div><div className="header-meta"><span className="header-item"><i>◷</i>{formatTime(now.toISOString())}</span><span className="header-item"><i>▣</i>{formatDate(now.toISOString())}</span><button className="profile-button" aria-label="Account">♟⌄</button></div></header>

      {view === "dashboard" && <section className="content dashboard reference-dashboard">
        <div className="action-grid">
          <article className="action-card blue-card"><span className="round-action-icon">ϟ</span><div><h3>Electricity Payment</h3><p>Record electricity payments and<br/>send confirmation instantly.</p><button onClick={() => setView("payment")}>＋ &nbsp; New Payment</button></div></article>
          <article className="action-card green-card"><span className="round-action-icon">▤</span><div><h3>Domicile Notification</h3><p>Send domicile ready notifications<br/>to your customers.</p><button onClick={() => setView("domicile")}>＋ &nbsp; Send Notification</button></div></article>
        </div>
        <div className="dashboard-middle">
          <div className="panel recent"><div className="panel-title"><h3>Recent Payments</h3><button onClick={() => setView("history")}>View All</button></div><PaymentTable payments={payments.slice(0, 2)} loading={loading}/><button className="view-payments" onClick={() => setView("history")}>View all payments &nbsp; →</button></div>
          <div className="panel month-overview"><h3>This Month Overview</h3><div><span className="overview-icon green-bg">▣</span><p>Total Payments</p><b className="green-text">Rs. {totalMonth.toLocaleString()}</b></div><div><span className="overview-icon amber-bg">⇄</span><p>Total Transactions</p><b className="orange-text">{payments.length}</b></div><div><span className="overview-icon purple-bg">▣</span><p>Last Payment</p><b className="purple-text">{lastPayment ? `${formatDate(lastPayment.createdAt)} - ${formatTime(lastPayment.createdAt)}` : "—"}</b></div></div>
        </div>
        <div className="dashboard-stats"><article className="blue-stat"><span>ϟ</span><div><small>Total Payments</small><b>Rs. {totalToday.toLocaleString()}</b></div><p>Today&apos;s total payments</p></article><article className="green-stat"><span>▣</span><div><small>This Month</small><b>Rs. {totalMonth.toLocaleString()}</b></div><p>Payments this month</p></article><article className="purple-stat"><span>⇄</span><div><small>Total Transactions</small><b>{payments.length}</b></div><p>All transactions</p></article><article className="orange-stat"><span>♟</span><div><small>Saved Contacts</small><b>{ownerPhone ? 1 : 0}</b></div><p>Saved in contacts</p></article></div>
        <div className="dashboard-tip"><span>ⓘ</span><b>Tip:</b> Record payments daily to keep accurate records and avoid any confusion.</div>
      </section>}

      {view === "payment" && <section className="content narrow"><Back onClick={() => setView("dashboard")}/><div className="form-intro"><span className="hero-icon blue-bg">ϟ</span><p className="eyebrow blue">PAYMENT RECORD</p><h2>Electricity Payment</h2><p>Record who received the money and send instant proof.</p></div><form className="panel form-card" onSubmit={submitPayment}>
        <label>Receiver <i>*</i><select value={receiver} onChange={e => setReceiver(e.target.value)}>{receivers.map(r => <option key={r}>{r}</option>)}</select></label>
        <label>Payment Amount (Rs.) <i>*</i><div className="money-input"><span>Rs.</span><input type="number" min="1" inputMode="numeric" required placeholder={String(settings.dailyRate)} value={amount} onChange={e => setAmount(e.target.value)}/></div></label>
        <label>Note <small>Optional</small><textarea rows={3} placeholder="e.g. Daily electricity payment" value={note} onChange={e => setNote(e.target.value)}/></label>
        <div className="auto-info"><span>▣ &nbsp; {formatDate(now.toISOString())}</span><span>◷ &nbsp; {formatTime(now.toISOString())}</span></div>
        <button className="primary" type="submit">Send Confirmation <span>↗</span></button>
      </form></section>}

      {view === "domicile" && <section className="content narrow"><Back onClick={() => setView("dashboard")}/><div className="form-intro green"><span className="hero-icon green-bg">✓</span><p className="eyebrow">CUSTOMER UPDATE</p><h2>Domicile Notification</h2><p>Let a customer know their certificate is ready.</p></div><form className="panel form-card" onSubmit={sendDomicile}>
        <label>Customer Contact Number <i>*</i><input type="tel" inputMode="tel" placeholder="03XX XXXXXXX" value={domicilePhone} onChange={e => { setDomicilePhone(e.target.value); setDomicileError(""); }}/>{domicileError && <span className="error">{domicileError}</span>}</label>
        <div className="message-preview" dir="rtl" lang="ur"><small>پیغام کا پیش نظارہ</small><p>السلام علیکم، آپ کا <b>ڈومیسائل</b> تیار ہو چکا ہے۔ براہِ کرم ہماری دکان پر تشریف لا کر وصول کریں۔ شکریہ۔</p></div>
        <button className="primary green-button" type="submit">Send Notification <span>↗</span></button>
      </form></section>}

      {view === "history" && <section className="content"><Back onClick={() => setView("dashboard")}/><div className="page-heading"><div><p className="eyebrow blue">PAYMENT RECORDS</p><h2>Payment History</h2><p>Search and review all electricity payments.</p></div><div className="total-pill"><small>Total paid</small><b>Rs. {payments.reduce((s,p) => s + p.amount, 0).toLocaleString()}</b></div></div><div className="panel history-panel"><div className="search"><span>⌕</span><input aria-label="Search payments" placeholder="Search by receiver, note or amount..." value={search} onChange={e => setSearch(e.target.value)}/></div><PaymentTable payments={filtered} loading={loading}/></div></section>}

      {view === "contacts" && <section className="content narrow"><Back onClick={() => setView("dashboard")}/><div className="page-heading"><div><p className="eyebrow blue">OWNER NUMBER</p><h2>Receiver Contact</h2><p>All payment confirmations—including payments received by sons—are sent to the owner.</p></div></div><div className="panel contact-list"><label><span><b>{receivers[0]}</b><small>Owner · Primary SMS contact</small></span><input type="tel" placeholder="03XX XXXXXXX" value={ownerPhone} onChange={e => saveContacts({__owner:e.target.value})}/></label></div></section>}

      {view === "data" && <section className="content narrow">
        <Back onClick={() => setView("dashboard")}/>
        <div className="page-heading"><div><p className="eyebrow blue">LOCAL STORAGE</p><h2>Data Management</h2><p>Manage your live data file, backups, and restoration.</p></div></div>
        <div className="panel settings-stack">
          <div className="setting-card folder-card"><span className="hero-icon green-bg">⌂</span><div><h3>Local data folder</h3><p>Open this site directly in <b>Microsoft Edge or Google Chrome</b>, then choose a parent folder. ShopDesk creates <b>ShopDesk Data/shopdesk-data.json</b> and saves every change there.</p><div className="backup-actions"><button className="secondary" onClick={connectLocalFolder}>{dataFolder ? "Change folder" : "Choose local folder"}</button><button className="secondary" onClick={saveFileNow}>Save data file now</button></div><span className={dataFolder ? "backup-status" : "folder-status"}>{folderStatus}</span></div></div>
          <div className="setting-card backup-card"><span className="hero-icon blue-bg">↓</span><div><h3>Portable backup</h3><p>Download a separate backup or restore one on another computer.</p><div className="backup-actions"><button className="secondary" onClick={downloadBackup}>Download backup</button><label className="upload-button">Restore backup<input type="file" accept="application/json,.json" onChange={e => restoreBackup(e.target.files?.[0])}/></label></div>{backupStatus && <span className="backup-status">{backupStatus}</span>}</div></div>
        </div>
      </section>}

      {view === "settings" && <section className="content narrow">
        <Back onClick={() => setView("dashboard")}/>
        <div className="page-heading"><div><p className="eyebrow blue">CUSTOMIZE SHOPDESK</p><h2>Settings</h2><p>Change shop details, receiver names, and message templates.</p></div></div>
        <div className="panel settings-stack">
          <div className="setting-card customization-card"><span className="hero-icon blue-bg">⚙</span><div className="settings-fields">
            <h3>Shop details</h3><div className="settings-grid"><label>Shop name<input value={settings.shopName} onChange={e => saveSettings({...settings, shopName:e.target.value})}/></label><label>Daily electricity rate (Rs.)<input type="number" min="1" value={settings.dailyRate} onChange={e => saveSettings({...settings, dailyRate:Number(e.target.value) || 0})}/></label></div>
            <h3>Receiver names</h3><div className="settings-grid">{settings.receiverNames.map((name,index)=><label key={index}>{index===0?"Owner":"Son "+index}<input value={name} onChange={e=>{const names=[...settings.receiverNames];names[index]=e.target.value;saveSettings({...settings,receiverNames:names})}}/></label>)}</div>
            <h3>Urdu SMS templates</h3><p className="template-help">Payment placeholders: <code>{'{amount}'}</code> <code>{'{receiver}'}</code> <code>{'{date}'}</code> <code>{'{time}'}</code> <code>{'{note}'}</code> <code>{'{shop}'}</code></p>
            <label>Payment confirmation SMS<textarea dir="rtl" lang="ur" rows={9} value={settings.paymentSms} onChange={e=>saveSettings({...settings,paymentSms:e.target.value})}/></label>
            <p className="template-help">Domicile placeholder: <code>{'{shop}'}</code></p><label>Domicile notification SMS<textarea dir="rtl" lang="ur" rows={7} value={settings.domicileSms} onChange={e=>saveSettings({...settings,domicileSms:e.target.value})}/></label>
            <button className="secondary reset-button" onClick={()=>saveSettings(defaultSettings)}>Restore default settings</button>
          </div></div>
        </div>
      </section>}
    </main>

    {contactPrompt && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="contact-title"><form className="modal" onSubmit={confirmPhone}><button type="button" className="close" onClick={() => setContactPrompt(false)}>×</button><span className="hero-icon blue-bg">♙</span><p className="eyebrow blue">ONE-TIME SETUP</p><h2 id="contact-title">Enter owner&apos;s number</h2><p>All payment confirmations will be sent to the owner, even when a son receives the payment.</p><label>Owner Contact Number <i>*</i><input autoFocus type="tel" inputMode="tel" placeholder="03XX XXXXXXX" value={phone} onChange={e => { setPhone(e.target.value); setPhoneError(""); }}/>{phoneError && <span className="error">{phoneError}</span>}</label><button className="primary" type="submit">Save & Continue <span>→</span></button></form></div>}
  </div>;
}

function Back({ onClick }: { onClick: () => void }) { return <button className="back" onClick={onClick}>← <span>Back to dashboard</span></button>; }
function PaymentTable({ payments, loading }: { payments: Payment[]; loading: boolean }) {
  if (loading) return <div className="empty">Loading payment records…</div>;
  if (!payments.length) return <div className="empty"><span>▧</span><b>No payments recorded yet</b><small>Your first payment will appear here.</small></div>;
  return <div className="table-wrap"><table><thead><tr><th>Date & Time</th><th>Receiver</th><th>Amount</th><th>Note</th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td><b>{formatDate(p.createdAt)}</b><small>{formatTime(p.createdAt)}</small></td><td><span className="receiver-dot">{p.receiver.charAt(0)}</span>{p.receiver}</td><td><strong>Rs. {p.amount.toLocaleString()}</strong></td><td>{p.note || <span className="muted">—</span>}</td></tr>)}</tbody></table></div>;
}
