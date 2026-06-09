import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Configuración de Firebase de la app web
const firebaseConfig = {
  apiKey: "AIzaSyDVRlbqJL9NDyQrYH1AD_e3TLBHXPb-pKI",
  authDomain: "saas-estrategias.firebaseapp.com",
  projectId: "saas-estrategias",
  storageBucket: "saas-estrategias.firebasestorage.app",
  messagingSenderId: "67055197163",
  appId: "1:67055197163:web:69afd55f77d1812b6f97ae"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
