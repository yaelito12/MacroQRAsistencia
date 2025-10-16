// app.js — lógica común para RTDB (SDK modular v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, signInAnonymously, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getDatabase, ref, get, set, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCnjFF4srF6nlhrGO0EteYGe6C7W36wSPc",
  authDomain: "macroqr-9cee8.firebaseapp.com",
  databaseURL: "https://macroqr-9cee8-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "macroqr-9cee8",
  storageBucket: "macroqr-9cee8.firebasestorage.app",
  messagingSenderId: "751611795247",
  appId: "1:751611795247:web:c28b92b31ded4fdd5cb3da",
  measurementId: "G-WR5H7L26DH"
};

// 2) Inicializa SDKs
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

// 3) DeviceId persistente por navegador
function getOrCreateDeviceId(){
  const k = 'macroqr_device_id';
  let id = localStorage.getItem(k);
  if (!id) {
    id = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c/4).toString(16)
    );
    localStorage.setItem(k, id);
  }
  return id;
}
const deviceId = getOrCreateDeviceId();

// 4) Vincular alumno ↔ dispositivo
async function bindUserToDevice(uid){
  const sref = ref(db, `students/${uid}`);
  const snap = await get(sref);
  if (!snap.exists()) {
    await set(sref, { deviceId, createdAt: Date.now() });
  } else if (snap.val().deviceId !== deviceId) {
    throw new Error('Tu cuenta está vinculada a otro dispositivo. Solicita cambio al profesor.');
  }
}

// (NUEVO) 4.1 Asegurar sesión anónima (si no usas email/password en ese dispositivo)
async function ensureAnonAuth(authInst = auth) {
  if (authInst.currentUser) return authInst.currentUser;
  await signInAnonymously(authInst);
  // Espera a que se refleje el usuario
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(authInst, (u) => {
      if (u) { unsub(); resolve(u); }
    });
  });
}

// 5) Login helper (email/password). Si no usas correos, puedes ignorar esto.
async function doLogin(email, password, authInst = auth){
  const cred = await signInWithEmailAndPassword(authInst, email, password);
  await bindUserToDevice(cred.user.uid);
  return cred.user;
}       

// 6) Registrar asistencia (lock por dispositivo + marca por alumno)
async function registrarAsistencia(sessionId, user){
  const lockRef = ref(db, `sessions/${sessionId}/devices/${deviceId}`);
  const attRef  = ref(db, `sessions/${sessionId}/attendance/${user.uid}`);

  // Candado por dispositivo (si ya existe, no lo pisa)
  await runTransaction(lockRef, (cur) => {
    if (cur) return cur;
    return { uid: user.uid, ts: Date.now() };
  });

  // Marca por alumno (fallará por reglas si ya había una)
  await set(attRef, { deviceId, ts: Date.now() });
}

// (NUEVO) 7) Helper para construir un sessionId diario a partir del aula
function buildSessionIdFromAula(aulaId){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${aulaId}-${yyyy}${mm}${dd}`; // p.ej. "3A-20251016"
}

// Exporta lo necesario
export { auth, db, doLogin, registrarAsistencia, bindUserToDevice, ensureAnonAuth, deviceId, buildSessionIdFromAula };