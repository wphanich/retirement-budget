import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, EVENT_ID } from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const $ = id => document.getElementById(id);
const baht = n => Number(n || 0).toLocaleString("th-TH", {minimumFractionDigits:2, maximumFractionDigits:2});
const esc  = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const CAT_ORDER = ["ค่าอาหารโต๊ะจีน","ค่าจัดสถานที่เวที","ค่าเช่าสถานที่และค่าเครื่องดื่ม"];
const CAT_LABEL = {
  "ค่าอาหารโต๊ะจีน":"ค่าอาหารโต๊ะจีน",
  "ค่าจัดสถานที่เวที":"ค่าจัดสถานที่และเวที",
  "ค่าเช่าสถานที่และค่าเครื่องดื่ม":"ค่าเช่าสถานที่และค่าเครื่องดื่ม",
  "OTHER":"ค่าใช้จ่ายอื่น ๆ"
};

/* ---------- เลขไทยเป็นตัวอักษร ---------- */
function bahtText(num) {
  const N = ["ศูนย์","หนึ่ง","สอง","สาม","สี่","ห้า","หก","เจ็ด","แปด","เก้า"];
  const U = ["","สิบ","ร้อย","พัน","หมื่น","แสน","ล้าน"];
  const readInt = s => {
    s = s.replace(/^0+/, "");
    if (!s) return "";
    if (s.length > 7) return readInt(s.slice(0,-6)) + "ล้าน" + readInt(s.slice(-6).padStart(6,"0"));
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const d = +s[i], pos = s.length - i - 1;
      if (d === 0) continue;
      if (pos === 0 && d === 1 && s.length > 1) out += "เอ็ด";
      else if (pos === 1 && d === 1) out += "สิบ";
      else if (pos === 1 && d === 2) out += "ยี่สิบ";
      else out += N[d] + U[pos];
    }
    return out;
  };
  const neg = num < 0;
  const [i, f] = Math.abs(num).toFixed(2).split(".");
  let t = (readInt(i) || "ศูนย์") + "บาท" + (f === "00" ? "ถ้วน" : readInt(f) + "สตางค์");
  return (neg ? "ลบ" : "") + t;
}

const thDate = iso => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${+d}/${+m}/${+y + 543}`;
};

/* ---------- โหลดข้อมูล ---------- */
let cache = [];
onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "index.html"; return; }
  const snap = await getDocs(query(collection(db,"events",EVENT_ID,"transactions"), orderBy("date","asc")));
  cache = snap.docs.map(d => d.data());
  render(cache);
});

function render(rows) {
  $("pOrg").textContent   = $("orgName").value;
  $("pEvent").textContent = $("eventName").value;

  const dates = rows.map(r => r.date).filter(Boolean).sort();
  $("pPeriod").textContent = dates.length
    ? `ระหว่างวันที่ ${thDate(dates[0])} ถึงวันที่ ${thDate(dates[dates.length-1])}` : "";

  /* --- รายรับ --- */
  const inc = rows.filter(r => r.type === "income");
  let sumIn = 0;
  $("tIncome").innerHTML = (inc.length ? inc.map((r,i) => {
    sumIn += r.amount;
    return `<tr><td class="ctr">${i+1}</td><td class="ctr">${thDate(r.date)}</td>
            <td>${esc(r.detail)}</td><td class="num">${baht(r.amount)}</td></tr>`;
  }).join("") : `<tr><td colspan="4" class="ctr">– ไม่มีรายการ –</td></tr>`)
  + `<tr class="total"><td colspan="3" class="ctr">รวมรายรับทั้งสิ้น</td><td class="num">${baht(sumIn)}</td></tr>`;

  /* --- รายจ่าย --- */
  const exp = rows.filter(r => r.type === "expense");
  const groups = {};
  exp.forEach(r => {
    const key = r.category?.startsWith("อื่นๆ") ? "OTHER" : r.category;
    (groups[key] = groups[key] || []).push(r);
  });

  const keys = [...CAT_ORDER.filter(k => groups[k]), ...(groups["OTHER"] ? ["OTHER"] : [])];
  const thNum = ["๒.๑","๒.๒","๒.๓","๒.๔","๒.๕","๒.๖"];
  let html = "", no = 0, sumOut = 0;

  keys.forEach((k, gi) => {
    const list = groups[k];
    const sub = list.reduce((a,b) => a + b.amount, 0);
    sumOut += sub;
    html += `<tr class="total"><td colspan="4">${thNum[gi] || ""} ${CAT_LABEL[k] || esc(k)}</td></tr>`;
    list.forEach(r => {
      no++;
      const extra = k === "OTHER"
        ? ` <span class="muted">(${esc(r.category.replace(/^อื่นๆ\s*-\s*/, ""))})</span>` : "";
      html += `<tr><td class="ctr">${no}</td><td class="ctr">${thDate(r.date)}</td>
               <td>${esc(r.detail)}${extra}</td><td class="num">${baht(r.amount)}</td></tr>`;
    });
    html += `<tr class="total"><td colspan="3" class="ctr">รวม ${CAT_LABEL[k] || esc(k)}</td>
             <td class="num">${baht(sub)}</td></tr>`;
  });
  if (!keys.length) html = `<tr><td colspan="4" class="ctr">– ไม่มีรายการ –</td></tr>`;
  html += `<tr class="grand"><td colspan="3" class="ctr">รวมรายจ่ายทั้งสิ้น</td>
           <td class="num">${baht(sumOut)}</td></tr>`;
  $("tExpense").innerHTML = html;

  /* --- สรุป --- */
  const bal = sumIn - sumOut;
  $("tSummary").innerHTML = `
    <tr><td>รายรับทั้งสิ้น</td><td class="num" style="width:40mm">${baht(sumIn)}</td></tr>
    <tr><td>หัก รายจ่ายทั้งสิ้น</td><td class="num">${baht(sumOut)}</td></tr>
    <tr class="grand"><td>คงเหลือ</td>
      <td class="num ${bal < 0 ? "neg" : ""}">${baht(bal)}</td></tr>`;
  $("thaiText").textContent = `( ${bahtText(bal)} )`;

  /* --- ภาคผนวกใบเสร็จ --- */
  const withImg = rows.filter(r => r.receiptUrl);
  if (withImg.length) {
    $("appendix").style.display = "block";
    $("apEvent").textContent = $("eventName").value;
    $("apGrid").innerHTML = withImg.map((r,i) => `
      <div class="ap-item">
        <img src="${r.receiptUrl}" alt="ใบเสร็จ ${i+1}" crossorigin="anonymous">
        <div class="ap-cap">
          <b>เอกสารแนบที่ ${i+1}</b><br>
          ${esc(r.category)} — ${esc(r.detail)}<br>
          วันที่ ${thDate(r.date)} จำนวน ${baht(r.amount)} บาท
        </div>
      </div>`).join("");
  } else {
    $("appendix").style.display = "none";
  }
}

["orgName","eventName"].forEach(id =>
  $(id).addEventListener("input", () => {
    $("pOrg").textContent   = $("orgName").value;
    $("pEvent").textContent = $("eventName").value;
    $("apEvent").textContent = $("eventName").value;
  })
);

$("btnPrint").addEventListener("click", () => window.print());
