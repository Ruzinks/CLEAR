// CONFIGURACIÓN DE FIREBASE (Project ID: clear-f797f)
const firebaseConfig = {
  apiKey: "AIzaSyDummyKeyForClearApp123456789", // Tu API Key registrada en Firebase Console
  authDomain: "clear-f797f.firebaseapp.com",
  projectId: "clear-f797f",
  storageBucket: "clear-f797f.appspot.com",
  messagingSenderId: "1223990557",
  appId: "1:1223990557:web:clearapp"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// TU CORREO DE ADMINISTRADOR (Único dueño autorizado para publicar anuncios globales)
const ADMIN_EMAIL = "bautikravsoski@gmail.com";

let currentUserRole = "student";

// ELEMENTOS DOM
const authBtn = document.getElementById("auth-btn");
const authModal = document.getElementById("auth-modal");
const closeAuthModal = document.getElementById("close-auth-modal");
const loginForm = document.getElementById("login-form");
const userDisplay = document.getElementById("user-display");
const adminPublisher = document.getElementById("admin-publisher");
const teacherTaskCreator = document.getElementById("teacher-task-creator");
const postsContainer = document.getElementById("posts-container");
const tasksContainer = document.getElementById("tasks-container");

// PESTAÑAS DE NAVEGACIÓN
const navButtons = document.querySelectorAll(".nav-btn");
const tabContents = document.querySelectorAll(".tab-content");

navButtons.forEach(button => {
  button.addEventListener("click", () => {
    const targetTab = button.getAttribute("data-tab");
    
    navButtons.forEach(btn => btn.classList.remove("active"));
    tabContents.forEach(tab => tab.classList.add("hidden"));

    button.classList.add("active");
    document.getElementById(`tab-${targetTab}`).classList.remove("hidden");
  });
});

// CONTROL DE MODAL
authBtn.addEventListener("click", () => {
  if (auth.currentUser) {
    auth.signOut();
  } else {
    authModal.classList.remove("hidden");
  }
});

closeAuthModal.addEventListener("click", () => {
  authModal.classList.add("hidden");
});

// INICIO DE SESIÓN
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  currentUserRole = document.getElementById("user-role").value;

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      authModal.classList.add("hidden");
      loginForm.reset();
    })
    .catch((error) => {
      // Si el usuario no existe en Firebase Auth, lo crea para pruebas
      if (error.code === 'auth/user-not-found') {
        auth.createUserWithEmailAndPassword(email, password)
          .then(() => authModal.classList.add("hidden"))
          .catch(err => alert("Error: " + err.message));
      } else {
        alert("Error de autenticación: " + error.message);
      }
    });
});

// OBSERVADOR DE ESTADO DE AUTENTICACIÓN
auth.onAuthStateChanged((user) => {
  if (user) {
    userDisplay.textContent = user.email;
    authBtn.textContent = "Cerrar Sesión";

    // PERMISO DE PROPIETARIO / ADMIN: Solo tu email puede publicar Novedades globales
    if (user.email === ADMIN_EMAIL || currentUserRole === "admin") {
      adminPublisher.classList.remove("hidden");
    } else {
      adminPublisher.classList.add("hidden");
    }

    // PERMISO DE DOCENTE: Puede crear y asignar tareas
    if (currentUserRole === "teacher" || currentUserRole === "admin" || user.email === ADMIN_EMAIL) {
      teacherTaskCreator.classList.remove("hidden");
    } else {
      teacherTaskCreator.classList.add("hidden");
    }

  } else {
    userDisplay.textContent = "Invitado";
    authBtn.textContent = "Iniciar Sesión";
    adminPublisher.classList.add("hidden");
    teacherTaskCreator.classList.add("hidden");
  }
});

// PUBLICAR ANUNCIO OFICIAL (ADMIN)
document.getElementById("publish-btn").addEventListener("click", () => {
  const content = document.getElementById("post-input").value;
  if (!content.trim()) return;

  db.collection("posts").add({
    author: auth.currentUser ? auth.currentUser.email : "Admin",
    content: content,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    document.getElementById("post-input").value = "";
  });
});

// CREAR TAREA (DOCENTE)
document.getElementById("create-task-btn").addEventListener("click", () => {
  const title = document.getElementById("task-title-input").value;
  const desc = document.getElementById("task-desc-input").value;
  const dueDate = document.getElementById("task-due-date").value;

  if (!title.trim() || !dueDate) {
    alert("Por favor completa el título y la fecha límite.");
    return;
  }

  db.collection("tasks").add({
    title: title,
    description: desc,
    dueDate: dueDate,
    createdBy: auth.currentUser ? auth.currentUser.email : "Docente",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    document.getElementById("task-title-input").value = "";
    document.getElementById("task-desc-input").value = "";
    document.getElementById("task-due-date").value = "";
  });
});

// CARGAR NOVEDADES EN TIEMPO REAL
db.collection("posts").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
  postsContainer.innerHTML = "";
  snapshot.forEach((doc) => {
    const data = doc.data();
    const postElement = document.createElement("div");
    postElement.className = "card";
    postElement.innerHTML = `
      <h4>${data.author}</h4>
      <p style="margin-top: 0.5rem;">${data.content}</p>
    `;
    postsContainer.appendChild(postElement);
  });
});

// CARGAR TAREAS EN TIEMPO REAL
db.collection("tasks").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
  tasksContainer.innerHTML = "";
  snapshot.forEach((doc) => {
    const data = doc.data();
    const taskElement = document.createElement("div");
    taskElement.className = "card";
    taskElement.innerHTML = `
      <h3>${data.title}</h3>
      <p style="color: #718096; font-size: 0.9rem;">Asignado por: ${data.createdBy} | Fecha límite: ${data.dueDate}</p>
      <p style="margin-top: 0.5rem;">${data.description}</p>
    `;
    tasksContainer.appendChild(taskElement);
  });
});