import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig, EVENT_ID } from "./firebase-config.js";

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);
const colRef  = collection(db, "events", EVENT_ID, "transactions");

const $ = id => document.getElementById(id);
const baht = n => Number(n || 0).toLocaleString("th-TH", {minimumFractionDigits:2, maximumFractionDigits:2});
const esc  = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let rows = [], unsub = null, chart = null, isAdmin = false;

/* ================= AUTH ================= */
$("btnLogin").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $("loginErr").textContent = "เข้าสู่ระบบไม่สำเร็จ: " + e.message; }
});
$("btnLogout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  if (user) {
    console.log("🔑 UID ของคุณ (ใช้สร้าง doc ใน collection 'admins'):", user.uid);
    try { isAdmin = (await getDoc(doc(db, "admins", user.uid))).exists(); }
    catch { isAdmin = false; }

    $("adminBadge").style.display = isAdmin ? "inline-block" : "none";
    $("login").style.display = "none";
    $("app").style.display   = "block";
    $("uName").textContent   = user.displayName || user.email;
    $("uPhoto").src          = user.photoURL || "";
    $("date").valueAsDate    = new Date();
    startListen();
  } else {
    isAdmin = false; rows = [];
    $("login").style.display = "block";
    $("app").style.display   = "none";
    if (unsub) { unsub(); unsub = null; }
  }
});

/* ================= UPLOAD ใบเสร็จ ================= */
function compressImage(file, maxW = 1400, quality = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("ไฟล์ต้องเป็นรูปภาพเท่านั้น"));
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width  = Math.round(img.width  * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(new Error("บีบอัดรูปไม่สำเร็จ")), "image/jpeg", quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("อ่านไฟล์รูปไม่ได้"));
    img.src = URL.createObjectURL(file);
  });
}

async function uploadReceipt(file) {
  if (!file) return null;
  if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 10 MB");
  const blob = await compressImage(file);
  const path = `receipts/${EVENT_ID}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
  const task = uploadBytesResumable(sRef(storage, path), blob, { contentType: "image/jpeg" });

  $("uploadBar").style.display = "block";
  return new Promise((resolve, reject) => {
    task.on("state_changed",
      s => $("upPct").textContent = Math.round(s.bytesTransferred / s.totalBytes * 100),
      err => { $("uploadBar").style.display = "none"; reject(err); },
      async () => {
        $("uploadBar").style.display = "none";
        resolve({ url: await getDownloadURL(task.snapshot.ref), path });
      });
  });
}

async function removeReceipt(path) {
  if (!path) return;
  try { await deleteObject(sRef(storage, path)); }
  catch (e) { console.warn("ลบไฟล์ไม่สำเร็จ:", e.message); }
}

/* ================= ฟอร์มเพิ่ม ================= */
$("type").addEventListener("change", e => {
  const isIncome = e.target.value === "income";
  $("category").disabled = isIncome;
  $("otherWrap").style.display = "none";
  if (isIncome) $("category").value = "ค่าอาหารโต๊ะจีน";
});
$("category").addEventListener("change", e => {
  $("otherWrap").style.display = e.target.value === "อื่นๆ" ? "block" : "none";
});

$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const type = $("type").value;
  let category = type === "income" ? "รายได้" : $("category").value;
  if (category === "อื่นๆ") {
    const name = $("otherName").value.trim();
    if (!name) return alert("กรุณาระบุว่าเป็นค่าอะไร");
    category = "อื่นๆ - " + name;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const f = $("receipt").files[0];
    const receipt = f ? await uploadReceipt(f) : null;

    await addDoc(colRef, {
      type, category,
      detail: $("detail").value.trim(),
      amount: parseFloat($("amount").value),
      date: $("date").value,
      receiptUrl:  receipt?.url  || null,
      receiptPath: receipt?.path || null,
      uid: auth.currentUser.uid,
      userName: auth.currentUser.displayName || auth.currentUser.email,
      createdAt: serverTimestamp()
    });
    $("detail").value = ""; $("amount").value = "";
    $("otherName").value = ""; $("receipt").value = "";
    $("otherWrap").style.display = "none";
  } catch (err) { alert("บันทึกไม่สำเร็จ: " + err.message); }
  finally { btn.disabled = false; }
});

/* ================= MODAL แก้ไข ================= */
const modal = $("modal");
const openModal  = () => modal.classList.add("show");
const closeModal = () => modal.classList.remove("show");

$("eCancel").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModal(); $("lightbox").classList.remove("show"); }
});

$("eType").addEventListener("change", e => {
  const isIncome = e.target.value === "income";
  $("eCategory").disabled = isIncome;
  $("eOtherWrap").style.display = "none";
});
$("eCategory").addEventListener("change", e => {
  $("eOtherWrap").style.display = e.target.value === "อื่นๆ" ? "block" : "none";
});

function openEdit(r) {
  $("eId").value     = r.id;
  $("eType").value   = r.type;
  $("eDetail").value = r.detail;
  $("eAmount").value = r.amount;
  $("eDate").value   = r.date;
  $("eCategory").disabled = r.type === "income";

  if (r.category?.startsWith("อื่นๆ")) {
    $("eCategory").value = "อื่นๆ";
    $("eOtherName").value = r.category.replace(/^อื่นๆ\s*-\s*/, "");
    $("eOtherWrap").style.display = "block";
  } else {
    $("eCategory").value = r.type === "income" ? "ค่าอาหารโต๊ะจีน" : (r.category || "ค่าอาหารโต๊ะจีน");
    $("eOtherName").value = "";
    $("eOtherWrap").style.display = "none";
  }

  $("eReceipt").value = "";
  $("eCurrentImg").innerHTML = r.receiptUrl
    ? `<img src="${r.receiptUrl}" class="thumb" style="width:70px;height:70px" data-lb="${r.receiptUrl}">
       <button type="button" id="eDelImg" class="btn-del" style="margin-left:8px">ลบรูป</button>`
    : `<span class="no-img">ยังไม่มีรูปใบเสร็จ</span>`;
  openModal();
}

$("eCurrentImg").addEventListener("click", async e => {
  if (e.target.id !== "eDelImg") return;
  if (!confirm("ลบรูปใบเสร็จนี้?")) return;
  const id = $("eId").value, r = rows.find(x => x.id === id);
  await removeReceipt(r?.receiptPath);
  await updateDoc(doc(db, "events", EVENT_ID, "transactions", id), { receiptUrl: null, receiptPath: null });
  $("eCurrentImg").innerHTML = `<span class="no-img">ยังไม่มีรูปใบเสร็จ</span>`;
});

$("editForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("eId").value;
  const type = $("eType").value;
  let category = type === "income" ? "รายได้" : $("eCategory").value;
  if (category === "อื่นๆ") {
    const name = $("eOtherName").value.trim();
    if (!name) return alert("กรุณาระบุว่าเป็นค่าอะไร");
    category = "อื่นๆ - " + name;
  }
  const old = rows.find(x => x.id === id);
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const patch = {
      type, category,
      detail: $("eDetail").value.trim(),
      amount: parseFloat($("eAmount").value),
      date: $("eDate").value,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.displayName || auth.currentUser.email
    };
    const f = $("eReceipt").files[0];
    if (f) {
      const up = await uploadReceipt(f);
      await removeReceipt(old?.receiptPath);
      patch.receiptUrl = up.url;
      patch.receiptPath = up.path;
    }
    await updateDoc(doc(db, "events", EVENT_ID, "transactions", id), patch);
    closeModal();
  } catch (err) { alert("แก้ไขไม่สำเร็จ: " + err.message); }
  finally { btn.disabled = false; }
});

/* ================= REALTIME ================= */
function startListen() {
  if (unsub) unsub();
  unsub = onSnapshot(query(colRef, orderBy("date", "asc")), snap => {
    rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => alert("โหลดข้อมูลไม่ได้: " + err.message));
}

/* ================= RENDER ================= */
function render() {
  const tb = $("tbody");
  tb.innerHTML = rows.length ? "" :
    `<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:22px">ยังไม่มีรายการ</td></tr>`;

  let income = 0, expense = 0;
  rows.forEach(r => {
    const isIn = r.type === "income";
    isIn ? income += r.amount : expense += r.amount;
    // แก้ไขบรรทัดนี้ในฟังก์ชัน render
    const canEdit = isAdmin || (auth.currentUser && r.uid === auth.currentUser.uid);
    const note = r.updatedBy ? `<div style="font-size:10px;color:#f59e0b">แก้ไขโดย ${esc(r.updatedBy)}</div>` : "";

    tb.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${esc(r.date)}</td>
        <td><span class="tag ${isIn ? "in" : ""}">${isIn ? "รายได้" : "รายจ่าย"}</span></td>
        <td>${esc(r.category)}</td>
        <td>${esc(r.detail)}
          <div style="font-size:11px;color:#9ca3af">${esc(r.userName)}</div>${note}</td>
        <td class="num green">${isIn ? baht(r.amount) : "-"}</td>
        <td class="num red">${!isIn ? baht(r.amount) : "-"}</td>
        <td class="ctr">${r.receiptUrl
          ? `<img src="${r.receiptUrl}" class="thumb" data-lb="${r.receiptUrl}" alt="ใบเสร็จ">`
          : `<span class="no-img">–</span>`}</td>
        <td>${canEdit
          ? `<button class="btn-edit" data-edit="${r.id}">แก้</button>
             <button class="btn-del" data-id="${r.id}">ลบ</button>` : "-"}</td>
      </tr>`);
  });

  $("sumIn").textContent  = baht(income);
  $("sumOut").textContent = baht(expense);
  const bal = income - expense;
  $("balance").textContent = baht(bal);
  $("balance").className = "value " + (bal >= 0 ? "blue" : "red");
  $("count").textContent = rows.length;

  const group = {};
  rows.filter(r => r.type === "expense").forEach(r => {
    const key = r.category?.startsWith("อื่นๆ") ? "ค่าใช้จ่ายอื่น ๆ" : r.category;
    group[key] = (group[key] || 0) + r.amount;
  });

  $("summary").innerHTML = Object.entries(group).map(([k, v]) => `
    <tr><td>${esc(k)}</td><td class="num">${baht(v)}</td>
    <td class="num">${expense ? ((v/expense)*100).toFixed(1) : 0}%</td></tr>`).join("")
    + `<tr style="font-weight:700;background:#f8fafc">
        <td>รวมรายจ่าย</td><td class="num">${baht(expense)}</td><td class="num">100%</td></tr>`;

  drawChart(group);
}

/* ================= CHART ================= */
function drawChart(group) {
  const labels = Object.keys(group), data = Object.values(group);
  const colors = ["#ef4444","#f59e0b","#3b82f6","#10b981","#8b5cf6","#ec4899"];
  const cfg = {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "55%",
      plugins: {
        legend: { position: "bottom", labels: { font: { family: "Sarabun", size: 12 }, boxWidth: 14 } },
        tooltip: { callbacks: { label: c => {
          const total = c.dataset.data.reduce((a,b) => a+b, 0);
          const pct = total ? (c.parsed / total * 100).toFixed(1) : 0;
          return ` ${c.label}: ${baht(c.parsed)} บาท (${pct}%)`;
        }}}
      }
    }
  };
  if (chart) { chart.data = cfg.data; chart.update(); }
  else chart = new Chart($("pie"), cfg);
}

/* ================= ปุ่มในตาราง ================= */
$("tbody").addEventListener("click", async e => {
  const editId = e.target.dataset.edit;
  const delId  = e.target.dataset.id;

  if (editId) {
    const r = rows.find(x => x.id === editId);
    if (r) openEdit(r);
    return;
  }
  if (delId && confirm("ยืนยันลบรายการนี้? (รูปใบเสร็จจะถูกลบด้วย)")) {
    const r = rows.find(x => x.id === delId);
    try {
      await removeReceipt(r?.receiptPath);
      await deleteDoc(doc(db, "events", EVENT_ID, "transactions", delId));
    } catch (err) { alert("ลบไม่สำเร็จ: " + err.message); }
  }
});

/* ================= LIGHTBOX ================= */
document.addEventListener("click", e => {
  const url = e.target.dataset.lb;
  if (url) { $("lbImg").src = url; $("lightbox").classList.add("show"); }
  else if (e.target.id === "lightbox" || e.target.id === "lbImg") $("lightbox").classList.remove("show");
});

/* ================= EXPORT CSV ================= */
$("exportCsv").addEventListener("click", () => {
  const head = "วันที่,ประเภท,หมวด,รายละเอียด,รายได้,รายจ่าย,ผู้บันทึก,ลิงก์ใบเสร็จ\n";
  const body = rows.map(r => [
    r.date, r.type === "income" ? "รายได้" : "รายจ่าย", `"${r.category}"`,
    `"${r.detail}"`, r.type === "income" ? r.amount : "",
    r.type === "expense" ? r.amount : "", `"${r.userName || ""}"`, `"${r.receiptUrl || ""}"`
  ].join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + head + body], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `บัญชีงานเกษียณ_${EVENT_ID}.csv`;
  a.click();
});
