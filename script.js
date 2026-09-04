const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const currentUser = {
  name: "Ózek364",
  courseId: "curso_3ro_a"
};

let currentPublishType = 'anuncio'; // 'anuncio' o 'tarea'

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupPublishType();

  loadFeed(currentUser.courseId);
  loadPendingTasks(currentUser.courseId);

  document.getElementById('btnSendPost').addEventListener('click', handlePublish);
});

// ==========================================================================
// FUNCIONALIDAD DE BOTONES Y NAVEGACIÓN
// ==========================================================================
function setupNavigation() {
  // Botones de la barra superior (Inicio, Cursos, Grupos)
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      alert(`Navegando a la sección: ${target.dataset.section.toUpperCase()}`);
    });
  });

  // Notificaciones y Mensajes
  document.getElementById('btnNotif').addEventListener('click', () => {
    alert('Tienes 3 notificaciones no leídas.');
  });

  document.getElementById('btnMsg').addEventListener('click', () => {
    alert('Tienes 5 mensajes nuevos.');
  });

  document.getElementById('btnProfile').addEventListener('click', () => {
    alert(`Perfil del usuario: ${currentUser.name}`);
  });

  // Pestañas (Actividad Reciente / Panel del Curso)
  const tabActividad = document.getElementById('tabActividad');
  const tabPanel = document.getElementById('tabPanel');
  const viewActividad = document.getElementById('viewActividad');
  const viewPanel = document.getElementById('viewPanel');

  tabActividad.addEventListener('click', () => {
    tabActividad.classList.add('active');
    tabPanel.classList.remove('active');
    viewActividad.classList.remove('hidden');
    viewPanel.classList.add('hidden');
  });

  tabPanel.addEventListener('click', () => {
    tabPanel.classList.add('active');
    tabActividad.classList.remove('active');
    viewPanel.classList.remove('hidden');
    viewActividad.classList.add('hidden');
  });
}

// Selector Anuncio / Tarea
function setupPublishType() {
  const btnAnuncio = document.getElementById('btnTypeAnuncio');
  const btnTarea = document.getElementById('btnTypeTarea');
  const dueDateContainer = document.getElementById('dueDateContainer');

  btnAnuncio.addEventListener('click', () => {
    currentPublishType = 'anuncio';
    btnAnuncio.classList.add('active');
    btnTarea.classList.remove('active');
    dueDateContainer.classList.add('hidden');
  });

  btnTarea.addEventListener('click', () => {
    currentPublishType = 'tarea';
    btnTarea.classList.add('active');
    btnAnuncio.classList.remove('active');
    dueDateContainer.classList.remove('hidden');
  });
}

// ==========================================================================
// PUBLICAR Y GUARDAR EN FIRESTORE
// ==========================================================================
async function handlePublish() {
  const content = document.getElementById('postInput').value.trim();
  if (!content) return alert('Por favor escribe un mensaje.');

  try {
    if (currentPublishType === 'anuncio') {
      await db.collection('courses').doc(currentUser.courseId).collection('posts').add({
        authorName: currentUser.name,
        content: content,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const dueDateVal = document.getElementById('dueDateInput').value;
      if (!dueDateVal) return alert('Por favor selecciona la fecha de entrega de la tarea.');

      await db.collection('courses').doc(currentUser.courseId).collection('tasks').add({
        title: content,
        dueDate: firebase.firestore.Timestamp.fromDate(new Date(dueDateVal)),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    document.getElementById('postInput').value = '';
    document.getElementById('dueDateInput').value = '';
  } catch (error) {
    console.error("Error al guardar:", error);
  }
}

// ==========================================================================
// CONSULTAS EN TIEMPO REAL DESDE FIRESTORE
// ==========================================================================
function loadFeed(courseId) {
  const feedContainer = document.getElementById('feedContainer');

  db.collection('courses').doc(courseId).collection('posts')
    .orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      feedContainer.innerHTML = '';
      if (snapshot.empty) {
        feedContainer.innerHTML = '<p class="text-muted">No hay anuncios recientes.</p>';
        return;
      }

      snapshot.forEach(doc => {
        const post = doc.data();
        const dateStr = post.createdAt ? new Date(post.createdAt.toDate()).toLocaleString() : 'Reciente';

        const card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = `
          <div class="post-author">
            <img src="https://via.placeholder.com/35" class="avatar">
            <div>
              <div class="post-author-name">${post.authorName}</div>
              <div class="post-date">${dateStr}</div>
            </div>
          </div>
          <p>${post.content}</p>
        `;
        feedContainer.appendChild(card);
      });
    });
}

function loadPendingTasks(courseId) {
  const overdueList = document.getElementById('overdueTasksList');
  const upcomingList = document.getElementById('upcomingTasksList');

  db.collection('courses').doc(courseId).collection('tasks')
    .orderBy('dueDate', 'asc')
    .onSnapshot((snapshot) => {
      overdueList.innerHTML = '';
      upcomingList.innerHTML = '';
      const now = new Date();

      snapshot.forEach(doc => {
        const task = doc.data();
        const dueDate = task.dueDate ? task.dueDate.toDate() : new Date();

        const taskItem = document.createElement('li');
        taskItem.className = 'task-item';
        taskItem.innerHTML = `
          <span class="material-icons">assignment</span>
          <div>
            <strong>${task.title}</strong>
            <span>Vence: ${dueDate.toLocaleDateString()} ${dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
        `;

        if (dueDate < now) {
          overdueList.appendChild(taskItem);
        } else {
          upcomingList.appendChild(taskItem);
        }
      });

      if (overdueList.children.length === 0) {
        overdueList.innerHTML = '<span class="text-muted text-sm">Sin tareas vencidas.</span>';
      }
      if (upcomingList.children.length === 0) {
        upcomingList.innerHTML = '<span class="text-muted text-sm">Sin entregas próximas.</span>';
      }
    });
}