import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig, EVENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ฟังก์ชันดึงและแสดงข้อมูล
async function loadReportData() {
  try {
    // ระบุ Path ให้ตรงกับโครงสร้าง: events -> EVENT_ID (retire-2569) -> transactions
    const colRef = collection(db, "events", EVENT_ID, "transactions");
    const q = query(colRef, orderBy("date", "asc"));
    const snap = await getDocs(q);

    const tIncome = document.getElementById("tIncome");
    const tExpense = document.getElementById("tExpense");
    
    tIncome.innerHTML = "";
    tExpense.innerHTML = "";

    let incomeCount = 1;
    let expenseCount = 1;

    snap.forEach((doc) => {
      const r = doc.data();
      const row = `<tr>
        <td class="ctr">${r.type === "รายได้" ? incomeCount++ : expenseCount++}</td>
        <td class="ctr">${r.date || "-"}</td>
        <td>${r.detail || "-"}</td>
        <td class="num">${parseFloat(r.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>`;

      if (r.type === "รายได้") {
        tIncome.innerHTML += row;
      } else {
        tExpense.innerHTML += row;
      }
    });

    // ถ้าไม่มีข้อมูล
    if (tIncome.innerHTML === "") tIncome.innerHTML = "<tr><td colspan='4' class='ctr'>ไม่มีข้อมูลรายรับ</td></tr>";
    if (tExpense.innerHTML === "") tExpense.innerHTML = "<tr><td colspan='4' class='ctr'>ไม่มีข้อมูลรายจ่าย</td></tr>";

  } catch (e) {
    console.error("Error loading report: ", e);
    alert("เกิดข้อผิดพลาดในการโหลดข้อมูล: " + e.message);
  }
}

// ตรวจสอบสถานะการล็อกอิน
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadReportData();
  } else {
    location.href = "index.html";
  }
});
