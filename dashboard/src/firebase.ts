import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  // ATENCIÓN: El usuario deberá reemplazar esto con la config web de su proyecto
  apiKey: "API_KEY_PLACEHOLDER",
  authDomain: "saas-estrategias.firebaseapp.com",
  projectId: "saas-estrategias",
  storageBucket: "saas-estrategias.appspot.com",
  messagingSenderId: "MESSAGING_SENDER_ID",
  appId: "APP_ID_PLACEHOLDER"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app);
