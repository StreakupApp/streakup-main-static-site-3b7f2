(function () {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return; // leave the pattern static for users who've asked for less motion

    let ticking = false;

    function updateParallax() {
        ticking = false;
        const offset = window.scrollY * 0.2;
        document.documentElement.style.setProperty('--bg-parallax-y', `-${offset}px`);
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(updateParallax);
            ticking = true;
        }
    }, { passive: true });

    updateParallax();
})();