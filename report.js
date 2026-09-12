import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig, EVENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function isIncome(type) {
  // ตรวจสอบทั้งคำว่า "รายรับ" และ "รายได้" กันเหนียว
  return type === "รายรับ" || type === "รายได้" || type === "income";
}

async function loadReportData() {
  try {
    const colRef = collection(db, "events", EVENT_ID, "transactions");
    const q = query(colRef, orderBy("date", "asc"));
    const snap = await getDocs(q);

    const tIncome = document.getElementById("tIncome");
    const tExpense = document.getElementById("tExpense");
    if (!tIncome || !tExpense) return;

    tIncome.innerHTML = "";
    tExpense.innerHTML = "";

    let incomeCount = 1;
    let expenseCount = 1;
    let sumIncome = 0;
    let sumExpense = 0;

    snap.forEach((doc) => {
      const r = doc.data();
      const amount = parseFloat(r.amount || 0);
      const row = `<tr>
        <td class="ctr">${isIncome(r.type) ? incomeCount++ : expenseCount++}</td>
        <td class="ctr">${r.date || "-"}</td>
        <td>${r.detail || "-"}</td>
        <td class="num">${amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>`;

      if (isIncome(r.type)) {
        tIncome.innerHTML += row;
        sumIncome += amount;
      } else {
        tExpense.innerHTML += row;
        sumExpense += amount;
      }
    });

    // เพิ่มแถวรวมยอดในแต่ละตาราง
    tIncome.innerHTML += `<tr style="font-weight:bold; background:#f0f9ff;">
      <td colspan="3" class="ctr">รวมรายรับ</td>
      <td class="num">${sumIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
    </tr>`;

    tExpense.innerHTML += `<tr style="font-weight:bold; background:#fef2f2;">
      <td colspan="3" class="ctr">รวมรายจ่าย</td>
      <td class="num">${sumExpense.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
    </tr>`;

    // แสดงสรุปยอดคงเหลือด้านล่างสุด
    const summaryBox = document.getElementById("summaryBox");
    if (summaryBox) {
      const balance = sumIncome - sumExpense;
      summaryBox.innerHTML = `
        <table style="width:100%; margin-top:5mm; font-size:13pt;">
          <tr>
            <td style="border:none; font-weight:bold; text-align:right; width:70%;">รวมรายรับทั้งสิ้น</td>
            <td style="border:none; font-weight:bold; text-align:right; color:green;">${sumIncome.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</td>
          </tr>
          <tr>
            <td style="border:none; font-weight:bold; text-align:right;">รวมรายจ่ายทั้งสิ้น</td>
            <td style="border:none; font-weight:bold; text-align:right; color:red;">${sumExpense.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</td>
          </tr>
          <tr>
            <td style="border:none; border-top:2px solid #000; font-weight:bold; text-align:right; font-size:15pt;">คงเหลือสุทธิ</td>
            <td style="border:none; border-top:2px solid #000; font-weight:bold; text-align:right; font-size:15pt; color:blue;">${balance.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</td>
          </tr>
        </table>
      `;
    }

  } catch (e) {
    console.error("Error: ", e);
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadReportData();
  } else {
    location.href = "index.html";
  }
});
