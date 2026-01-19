// menu.js
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');
const navOverlay = document.getElementById('navOverlay');
const menuClose = document.getElementById('menuClose');

if (menuToggle) {
    menuToggle.addEventListener('click', (e) => {
        e.preventDefault();
        menuToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
        navOverlay.classList.toggle('active');
    });
}

if (menuClose) {
    menuClose.addEventListener('click', (e) => {
        e.preventDefault();
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
        navOverlay.classList.remove('active');
    });
}

if (navOverlay) {
    navOverlay.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
        navOverlay.classList.remove('active');
    });
}

const links = document.querySelectorAll('.nav-menu-links a');
links.forEach(link => {
    link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
        navOverlay.classList.remove('active');
    });
});
