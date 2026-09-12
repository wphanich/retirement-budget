import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig, EVENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function loadReportData() {
  try {
    const colRef = collection(db, "events", EVENT_ID, "transactions");
    const q = query(colRef, orderBy("date", "asc"));
    const snap = await getDocs(q);

    const tIncome = document.getElementById("tIncome");
    const tExpense = document.getElementById("tExpense");
    
    // ตรวจสอบว่า ID ใน HTML มีอยู่จริงก่อนใช้งาน
    if (!tIncome || !tExpense) return; 

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
