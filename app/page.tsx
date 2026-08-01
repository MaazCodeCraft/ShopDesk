"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "dashboard" | "payment" | "domicile" | "history" | "contacts" | "settings";
type Payment = { id: number; amount: number; receiver: string; note: string; createdAt: string };

const receivers = ["Shop Owner", "Son 1", "Son 2", "Son 3"];
const receiverUrdu: Record<string, string> = { "Shop Owner": "دکان مالک", "Son 1": "بیٹا 1", "Son 2": "بیٹا 2", "Son 3": "بیٹا 3" };

function Icon({ children }: { children: string }) { return <span className="icon" aria-hidden="true">{children}</span>; }

function formatDate(value: string, urdu = false) {
  return new Intl.DateTimeFormat(urdu ? "ur-PK" : "en-PK", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}

function validPhone(value: string) { return /^(?:\+92|0092|0)?3\d{9}$/.test(value.replace(/[\s-]/g, "")); }
function smsLink(phone: string, body: string) { return `sms:${phone.replace(/[\s-]/g, "")}?body=${encodeURIComponent(body)}`; }

type ShopData = { version: number; updatedAt: string; payments: Payment[]; contacts: Record<string, string> };

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

async function writeDataFile(folder: any, payments: Payment[], contacts: Record<string, string>) {
  const fileHandle = await folder.getFileHandle("shopdesk-data.json", { create: true });
  const writable = await fileHandle.createWritable();
  const data: ShopData = { version: 1, updatedAt: new Date().toISOString(), payments, contacts };
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function readDataFile(folder: any): Promise<ShopData | null> {
  try {
    const fileHandle = await folder.getFileHandle("shopdesk-data.json");
    return JSON.parse(await (await fileHandle.getFile()).text()) as ShopData;
  } catch { return null; }
}

export default function Home() {
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
  const now = new Date();

  useEffect(() => {
    void (async () => {
      let cachedPayments: Payment[] = [];
      let cachedContacts: Record<string, string> = {};
      try {
      const savedContacts = localStorage.getItem("receiverContacts");
      const savedPayments = localStorage.getItem("shopdeskPayments");
        if (savedContacts) cachedContacts = JSON.parse(savedContacts);
        if (savedPayments) cachedPayments = JSON.parse(savedPayments);
        setContacts(cachedContacts); setPayments(cachedPayments);
      } catch { /* Ignore damaged browser data and start safely with empty records. */ }
      try {
        const folder = await rememberedFolder();
        if (folder && await folder.queryPermission({ mode: "readwrite" }) === "granted") {
          setDataFolder(folder); setFolderStatus("Connected — automatic file saving is on");
          const saved = await readDataFile(folder);
          if (saved) {
            setPayments(saved.payments); setContacts(saved.contacts);
            localStorage.setItem("shopdeskPayments", JSON.stringify(saved.payments));
            localStorage.setItem("receiverContacts", JSON.stringify(saved.contacts));
          }
        }
      } catch { /* The local file remains safe even if browser permission needs renewal. */ }
      setLoading(false);
    })();
  }, []);

  const totalToday = payments.filter(p => new Date(p.createdAt).toDateString() === now.toDateString()).reduce((s, p) => s + p.amount, 0);
  const totalMonth = payments.filter(p => { const d = new Date(p.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, p) => s + p.amount, 0);
  const filtered = useMemo(() => payments.filter(p => `${p.receiver} ${p.note} ${p.amount}`.toLowerCase().includes(search.toLowerCase())), [payments, search]);

  function savePayments(next: Payment[]) {
    setPayments(next);
    localStorage.setItem("shopdeskPayments", JSON.stringify(next));
    if (dataFolder) void writeDataFile(dataFolder, next, contacts).catch(() => setFolderStatus("Folder permission required — reconnect it in Settings"));
  }

  function saveContacts(next: Record<string, string>) {
    setContacts(next);
    localStorage.setItem("receiverContacts", JSON.stringify(next));
    if (dataFolder) void writeDataFile(dataFolder, payments, next).catch(() => setFolderStatus("Folder permission required — reconnect it in Settings"));
  }

  function recordAndSend(number: string) {
    const createdAt = new Date().toISOString();
    const payload = { amount: Number(amount), receiver, note: note.trim(), createdAt };
    savePayments([{ id: Date.now(), ...payload }, ...payments]);
    const message = `ادائیگی کی تصدیق\n\nالسلام علیکم،\n\nآج بجلی کی مد میں ${Number(amount).toLocaleString("en-PK")} روپے ادا کر دیے گئے ہیں۔\n\nوصول کنندہ: ${receiverUrdu[receiver]}\n\nتاریخ: ${formatDate(createdAt, true)}\n\nوقت: ${formatTime(createdAt)}${note.trim() ? `\n\nنوٹ: ${note.trim()}` : ""}\n\nشکریہ۔`;
    setContactPrompt(false); setAmount(""); setNote("");
    window.location.href = smsLink(number, message);
  }

  function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    if (contacts[receiver]) recordAndSend(contacts[receiver]);
    else { setPhone(""); setPhoneError(""); setContactPrompt(true); }
  }

  function confirmPhone(e: FormEvent) {
    e.preventDefault();
    if (!validPhone(phone)) { setPhoneError("Enter a valid Pakistani mobile number"); return; }
    const next = { ...contacts, [receiver]: phone };
    saveContacts(next); recordAndSend(phone);
  }

  function sendDomicile(e: FormEvent) {
    e.preventDefault();
    if (!validPhone(domicilePhone)) { setDomicileError("Enter a valid Pakistani mobile number"); return; }
    const message = "السلام علیکم،\n\nآپ کا ڈومیسائل تیار ہو چکا ہے۔\n\nبراہِ کرم ہماری دکان پر تشریف لا کر اپنا ڈومیسائل وصول کریں۔\n\nشکریہ۔";
    window.location.href = smsLink(domicilePhone, message);
  }

  function downloadBackup() {
    const backup = { version: 1, exportedAt: new Date().toISOString(), payments, contacts };
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
        const data = JSON.parse(String(reader.result)) as { payments?: Payment[]; contacts?: Record<string, string> };
        if (!Array.isArray(data.payments) || !data.contacts) throw new Error();
        setPayments(data.payments);
        setContacts(data.contacts);
        localStorage.setItem("shopdeskPayments", JSON.stringify(data.payments));
        localStorage.setItem("receiverContacts", JSON.stringify(data.contacts));
        if (dataFolder) void writeDataFile(dataFolder, data.payments, data.contacts);
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
        localStorage.setItem("shopdeskPayments", JSON.stringify(existing.payments));
        localStorage.setItem("receiverContacts", JSON.stringify(existing.contacts));
      } else await writeDataFile(folder, payments, contacts);
      await rememberFolder(folder);
      setDataFolder(folder); setFolderStatus("Connected — automatic file saving is on");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFolderStatus("Could not access that folder. Please try again.");
    }
  }

  const nav = [
    ["dashboard", "⌂", "Dashboard"], ["payment", "ϟ", "Electricity Payment"], ["domicile", "▤", "Domicile Notification"],
    ["history", "▧", "Payment History"], ["contacts", "♙", "Contacts"], ["settings", "⚙", "Settings"]
  ] as const;

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView("dashboard")}><span className="brand-mark">⌁</span><span>Photostat &<br/>Printing Shop</span></button>
      <nav>{nav.map(([id, ico, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon>{ico}</Icon>{label}</button>)}</nav>
      <div className="summary"><span>Today&apos;s Summary</span><b>Rs. {totalToday.toLocaleString()}</b><small>{payments.filter(p => new Date(p.createdAt).toDateString() === now.toDateString()).length} transactions</small></div>
    </aside>

    <main>
      <header><button className="menu" aria-label="Menu">☰</button><div><p className="eyebrow">PHOTOSTAT & PRINTING SHOP</p><h1>{nav.find(n => n[0] === view)?.[2]}</h1></div><div className="clock"><b>{formatTime(now.toISOString())}</b><span>{formatDate(now.toISOString())}</span></div><div className="avatar">●</div></header>

      {view === "dashboard" && <section className="content dashboard">
        <div className="welcome"><div><p className="eyebrow blue">DAILY OPERATIONS</p><h2>Everything you need,<br/><em>right at hand.</em></h2><p>Record electricity payments and notify customers in just a few clicks.</p></div><div className="date-chip"><span>{now.toLocaleDateString("en-PK", { weekday: "long" })}</span><strong>{now.getDate()}</strong><small>{now.toLocaleDateString("en-PK", { month: "long", year: "numeric" })}</small></div></div>
        <div className="action-grid">
          <button className="action-card blue-card" onClick={() => setView("payment")}><Icon>ϟ</Icon><div><h3>Electricity Payment</h3><p>Record a payment and send confirmation</p><span>Start payment →</span></div></button>
          <button className="action-card green-card" onClick={() => setView("domicile")}><Icon>✓</Icon><div><h3>Domicile Notification</h3><p>Tell a customer their document is ready</p><span>Send notification →</span></div></button>
        </div>
        <div className="stats"><article><span className="stat-icon blue-bg">₨</span><div><small>Paid Today</small><b>Rs. {totalToday.toLocaleString()}</b></div></article><article><span className="stat-icon green-bg">▦</span><div><small>This Month</small><b>Rs. {totalMonth.toLocaleString()}</b></div></article><article><span className="stat-icon amber-bg">↗</span><div><small>Total Records</small><b>{payments.length}</b></div></article></div>
        <div className="panel recent"><div className="panel-title"><div><h3>Recent Payments</h3><p>Your latest electricity payment records</p></div><button onClick={() => setView("history")}>View all →</button></div><PaymentTable payments={payments.slice(0, 4)} loading={loading}/></div>
      </section>}

      {view === "payment" && <section className="content narrow"><Back onClick={() => setView("dashboard")}/><div className="form-intro"><span className="hero-icon blue-bg">ϟ</span><p className="eyebrow blue">PAYMENT RECORD</p><h2>Electricity Payment</h2><p>Record who received the money and send instant proof.</p></div><form className="panel form-card" onSubmit={submitPayment}>
        <label>Receiver <i>*</i><select value={receiver} onChange={e => setReceiver(e.target.value)}>{receivers.map(r => <option key={r}>{r}</option>)}</select></label>
        <label>Payment Amount (Rs.) <i>*</i><div className="money-input"><span>Rs.</span><input type="number" min="1" inputMode="numeric" required placeholder="400" value={amount} onChange={e => setAmount(e.target.value)}/></div></label>
        <label>Note <small>Optional</small><textarea rows={3} placeholder="e.g. Daily electricity payment" value={note} onChange={e => setNote(e.target.value)}/></label>
        <div className="auto-info"><span>▣ &nbsp; {formatDate(now.toISOString())}</span><span>◷ &nbsp; {formatTime(now.toISOString())}</span></div>
        <button className="primary" type="submit">Send Confirmation <span>↗</span></button>
      </form></section>}

      {view === "domicile" && <section className="content narrow"><Back onClick={() => setView("dashboard")}/><div className="form-intro green"><span className="hero-icon green-bg">✓</span><p className="eyebrow">CUSTOMER UPDATE</p><h2>Domicile Notification</h2><p>Let a customer know their certificate is ready.</p></div><form className="panel form-card" onSubmit={sendDomicile}>
        <label>Customer Contact Number <i>*</i><input type="tel" inputMode="tel" placeholder="03XX XXXXXXX" value={domicilePhone} onChange={e => { setDomicilePhone(e.target.value); setDomicileError(""); }}/>{domicileError && <span className="error">{domicileError}</span>}</label>
        <div className="message-preview" dir="rtl"><small>پیغام کا پیش نظارہ</small><p>السلام علیکم، آپ کا <b>ڈومیسائل</b> تیار ہو چکا ہے۔ براہِ کرم ہماری دکان پر تشریف لا کر وصول کریں۔ شکریہ۔</p></div>
        <button className="primary green-button" type="submit">Send Notification <span>↗</span></button>
      </form></section>}

      {view === "history" && <section className="content"><Back onClick={() => setView("dashboard")}/><div className="page-heading"><div><p className="eyebrow blue">PAYMENT RECORDS</p><h2>Payment History</h2><p>Search and review all electricity payments.</p></div><div className="total-pill"><small>Total paid</small><b>Rs. {payments.reduce((s,p) => s + p.amount, 0).toLocaleString()}</b></div></div><div className="panel history-panel"><div className="search"><span>⌕</span><input aria-label="Search payments" placeholder="Search by receiver, note or amount..." value={search} onChange={e => setSearch(e.target.value)}/></div><PaymentTable payments={filtered} loading={loading}/></div></section>}

      {view === "contacts" && <section className="content narrow"><Back onClick={() => setView("dashboard")}/><div className="page-heading"><div><p className="eyebrow blue">SAVED NUMBERS</p><h2>Receiver Contacts</h2><p>Numbers are saved on this device for faster payments.</p></div></div><div className="panel contact-list">{receivers.map(r => <label key={r}><span><b>{r}</b><small>{receiverUrdu[r]}</small></span><input type="tel" placeholder="03XX XXXXXXX" value={contacts[r] ?? ""} onChange={e => saveContacts({...contacts,[r]:e.target.value})}/></label>)}</div></section>}

      {view === "settings" && <section className="content narrow"><Back onClick={() => setView("dashboard")}/><div className="page-heading"><div><p className="eyebrow blue">LOCAL DATA</p><h2>Settings & Backup</h2><p>Keep your records in a real folder on your Windows computer.</p></div></div><div className="panel settings-stack"><div className="setting-card folder-card"><span className="hero-icon green-bg">⌂</span><div><h3>Local data folder</h3><p>Choose a folder and ShopDesk will create <b>ShopDesk Data/shopdesk-data.json</b> inside it. Every payment and contact change is saved there automatically.</p><div className="backup-actions"><button className="secondary" onClick={connectLocalFolder}>{dataFolder ? "Change folder" : "Choose local folder"}</button></div><span className={dataFolder ? "backup-status" : "folder-status"}>{folderStatus}</span></div></div><div className="setting-card backup-card"><span className="hero-icon blue-bg">↓</span><div><h3>Portable backup</h3><p>You can also download a separate backup or restore one on another computer.</p><div className="backup-actions"><button className="secondary" onClick={downloadBackup}>Download backup</button><label className="upload-button">Restore backup<input type="file" accept="application/json,.json" onChange={e => restoreBackup(e.target.files?.[0])}/></label></div>{backupStatus && <span className="backup-status">{backupStatus}</span>}</div></div><div className="setting-card"><span className="hero-icon blue-bg">✓</span><div><h3>Urdu SMS templates enabled</h3><p>Messages open in your default SMS handler. On Windows, make sure Phone Link is configured as the app for SMS links.</p></div></div></div></section>}
    </main>

    {contactPrompt && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="contact-title"><form className="modal" onSubmit={confirmPhone}><button type="button" className="close" onClick={() => setContactPrompt(false)}>×</button><span className="hero-icon blue-bg">♙</span><p className="eyebrow blue">ONE-TIME SETUP</p><h2 id="contact-title">Enter contact number</h2><p>Add the number for <b>{receiver}</b>. We&apos;ll save it on this device.</p><label>Contact Number <i>*</i><input autoFocus type="tel" inputMode="tel" placeholder="03XX XXXXXXX" value={phone} onChange={e => { setPhone(e.target.value); setPhoneError(""); }}/>{phoneError && <span className="error">{phoneError}</span>}</label><button className="primary" type="submit">Save & Continue <span>→</span></button></form></div>}
  </div>;
}

function Back({ onClick }: { onClick: () => void }) { return <button className="back" onClick={onClick}>← <span>Back to dashboard</span></button>; }
function PaymentTable({ payments, loading }: { payments: Payment[]; loading: boolean }) {
  if (loading) return <div className="empty">Loading payment records…</div>;
  if (!payments.length) return <div className="empty"><span>▧</span><b>No payments recorded yet</b><small>Your first payment will appear here.</small></div>;
  return <div className="table-wrap"><table><thead><tr><th>Date & Time</th><th>Receiver</th><th>Amount</th><th>Note</th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td><b>{formatDate(p.createdAt)}</b><small>{formatTime(p.createdAt)}</small></td><td><span className="receiver-dot">{p.receiver.charAt(0)}</span>{p.receiver}</td><td><strong>Rs. {p.amount.toLocaleString()}</strong></td><td>{p.note || <span className="muted">—</span>}</td></tr>)}</tbody></table></div>;
}
