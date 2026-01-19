async function loadComponent(elementId, componentPath) {
    try {
        const response = await fetch(componentPath);
        const html = await response.text();
        document.getElementById(elementId).innerHTML = html;
    } catch (error) {
        console.error(`Error loading component ${componentPath}:`, error);
    }
}

// Load all components when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    await loadComponent('navigation-container', 'components/navigation.html');
    await loadComponent('floating-bar-container', 'components/floating-bar.html');
    await loadComponent('footer-container', 'components/footer.html');

    // Initialize menu after navigation is loaded
    const menuScript = document.createElement('script');
    menuScript.src = 'js/menu.js';
    document.body.appendChild(menuScript);
});